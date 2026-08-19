'use client'

import type { PlannerItem } from '../../lib/v2/planner'
import type { MaiState } from '../../lib/v2/state'
import type { AppView, Row, TodayBlock } from './app-types'
import type { InspectableItem } from './ContextDrawer'
import styles from './unified.module.css'

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const cleanText = (value: unknown) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const TODAY_BLOCKS: { id: TodayBlock; label: string }[] = [
  { id: 'flow', label: 'Meu dia' }, { id: 'goals', label: 'Metas em foco' }, { id: 'notes', label: 'Notas recentes' },
  { id: 'health', label: 'Bem-estar' }, { id: 'finance', label: 'Finanças' },
]

type Props = {
  id: Exclude<TodayBlock, 'flow'>
  state: MaiState
  today: string
  financeToday: PlannerItem[]
  navigate: (view: AppView) => void
  inspect: (item: InspectableItem) => void
}

export function TodayBlockView({ id, state, today, financeToday, navigate, inspect }: Props) {
  if (id === 'goals') {
    const goals = rows(state.goals).filter(item => !String(item.status || '').toLocaleLowerCase('pt-BR').includes('conclu')).sort((a, b) => String(a.prazo || '9999').localeCompare(String(b.prazo || '9999'))).slice(0, 4)
    return <section><header><strong>Metas em foco</strong><button onClick={() => navigate('goals')}>Ver todas</button></header>{goals.map(goal => <button className={styles.focusRow} key={String(goal.id)} onClick={() => inspect({ kind: 'goal', sourceId: String(goal.id), title: String(goal.titulo || 'Meta'), date: String(goal.prazo || '').slice(0, 10), raw: goal })}><span>{goal.titulo}</span><b>{Math.round(Number(goal.progresso_atual || 0) / Math.max(1, Number(goal.progresso_total || 100)) * 100)}%</b></button>)}{!goals.length ? <small>Sem metas ativas.</small> : null}</section>
  }
  if (id === 'notes') {
    const notes = rows(state.notes).filter(item => item.ativo !== false && !item.arquivado).sort((a, b) => String(b.data || '').localeCompare(String(a.data || ''))).slice(0, 4)
    return <section><header><strong>Notas recentes</strong><button onClick={() => navigate('notes')}>Ver todas</button></header>{notes.map(note => <button className={styles.notePeek} key={String(note.id)} onClick={() => inspect({ kind: 'note', sourceId: String(note.id), title: String(note.titulo || 'Nota'), raw: note })}><strong>{note.titulo || 'Sem título'}</strong><span>{cleanText(note.conteudo).slice(0, 90) || 'Sem conteúdo'}</span></button>)}{!notes.length ? <small>Nenhuma nota recente.</small> : null}</section>
  }
  if (id === 'health') {
    const healthDay = ((state.health.diary || {}) as Record<string, Row>)[today]
    return <section><header><strong>Bem-estar</strong><button onClick={() => navigate('health')}>Abrir diário</button></header><button className={styles.healthPeek} onClick={() => navigate('health')}><span>{healthDay ? 'Diário atualizado' : 'Check-in pendente'}</span><strong>{healthDay?.sono?.score ? `Sono ${healthDay.sono.score}/100` : 'Registrar o dia'}</strong></button></section>
  }
  return <section><header><strong>Finanças de hoje</strong><button onClick={() => navigate('finance')}>Ver mês</button></header>{financeToday.slice(0, 5).map(item => <button className={styles.focusRow} key={item.id} onClick={() => inspect({ kind: item.kind, sourceId: item.sourceId, title: item.title, date: item.date, time: item.time, raw: item.raw })}><span>{item.title}</span><b>{item.raw.tipo === 'receita' ? '+' : '−'} {money.format(Number(item.raw.valor_real || item.raw.valor || 0))}</b></button>)}{!financeToday.length ? <small>Nenhum lançamento hoje.</small> : null}</section>
}
