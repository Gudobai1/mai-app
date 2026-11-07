'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type DragEvent } from 'react'
import { plannerItems, type PlannerItem } from '../../lib/v2/planner'
import type { MaiState } from '../../lib/v2/state'
import { Check, Icon } from '../ds'
import { abbreviateUnit } from '../../lib/v2/units'
import { AgendaStrip } from './today/AgendaStrip'
import { DotRing } from './habits/DotRing'
import todayStyles from './today/TodayModern.module.css'
import type { InspectableItem } from './ContextDrawer'
import styles from './DayTimeline.module.css'

/**
 * Linha do tempo de um dia: compromissos, tarefas e hábitos com horário viram blocos
 * numa grade de horas; o que não tem horário fica em "Sem horário" e é arrastado
 * (ou recebe um horário no botão) para a grade. Usada em Hoje e em Em breve › Meu dia.
 */

/* Botão "Organizar o dia" (fica no cabeçalho da tela) e o pop-up (aqui dentro) conversam por este estado. */
const organizer = { count: 0, open: false }
const organizerListeners = new Set<() => void>()
const emitOrganizer = () => organizerListeners.forEach(listener => listener())
const subscribeOrganizer = (listener: () => void) => { organizerListeners.add(listener); return () => { organizerListeners.delete(listener) } }
const organizerSnap = () => organizer.count * 2 + (organizer.open ? 1 : 0)

export function OrganizeButton() {
  const snapshot = useSyncExternalStore(subscribeOrganizer, organizerSnap, organizerSnap)
  const count = snapshot >> 1
  return (
    <button type="button" className={styles.organize} aria-label="Organizar o dia" aria-expanded={(snapshot & 1) === 1} onClick={() => { organizer.open = !organizer.open; emitOrganizer() }}>
      <Icon name="event_note" size={20} filled={false} />
      {count ? <b>{count}</b> : null}
    </button>
  )
}

type Props = {
  state: MaiState
  day: string
  today: string
  commit: (change: (current: MaiState) => MaiState) => void
  inspect: (item: InspectableItem) => void
  /** Mesmos filtros da tela (tipos, "somente o próximo", projetos…). */
  accept?: (item: PlannerItem) => boolean
}

const FIRST_HOUR = 0
const LAST_HOUR = 24
const ROW_MIN = 22
const SNAP = 15
const toMinutes = (time: string) => {
  if (!String(time || '').trim()) return NaN // sem horário não é 00:00
  const [h, m] = String(time || '').split(':').map(Number)
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : NaN
}
const clock = (total: number) => `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
const span = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`)
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

type Block = { item: PlannerItem; start: number; end: number; lane: number; lanes: number; group?: PlannerItem[] }

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

