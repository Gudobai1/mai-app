'use client'

import { useMemo, useState } from 'react'
import { addDays, type PlannerItem, plannerItems } from '../../lib/v2/planner'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import styles from './unified.module.css'

type Props = {
  state: MaiState
  today: string
  inspect: (item: InspectableItem) => void
  onAgenda: () => void
}

export function UpcomingCompact({ state, today, inspect, onAgenda }: Props) {
  const [sort, setSort] = useState<'time' | 'priority' | 'project' | 'name'>('time')
  const [day, setDay] = useState('')
  const items = useMemo(() => plannerItems(state, today, addDays(today, 45)).filter(item => !item.completed), [state, today])
  const groups = useMemo(() => {
    const sorted = [...items].sort((a, b) => sort === 'time' ? `${a.date} ${a.time || '99:99'}`.localeCompare(`${b.date} ${b.time || '99:99'}`) : sort === 'priority' ? Number(a.raw.prioridade || 4) - Number(b.raw.prioridade || 4) || a.date.localeCompare(b.date) : sort === 'project' ? a.subtitle.localeCompare(b.subtitle, 'pt-BR') || a.date.localeCompare(b.date) : a.title.localeCompare(b.title, 'pt-BR'))
    const map = new Map<string, PlannerItem[]>()
    sorted.forEach(item => { if (day && item.date !== day) return; if (!map.has(item.date)) map.set(item.date, []); map.get(item.date)!.push(item) })
    return [...map.entries()]
  }, [items, sort, day])

  return <div>
    <div className={styles.moduleHeadline}><div><div><h1>Em breve</h1></div></div><div><button className={styles.primaryButton} onClick={onAgenda}>Agenda</button></div></div>
    <div className={styles.upcomingToolbar}><input type="date" value={day} onChange={event => setDay(event.target.value)} /><button onClick={() => setDay('')}>Todos</button><select value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="time">Horário</option><option value="priority">Prioridade</option><option value="project">Projeto</option><option value="name">Nome</option></select></div>
    <div className={styles.upcomingCalendarStrip}>{Array.from({ length: 14 }, (_, index) => addDays(today, index)).map(key => { const count = items.filter(item => item.date === key).length; return <button key={key} data-active={day === key} data-today={key === today} onClick={() => setDay(current => current === key ? '' : key)}><small>{new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' })}</small><strong>{Number(key.slice(8))}</strong><span>{count || ''}</span></button> })}</div>
    <div className={styles.upcomingList}>{groups.map(([key, list]) => <section key={key}><header><strong>{key === today ? 'Hoje' : new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</strong><span>{list.length}</span></header>{list.map(item => <article className={styles.todayRow} key={item.id}><span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} /><button onClick={() => inspect({ kind: item.kind, sourceId: item.sourceId, title: item.title, date: item.date, time: item.time, raw: item.raw })}><strong>{item.title}</strong><small>{item.subtitle}{item.recurring ? ' · recorrente' : ''}</small></button><time>{item.time || 'Dia todo'}</time></article>)}</section>)}</div>
  </div>
}
