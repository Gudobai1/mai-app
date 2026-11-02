import type { MaiState } from './state'

type Row = Record<string, unknown>
export type ChangeKind = 'delete' | 'archive' | 'complete'
export type ChangeInfo = { kind: ChangeKind; text: string; titles: string[] }

const COLLECTIONS: { get: (state: MaiState) => Row[]; one: string; fem?: boolean; title: string[] }[] = [
  { get: s => s.tasks as Row[], one: 'Tarefa', fem: true, title: ['titulo'] },
  { get: s => s.events as Row[], one: 'Compromisso', title: ['titulo'] },
  { get: s => s.habits as Row[], one: 'Hábito', title: ['nome'] },
  { get: s => s.notes as Row[], one: 'Nota', fem: true, title: ['titulo'] },
  { get: s => (s as unknown as { goals: Row[] }).goals, one: 'Meta', fem: true, title: ['titulo', 'nome'] },
  { get: s => s.projects as Row[], one: 'Projeto', title: ['nome'] },
  { get: s => (s.finance?.transactions || []) as Row[], one: 'Lançamento', title: ['titulo', 'descricao'] },
]

const list = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : [])
const titleOf = (item: Row, keys: string[]) => String(keys.map(key => item[key]).find(Boolean) || '')
const archived = (item: Row) => item.arquivado === true || item.arquivada === true || item.ativo === false

/** Resume uma mudança de estado quando ela é excluir, arquivar ou concluir. */
export function describeChange(prev: MaiState, next: MaiState): ChangeInfo | null {
  for (const col of COLLECTIONS) {
    const before = list(col.get(prev))
    const after = list(col.get(next))
    if (!before.length) continue
    const afterById = new Map(after.map(item => [String(item.id), item]))
    const removed = before.filter(item => !afterById.has(String(item.id)))
    if (removed.length && after.length < before.length) {
      const text = removed.length === 1 ? `${col.one} ${col.fem ? 'excluída' : 'excluído'}` : `${removed.length} itens excluídos`
      return { kind: 'delete', text, titles: removed.map(item => titleOf(item, col.title)) }
    }
    const nowArchived = before.filter(item => { const later = afterById.get(String(item.id)); return later && !archived(item) && archived(later) })
    if (nowArchived.length) {
      return { kind: 'archive', text: nowArchived.length === 1 ? `${col.one} ${col.fem ? 'arquivada' : 'arquivado'}` : `${nowArchived.length} itens arquivados`, titles: nowArchived.map(item => titleOf(item, col.title)) }
    }
    if (col.one === 'Tarefa') {
      const done = before.filter(item => { const later = afterById.get(String(item.id)); return later && !item.concluida && later.concluida })
      if (done.length) return { kind: 'complete', text: done.length === 1 ? 'Tarefa concluída' : `${done.length} tarefas concluídas`, titles: done.map(item => titleOf(item, col.title)) }
    }
  }
  return null
}
