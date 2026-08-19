'use client'

import type { PlannerItem } from '../../lib/v2/planner'
import type { MaiState } from '../../lib/v2/state'
import type { AppView, Row, TodayBlock } from './app-types'
import type { InspectableItem } from './ContextDrawer'

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const cleanText = (value: unknown) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const TODAY_BLOCKS: { id: TodayBlock; label: string }[] = [
  { id: 'habits', label: 'Rotinas' },
  { id: 'goals', label: 'Metas' },
  { id: 'notes', label: 'Notas' },
  { id: 'finance', label: 'Finanças' },
  { id: 'health', label: 'Bem-estar' },
]

type Props = {
  id: TodayBlock
  state: MaiState
  today: string
  financeToday: PlannerItem[]
  navigate: (view: AppView) => void
  inspect: (item: InspectableItem) => void
}

export function TodayBlockView({ id, state, today, financeToday, navigate, inspect }: Props) {
  if (id === 'habits') {
    const habits = rows(state.habits).filter(item => item.ativo !== false).slice(0, 4)
    const entries = rows(state.habitEntries)
    return <section className="mai-today-card"><header><div><span>Rotinas</span><strong>{habits.length ? `${habits.filter(h => entries.some(e => String(e.habito_id) === String(h.id) && String(e.data).slice(0,10) === today && Number(e.valor || 0) >= Math.max(1, Number(h.meta || 1)))).length}/${habits.length}` : '0'}</strong></div><button onClick={() => navigate('habits')}>Abrir</button></header><div className="mai-card-list">{habits.map(habit => { const entry = entries.find(e => String(e.habito_id) === String(habit.id) && String(e.data).slice(0,10) === today); const done = Number(entry?.valor || 0) >= Math.max(1, Number(habit.meta || 1)); return <button key={String(habit.id)} onClick={() => inspect({ kind:'habit', sourceId:String(habit.id), title:String(habit.nome || 'Rotina'), date:today, raw:habit })}><i style={{background:habit.cor_hex || '#60765a'}}/><span><strong>{habit.nome}</strong><small>{done ? 'Concluída' : habit.hora || 'Pendente'}</small></span><b>{done ? '✓' : ''}</b></button> })}{!habits.length ? <small>Nenhuma rotina ativa.</small> : null}</div></section>
  }

  if (id === 'goals') {
    const goals = rows(state.goals).filter(item => !String(item.status || '').toLocaleLowerCase('pt-BR').includes('conclu')).sort((a, b) => String(a.prazo || '9999').localeCompare(String(b.prazo || '9999'))).slice(0, 4)
    return <section className="mai-today-card"><header><div><span>Metas</span><strong>{goals.length}</strong></div><button onClick={() => navigate('goals')}>Abrir</button></header><div className="mai-card-list">{goals.map(goal => { const pct = Math.round(Number(goal.progresso_atual || 0) / Math.max(1, Number(goal.progresso_total || 100)) * 100); return <button key={String(goal.id)} onClick={() => inspect({ kind:'goal', sourceId:String(goal.id), title:String(goal.titulo || 'Meta'), date:String(goal.prazo || '').slice(0,10), raw:goal })}><span><strong>{goal.titulo}</strong><small>{goal.prazo ? String(goal.prazo).slice(0,10) : 'Sem prazo'}</small></span><b>{pct}%</b></button> })}{!goals.length ? <small>Sem metas ativas.</small> : null}</div></section>
  }

  if (id === 'notes') {
    const notes = rows(state.notes).filter(item => item.ativo !== false && !item.arquivado).sort((a, b) => String(b.data || '').localeCompare(String(a.data || ''))).slice(0, 3)
    return <section className="mai-today-card"><header><div><span>Notas</span><strong>{notes.length}</strong></div><button onClick={() => navigate('notes')}>Abrir</button></header><div className="mai-card-list">{notes.map(note => <button key={String(note.id)} onClick={() => inspect({ kind:'note', sourceId:String(note.id), title:String(note.titulo || 'Nota'), raw:note })}><span><strong>{note.titulo || 'Sem título'}</strong><small>{cleanText(note.conteudo).slice(0,72) || 'Sem conteúdo'}</small></span></button>)}{!notes.length ? <small>Nenhuma nota recente.</small> : null}</div></section>
  }

  if (id === 'finance') {
    const total = financeToday.reduce((sum, item) => sum + (item.raw.tipo === 'receita' ? Number(item.raw.valor_real || item.raw.valor || 0) : -Number(item.raw.valor_real || item.raw.valor || 0)), 0)
    return <section className="mai-today-card"><header><div><span>Finanças</span><strong>{money.format(total)}</strong></div><button onClick={() => navigate('finance')}>Abrir</button></header><div className="mai-card-list">{financeToday.slice(0,4).map(item => <button key={item.id} onClick={() => inspect({ kind:'finance', sourceId:item.sourceId, title:item.title, date:item.date, time:item.time, raw:item.raw })}><span><strong>{item.title}</strong><small>{item.raw.categoria || (item.raw.tipo === 'receita' ? 'Receita' : 'Despesa')}</small></span><b>{item.raw.tipo === 'receita' ? '+' : '−'} {money.format(Number(item.raw.valor_real || item.raw.valor || 0))}</b></button>)}{!financeToday.length ? <small>Nenhum lançamento hoje.</small> : null}</div></section>
  }

  const healthDay = ((state.health.diary || {}) as Record<string, Row>)[today]
  return <section className="mai-today-card"><header><div><span>Bem-estar</span><strong>{healthDay?.sono?.score ? `${healthDay.sono.score}/100` : '—'}</strong></div><button onClick={() => navigate('health')}>Abrir</button></header><button className="mai-health-card-action" onClick={() => navigate('health')}><span>{healthDay ? 'Diário atualizado' : 'Check-in pendente'}</span><strong>{healthDay?.sono?.score ? 'Sono registrado hoje' : 'Registrar o dia'}</strong></button></section>
}
