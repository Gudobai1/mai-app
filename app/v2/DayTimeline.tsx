'use client'

import { useEffect, useMemo, useState, type CSSProperties, type DragEvent } from 'react'
import { plannerItems, type PlannerItem } from '../../lib/v2/planner'
import type { MaiState } from '../../lib/v2/state'
import { Icon } from '../ds'
import type { InspectableItem } from './ContextDrawer'
import styles from './DayTimeline.module.css'

/**
 * Linha do tempo de um dia: compromissos, tarefas e hábitos com horário viram blocos
 * numa grade de horas; o que não tem horário fica em "Sem horário" e é arrastado
 * (ou recebe um horário no botão) para a grade. Usada em Hoje e em Em breve › Meu dia.
 */

type Props = {
  state: MaiState
  day: string
  today: string
  commit: (change: (current: MaiState) => MaiState) => void
  inspect: (item: InspectableItem) => void
}

const HOUR = 56
const SNAP = 15
const toMinutes = (time: string) => {
  const [h, m] = String(time || '').split(':').map(Number)
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : NaN
}
const clock = (total: number) => `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
const span = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`)
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

type Block = { item: PlannerItem; start: number; end: number; lane: number; lanes: number }

function duration(item: PlannerItem) {
  if (item.kind === 'event') {
    const start = toMinutes(item.time)
    const end = toMinutes(String(item.raw.hora_fim || ''))
    return Number.isFinite(end) && end > start ? end - start : 60
  }
  const planned = Number(item.raw.duracao_min || item.raw.duracao || 0)
  return planned > 0 ? planned : 30
}

const movable = (item: PlannerItem) => item.kind === 'task' || item.kind === 'habit' || (item.kind === 'event' && item.raw.tipo !== 'google' && item.raw.tipo !== 'gcalendar')

