'use client'

import { useMemo } from 'react'
import { plannerItems, type PlannerItem } from '../../lib/v2/planner'
import { nextRepeat, type MaiState } from '../../lib/v2/state'
import type { AppView, Row, TodayBlock } from './app-types'
import type { InspectableItem } from './ContextDrawer'
import { MaiIcon } from './MaiIcons'
import { TodayBlockView } from './TodayBlocks'

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []

type Props = {
  state: MaiState
  today: string
  commit: (change: (current: MaiState) => MaiState) => void
  navigate: (view: AppView) => void
  inspect: (item: InspectableItem) => void
  onPersonalize: () => void
}

export function TodayCompact({ state, today, commit, navigate, inspect, onPersonalize }: Props) {
  const plan = useMemo(() => plannerItems(state, today, today), [state, today])
  const events = useMemo(() => plan.filter(item => item.kind === 'event').sort((a,b) => `${a.time || '99:99'} ${a.title}`.localeCompare(`${b.time || '99:99'} ${b.title}`)), [plan])
  const dayTasks = useMemo(() => plan.filter(item => item.kind === 'task').sort((a,b) => `${a.time || '99:99'} ${a.title}`.localeCompare(`${b.time || '99:99'} ${b.title}`)), [plan])
  const overdue = useMemo(() => state.tasks.filter(task => !task.concluida && String(task.data_vencimento || '').slice(0,10) && String(task.data_vencimento || '').slice(0,10) < today), [state.tasks, today])
  const financeToday = plan.filter(item => item.kind === 'finance')
  const side = (Array.isArray(state.configs.todaySideSections) ? state.configs.todaySideSections : ['habits','goals','notes','finance','health']).map(String) as TodayBlock[]
  const hidden = (Array.isArray(state.configs.todayHiddenSections) ? state.configs.todayHiddenSections : []).map(String)
  const visibleSide = side.filter((id, index) => !hidden.includes(id) && side.indexOf(id) === index)

  function toggleEvent(item: PlannerItem) {
    const key = `${item.sourceId}|${item.date}|${item.time || ''}`
    commit(current => {
      const list = rows(current.eventCompletions)
      const exists = list.some(entry => entry.chave === key)
      return { ...current, eventCompletions: exists ? list.filter(entry => entry.chave !== key) : [...list, { chave:key, evento_id:item.sourceId, data:item.date, hora:item.time, concluida:true, atualizado_em:new Date().toISOString() }] }
    })
  }

  function toggleTask(id: string) {
    commit(current => ({ ...current, tasks: current.tasks.map(task => {
      if (task.id !== id) return task
      if (!task.concluida && task.repeticao && task.data_vencimento) return { ...task, data_vencimento: nextRepeat(task.data_vencimento, task.repeticao), concluida:false, concluida_em:'' }
      return { ...task, concluida:!task.concluida, concluida_em:!task.concluida ? new Date().toISOString() : '' }
    }) }))
  }

  const inspectPlanner = (item: PlannerItem) => inspect({ kind:item.kind, sourceId:item.sourceId, title:item.title, date:item.date, time:item.time, raw:item.raw })
  const dateLabel = new Date(`${today}T12:00:00`).toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' })

  return <div className="mai-today-page">
    <div className="mai-page-bar"><div><strong>Hoje</strong><span>{dateLabel}</span></div><button title="Personalizar lateral" onClick={onPersonalize}><MaiIcon name="settings" size={16}/></button></div>
    <div className="mai-today-layout-v2">
      <main className="mai-today-main-v2">
        <section className="mai-today-section">
          <header><strong>Compromissos</strong><span>{events.filter(item => !item.completed).length}</span></header>
          <div>{events.map(item => <article className="mai-today-item" key={item.id} data-completed={item.completed}><button className="mai-round-check" style={{borderColor:item.color,background:item.completed ? item.color : ''}} onClick={() => toggleEvent(item)}>{item.completed ? '✓' : ''}</button><button className="mai-item-body" onClick={() => inspectPlanner(item)}><strong>{item.title}</strong><small>{item.subtitle || 'Compromisso'}</small></button><time>{item.time || 'Dia todo'}</time></article>)}{!events.length ? <div className="mai-section-empty">Nenhum compromisso para hoje.</div> : null}</div>
        </section>

        <section className="mai-today-section">
          <header><strong>Tarefas</strong><span>{dayTasks.filter(item => !item.completed).length + overdue.length}</span></header>
          <div>{overdue.map(task => <article className="mai-today-item" key={`over-${task.id}`}><button className="mai-round-check" data-overdue="true" onClick={() => toggleTask(task.id)}/><button className="mai-item-body" onClick={() => inspect({ kind:'task', sourceId:task.id, title:task.titulo, date:String(task.data_vencimento || '').slice(0,10), raw:task as Row })}><strong>{task.titulo}</strong><small className="mai-overdue-text">Atrasada · {String(task.data_vencimento || '').slice(0,10)}</small></button><time>!</time></article>)}{dayTasks.map(item => <article className="mai-today-item" key={item.id} data-completed={item.completed}><button className="mai-round-check" style={{borderColor:item.color,background:item.completed ? item.color : ''}} onClick={() => toggleTask(item.sourceId)}>{item.completed ? '✓' : ''}</button><button className="mai-item-body" onClick={() => inspectPlanner(item)}><strong>{item.title}</strong><small>{item.subtitle}{item.recurring ? ' · recorrente' : ''}</small></button><time>{item.time || ''}</time></article>)}{!dayTasks.length && !overdue.length ? <div className="mai-section-empty">Nenhuma tarefa para hoje.</div> : null}</div>
        </section>
      </main>

      <aside className="mai-today-side-v2">{visibleSide.map(id => <TodayBlockView key={id} id={id} state={state} today={today} financeToday={financeToday} navigate={navigate} inspect={inspect}/>)}</aside>
    </div>
  </div>
}
