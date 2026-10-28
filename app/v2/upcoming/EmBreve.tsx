'use client'

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { addDays, eventColor, plannerItems, type PlannerItem } from '../../../lib/v2/planner'
import { dateKey, type MaiState } from '../../../lib/v2/state'
import { Check, Icon } from '../../ds'
import type { Row } from '../app-types'
import type { InspectableItem } from '../ContextDrawer'
import { driveAssetUrl } from '../DriveAsset'
import { askConfirm } from '../shell/ConfirmDialog'
import { useQuickMenu, type QuickMenuConfig } from '../shell/QuickMenu'
import styles from './EmBreve.module.css'

/**
 * Em breve = módulo de agenda: tarefas e compromissos juntos, em lista por
 * dias, semana ou mês. Compromisso: bolinha da cor do calendário + horário.
 * Tarefa: círculo para concluir + projeto.
 */

type Mode = 'list' | 'week' | 'month'
type Filter = 'all' | 'tasks' | 'events'

type Entry = {
  id: string
  kind: 'task' | 'event'
  day: string
  time: string
  end: string
  title: string
  color: string
  source: string
  allDay: boolean
  done: boolean
  late: boolean
  priority: number
  project: { name: string; color: string; image: string } | null
  recurring: boolean
  planner: PlannerItem
}

const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : [])
const PRIORITY_COLOR: Record<number, string> = { 1: 'var(--ds-danger)', 2: 'var(--ds-peach-fg)', 3: 'var(--ds-sky-fg)' }
const WEEKDAY = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const LIST_CHUNK = 14

const minutes = (time: string) => {
  const [h, m] = String(time || '').split(':').map(Number)
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : NaN
}
const duration = (start: string, end: string) => {
  const total = minutes(end) - minutes(start)
  if (!Number.isFinite(total) || total <= 0) return ''
  const h = Math.floor(total / 60)
  const m = total % 60
  return !h ? `${m} min` : m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}
const ymd = (value: unknown) => String(value || '').slice(0, 10)
const dayDate = (key: string) => new Date(`${key}T12:00:00`)
const monthStart = (key: string) => `${key.slice(0, 7)}-01`
const shiftMonth = (key: string, amount: number) => {
  const date = dayDate(monthStart(key))
  date.setMonth(date.getMonth() + amount)
  return dateKey(date)
}
const longDay = (key: string) => dayDate(key).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
const shortRange = (start: string, end: string) => {
  const a = dayDate(start)
  const b = dayDate(end)
  const fmt = (date: Date) => date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '')
  return `${fmt(a)} – ${fmt(b)}`
}
const monthTitle = (key: string) => {
  const text = dayDate(key).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return text.charAt(0).toUpperCase() + text.slice(1)
}
function dayHeading(day: string, today: string) {
  if (day === today) return { name: 'Hoje', sub: longDay(day) }
  if (day === addDays(today, 1)) return { name: 'Amanhã', sub: longDay(day) }
  const text = longDay(day)
  return { name: text.charAt(0).toUpperCase() + text.slice(1), sub: '' }
}

function useIsMobile() {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)')
    const sync = () => setMobile(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  return mobile
}

type Props = {
  state: MaiState
  today: string
  commit: (change: (current: MaiState) => MaiState) => void
  inspect: (item: InspectableItem) => void
  /** Pede ao Google os eventos de outro período (sem argumentos: volta ao período padrão). */
  syncRange?: (start?: string, end?: string) => void
}