export function DayTimeline({ state, day, today, commit, inspect, accept }: Props) {
  const [now, setNow] = useState(() => new Date())
  const [dragId, setDragId] = useState('')
  const [ghost, setGhost] = useState<number | null>(null)
  const [pickFor, setPickFor] = useState('')

  useEffect(() => () => { organizer.count = 0; organizer.open = false; emitOrganizer() }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const items = useMemo(() => {
    const base = plannerItems(state, day, day).filter(item => item.kind !== 'goal' && item.kind !== 'finance' && !(item.kind === 'task' && item.raw.parent_id))
    // Finanças e metas seguem a mesma regra do módulo Hoje (hoje inclui o que já venceu).
    const key = (value: unknown) => String(value || '').slice(0, 10)
    const due = (date: string) => Boolean(date) && (day === today ? date <= today : date === day)
    const paid = (status: unknown) => ['pago', 'paga', 'quitado', 'quitada', 'concluido', 'concluida'].includes(String(status || '').toLowerCase())
    const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    const finance: PlannerItem[] = (((state.finance as unknown as Record<string, any>)?.transactions || []) as Record<string, any>[])
      .filter(item => due(key(item.data)) && !item.ignorar_calculo && !paid(item.status) && !(item.pluggy_id && !item.of_linked) && item.ocultar_inicio !== true && item.ocultar_home !== true && !(item.cartao_id && !item.ajuste_fatura && !item.fixo_id))
      .map(item => ({ id: `finance:${item.id}:${day}`, sourceId: String(item.id), kind: 'finance', date: key(item.data), time: '', title: String(item.descricao || item.titulo || item.nome || item.categoria || 'Lançamento'), subtitle: `${item.tipo === 'receita' ? 'Receita' : 'Despesa'} · ${money.format(Number(item.valor || 0))}`, color: item.tipo === 'receita' ? '#4f8a66' : '#b75b55', completed: false, recurring: item.recorrente === true, raw: item }) as PlannerItem)
    const goals: PlannerItem[] = ((state.goals || []) as unknown as Record<string, any>[])
      .filter(goal => due(key(goal.prazo || goal.data || goal.data_limite || goal.deadline)) && goal.concluida !== true && !String(goal.status || '').toLowerCase().includes('conclu'))
      .map(goal => ({ id: `goal:${goal.id}:${day}`, sourceId: String(goal.id), kind: 'goal', date: key(goal.prazo || goal.data || goal.data_limite || goal.deadline), time: '', title: String(goal.titulo || goal.nome || 'Meta'), subtitle: 'Prazo da meta', color: String(goal.cor || '#8a6f98'), completed: false, recurring: false, raw: goal }) as PlannerItem)
    return [...base, ...finance, ...goals].filter(item => !accept || accept(item))
  }, [state, day, today, accept])

  const firstHour = FIRST_HOUR
  const lastHour = LAST_HOUR
  const { blocks, loose } = useMemo(() => {
    const timed: Block[] = []
    const rest: PlannerItem[] = []
    const habitsAt = new Map<number, PlannerItem[]>()
    for (const item of items) {
      const allDay = item.kind === 'event' && (item.raw.dia_inteiro === true || item.subtitle === 'Em andamento')
      const start = toMinutes(item.time)
      if (item.kind === 'habit' && !allDay && Number.isFinite(start)) {
        habitsAt.set(start, [...(habitsAt.get(start) || []), item])
      } else if (item.kind !== 'finance' && !allDay && Number.isFinite(start)) {
        timed.push({ item, start, end: Math.min(1440, start + duration(item)), lane: 0, lanes: 1 })
      } else rest.push(item)
    }
    // Hábitos no mesmo horário viram um bloco só, com uma linha por hábito (nome + progresso).
    habitsAt.forEach((group, start) => timed.push({ item: group[0], group, start, end: Math.min(1440, start + 30 * group.length), lane: 0, lanes: 1 }))
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
    return { blocks: timed, loose: rest }
  }, [items])

  const overdue = useMemo(() => (day !== today ? [] : (state.tasks as Record<string, any>[])
    .filter(task => !task.concluida && !task.parent_id && !task.ocultar_agenda && String(task.data_vencimento || '').slice(0, 10) && String(task.data_vencimento).slice(0, 10) < today)
    .map(task => ({ id: String(task.id), title: String(task.titulo || 'Tarefa'), date: String(task.data_vencimento).slice(0, 10), raw: task }))), [state.tasks, day, today])

  const isToday = day === today
  const organizerSnapshot = useSyncExternalStore(subscribeOrganizer, organizerSnap, organizerSnap)
  const dockOpen = (organizerSnapshot & 1) === 1
  const setDockOpen = (next: boolean | ((current: boolean) => boolean)) => { organizer.open = typeof next === 'function' ? next(organizer.open) : next; emitOrganizer() }
  const [HOUR, setHour] = useState(36)
  const cardRef = useRef<HTMLElement | null>(null)
  // As 24 horas cabem na tela, sem rolar: a altura da hora vem do espaço livre abaixo do cabeçalho.
  useLayoutEffect(() => {
    const fit = () => {
      const card = cardRef.current
      if (!card) return
      const mobile = window.matchMedia('(max-width: 900px)').matches
      const reserve = mobile ? 72 : 24
      const free = window.innerHeight - card.getBoundingClientRect().top - reserve - 32
      setHour(Math.max(mobile ? 14 : 22, Math.min(56, Math.floor(free / 24))))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const gridHeight = (lastHour - firstHour) * HOUR
  const topOf = (minutes: number) => ((minutes - firstHour * 60) / 60) * HOUR

  useEffect(() => { organizer.count = items.length + overdue.length; emitOrganizer() }, [items.length, overdue.length])

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

  const habitState = (item: PlannerItem) => {
    const entry = (state.habitEntries as Record<string, any>[]).find(row => String(row.habito_id) === item.sourceId && String(row.data).slice(0, 10) === day)
    const target = Math.max(1, Number(item.raw.meta || 1))
    const value = entry && entry.falhou !== true ? Number(entry.valor || 0) : 0
    const quantitative = target > 1 || Boolean(item.raw.unidade)
    const number = (amount: number) => String(Math.round(amount * 10) / 10).replace('.', ',')
    const unit = String(item.raw.unidade || '').trim()
    const label = quantitative ? `${number(value)} de ${number(target)}${unit ? ` ${unit}` : ''}` : value > 0 ? 'Feito' : 'Pendente'
    const failed = entry?.falhou === true
    return { target, value, quantitative, label: failed ? 'Não feito' : label, failed, pct: Math.min(100, Math.round((value / target) * 100)) }
  }
  const toggleHabit = (item: PlannerItem) => {
    if (day > today) return open(item)
    const { target, quantitative } = habitState(item)
    commit(current => {
      const all = current.habitEntries as Record<string, any>[]
      const existing = all.find(row => String(row.habito_id) === item.sourceId && String(row.data).slice(0, 10) === day)
      const others = all.filter(row => row !== existing)
      const make = (valor: number) => ({ id: existing?.id || `hr-${crypto.randomUUID()}`, habito_id: item.raw.id, data: day, valor, falhou: false, status: '', criado_em: existing?.criado_em || new Date().toISOString() })
      const currentValue = existing && existing.falhou !== true ? Number(existing.valor || 0) : 0
      if (!quantitative) return { ...current, habitEntries: currentValue > 0 ? others : [...others, make(target)] } as MaiState
      const next = currentValue >= target ? 0 : currentValue + 1
      return { ...current, habitEntries: next === 0 ? others : [...others, make(next)] } as MaiState
    })
  }

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

  const projectOf = (item: PlannerItem) => (state.projects as Record<string, any>[]).find(project => String(project.id) === String(item.raw.projeto_id || ''))
  const timeControl = (item: PlannerItem) => (
    movable(item) && item.kind !== 'event' && !item.time ? (
      pickFor === item.id
        ? <input type="time" className={styles.timeInput} aria-label={`Horário de ${item.title}`} autoFocus onBlur={() => setPickFor('')} onChange={event => { if (event.target.value) { schedule(item, event.target.value); setPickFor('') } }} />
        : <button type="button" className={styles.timeButton} onClick={() => setPickFor(item.id)}>Horário</button>
    ) : null
  )

  // Mesmo visual das listas do módulo Hoje.
  const taskRow = (item: PlannerItem) => {
    const project = projectOf(item)
    const priority = Number(item.raw.prioridade || 4)
    const color = priority === 1 ? 'var(--ds-rose-fg)' : priority === 2 ? 'var(--ds-peach-fg)' : priority === 3 ? 'var(--ds-sky-fg)' : ''
    return (
      <div key={item.id} role="listitem" className={`${todayStyles.item} ${todayStyles.itemWrap} ${todayStyles.task} ${item.completed ? todayStyles.itemPassed : ''}`} {...dragProps(item)}>
        <Check className={todayStyles.itemCheck} checked={item.completed} label={`Concluir: ${item.title}`} data-priority={!item.completed && color ? priority : undefined} style={!item.completed && color ? ({ '--check-color': color } as CSSProperties) : undefined} onCheckedChange={() => toggleTask(item)} />
        <div className={todayStyles.taskMain} onClick={() => open(item)}>
          <button type="button" className={todayStyles.taskTitleBtn}>{item.title}</button>
          <div className={todayStyles.taskMeta}>
            {item.time ? <span className={todayStyles.dateTag}><Icon name="schedule" size={14} filled={false} />{item.time}</span> : null}
            <span className={todayStyles.projLabel} style={{ color: String(project?.cor || 'var(--ds-line-strong)') }}>{String(project?.nome || 'Entrada')}<b>#</b></span>
          </div>
        </div>
        {timeControl(item)}
      </div>
    )
  }

  const habitRow = (item: PlannerItem) => {
    const info = habitState(item)
    const color = String(item.raw.cor_hex || item.color || 'var(--ds-accent)')
    const entry = (state.habitEntries as Record<string, any>[]).find(row => String(row.habito_id) === item.sourceId && String(row.data).slice(0, 10) === day)
    const sub = [item.time, info.quantitative || info.failed ? info.label : item.completed ? 'Feito' : 'Pendente'].filter(Boolean).join(' · ')
    return (
      <div key={item.id} role="listitem" className={todayStyles.habitRow} style={{ '--hc': color } as CSSProperties} {...dragProps(item)}>
        <button type="button" className={todayStyles.habitBody} onClick={() => open(item)}>
          <span className={todayStyles.habitTitle} style={{ color }}>{item.title}</span>
          <span className={todayStyles.habitDesc}>{sub}</span>
        </button>
        {timeControl(item)}
        <span className={todayStyles.habitDots}>
          <button type="button" className={todayStyles.habitDay} data-on={info.pct >= 100 || undefined} data-part={(info.pct > 0 && info.pct < 100) || undefined} data-failed={info.failed || undefined} data-today={day === today || undefined} disabled={day > today} onClick={() => toggleHabit(item)} aria-label={`Registrar: ${item.title}`}>
            <DotRing pct={info.pct} value={Number(entry?.valor || 0)} unit={abbreviateUnit(item.raw.unidade)} plain={!info.quantitative} fail={info.failed} empty={info.value <= 0 && !info.failed} today={day === today} />
          </button>
        </span>
      </div>
    )
  }

  const financeRow = (item: PlannerItem) => (
    <div key={item.id} role="listitem" className={`${todayStyles.item} ${todayStyles.itemWrap} ${todayStyles.task} ${item.completed ? todayStyles.itemPassed : ''}`}>
      <Icon name={item.kind === 'goal' ? 'flag' : 'payments'} size={20} filled={false} style={{ color: item.color }} />
      <div className={todayStyles.taskMain} onClick={() => open(item)}>
        <button type="button" className={todayStyles.taskTitleBtn}>{item.title}</button>
        <div className={todayStyles.taskMeta}><span className={todayStyles.dateTag}>{item.subtitle}</span></div>
      </div>
    </div>
  )

  const groupEvents = items.filter(item => item.kind === 'event')
  const groupTasks = items.filter(item => item.kind === 'task')
  const groupHabits = items.filter(item => item.kind === 'habit')
  const groupFinance = items.filter(item => item.kind === 'finance')
  const groupGoals = items.filter(item => item.kind === 'goal')

  return (
    <div className={styles.wrap}>
      <div className={styles.layout}>
        <section ref={cardRef} className={styles.gridCard} aria-label="Linha do tempo do dia">
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
            {hours.filter(hour => HOUR >= 28 || hour % 2 === 0).map(hour => (
              <span key={hour} className={styles.hourLabel} style={{ top: (hour - firstHour) * HOUR }}>{String(hour % 24).padStart(2, '0')}:00</span>
            ))}

            {blocks.map(({ item, start, end, lane, lanes, group }) => {
              const high = (end - start) / 60 * HOUR
              if (group) {
                return (
                  <div key={`habits-${start}`} className={styles.habitGroup}
                    style={{ top: topOf(start), height: Math.max(group.length * ROW_MIN, high - 2), left: `calc(${(lane / lanes) * 100}% + 8px)`, width: `calc(${100 / lanes}% - 12px)` } as CSSProperties}>
                    {group.map(habit => (
                      <div key={habit.id} className={styles.habitLine} data-done={habit.completed || undefined} {...dragProps(habit)}>
                        <button type="button" className={styles.check} aria-label={`Registrar: ${habit.title}`} aria-pressed={habit.completed} onClick={() => toggleHabit(habit)}>{habit.completed ? <Icon name="check" size={12} /> : null}</button>
                        <button type="button" className={styles.blockMain} onClick={() => open(habit)}>
                          <b>{habit.title}</b>
                        </button>
                        <span className={styles.habitProgress}>{clock(start)} · {habitState(habit).label}</span>
                        <button type="button" className={styles.unplan} aria-label={`Tirar ${habit.title} do horário`} onClick={() => schedule(habit, null)}><Icon name="close" size={14} filled={false} /></button>
                      </div>
                    ))}
                  </div>
                )
              }
              return (
                <div key={item.id} className={styles.block} data-kind={item.kind} data-done={item.completed || undefined} data-short={high < 44 || undefined}
                  style={{ top: topOf(start), height: Math.max(18, high - 2), left: `calc(${(lane / lanes) * 100}% + 8px)`, width: `calc(${100 / lanes}% - 12px)`, '--ev': item.kind === 'event' ? item.color : item.kind === 'habit' ? item.color : 'var(--ds-accent)' } as CSSProperties}
                  {...dragProps(item)}>
                  {item.kind === 'task'
                    ? <button type="button" className={styles.check} aria-label={`Concluir: ${item.title}`} aria-pressed={item.completed} onClick={() => toggleTask(item)}>{item.completed ? <Icon name="check" size={12} /> : null}</button>
                    : item.kind === 'habit'
                      ? <button type="button" className={styles.check} aria-label={`Registrar: ${item.title}`} aria-pressed={item.completed} onClick={() => toggleHabit(item)}>{item.completed ? <Icon name="check" size={12} /> : null}</button>
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
              <div className={styles.ghost} style={{ top: topOf(ghost), height: Math.max(18, duration(dragged) / 60 * HOUR - 2) }}>
                <span>{dragged.title}</span><em>Solte aqui · {clock(ghost)}</em>
              </div>
            ) : null}

            {isToday && nowMin >= firstHour * 60 && nowMin <= lastHour * 60 ? (
              <div className={styles.now} style={{ top: topOf(nowMin) }} aria-label={`Agora, ${clock(nowMin)}`}><i /><span>{clock(nowMin)}</span></div>
            ) : null}
          </div>
        </section>

        <aside className={styles.side} data-open={dockOpen || undefined} aria-label="Dia todo">
          {dockOpen ? <button type="button" className={styles.scrim} aria-label="Fechar" onClick={() => setDockOpen(false)} /> : null}
          <div className={styles.dockBody}>
            <section className={`${styles.panel} ${todayStyles.page} ${styles.hojeScope}`}>
              <h2>Dia todo</h2>
              {items.length ? null : <small className={styles.empty}>Nada previsto para este dia.</small>}
              {groupEvents.length ? <div className={styles.group}><h3>Compromissos</h3><AgendaStrip items={groupEvents} nowMinutes={isToday ? nowMin : null} isPassed={() => false} onOpen={open} bind={() => ({})} /></div> : null}
              {groupTasks.length ? <div className={styles.group}><h3>Tarefas</h3><div className={todayStyles.items} role="list">{groupTasks.map(taskRow)}</div></div> : null}
              {groupHabits.length ? <div className={styles.group}><h3>Hábitos</h3><div className={todayStyles.habitList} role="list">{groupHabits.map(habitRow)}</div></div> : null}
              {groupFinance.length ? <div className={styles.group}><h3>Finanças</h3><div className={todayStyles.items} role="list">{groupFinance.map(financeRow)}</div></div> : null}
              {groupGoals.length ? <div className={styles.group}><h3>Metas</h3><div className={todayStyles.items} role="list">{groupGoals.map(financeRow)}</div></div> : null}
            </section>
            {overdue.length ? (
              <section className={`${styles.panel} ${styles.panelLate}`}>
                <h2>Atrasadas</h2>
                <div className={styles.looseList}>
                  {overdue.map(task => (
                    <div key={task.id} className={styles.looseItem}>
                      <button type="button" className={styles.check} aria-label={`Concluir: ${task.title}`} onClick={() => commit(current => ({ ...current, tasks: current.tasks.map(row => (String(row.id) === task.id ? { ...row, concluida: true, concluida_em: new Date().toISOString() } : row)) }))} />
                      <button type="button" className={styles.looseMain} onClick={() => inspect({ kind: 'task', sourceId: task.id, title: task.title, date: task.date, time: '', raw: task.raw })}>
                        <span>{task.title}</span>
                        <small className={styles.late}>Atrasada · {task.date.split('-').reverse().slice(0, 2).join('/')}</small>
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  )
}

/** Navegação de dia: setas e a própria data, que também volta para hoje. */
export function DayNav({ day, today, onStep, onToday }: { day: string; today: string; onStep: (direction: number) => void; onToday: () => void }) {
  const raw = new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^([^,]+?)-feira/, '$1')
  const label = raw.charAt(0).toUpperCase() + raw.slice(1)
  return (
    <div className={styles.dayNav}>
      <button type="button" className={styles.dayStep} aria-label="Dia anterior" onClick={() => onStep(-1)}><Icon name="chevron_left" size={20} filled={false} /></button>
      <button type="button" className={styles.dayTitle} aria-label={day === today ? `${label}, hoje` : `${label}. Voltar para hoje`} onClick={onToday}>{label}</button>
      <button type="button" className={styles.dayStep} aria-label="Próximo dia" onClick={() => onStep(1)}><Icon name="chevron_right" size={20} filled={false} /></button>
    </div>
  )
}
