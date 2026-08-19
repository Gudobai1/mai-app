'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'

export type InspectableKind = 'task' | 'event' | 'habit' | 'finance' | 'goal' | 'note'
export type InspectableItem = { kind: InspectableKind; sourceId: string; title: string; date?: string; time?: string; raw: Record<string, any> }
type Row = Record<string, any>
type Props = {
  item: InspectableItem | null
  state: MaiState
  today: string
  commit: (change: (current: MaiState) => MaiState) => void
  googleRpc: (method: string, args?: unknown[]) => Promise<any>
  refreshEvents?: () => Promise<void> | void
  onClose: () => void
}

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const dateOnly = (value: unknown) => String(value || '').slice(0, 10)
const clean = (value: unknown) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const timeOnly = (value: unknown) => String(value || '').includes('T') ? String(value).slice(11, 16) : String(value || '').slice(0, 5)

export function ContextDrawer({ item, state, today, commit, googleRpc, refreshEvents, onClose }: Props) {
  const [draft, setDraft] = useState<Row>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { setDraft(item ? { ...item.raw } : {}); setMessage('') }, [item?.kind, item?.sourceId, item?.date])
  const projects = useMemo(() => rows(state.projects).filter(project => project.ativo !== false), [state.projects])
  const habitEntry = useMemo(() => item?.kind === 'habit' ? rows(state.habitEntries).find(entry => String(entry.habito_id) === item.sourceId && dateOnly(entry.data) === (item.date || today)) : undefined, [item, state.habitEntries, today])
  if (!item) return null
  const active = item
  const label = ({ task: 'Tarefa', event: 'Compromisso', habit: 'Rotina', finance: 'Finanças', goal: 'Meta', note: 'Nota' } as const)[active.kind]
  const set = (patch: Row) => setDraft(current => ({ ...current, ...patch }))

  async function save(event: FormEvent) {
    event.preventDefault(); setMessage('')
    if (active.kind === 'task') {
      const day = dateOnly(draft.data_vencimento); const hour = String(draft._hora ?? timeOnly(draft.data_vencimento)); const due = day ? `${day}${hour ? `T${hour}` : ''}` : ''
      commit(current => ({ ...current, tasks: current.tasks.map(task => task.id === active.sourceId ? { ...task, ...draft, titulo: String(draft.titulo || '').trim(), data_vencimento: due, prioridade: Number(draft.prioridade || 4), projeto_id: draft.projeto_id || 'entrada' } : task) }))
    } else if (active.kind === 'event') {
      const next = { ...draft, titulo: String(draft.titulo || '').trim(), data_inicio: dateOnly(draft.data_inicio) || active.date || today }
      if (next.tipo === 'google' || next.tipo === 'gcalendar' || String(next.id || '').includes('::')) {
        setBusy(true)
        try { await googleRpc('salvarEventoAgenda', [next]); await refreshEvents?.() }
        catch (error: any) { setMessage(error?.message || 'Não foi possível salvar no Google Agenda.'); setBusy(false); return }
        finally { setBusy(false) }
      } else commit(current => ({ ...current, events: rows(current.events).map(row => String(row.id) === active.sourceId ? next : row) }))
    } else if (active.kind === 'habit') {
      const value = Math.max(0, Number(draft._valor ?? habitEntry?.valor ?? 0)); const day = active.date || today
      commit(current => { const entries = rows(current.habitEntries).filter(entry => !(String(entry.habito_id) === active.sourceId && dateOnly(entry.data) === day)); return { ...current, habits: rows(current.habits).map(habit => String(habit.id) === active.sourceId ? { ...habit, nome: draft.nome || habit.nome, meta: Number(draft.meta || 1), unidade: draft.unidade || '', hora: draft.hora || '' } : habit), habitEntries: value > 0 ? [...entries, { id: habitEntry?.id || `hr-${crypto.randomUUID()}`, habito_id: active.sourceId, data: day, valor: value, criado_em: habitEntry?.criado_em || new Date().toISOString() }] : entries } })
    } else if (active.kind === 'finance') {
      if (active.raw.fixo_id || active.raw.recorrente === true) commit(current => ({ ...current, finance: { ...current.finance, fixed: rows(current.finance.fixed).map(rule => String(rule.id) === String(active.raw.fixo_id || active.sourceId) ? { ...rule, titulo: draft.titulo || rule.titulo, valor: Number(draft.valor_real ?? draft.valor ?? rule.valor), categoria: draft.categoria ?? rule.categoria } : rule) } }))
      else commit(current => ({ ...current, finance: { ...current.finance, transactions: rows(current.finance.transactions).map(tx => String(tx.id) === active.sourceId ? { ...tx, titulo: draft.titulo || tx.titulo, valor: Number(draft.valor || 0), data: dateOnly(draft.data) || tx.data, categoria: draft.categoria || '', status: draft.status || 'pendente', valor_pago: draft.status === 'pago' ? Number(draft.valor || 0) : Number(draft.valor_pago || 0) } : tx) } }))
    } else if (active.kind === 'goal') commit(current => ({ ...current, goals: rows(current.goals).map(goal => String(goal.id) === active.sourceId ? { ...goal, titulo: draft.titulo || goal.titulo, prazo: dateOnly(draft.prazo), status: draft.status || goal.status, progresso_atual: Number(draft.progresso_atual || 0), progresso_total: Math.max(1, Number(draft.progresso_total || 100)) } : goal) }))
    else commit(current => ({ ...current, notes: rows(current.notes).map(note => String(note.id) === active.sourceId ? { ...note, titulo: draft.titulo || '', conteudo: draft.conteudo || '', data: new Date().toISOString() } : note) }))
    onClose()
  }

  async function remove() {
    if (!confirm(`Excluir ${label.toLocaleLowerCase('pt-BR')}?`)) return
    if (active.kind === 'task') commit(current => ({ ...current, tasks: current.tasks.filter(task => task.id !== active.sourceId) }))
    if (active.kind === 'note') commit(current => ({ ...current, notes: rows(current.notes).map(note => String(note.id) === active.sourceId ? { ...note, ativo: false } : note) }))
    if (active.kind === 'goal') commit(current => ({ ...current, goals: rows(current.goals).filter(goal => String(goal.id) !== active.sourceId) }))
    if (active.kind === 'finance' && !active.raw.fixo_id && active.raw.recorrente !== true) commit(current => ({ ...current, finance: { ...current.finance, transactions: rows(current.finance.transactions).filter(tx => String(tx.id) !== active.sourceId) } }))
    if (active.kind === 'event') {
      if (draft.tipo === 'google' || draft.tipo === 'gcalendar' || String(draft.id || '').includes('::')) { setBusy(true); try { await googleRpc('excluirEventoAgenda', [draft.id]); await refreshEvents?.() } finally { setBusy(false) } }
      else commit(current => ({ ...current, events: rows(current.events).filter(row => String(row.id) !== active.sourceId) }))
    }
    onClose()
  }

  return <div className="mai-context-layer" onMouseDown={onClose}><aside className="mai-context-drawer" onMouseDown={event => event.stopPropagation()}>
    <header><div><span>{label}</span><strong>{active.title}</strong></div><button type="button" onClick={onClose}>×</button></header>
    <form onSubmit={save}>
      {active.kind === 'task' ? <><label><span>Título</span><input autoFocus value={draft.titulo || ''} onChange={e => set({ titulo: e.target.value })} /></label><label><span>Descrição</span><textarea rows={5} value={clean(draft.descricao)} onChange={e => set({ descricao: e.target.value })} /></label><div className="mai-context-grid"><label><span>Data</span><input type="date" value={dateOnly(draft.data_vencimento)} onChange={e => set({ data_vencimento: e.target.value, _hora: draft._hora ?? timeOnly(draft.data_vencimento) })} /></label><label><span>Horário</span><input type="time" value={String(draft._hora ?? timeOnly(draft.data_vencimento))} onChange={e => set({ _hora: e.target.value })} /></label></div><div className="mai-context-grid"><label><span>Prioridade</span><select value={Number(draft.prioridade || 4)} onChange={e => set({ prioridade: Number(e.target.value) })}><option value={1}>Urgente</option><option value={2}>Alta</option><option value={3}>Média</option><option value={4}>Normal</option></select></label><label><span>Projeto</span><select value={draft.projeto_id || 'entrada'} onChange={e => set({ projeto_id: e.target.value })}><option value="entrada">Entrada</option>{projects.map(project => <option key={String(project.id)} value={project.id}>{project.nome}</option>)}</select></label></div></> : null}
      {active.kind === 'event' ? <><label><span>Título</span><input autoFocus value={draft.titulo || ''} onChange={e => set({ titulo: e.target.value })} /></label><label><span>Descrição</span><textarea rows={5} value={draft.descricao || ''} onChange={e => set({ descricao: e.target.value })} /></label><div className="mai-context-grid"><label><span>Data</span><input type="date" value={dateOnly(draft.data_inicio) || active.date || today} onChange={e => set({ data_inicio: e.target.value })} /></label><label><span>Início</span><input type="time" value={draft.hora_inicio || ''} onChange={e => set({ hora_inicio: e.target.value })} /></label></div><label><span>Fim</span><input type="time" value={draft.hora_fim || ''} onChange={e => set({ hora_fim: e.target.value })} /></label></> : null}
      {active.kind === 'habit' ? <><label><span>Rotina</span><input value={draft.nome || active.title} onChange={e => set({ nome: e.target.value })} /></label><div className="mai-context-grid"><label><span>Meta</span><input type="number" min="0" step="0.1" value={draft.meta ?? 1} onChange={e => set({ meta: Number(e.target.value) })} /></label><label><span>Unidade</span><input value={draft.unidade || ''} onChange={e => set({ unidade: e.target.value })} /></label></div><div className="mai-context-grid"><label><span>Horário</span><input type="time" value={draft.hora || ''} onChange={e => set({ hora: e.target.value })} /></label><label><span>Realizado</span><input type="number" min="0" step="0.1" value={draft._valor ?? habitEntry?.valor ?? 0} onChange={e => set({ _valor: Number(e.target.value) })} /></label></div></> : null}
      {active.kind === 'finance' ? <><label><span>Descrição</span><input value={draft.titulo || active.title} onChange={e => set({ titulo: e.target.value })} /></label><div className="mai-context-grid"><label><span>Valor</span><input type="number" step="0.01" value={draft.valor_real ?? draft.valor ?? 0} onChange={e => set({ [draft.valor_real != null ? 'valor_real' : 'valor']: Number(e.target.value) })} /></label><label><span>Status</span><select value={draft.status || 'pendente'} onChange={e => set({ status: e.target.value })}><option value="pendente">Pendente</option><option value="parcial">Parcial</option><option value="pago">Pago</option></select></label></div>{!active.raw.fixo_id && active.raw.recorrente !== true ? <label><span>Data</span><input type="date" value={dateOnly(draft.data)} onChange={e => set({ data: e.target.value })} /></label> : null}<label><span>Categoria</span><input value={draft.categoria || ''} onChange={e => set({ categoria: e.target.value })} /></label></> : null}
      {active.kind === 'goal' ? <><label><span>Meta</span><input value={draft.titulo || active.title} onChange={e => set({ titulo: e.target.value })} /></label><div className="mai-context-grid"><label><span>Atual</span><input type="number" step="0.1" value={draft.progresso_atual || 0} onChange={e => set({ progresso_atual: Number(e.target.value) })} /></label><label><span>Alvo</span><input type="number" min="1" step="0.1" value={draft.progresso_total || 100} onChange={e => set({ progresso_total: Number(e.target.value) })} /></label></div><label><span>Prazo</span><input type="date" value={dateOnly(draft.prazo)} onChange={e => set({ prazo: e.target.value })} /></label><label><span>Status</span><select value={draft.status || 'Em Andamento'} onChange={e => set({ status: e.target.value })}><option>Em Andamento</option><option>Atenção</option><option>Concluída</option></select></label></> : null}
      {active.kind === 'note' ? <><label><span>Título</span><input autoFocus value={draft.titulo || ''} onChange={e => set({ titulo: e.target.value })} /></label><label><span>Conteúdo</span><textarea rows={14} value={clean(draft.conteudo)} onChange={e => set({ conteudo: e.target.value })} /></label></> : null}
      {message ? <p className="mai-context-error">{message}</p> : null}
      <footer><button type="button" className="mai-context-delete" onClick={() => void remove()} disabled={busy}>Excluir</button><div><button type="button" onClick={onClose}>Cancelar</button><button disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button></div></footer>
    </form>
  </aside></div>
}
