'use client'

import { useMemo } from 'react'
import { plannerItems } from '../../lib/v2/planner'
import type { MaiState } from '../../lib/v2/state'
import type { AppView, TodayBlock } from './app-types'
import type { InspectableItem } from './ContextDrawer'
import { MaiIcon } from './MaiIcons'
import { TodayBlockView } from './TodayBlocks'
import { TodayFlow } from './TodayFlow'
import styles from './unified.module.css'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

type Props = {
  state: MaiState
  today: string
  commit: (change: (current: MaiState) => MaiState) => void
  navigate: (view: AppView) => void
  inspect: (item: InspectableItem) => void
  onPersonalize: () => void
  onNewTask: () => void
}

export function TodayCompact({ state, today, commit, navigate, inspect, onPersonalize, onNewTask }: Props) {
  const plan = useMemo(() => plannerItems(state, today, today), [state, today])
  const overdue = useMemo(() => state.tasks.filter(task => !task.concluida && String(task.data_vencimento || '').slice(0, 10) && String(task.data_vencimento || '').slice(0, 10) < today), [state.tasks, today])
  const financeToday = plan.filter(item => item.kind === 'finance')
  const legacy = Array.isArray(state.configs.todaySections) ? state.configs.todaySections.map(String) : []
  const main = (Array.isArray(state.configs.todayMainSections) ? state.configs.todayMainSections : ['flow']).map(String) as TodayBlock[]
  const side = (Array.isArray(state.configs.todaySideSections) ? state.configs.todaySideSections : ['goals', 'notes', 'health', 'finance'].filter(id => !legacy.length || legacy.includes(id) || id === 'finance')).map(String) as TodayBlock[]
  const hidden = (Array.isArray(state.configs.todayHiddenSections) ? state.configs.todayHiddenSections : []).map(String)
  const visibleMain = main.filter(id => !hidden.includes(id))
  const visibleSide = side.filter(id => !hidden.includes(id) && !visibleMain.includes(id))

  const render = (id: TodayBlock) => id === 'flow'
    ? <TodayFlow items={plan} overdue={overdue} commit={commit} inspect={inspect} />
    : <TodayBlockView id={id} state={state} today={today} financeToday={financeToday} navigate={navigate} inspect={inspect} />

  return <div className={styles.todayView}>
    <div className={styles.moduleHeadline}><div><div><h1>Hoje</h1><p>{new Date(`${today}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div></div><div><button className={styles.secondaryButton} onClick={onPersonalize}><MaiIcon name="settings" size={15} /> Personalizar</button><button className={styles.primaryButton} onClick={onNewTask}>＋ Tarefa</button></div></div>
    <div className="mai-today-strip"><div><span>A fazer</span><strong>{plan.filter(item => !item.completed).length}</strong><small>{overdue.length ? `${overdue.length} atrasada${overdue.length === 1 ? '' : 's'}` : 'Sem atrasos'}</small></div><div><span>Compromissos</span><strong>{plan.filter(item => item.kind === 'event' && !item.completed).length}</strong><small>{plan.filter(item => item.kind === 'event' && item.time).sort((a, b) => a.time.localeCompare(b.time))[0]?.time || 'Agenda livre'}</small></div><div><span>Rotinas</span><strong>{plan.filter(item => item.kind === 'habit' && item.completed).length}/{plan.filter(item => item.kind === 'habit').length}</strong><small>Concluídas</small></div><div><span>Finanças</span><strong>{financeToday.length}</strong><small>{money.format(financeToday.reduce((sum, item) => sum + (item.raw.tipo === 'receita' ? Number(item.raw.valor_real || item.raw.valor || 0) : -Number(item.raw.valor_real || item.raw.valor || 0)), 0))}</small></div></div>
    <div className="mai-today-grid"><main>{visibleMain.map(id => <div key={id}>{render(id)}</div>)}</main>{visibleSide.length ? <aside className={styles.todaySide}>{visibleSide.map(id => <div key={id}>{render(id)}</div>)}</aside> : null}</div>
  </div>
}