export function EmBreve({ state, today, commit, inspect, syncRange }: Props) {
  const mobile = useIsMobile()
  const quick = useQuickMenu()
  const saved = state.configs.upcomingView
  const [mode, setModeState] = useState<Mode>(saved === 'month' ? 'month' : saved === 'week' ? 'week' : 'list')
  const [filter, setFilter] = useState<Filter>('all')
  const [anchor, setAnchor] = useState(today)
  const [selected, setSelected] = useState(today)
  const [chunks, setChunks] = useState(1)
  const [lateOpen, setLateOpen] = useState(false)
  const [miniView, setMiniView] = useState(monthStart(today))

  const setMode = (next: Mode) => {
    setModeState(next)
    commit(current => ({ ...current, configs: { ...current.configs, upcomingView: next } }))
  }

  /* ------------------------------------------------------------ Período */
  const range = useMemo(() => {
    if (mode === 'list') return { start: today, end: addDays(today, chunks * LIST_CHUNK - 1) }
    if (mode === 'week') return { start: anchor, end: addDays(anchor, 6) }
    const first = monthStart(anchor)
    const startOffset = dayDate(first).getDay()
    const gridStart = addDays(first, -startOffset)
    return { start: gridStart, end: addDays(gridStart, 41) }
  }, [mode, today, anchor, chunks])

  // Google: só pede outro período quando o que está na tela sai da janela padrão.
  const extended = useRef(false)
  useEffect(() => {
    if (!syncRange) return
    const outside = range.start < addDays(today, -14) || range.end > addDays(today, 61)
    if (!outside && !extended.current) return
    const timer = window.setTimeout(() => {
      extended.current = outside
      if (outside) syncRange(range.start, range.end)
      else syncRange()
    }, 450)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end, today])
  useEffect(() => () => { if (extended.current) syncRange?.() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  /* -------------------------------------------------------------- Itens */
  const projects = useMemo(() => new Map(rows(state.projects).map(project => [String(project.id), project])), [state.projects])
  const projectOf = (id: unknown): Entry['project'] => {
    const key = String(id || 'entrada')
    if (key === 'entrada') return { name: 'Entrada', color: 'var(--ds-accent)', image: '' }
    const project = projects.get(key)
    if (!project) return null
    return { name: String(project.nome || 'Projeto'), color: String(project.cor || 'var(--ds-line-strong)'), image: project.imagem_url ? driveAssetUrl(project.imagem_url) : '' }
  }

  const toEntry = (item: PlannerItem): Entry => {
    if (item.kind === 'task') {
      const task = item.raw
      return {
        id: item.id, kind: 'task', day: item.date, time: item.time, end: '', title: item.title, color: eventColor({}), source: '',
        allDay: false, done: item.completed, late: item.date < today && !item.completed, priority: Number(task.prioridade || 4),
        project: projectOf(task.projeto_id), recurring: item.recurring, planner: item,
      }
    }
    const google = item.raw.tipo === 'google' || item.raw.tipo === 'gcalendar'
    const end = String(item.raw.hora_fim || '').slice(0, 5)
    return {
      id: item.id, kind: 'event', day: item.date, time: item.time ? item.time.slice(0, 5) : '', end, title: item.title, color: item.color,
      source: google ? String(item.raw.calendario_nome || 'Google Agenda') : String(item.raw.categoria || 'MAI'),
      allDay: item.raw.dia_inteiro === true || !item.time || item.subtitle === 'Em andamento',
      done: item.completed, late: false, priority: 4, project: null, recurring: item.recurring, planner: item,
    }
  }

  const entries = useMemo(() => {
    const list = plannerItems(state, range.start, range.end)
      .filter(item => (item.kind === 'task' || item.kind === 'event') && !(item.kind === 'task' && item.raw.parent_id))
      .filter(item => (filter === 'all' ? true : filter === 'tasks' ? item.kind === 'task' : item.kind === 'event'))
      .map(toEntry)
    const rank = (entry: Entry) => (entry.allDay ? 0 : entry.time ? 1 : 2)
    return list.sort((a, b) => a.day.localeCompare(b.day) || rank(a) - rank(b) || a.time.localeCompare(b.time) || a.title.localeCompare(b.title, 'pt-BR'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, range.start, range.end, filter, today, projects])

  const byDay = useMemo(() => {
    const map = new Map<string, Entry[]>()
    for (const entry of entries) map.set(entry.day, [...(map.get(entry.day) || []), entry])
    return map
  }, [entries])

  const overdue = useMemo(() => {
    if (filter === 'events') return []
    return rows(state.tasks)
      .filter(task => !task.concluida && !task.parent_id && ymd(task.data_vencimento) && ymd(task.data_vencimento) < today)
      .sort((a, b) => dateKey(a.data_vencimento).localeCompare(dateKey(b.data_vencimento)))
      .map(task => toEntry({ id: `task:${task.id}:${ymd(task.data_vencimento)}`, sourceId: String(task.id), kind: 'task', date: ymd(task.data_vencimento), time: String(task.data_vencimento).includes('T') ? String(task.data_vencimento).slice(11, 16) : '', title: String(task.titulo || 'Tarefa'), subtitle: '', color: '', completed: false, recurring: Boolean(task.repeticao), raw: task }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.tasks, today, filter, projects])

  const nowMinutes = (() => { const now = new Date(); return now.getHours() * 60 + now.getMinutes() })()
  const passed = (entry: Entry) => {
    if (entry.done) return true
    if (entry.kind !== 'event' || entry.allDay) return false
    if (entry.day < today) return true
    if (entry.day > today) return false
    const end = minutes(entry.end || entry.time) + (entry.end ? 0 : 60)
    return Number.isFinite(end) && end <= nowMinutes
  }

  /* ------------------------------------------------------------- Ações */
  const open = (entry: Entry) => inspect({ kind: entry.kind, sourceId: entry.planner.sourceId, title: entry.title, date: entry.day, time: entry.time, raw: entry.planner.raw })
  const toggleTask = (entry: Entry) => commit(current => ({ ...current, tasks: current.tasks.map(task => (String(task.id) === entry.planner.sourceId ? { ...task, concluida: !task.concluida, concluida_em: !task.concluida ? new Date().toISOString() : '' } : task)) }))
  const patchTask = (id: string, patch: Row) => commit(current => ({ ...current, tasks: current.tasks.map(task => (String(task.id) === id ? { ...task, ...patch } : task)) }))
  const nextMonday = (() => { const date = dayDate(today); const add = ((8 - date.getDay()) % 7) || 7; return addDays(today, add) })()
  const choices = [
    { label: 'Hoje', icon: 'today', value: today },
    { label: 'Amanhã', icon: 'wb_sunny', value: addDays(today, 1) },
    { label: 'Próx. semana', icon: 'date_range', value: nextMonday },
  ]

  function menuFor(entry: Entry): QuickMenuConfig {
    if (entry.kind === 'task') {
      const id = entry.planner.sourceId
      const task = entry.planner.raw
      const time = String(task.data_vencimento || '').includes('T') ? String(task.data_vencimento).slice(11, 16) : ''
      return {
        title: entry.title,
        subtitle: entry.project?.name || 'Tarefa',
        groups: [
          { label: 'Data', inline: true, options: [
            ...choices.map(choice => ({ label: choice.label, icon: choice.icon, active: entry.day === choice.value, onSelect: () => patchTask(id, { data_vencimento: `${choice.value}${time ? `T${time}` : ''}` }) })),
            { label: 'Sem data', icon: 'event_busy', onSelect: () => patchTask(id, { data_vencimento: '' }) },
          ] },
          { options: [
            { label: entry.done ? 'Reabrir tarefa' : 'Concluir', icon: entry.done ? 'undo' : 'check_circle', onSelect: () => toggleTask(entry) },
            { label: 'Abrir detalhes', icon: 'open_in_full', onSelect: () => open(entry) },
            { label: 'Excluir', icon: 'delete', tone: 'danger', onSelect: async () => {
              if (!(await askConfirm({ title: 'Excluir tarefa?', message: `“${entry.title}” será excluída. Não dá para desfazer.` }))) return
              commit(current => ({ ...current, tasks: current.tasks.filter(item => String(item.id) !== id && String(item.parent_id || '') !== id) }))
            } },
          ] },
        ],
      }
    }
    const raw = entry.planner.raw
    const google = raw.tipo === 'google' || raw.tipo === 'gcalendar'
    const id = entry.planner.sourceId
    const start = ymd(raw.data_inicio)
    const end = ymd(raw.data_fim)
    const moveTo = (target: string) => commit(current => ({
      ...current,
      events: rows(current.events).map(event => {
        if (String(event.id) !== id) return event
        const shift = Math.round((dayDate(target).getTime() - dayDate(start).getTime()) / 86400000)
        return { ...event, data_inicio: target, ...(end ? { data_fim: addDays(end, shift) } : {}) }
      }),
    }))
    return {
      title: entry.title,
      subtitle: `${entry.time ? `${entry.time} · ` : ''}${entry.source}`,
      groups: [
        ...(google || !start ? [] : [{ label: 'Mover para', inline: true, options: choices.map(choice => ({ label: choice.label, icon: choice.icon, active: start === choice.value, onSelect: () => moveTo(choice.value) })) }]),
        { options: [
          { label: 'Abrir detalhes', icon: 'open_in_full', onSelect: () => open(entry) },
          ...(google && raw.url ? [{ label: 'Abrir no Google Agenda', icon: 'open_in_new', onSelect: () => { window.open(String(raw.url), '_blank', 'noopener') } }] : []),
          ...(!google ? [{ label: 'Excluir', icon: 'delete', tone: 'danger' as const, onSelect: async () => {
            if (!(await askConfirm({ title: 'Excluir compromisso?', message: `“${entry.title}” será excluído. Não dá para desfazer.` }))) return
            commit(current => ({ ...current, events: rows(current.events).filter(event => String(event.id) !== id), eventCompletions: rows(current.eventCompletions).filter(entry2 => String(entry2.evento_id) !== id) }))
          } }] : []),
        ] },
      ],
    }
  }

  /* ----------------------------------------------------------- Peças */
  const projectTag = (entry: Entry) => {
    if (!entry.project) return null
    return (
      <span className={styles.project}>
        {entry.project.image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img className={styles.projectImg} src={entry.project.image} alt="" loading="lazy" />
          : <span className={styles.projectDot} style={{ background: entry.project.color }} />}
        <span>{entry.project.name}</span>
      </span>
    )
  }

  const renderRow = (entry: Entry, compact?: boolean) => {
    if (entry.kind === 'event' && entry.allDay) {
      return (
        <button type="button" className={styles.allDay} style={{ '--ev': entry.color } as CSSProperties} onClick={() => open(entry)} {...quick.bind(() => menuFor(entry))}>
          <span className={styles.allDayTag}>{entry.planner.subtitle === 'Em andamento' ? 'Contínuo' : 'Dia todo'}</span>
          <strong>{entry.title}</strong>
          <small>{entry.source}</small>
        </button>
      )
    }
    if (entry.kind === 'event') {
      const length = duration(entry.time, entry.end)
      return (
        <button type="button" className={styles.event} data-passed={passed(entry) || undefined} data-compact={compact || undefined} style={{ '--ev': entry.color } as CSSProperties} onClick={() => open(entry)} {...quick.bind(() => menuFor(entry))}>
          <span className={styles.eventDot} aria-hidden="true" />
          <span className={styles.eventTime}>{entry.time}</span>
          <strong>{entry.title}</strong>
          {entry.recurring ? <Icon name="repeat" size={12} /> : null}
          <small>{length ? `${length} · ` : ''}{entry.source}</small>
        </button>
      )
    }
    const color = !entry.done && PRIORITY_COLOR[entry.priority] ? PRIORITY_COLOR[entry.priority] : undefined
    return (
      <div className={styles.task} data-done={entry.done || undefined} data-compact={compact || undefined} {...quick.bind(() => menuFor(entry))}>
        <Check checked={entry.done} late={entry.late} label={entry.done ? 'Reabrir tarefa' : 'Concluir tarefa'} onCheckedChange={() => toggleTask(entry)} style={color ? ({ '--check-color': color } as CSSProperties) : undefined} />
        <button type="button" className={styles.taskMain} onClick={() => open(entry)}>
          <strong>{entry.title}</strong>
          {entry.time ? <span className={styles.taskTime}>{entry.time}</span> : null}
          {entry.late ? <span className={styles.lateTag}>{dayHeading(entry.day, today).name.slice(0, 12)}</span> : null}
          {projectTag(entry)}
        </button>
      </div>
    )
  }

  const filterChips = (
    <div className={styles.chips} role="tablist" aria-label="Filtrar">
      {([['all', 'Tudo'], ['tasks', 'Tarefas'], ['events', 'Compromissos']] as [Filter, string][]).map(([id, label]) => (
        <button key={id} type="button" role="tab" aria-selected={filter === id} data-active={filter === id || undefined} onClick={() => setFilter(id)}>{label}</button>
      ))}
    </div>
  )

  const overduePanel = overdue.length ? (
    <div className={styles.late}>
      <button type="button" className={styles.lateHead} aria-expanded={lateOpen} onClick={() => setLateOpen(value => !value)}>
        <Icon name="schedule" size={16} filled={false} />{overdue.length} {overdue.length === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}
        <Icon name="expand_more" size={18} filled={false} className={styles.lateChevron} />
      </button>
      {lateOpen ? <div className={styles.lateBody}>{overdue.map(entry => <Fragment key={entry.id}>{renderRow(entry)}</Fragment>)}</div> : null}
    </div>
  ) : null

  /* ------------------------------------------------------ Navegação */
  const step = (direction: number) => {
    if (mode === 'week') { setAnchor(addDays(anchor, direction * 7)); setSelected(addDays(anchor, direction * 7)) }
    else if (mode === 'month') { const next = shiftMonth(anchor, direction); setAnchor(next); setSelected(next) }
  }
  const goToday = () => { setAnchor(today); setSelected(today); setChunks(1) }
  const subtitle = mode === 'month' ? monthTitle(anchor) : mode === 'week' ? shortRange(range.start, range.end) : shortRange(today, addDays(today, chunks * LIST_CHUNK - 1))

  /* ----------------------------------------------------------- Lista */
  const listDays = useMemo(() => {
    const days: string[] = []
    for (let i = 0; i < chunks * LIST_CHUNK; i += 1) {
      const day = addDays(today, i)
      if (day === today || (byDay.get(day) || []).length) days.push(day)
    }
    return days
  }, [byDay, today, chunks])

  const dayBlock = (day: string, items: Entry[], compact?: boolean) => {
    const heading = dayHeading(day, today)
    return (
      <section key={day} className={styles.day} data-day={day}>
        <header className={styles.dayHead}>
          <strong data-today={day === today || undefined}>{heading.name}</strong>
          {heading.sub ? <span>{heading.sub}</span> : null}
          <em>{items.length ? `${items.length} ${items.length === 1 ? 'item' : 'itens'}` : ''}</em>
        </header>
        {items.length ? <div className={styles.dayBody}>{items.map(entry => <Fragment key={entry.id}>{renderRow(entry, compact)}</Fragment>)}</div> : <p className={styles.empty}>Nada marcado para este dia.</p>}
      </section>
    )
  }

  /* ------------------------------------------------------- Mini mês */
  const renderMini = () => {
    const first = miniView
    const offset = dayDate(first).getDay()
    const total = new Date(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 0).getDate()
    const cells: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: total }, (_, index) => `${first.slice(0, 8)}${String(index + 1).padStart(2, '0')}`)]
    return (
      <aside className={styles.mini} aria-label="Calendário">
        <div className={styles.miniHead}>
          <strong>{monthTitle(first)}</strong>
          <span>
            <button type="button" aria-label="Mês anterior" onClick={() => setMiniView(shiftMonth(first, -1))}><Icon name="chevron_left" size={18} filled={false} /></button>
            <button type="button" aria-label="Próximo mês" onClick={() => setMiniView(shiftMonth(first, 1))}><Icon name="chevron_right" size={18} filled={false} /></button>
          </span>
        </div>
        <div className={styles.miniGrid}>
          {WEEKDAY.map(name => <i key={name}>{name[0]}</i>)}
          {cells.map((day, index) => day
            ? <button key={day} type="button" data-today={day === today || undefined} data-has={(byDay.get(day) || []).length > 0 || undefined} onClick={() => { setMode('week'); setAnchor(day); setSelected(day) }}>{Number(day.slice(8))}</button>
            : <span key={`e${index}`} />)}
        </div>
      </aside>
    )
  }

  /* ----------------------------------------------------------- Semana */
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(range.start, index))
  const weekView = mobile ? (
    <>
      <div className={styles.strip}>
        {weekDays.map(day => {
          const items = byDay.get(day) || []
          return (
            <button key={day} type="button" data-active={selected === day || undefined} data-today={day === today || undefined} onClick={() => setSelected(day)}>
              <span>{WEEKDAY[dayDate(day).getDay()]}</span>
              <b>{Number(day.slice(8))}</b>
              <i>{items.slice(0, 3).map(entry => <u key={entry.id} style={{ background: entry.kind === 'event' ? entry.color : 'var(--ds-muted)' }} />)}</i>
            </button>
          )
        })}
      </div>
      {dayBlock(selected, byDay.get(selected) || [])}
    </>
  ) : (
    <div className={styles.week}>
      {weekDays.map(day => {
        const items = byDay.get(day) || []
        return (
          <section key={day} className={styles.weekCol} data-today={day === today || undefined}>
            <header>
              <span>{WEEKDAY[dayDate(day).getDay()]}</span>
              <b>{Number(day.slice(8))}</b>
            </header>
            <div className={styles.weekBody}>
              {items.map(entry => entry.kind === 'event' && entry.allDay
                ? <button key={entry.id} type="button" className={styles.weekAllDay} style={{ '--ev': entry.color } as CSSProperties} onClick={() => open(entry)} {...quick.bind(() => menuFor(entry))}>{entry.title}</button>
                : entry.kind === 'event'
                  ? <button key={entry.id} type="button" className={styles.weekEvent} data-passed={passed(entry) || undefined} style={{ '--ev': entry.color } as CSSProperties} onClick={() => open(entry)} {...quick.bind(() => menuFor(entry))}><b>{entry.time}</b><span>{entry.title}</span></button>
                  : <div key={entry.id} className={styles.weekTask} data-done={entry.done || undefined} {...quick.bind(() => menuFor(entry))}>
                    <Check checked={entry.done} late={entry.late} label="Concluir tarefa" onCheckedChange={() => toggleTask(entry)} />
                    <button type="button" onClick={() => open(entry)}><span>{entry.title}</span>{entry.project ? <small>{entry.project.name}</small> : null}</button>
                  </div>)}
            </div>
          </section>
        )
      })}
    </div>
  )

  /* -------------------------------------------------------------- Mês */
  const gridDays = Array.from({ length: 42 }, (_, index) => addDays(range.start, index))
  const monthKey = monthStart(anchor).slice(0, 7)
  const monthView = (
    <div className={styles.monthWrap}>
      <div className={styles.month}>
        {WEEKDAY.map(name => <div key={name} className={styles.monthHead}>{name}</div>)}
        {gridDays.map(day => {
          const items = byDay.get(day) || []
          return (
            <button key={day} type="button" className={styles.cell} data-other={day.slice(0, 7) !== monthKey || undefined} data-today={day === today || undefined} data-selected={selected === day || undefined} onClick={() => setSelected(day)}>
              <b>{Number(day.slice(8))}</b>
              {mobile ? (
                <i>{items.slice(0, 3).map(entry => <u key={entry.id} style={{ background: entry.kind === 'event' ? entry.color : 'var(--ds-muted)' }} />)}</i>
              ) : (
                <span className={styles.cellItems}>
                  {items.slice(0, 3).map(entry => (
                    <span key={entry.id} data-kind={entry.kind} data-done={entry.done || undefined} style={{ '--ev': entry.color } as CSSProperties}><u />{entry.title}</span>
                  ))}
                  {items.length > 3 ? <em>+{items.length - 3}</em> : null}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className={styles.monthSide}>{dayBlock(selected, byDay.get(selected) || [])}</div>
    </div>
  )

  /* ------------------------------------------------------------ Tela */
  return (
    <div className={styles.page} data-mode={mode}>
      <header className={styles.header}>
        <div className={styles.headText}>
          <span>{subtitle}</span>
          <h1>Em breve</h1>
        </div>
        <div className={styles.controls}>
          <div className={styles.segmented} role="tablist" aria-label="Visualização">
            {([['list', 'Lista'], ['week', 'Semana'], ['month', 'Mês']] as [Mode, string][]).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={mode === id} data-active={mode === id || undefined} onClick={() => { setMode(id); if (id !== 'list') { setAnchor(selected || today) } }}>{label}</button>
            ))}
          </div>
          <div className={styles.nav}>
            {mode !== 'list' ? <button type="button" aria-label="Anterior" onClick={() => step(-1)}><Icon name="chevron_left" size={20} filled={false} /></button> : null}
            <button type="button" className={styles.todayButton} onClick={goToday}>Hoje</button>
            {mode !== 'list' ? <button type="button" aria-label="Próximo" onClick={() => step(1)}><Icon name="chevron_right" size={20} filled={false} /></button> : null}
          </div>
        </div>
      </header>

      {filterChips}
      {mode !== 'month' ? overduePanel : null}

      {mode === 'list' ? (
        <div className={styles.listLayout}>
          <div className={styles.listMain}>
            {listDays.map(day => dayBlock(day, byDay.get(day) || []))}
            <button type="button" className={styles.more} onClick={() => setChunks(value => value + 1)}>Mostrar mais duas semanas</button>
          </div>
          {!mobile ? renderMini() : null}
        </div>
      ) : null}
      {mode === 'week' ? weekView : null}
      {mode === 'month' ? monthView : null}
      {quick.element}
    </div>
  )
}