export function DayTimeline({ state, day, today, commit, inspect }: Props) {
  const [now, setNow] = useState(() => new Date())
  const [dragId, setDragId] = useState('')
  const [ghost, setGhost] = useState<number | null>(null)
  const [pickFor, setPickFor] = useState('')

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const items = useMemo(
    () => plannerItems(state, day, day).filter(item => item.kind !== 'goal' && !(item.kind === 'task' && item.raw.parent_id)),
    [state, day],
  )

  const { blocks, loose, firstHour, lastHour } = useMemo(() => {
    const timed: Block[] = []
    const rest: PlannerItem[] = []
    for (const item of items) {
      const allDay = item.kind === 'event' && (item.raw.dia_inteiro === true || item.subtitle === 'Em andamento')
      const start = toMinutes(item.time)
      if (item.kind !== 'finance' && !allDay && Number.isFinite(start)) {
        timed.push({ item, start, end: Math.min(1440, start + duration(item)), lane: 0, lanes: 1 })
      } else rest.push(item)
    }
    timed.sort((a, b) => a.start - b.start || b.end - a.end)
    let cluster: Block[] = []
    let clusterEnd = -1
    const flush = () => { const lanes = Math.max(1, ...cluster.map(block => block.lane + 1)); cluster.forEach(block => { block.lanes = lanes }); cluster = [] }
    for (const block of timed) {
      if (cluster.length && block.start >= clusterEnd) { flush(); clusterEnd = -1 }
      const used = cluster.filter(other => other.end > block.start).map(other => other.lane)
      let lane = 0
      while (used.includes(lane)) lane += 1
      block.lane = lane
      cluster.push(block)
      clusterEnd = Math.max(clusterEnd, block.end)
    }
    flush()
    const first = Math.min(7, ...timed.map(block => Math.floor(block.start / 60) - 1))
    const last = Math.max(21, ...timed.map(block => Math.ceil(block.end / 60) + 1))
    return { blocks: timed, loose: rest, firstHour: Math.max(0, first), lastHour: Math.min(24, last) }
  }, [items])

  const overdue = useMemo(() => (day !== today ? [] : (state.tasks as Record<string, any>[])
    .filter(task => !task.concluida && !task.parent_id && !task.ocultar_agenda && String(task.data_vencimento || '').slice(0, 10) && String(task.data_vencimento).slice(0, 10) < today)
    .map(task => ({ id: String(task.id), title: String(task.titulo || 'Tarefa'), date: String(task.data_vencimento).slice(0, 10), raw: task }))), [state.tasks, day, today])

  const isToday = day === today
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const gridHeight = (lastHour - firstHour) * HOUR
  const topOf = (minutes: number) => ((minutes - firstHour * 60) / 60) * HOUR

  const timed = blocks.filter(block => block.item.kind !== 'finance')
  const busy = timed.reduce((sum, block) => sum + (block.end - block.start), 0)
  const free = Math.max(0, (lastHour - firstHour) * 60 - busy)
  const counts = {
    event: items.filter(item => item.kind === 'event').length,
    task: items.filter(item => item.kind === 'task').length,
  }

  const open = (item: PlannerItem) => inspect({ kind: item.kind, sourceId: item.sourceId, title: item.title, date: item.date, time: item.time, raw: item.raw })

  const schedule = (item: PlannerItem, time: string | null) => commit(current => {
    if (item.kind === 'task') {
      return { ...current, tasks: current.tasks.map(task => {
        if (String(task.id) !== item.sourceId) return task
        const base = String(task.data_vencimento || day).slice(0, 10) || day
        return { ...task, data_vencimento: time ? `${base}T${time}` : base }
      }) }
    }
    if (item.kind === 'habit') {
      return { ...current, habits: (current.habits as Record<string, any>[]).map(habit => (String(habit.id) === item.sourceId ? { ...habit, hora: time || '' } : habit)) } as MaiState
    }
    if (item.kind === 'event' && time) {
      return { ...current, events: (current.events as Record<string, any>[]).map(event => {
        if (String(event.id) !== item.sourceId) return event
        const length = duration(item)
        return { ...event, hora_inicio: time, hora_fim: clock(Math.min(1439, toMinutes(time) + length)) }
      }) } as MaiState
    }
    return current
  })

  const toggleTask = (item: PlannerItem) => commit(current => ({ ...current, tasks: current.tasks.map(task => (String(task.id) === item.sourceId ? { ...task, concluida: !task.concluida, concluida_em: !task.concluida ? new Date().toISOString() : '' } : task)) }))

  const minutesAt = (event: DragEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const raw = firstHour * 60 + ((event.clientY - rect.top) / HOUR) * 60
    return Math.max(firstHour * 60, Math.min(lastHour * 60 - SNAP, Math.round(raw / SNAP) * SNAP))
  }
  const dragProps = (item: PlannerItem) => movable(item) ? {
    draggable: true,
    onDragStart: (event: DragEvent) => { event.dataTransfer.setData('text/plain', item.id); event.dataTransfer.effectAllowed = 'move'; setDragId(item.id) },
    onDragEnd: () => { setDragId(''); setGhost(null) },
  } : {}
  const dragged = dragId ? items.find(item => item.id === dragId) : undefined

  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, index) => firstHour + index)

  const looseRow = (item: PlannerItem) => (
    <div key={item.id} className={styles.looseItem} data-kind={item.kind} data-done={item.completed || undefined} {...dragProps(item)}>
      {movable(item) ? <Icon name="drag_indicator" size={16} filled={false} className={styles.grip} /> : null}
      {item.kind === 'task'
        ? <button type="button" className={styles.check} aria-label={`Concluir: ${item.title}`} aria-pressed={item.completed} onClick={() => toggleTask(item)}>{item.completed ? <Icon name="check" size={12} /> : null}</button>
        : <Icon name={item.kind === 'habit' ? 'autorenew' : item.kind === 'finance' ? 'payments' : 'event'} size={16} filled={false} style={{ color: item.color }} />}
      <button type="button" className={styles.looseMain} onClick={() => open(item)}>
        <span>{item.title}</span>
        <small>{item.kind === 'finance' ? item.subtitle : item.kind === 'event' ? 'Dia inteiro' : item.subtitle}</small>
      </button>
      {movable(item) && item.kind !== 'event' ? (
        pickFor === item.id
          ? <input type="time" className={styles.timeInput} aria-label={`Horário de ${item.title}`} autoFocus onBlur={() => setPickFor('')} onChange={event => { if (event.target.value) { schedule(item, event.target.value); setPickFor('') } }} />
          : <button type="button" className={styles.timeButton} onClick={() => setPickFor(item.id)}>Horário</button>
      ) : null}
    </div>
  )

  return (
    <div className={styles.wrap}>
      <div className={styles.summary}>
        <span>{counts.event} {counts.event === 1 ? 'compromisso' : 'compromissos'} · {counts.task} {counts.task === 1 ? 'tarefa' : 'tarefas'}</span>
        <span>{span(Math.round(free / 15) * 15)} livres</span>
        <div className={styles.meter} aria-hidden="true"><i style={{ width: `${Math.min(100, Math.round((busy / Math.max(1, (lastHour - firstHour) * 60)) * 100))}%` }} /></div>
      </div>

      <div className={styles.layout}>
        <section className={styles.gridCard} aria-label="Linha do tempo do dia">
          <div className={styles.grid} style={{ height: gridHeight, '--hour': `${HOUR}px` } as CSSProperties}
            onDragOver={event => { if (dragId) { event.preventDefault(); setGhost(minutesAt(event)) } }}
            onDragLeave={event => { if (event.currentTarget === event.target) setGhost(null) }}
            onDrop={event => {
              event.preventDefault()
              const target = dragged
              const at = minutesAt(event)
              setGhost(null); setDragId('')
              if (target) schedule(target, clock(at))
            }}>
            {hours.map(hour => (
              <span key={hour} className={styles.hourLabel} style={{ top: (hour - firstHour) * HOUR }}>{String(hour % 24).padStart(2, '0')}:00</span>
            ))}

            {blocks.map(({ item, start, end, lane, lanes }) => {
              const high = (end - start) / 60 * HOUR
              return (
                <div key={item.id} className={styles.block} data-kind={item.kind} data-done={item.completed || undefined} data-short={high < 40 || undefined}
                  style={{ top: topOf(start), height: Math.max(26, high - 2), left: `calc(${(lane / lanes) * 100}% + 8px)`, width: `calc(${100 / lanes}% - 12px)`, '--ev': item.kind === 'event' ? item.color : item.kind === 'habit' ? item.color : 'var(--ds-accent)' } as CSSProperties}
                  {...dragProps(item)}>
                  {item.kind === 'task'
                    ? <button type="button" className={styles.check} aria-label={`Concluir: ${item.title}`} aria-pressed={item.completed} onClick={() => toggleTask(item)}>{item.completed ? <Icon name="check" size={12} /> : null}</button>
                    : null}
                  <button type="button" className={styles.blockMain} onClick={() => open(item)}>
                    <b>{item.title}</b>
                    <small>{clock(start)} – {clock(end)}{item.kind === 'event' && item.subtitle ? ` · ${item.subtitle}` : ''}</small>
                  </button>
                  {item.kind !== 'event' && movable(item) ? <button type="button" className={styles.unplan} aria-label={`Tirar ${item.title} do horário`} onClick={() => schedule(item, null)}><Icon name="close" size={14} filled={false} /></button> : null}
                </div>
              )
            })}

            {ghost !== null && dragged ? (
              <div className={styles.ghost} style={{ top: topOf(ghost), height: Math.max(26, duration(dragged) / 60 * HOUR - 2) }}>
                <span>{dragged.title}</span><em>Solte aqui · {clock(ghost)}</em>
              </div>
            ) : null}

            {isToday && nowMin >= firstHour * 60 && nowMin <= lastHour * 60 ? (
              <div className={styles.now} style={{ top: topOf(nowMin) }} aria-label={`Agora, ${clock(nowMin)}`}><i /><span>{clock(nowMin)}</span></div>
            ) : null}
          </div>
        </section>

        <aside className={styles.side}>
          <section className={styles.panel}>
            <h2>Sem horário</h2>
            <p>Arraste para a linha do tempo ou toque em Horário.</p>
            {loose.length ? loose.map(looseRow) : <small className={styles.empty}>Tudo com horário por aqui.</small>}
          </section>
          {overdue.length ? (
            <section className={styles.panel}>
              <h2>Atrasadas</h2>
              {overdue.map(task => (
                <div key={task.id} className={styles.looseItem}>
                  <button type="button" className={styles.check} aria-label={`Concluir: ${task.title}`} onClick={() => commit(current => ({ ...current, tasks: current.tasks.map(row => (String(row.id) === task.id ? { ...row, concluida: true, concluida_em: new Date().toISOString() } : row)) }))} />
                  <button type="button" className={styles.looseMain} onClick={() => inspect({ kind: 'task', sourceId: task.id, title: task.title, date: task.date, time: '', raw: task.raw })}>
                    <span>{task.title}</span>
                    <small className={styles.late}>Atrasada · {task.date.split('-').reverse().slice(0, 2).join('/')}</small>
                  </button>
                </div>
              ))}
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
