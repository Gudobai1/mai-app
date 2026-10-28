'use client'

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { addDays, eventColor, plannerItems, type PlannerItem } from '../../../lib/v2/planner'
import { dateKey, type MaiState } from '../../../lib/v2/state'
import { Icon } from '../../ds'
import type { Row } from '../app-types'
import type { InspectableItem } from '../ContextDrawer'
import { driveAssetUrl } from '../DriveAsset'
import { Floating } from '../detail/Pickers'
import { financeCardPaymentState } from '../FinanceTransactionCard'
import { askConfirm } from '../shell/ConfirmDialog'
import { useQuickMenu, type QuickMenuConfig } from '../shell/QuickMenu'
import tasksStyles from '../tasks/TasksModern.module.css'
import styles from './EmBreve.module.css'

/**
 * Em breve = agenda do MAI: compromissos, tarefas, hábitos e lançamentos
 * financeiros em lista infinita, semana (domingo a sábado) ou mês.
 * Em todas as listas: compromissos primeiro, depois tarefas, hábitos e finanças.
 */

type Mode = 'list' | 'week' | 'month'
type Kind = 'event' | 'task' | 'habit' | 'finance'

type Entry = {
  id: string
  kind: Kind
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
  subtitle: string
  amount: string
  planner: PlannerItem
}

const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : [])
const PRIORITY_COLOR: Record<number, string> = { 1: 'var(--ds-rose-fg)', 2: 'var(--ds-peach-fg)', 3: 'var(--ds-sky-fg)' }
const WEEKDAY = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const KINDS: { id: Kind; label: string; icon: string }[] = [
  { id: 'event', label: 'Compromissos', icon: 'event' },
  { id: 'task', label: 'Tarefas', icon: 'task_alt' },
  { id: 'habit', label: 'Hábitos', icon: 'autorenew' },
  { id: 'finance', label: 'Finanças', icon: 'payments' },
]
const HOUR = 52
const MAX_HORIZON = 730

const ymd = (value: unknown) => String(value || '').slice(0, 10)
const minutes = (time: string) => {
  const [h, m] = String(time || '').split(':').map(Number)
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : NaN
}
const dayDate = (key: string) => new Date(`${key}T12:00:00`)
const monthStart = (key: string) => `${key.slice(0, 7)}-01`
const monthLength = (key: string) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate()
const weekStart = (key: string) => addDays(key, -dayDate(key).getDay())
const diff = (a: string, b: string) => Math.round((dayDate(b).getTime() - dayDate(a).getTime()) / 86400000)
const shiftMonth = (key: string, amount: number) => {
  const date = dayDate(monthStart(key))
  date.setMonth(date.getMonth() + amount)
  return dateKey(date)
}
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const longDay = (key: string) => dayDate(key).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
const monthTitle = (key: string) => cap(dayDate(key).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))
const shortRange = (start: string, end: string) => {
  const fmt = (key: string) => dayDate(key).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '')
  return `${fmt(start)} – ${fmt(end)}`
}
const monthShort = (key: string) => dayDate(key).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
const naturalDate = (key: string, today: string) => {
  if (key === today) return 'Hoje'
  if (key === addDays(today, -1)) return 'Ontem'
  if (key === addDays(today, 1)) return 'Amanhã'
  return cap(dayDate(key).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, ''))
}
function dayHeading(day: string, today: string) {
  if (day === today) return { name: 'Hoje', sub: cap(longDay(day)) }
  if (day === addDays(today, 1)) return { name: 'Amanhã', sub: cap(longDay(day)) }
  return { name: cap(longDay(day)), sub: '' }
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
  const [selected, setSelected] = useState(today)
  const [anchor, setAnchor] = useState(weekStart(today))
  const [monthAnchor, setMonthAnchor] = useState(monthStart(today))
  const [miniMonth, setMiniMonth] = useState(monthStart(today))
  const [horizon, setHorizon] = useState(28)
  const [lateOpen, setLateOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [scrollTo, setScrollTo] = useState({ day: today, n: 0 })
  const filterRef = useRef<HTMLButtonElement | null>(null)
  const stripRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const weekBodyRef = useRef<HTMLDivElement | null>(null)
  const lockUntil = useRef(0)

  const show = (state.configs.upcomingShow || {}) as Record<string, boolean>
  const visible = (kind: Kind) => show[kind] !== false
  const hiddenKinds = KINDS.filter(kind => !visible(kind.id)).length
  const patchShow = (kind: Kind, value: boolean) => commit(current => ({ ...current, configs: { ...current.configs, upcomingShow: { ...((current.configs.upcomingShow || {}) as Record<string, boolean>), [kind]: value } } }))

  const setMode = (next: Mode) => {
    setModeState(next)
    if (next === 'week') setAnchor(weekStart(selected))
    if (next === 'month') setMonthAnchor(monthStart(selected))
    commit(current => ({ ...current, configs: { ...current.configs, upcomingView: next } }))
  }

  /* ------------------------------------------------------------ Período */
  const range = useMemo(() => {
    if (mode === 'list') return { start: today, end: addDays(today, horizon - 1) }
    if (mode === 'week') return { start: anchor, end: addDays(anchor, 6) }
    return { start: monthAnchor, end: addDays(monthAnchor, monthLength(monthAnchor) - 1) }
  }, [mode, today, anchor, monthAnchor, horizon])

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
    }, 600)
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
    return { name: String(project.nome || 'Projeto'), color: String(project.cor || 'var(--ds-accent)'), image: project.imagem_url ? driveAssetUrl(project.imagem_url) : '' }
  }

  const toEntry = (item: PlannerItem): Entry => {
    const base = { id: item.id, day: item.date, color: item.color, done: item.completed, recurring: item.recurring, planner: item, subtitle: item.subtitle, amount: '', late: false, priority: 4, project: null as Entry['project'], end: '', source: '', allDay: false }
    if (item.kind === 'task') {
      return { ...base, kind: 'task', time: item.time, title: item.title, late: item.date < today && !item.completed, priority: Number(item.raw.prioridade || 4), project: projectOf(item.raw.projeto_id) }
    }
    if (item.kind === 'habit') return { ...base, kind: 'habit', time: item.time, title: item.title }
    if (item.kind === 'finance') {
      const payment = financeCardPaymentState(item.raw)
      const income = item.raw.tipo === 'receita'
      return { ...base, kind: 'finance', time: '', title: item.title, done: payment.status === 'pago', source: String(item.raw.categoria || (income ? 'Receita' : 'Despesa')), amount: `${income ? '+' : ''}${money(payment.status === 'parcial' ? payment.remaining : payment.total)}`, color: income ? 'var(--ds-mint-fg)' : 'var(--ds-rose-fg)', priority: income ? 1 : 0 }
    }
    const google = item.raw.tipo === 'google' || item.raw.tipo === 'gcalendar'
    return {
      ...base, kind: 'event', time: item.time ? item.time.slice(0, 5) : '', end: String(item.raw.hora_fim || '').slice(0, 5), title: item.title,
      source: String(item.raw.calendario_nome || (google ? 'Google Agenda' : item.raw.categoria || 'MAI')),
      allDay: item.raw.dia_inteiro === true || !item.time || item.subtitle === 'Em andamento',
    }
  }

  const entries = useMemo(() => {
    const rank = (entry: Entry) => (entry.kind === 'event' ? (entry.allDay ? 0 : 1) : entry.kind === 'task' ? 2 : entry.kind === 'habit' ? 3 : 4)
    return plannerItems(state, range.start, range.end)
      .filter(item => (item.kind === 'event' || item.kind === 'task' || item.kind === 'habit' || item.kind === 'finance') && visible(item.kind))
      .filter(item => !(item.kind === 'task' && item.raw.parent_id))
      .map(toEntry)
      .sort((a, b) => a.day.localeCompare(b.day) || rank(a) - rank(b) || (a.time || '99:99').localeCompare(b.time || '99:99') || a.priority - b.priority || a.title.localeCompare(b.title, 'pt-BR'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, range.start, range.end, show.event, show.task, show.habit, show.finance, today, projects])

  const byDay = useMemo(() => {
    const map = new Map<string, Entry[]>()
    for (const entry of entries) map.set(entry.day, [...(map.get(entry.day) || []), entry])
    return map
  }, [entries])

  const overdue = useMemo(() => {
    if (!visible('task')) return []
    return rows(state.tasks)
      .filter(task => !task.concluida && !task.parent_id && !task.ocultar_agenda && ymd(task.data_vencimento) && ymd(task.data_vencimento) < today)
      .sort((a, b) => ymd(a.data_vencimento).localeCompare(ymd(b.data_vencimento)))
      .map(task => toEntry({ id: `task:${task.id}:${ymd(task.data_vencimento)}`, sourceId: String(task.id), kind: 'task', date: ymd(task.data_vencimento), time: String(task.data_vencimento).includes('T') ? String(task.data_vencimento).slice(11, 16) : '', title: String(task.titulo || 'Tarefa'), subtitle: '', color: '', completed: false, recurring: Boolean(task.repeticao), raw: task }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.tasks, today, show.task, projects])

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

  const failedEntry = (entry?: Row) => entry?.falhou === true || String(entry?.status || '').toLowerCase() === 'falha'
  const toggleHabit = (entry: Entry) => {
    if (entry.day > today) return open(entry)
    const habit = entry.planner.raw
    const target = Math.max(1, Number(habit.meta || 1))
    const quantitative = target > 1 || Boolean(habit.unidade)
    commit(current => {
      const all = rows(current.habitEntries)
      const existing = all.find(item => String(item.habito_id) === String(habit.id) && ymd(item.data) === entry.day)
      const others = all.filter(item => !(String(item.habito_id) === String(habit.id) && ymd(item.data) === entry.day))
      const make = (valor: number) => ({ id: existing?.id || `hr-${crypto.randomUUID()}`, habito_id: habit.id, data: entry.day, valor, falhou: false, status: '', criado_em: existing?.criado_em || new Date().toISOString() })
      const currentValue = existing && !failedEntry(existing) ? Number(existing.valor || 0) : 0
      if (!quantitative) return { ...current, habitEntries: currentValue > 0 ? others : [...others, make(target)] }
      const next = currentValue >= target ? 0 : currentValue + 1
      return { ...current, habitEntries: next === 0 ? others : [...others, make(next)] }
    })
  }
  const toggleFinance = (entry: Entry) => {
    const item = entry.planner.raw
    const real = rows(state.finance.transactions).some(row => String(row.id) === String(item.id))
    if (!real) return open(entry)
    const payment = financeCardPaymentState(item)
    commit(current => ({
      ...current,
      finance: {
        ...current.finance,
        transactions: rows(current.finance.transactions).map(row => {
          if (String(row.id) !== String(item.id)) return row
          if (payment.status === 'pago') return { ...row, status: 'pendente', valor_pago: 0, pagamentos: [] }
          if (payment.total <= 0) return row
          const existing = rows(row.pagamentos)
          const pagamentos = payment.remaining > 0 ? [...existing, { id: `pay-${crypto.randomUUID()}`, data: today, valor: payment.remaining }] : existing
          return { ...row, status: 'pago', valor_pago: payment.total, pagamentos }
        }),
      },
    }))
  }
  const toggleEntry = (entry: Entry) => (entry.kind === 'task' ? toggleTask(entry) : entry.kind === 'habit' ? toggleHabit(entry) : entry.kind === 'finance' ? toggleFinance(entry) : open(entry))

  const nextSunday = addDays(today, 7 - dayDate(today).getDay())
  const choices = [
    { label: 'Hoje', icon: 'today', value: today },
    { label: 'Amanhã', icon: 'wb_sunny', value: addDays(today, 1) },
    { label: 'Próx. semana', icon: 'date_range', value: addDays(nextSunday, 1) },
  ]

  function menuFor(entry: Entry): QuickMenuConfig {
    const details = { label: 'Abrir detalhes', icon: 'open_in_full', onSelect: () => open(entry) }
    if (entry.kind === 'task') {
      const id = entry.planner.sourceId
      const time = String(entry.planner.raw.data_vencimento || '').includes('T') ? String(entry.planner.raw.data_vencimento).slice(11, 16) : ''
      return {
        title: entry.title,
        subtitle: entry.project?.name || 'Tarefa',
        groups: [
          { label: 'Data', inline: true, options: [
            ...choices.map(choice => ({ label: choice.label, icon: choice.icon, active: entry.day === choice.value, onSelect: () => patchTask(id, { data_vencimento: `${choice.value}${time ? `T${time}` : ''}` }) })),
            { label: 'Sem data', icon: 'event_busy', onSelect: () => patchTask(id, { data_vencimento: '' }) },
          ] },
          { label: 'Prioridade', inline: true, options: [1, 2, 3, 4].map(level => ({ label: ['Alta', 'Média', 'Baixa', 'Nenhuma'][level - 1], icon: 'flag', color: PRIORITY_COLOR[level] || 'var(--ds-muted)', active: entry.priority === level, onSelect: () => patchTask(id, { prioridade: level }) })) },
          { options: [
            { label: entry.done ? 'Reabrir tarefa' : 'Concluir', icon: entry.done ? 'undo' : 'check_circle', onSelect: () => toggleTask(entry) },
            details,
            { label: 'Excluir', icon: 'delete', tone: 'danger' as const, onSelect: async () => {
              if (!(await askConfirm({ title: 'Excluir tarefa?', message: `“${entry.title}” será excluída. Não dá para desfazer.` }))) return
              commit(current => ({ ...current, tasks: current.tasks.filter(item => String(item.id) !== id && String(item.parent_id || '') !== id) }))
            } },
          ] },
        ],
      }
    }
    if (entry.kind === 'habit') {
      return { title: entry.title, subtitle: 'Hábito', groups: [{ options: [{ label: entry.done ? 'Desmarcar' : 'Marcar como feito', icon: entry.done ? 'undo' : 'check_circle', onSelect: () => toggleHabit(entry) }, details] }] }
    }
    if (entry.kind === 'finance') {
      return { title: entry.title, subtitle: entry.amount, groups: [{ options: [{ label: entry.done ? 'Marcar como pendente' : 'Marcar como pago', icon: entry.done ? 'undo' : 'paid', onSelect: () => toggleFinance(entry) }, details] }] }
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
        return { ...event, data_inicio: target, ...(end ? { data_fim: addDays(end, diff(start, target)) } : {}) }
      }),
    }))
    return {
      title: entry.title,
      subtitle: `${entry.time ? `${entry.time} · ` : ''}${entry.source}`,
      groups: [
        ...(google || !start ? [] : [{ label: 'Mover para', inline: true, options: choices.map(choice => ({ label: choice.label, icon: choice.icon, active: start === choice.value, onSelect: () => moveTo(choice.value) })) }]),
        { options: [
          details,
          ...(google && raw.url ? [{ label: 'Abrir no Google Agenda', icon: 'open_in_new', onSelect: () => { window.open(String(raw.url), '_blank', 'noopener') } }] : []),
          ...(!google ? [{ label: 'Excluir', icon: 'delete', tone: 'danger' as const, onSelect: async () => {
            if (!(await askConfirm({ title: 'Excluir compromisso?', message: `“${entry.title}” será excluído. Não dá para desfazer.` }))) return
            commit(current => ({ ...current, events: rows(current.events).filter(event => String(event.id) !== id), eventCompletions: rows(current.eventCompletions).filter(item => String(item.evento_id) !== id) }))
          } }] : []),
        ] },
      ],
    }
  }

  /* ------------------------------------------------------ Cartões (itens) */
  const priorityStyle = (entry: Entry) => (!entry.done && PRIORITY_COLOR[entry.priority] ? ({ '--check-color': PRIORITY_COLOR[entry.priority] } as CSSProperties) : undefined)

  const projectTag = (entry: Entry) => entry.project ? (
    <span className={tasksStyles.metaProject}>
      {entry.project.image
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={entry.project.image} alt="" loading="lazy" />
        : <i style={{ background: entry.project.color }} />}
      {entry.project.name}
    </span>
  ) : null

  const renderTask = (entry: Entry, withDate = false) => (
    <div key={entry.id} role="listitem" className={tasksStyles.card} data-done={entry.done || undefined} {...quick.bind(() => menuFor(entry))}>
      <button type="button" className={tasksStyles.check} data-done={entry.done || undefined} data-late={entry.late || undefined} data-priority={!entry.done && PRIORITY_COLOR[entry.priority] ? entry.priority : undefined} style={priorityStyle(entry)} onClick={() => toggleTask(entry)} aria-label={entry.done ? `Reabrir ${entry.title}` : `Concluir ${entry.title}`}>
        {entry.done ? <Icon name="check" size={13} /> : null}
      </button>
      <button type="button" className={tasksStyles.cardMain} onClick={() => open(entry)}>
        <span className={tasksStyles.cardTitle}>{entry.title}</span>
        <span className={tasksStyles.cardMeta}>
          {withDate ? <span data-late={entry.late || undefined}><Icon name="calendar_today" size={12} />{naturalDate(entry.day, today)}{entry.time ? ` · ${entry.time}` : ''}</span> : entry.time ? <span><Icon name="schedule" size={12} />{entry.time}</span> : null}
          {projectTag(entry)}
          {entry.recurring ? <span><Icon name="repeat" size={12} />Repete</span> : null}
        </span>
      </button>
    </div>
  )

  const renderHabit = (entry: Entry) => (
    <div key={entry.id} role="listitem" className={tasksStyles.card} data-done={entry.done || undefined} {...quick.bind(() => menuFor(entry))}>
      <button type="button" className={tasksStyles.check} data-done={entry.done || undefined} data-priority="1" style={{ '--check-color': entry.color } as CSSProperties} onClick={() => toggleHabit(entry)} aria-label={entry.done ? `Desmarcar ${entry.title}` : `Marcar ${entry.title}`}>
        {entry.done ? <Icon name="check" size={13} /> : null}
      </button>
      <button type="button" className={tasksStyles.cardMain} onClick={() => open(entry)}>
        <span className={tasksStyles.cardTitle}>{entry.title}</span>
        <span className={tasksStyles.cardMeta}>
          {entry.time ? <span><Icon name="schedule" size={12} />{entry.time}</span> : null}
          <span><Icon name="autorenew" size={12} />{entry.subtitle}</span>
        </span>
      </button>
    </div>
  )

  const renderFinance = (entry: Entry) => (
    <div key={entry.id} role="listitem" className={tasksStyles.card} data-done={entry.done || undefined} {...quick.bind(() => menuFor(entry))}>
      <button type="button" className={tasksStyles.check} data-done={entry.done || undefined} data-priority="1" style={{ '--check-color': 'var(--ds-mint-fg)' } as CSSProperties} onClick={() => toggleFinance(entry)} aria-label={entry.done ? `Marcar ${entry.title} como pendente` : `Marcar ${entry.title} como pago`}>
        {entry.done ? <Icon name="check" size={13} /> : null}
      </button>
      <button type="button" className={tasksStyles.cardMain} onClick={() => open(entry)}>
        <span className={tasksStyles.cardTitle}>{entry.title}</span>
        <span className={tasksStyles.cardMeta}>
          <span><Icon name="payments" size={12} />{entry.source}</span>
          <span>{entry.done ? 'Pago' : 'Pendente'}</span>
        </span>
      </button>
      <span className={styles.amount} style={{ color: entry.color }}>{entry.amount}</span>
    </div>
  )

  const renderAllDay = (entry: Entry) => (
    <button key={entry.id} type="button" className={styles.allDay} style={{ '--ev': entry.color } as CSSProperties} onClick={() => open(entry)} {...quick.bind(() => menuFor(entry))}>
      <span className={styles.allDayStack}>
        <span className={styles.allDayTag}>{entry.planner.subtitle === 'Em andamento' ? 'Contínuo' : 'Dia todo'}</span>
        <small>{entry.source}</small>
      </span>
      <strong>{entry.title}</strong>
    </button>
  )

  const renderEvent = (entry: Entry) => {
    const range = entry.end ? `${entry.time} – ${entry.end}` : ''
    return (
      <button key={entry.id} type="button" className={styles.event} data-passed={passed(entry) || undefined} style={{ '--ev': entry.color } as CSSProperties} onClick={() => open(entry)} {...quick.bind(() => menuFor(entry))}>
        <span className={styles.eventDot} aria-hidden="true" />
        <span className={styles.eventTime}><b>{range || entry.time}</b><small>{entry.source}</small></span>
        <strong>{entry.title}</strong>
        {entry.recurring ? <Icon name="repeat" size={12} /> : null}
      </button>
    )
  }

  const group = (label: string, children: ReactNode, key: string) => (
    <div key={key} className={styles.group}>
      <h4>{label}</h4>
      <div className={styles.groupBody} role="list">{children}</div>
    </div>
  )

  /** Compromissos primeiro (mesmo com horário), depois tarefas, hábitos e finanças. */
  const sections = (items: Entry[]) => {
    const allDay = items.filter(entry => entry.kind === 'event' && entry.allDay)
    const events = items.filter(entry => entry.kind === 'event' && !entry.allDay)
    const tasks = items.filter(entry => entry.kind === 'task')
    const habits = items.filter(entry => entry.kind === 'habit')
    const finance = items.filter(entry => entry.kind === 'finance')
    return (
      <>
        {allDay.length || events.length ? (
          <div className={styles.group}>
            <h4>Compromissos</h4>
            <div className={styles.groupBody} role="list">
              {allDay.map(renderAllDay)}
              {events.map(renderEvent)}
            </div>
          </div>
        ) : null}
        {tasks.length ? group('Tarefas', tasks.map(entry => renderTask(entry)), 'tasks') : null}
        {habits.length ? group('Hábitos', habits.map(renderHabit), 'habits') : null}
        {finance.length ? group('Finanças', finance.map(renderFinance), 'finance') : null}
      </>
    )
  }

  const dayBlock = (day: string, items: Entry[]) => {
    const heading = dayHeading(day, today)
    return (
      <section key={day} className={styles.day} data-day={day}>
        <header className={styles.dayHead}>
          <strong data-today={day === today || undefined}>{heading.name}</strong>
          {heading.sub ? <span>{heading.sub}</span> : null}
          <em>{items.length ? `${items.length} ${items.length === 1 ? 'item' : 'itens'}` : ''}</em>
        </header>
        {items.length ? sections(items) : <p className={styles.empty}>Nada marcado para este dia.</p>}
      </section>
    )
  }

  const overduePanel = overdue.length && mode !== 'month' ? (
    <div className={styles.late}>
      <button type="button" className={styles.lateHead} aria-expanded={lateOpen} onClick={() => setLateOpen(value => !value)}>
        <Icon name="schedule" size={16} filled={false} />{overdue.length} {overdue.length === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}
        <Icon name="expand_more" size={18} filled={false} className={styles.lateChevron} />
      </button>
      {lateOpen ? <div className={styles.lateBody} role="list">{overdue.map(entry => renderTask(entry, true))}</div> : null}
    </div>
  ) : null

  /* ------------------------------------------------------ Navegação */
  const step = (direction: number) => {
    if (mode === 'week') {
      const next = addDays(anchor, direction * 7)
      setAnchor(next)
      setSelected(next <= today && today <= addDays(next, 6) ? today : next)
    } else if (mode === 'month') {
      const next = shiftMonth(monthAnchor, direction)
      setMonthAnchor(next)
      setSelected(next.slice(0, 7) === today.slice(0, 7) ? today : next)
    }
  }
  const goToday = () => {
    setSelected(today)
    setAnchor(weekStart(today))
    setMonthAnchor(monthStart(today))
    if (mode === 'list') goList(today)
  }
  const subtitle = mode === 'month' ? monthTitle(monthAnchor) : mode === 'week' ? shortRange(anchor, addDays(anchor, 6)) : cap(monthShort(selected)) + ' ' + selected.slice(0, 4)

  /* -------------------------------------------------- Lista infinita */
  const listDays = useMemo(() => {
    const days = new Set<string>([today])
    if (selected >= today && selected <= range.end) days.add(selected)
    for (const day of byDay.keys()) days.add(day)
    return [...days].sort()
  }, [byDay, today, selected, range.end])

  const goList = (day: string) => {
    lockUntil.current = Date.now() + 1500
    setSelected(day)
    const distance = diff(today, day)
    if (distance >= horizon - 1) setHorizon(Math.min(MAX_HORIZON, distance + 14))
    setScrollTo(current => ({ day, n: current.n + 1 }))
  }

  useEffect(() => {
    if (mode !== 'list') return
    const sections = [...document.querySelectorAll<HTMLElement>('[data-day-section]')]
    const target = sections.find(section => String(section.dataset.daySection) >= scrollTo.day) || sections[sections.length - 1]
    target?.scrollIntoView({ block: 'start', behavior: scrollTo.n ? 'smooth' : 'auto' })
  }, [scrollTo, mode])  // eslint-disable-line react-hooks/exhaustive-deps

  // Carrega mais dias ao chegar no fim da lista.
  useEffect(() => {
    if (mode !== 'list' || !sentinelRef.current) return
    const observer = new IntersectionObserver(items => {
      if (items.some(item => item.isIntersecting)) setHorizon(value => Math.min(MAX_HORIZON, value + 14))
    }, { rootMargin: '0px 0px 400px 0px' })
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [mode, horizon])

  // O dia que está no topo da lista fica marcado na faixa de dias.
  useEffect(() => {
    if (mode !== 'list') return
    const sections = [...document.querySelectorAll<HTMLElement>('[data-day-section]')]
    const observer = new IntersectionObserver(items => {
      if (Date.now() < lockUntil.current) return
      const hit = items.filter(item => item.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (hit) setSelected(String((hit.target as HTMLElement).dataset.daySection))
    }, { rootMargin: '-130px 0px -70% 0px' })
    sections.forEach(section => observer.observe(section))
    return () => observer.disconnect()
  }, [mode, listDays.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode !== 'list' || !stripRef.current) return
    const button = stripRef.current.querySelector<HTMLElement>(`[data-strip="${selected}"]`)
    if (!button) return
    const box = stripRef.current
    const left = button.offsetLeft - box.clientWidth / 2 + button.clientWidth / 2
    box.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
  }, [selected, mode])

  const stripDays = Array.from({ length: horizon }, (_, index) => addDays(today, index))
  const strip = (
    <div className={styles.stripWrap}>
      <div className={styles.stripList} ref={stripRef} onScroll={event => {
        const box = event.currentTarget
        if (box.scrollLeft + box.clientWidth > box.scrollWidth - 320) setHorizon(value => Math.min(MAX_HORIZON, value + 28))
      }}>
        {stripDays.map((day, index) => {
          const items = byDay.get(day) || []
          const first = day.slice(8) === '01' || index === 0
          return (
            <Fragment key={day}>
              {first && index > 0 ? <span className={styles.stripMonth}>{monthShort(day)}</span> : null}
              <button type="button" data-strip={day} data-active={selected === day || undefined} data-today={day === today || undefined} onClick={() => goList(day)}>
                <span>{WEEKDAY[dayDate(day).getDay()]}</span>
                <b>{Number(day.slice(8))}</b>
                <i>{items.length ? <u /> : null}</i>
              </button>
            </Fragment>
          )
        })}
      </div>
    </div>
  )

  /* ------------------------------------------------------- Mini mês */
  const goMonth = (first: string) => {
    setMiniMonth(first)
    goList(first <= monthStart(today) ? today : first)
  }
  useEffect(() => { setMiniMonth(monthStart(selected)) }, [selected])

  const renderMini = () => {
    const first = miniMonth
    const offset = dayDate(first).getDay()
    const total = monthLength(first)
    const cells: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: total }, (_, index) => `${first.slice(0, 8)}${String(index + 1).padStart(2, '0')}`)]
    return (
      <aside className={styles.mini} aria-label="Calendário">
        <div className={styles.miniHead}>
          <strong>{monthTitle(first)}</strong>
          <span>
            <button type="button" aria-label="Mês anterior" disabled={first <= monthStart(today)} onClick={() => goMonth(shiftMonth(first, -1))}><Icon name="chevron_left" size={18} filled={false} /></button>
            <button type="button" aria-label="Próximo mês" onClick={() => goMonth(shiftMonth(first, 1))}><Icon name="chevron_right" size={18} filled={false} /></button>
          </span>
        </div>
        <div className={styles.miniGrid}>
          {WEEKDAY.map(name => <i key={name}>{name[0]}</i>)}
          {cells.map((day, index) => day
            ? <button key={day} type="button" disabled={day < today} data-today={day === today || undefined} data-selected={selected === day || undefined} onClick={() => goList(day)}>{Number(day.slice(8))}</button>
            : <span key={`e${index}`} />)}
        </div>
      </aside>
    )
  }

  /* ----------------------------------------------------------- Semana */
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(anchor, index))

  type Placed = { entry: Entry; start: number; end: number; lane: number; lanes: number }
  const place = (items: Entry[]): Placed[] => {
    const timed = items
      .filter(entry => entry.kind === 'event' && !entry.allDay && Number.isFinite(minutes(entry.time)))
      .map(entry => {
        const start = minutes(entry.time)
        const rawEnd = minutes(entry.end)
        return { entry, start, end: Math.min(1440, Number.isFinite(rawEnd) && rawEnd > start ? rawEnd : start + 60), lane: 0, lanes: 1 }
      })
      .sort((a, b) => a.start - b.start || b.end - a.end)
    let cluster: Placed[] = []
    let clusterEnd = -1
    const flush = () => { const lanes = Math.max(1, ...cluster.map(item => item.lane + 1)); cluster.forEach(item => { item.lanes = lanes }); cluster = [] }
    for (const item of timed) {
      if (cluster.length && item.start >= clusterEnd) { flush(); clusterEnd = -1 }
      const used = cluster.filter(other => other.end > item.start).map(other => other.lane)
      let lane = 0
      while (used.includes(lane)) lane += 1
      item.lane = lane
      cluster.push(item)
      clusterEnd = Math.max(clusterEnd, item.end)
    }
    flush()
    return timed
  }

  const weekHasToday = today >= anchor && today <= addDays(anchor, 6)
  useLayoutEffect(() => {
    if (mode !== 'week' || mobile || !weekBodyRef.current) return
    const first = weekDays.flatMap(day => place(byDay.get(day) || [])).map(item => item.start).sort((a, b) => a - b)[0]
    const focus = weekHasToday ? Math.min(nowMinutes, first ?? nowMinutes) : first ?? 8 * 60
    weekBodyRef.current.scrollTop = Math.max(0, (focus / 60 - 1) * HOUR)
  }, [mode, mobile, anchor])  // eslint-disable-line react-hooks/exhaustive-deps

  const chip = (entry: Entry) => (
    <button key={entry.id} type="button" className={styles.chip} data-kind={entry.kind} data-done={entry.done || undefined} style={{ '--ev': entry.kind === 'task' ? (PRIORITY_COLOR[entry.priority] || 'var(--ds-muted)') : entry.color } as CSSProperties} onClick={() => open(entry)} {...quick.bind(() => menuFor(entry))}>
      {entry.kind === 'task'
        ? <span role="checkbox" aria-checked={entry.done} aria-label="Concluir" tabIndex={0} className={styles.chipCheck} onClick={event => { event.stopPropagation(); toggleTask(entry) }} onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); toggleTask(entry) } }}>{entry.done ? <Icon name="check" size={10} /> : null}</span>
        : <Icon name={entry.kind === 'habit' ? 'autorenew' : entry.kind === 'finance' ? 'payments' : 'event'} size={13} style={{ color: entry.color }} />}
      <span>{entry.title}</span>
    </button>
  )

  const weekDesktop = (
    <div className={styles.weekGrid}>
      <div className={styles.weekHeadRow}>
        <span className={styles.gutter} />
        {weekDays.map(day => (
          <button key={day} type="button" className={styles.weekHead} data-today={day === today || undefined} data-selected={selected === day || undefined} onClick={() => setSelected(day)}>
            <span>{WEEKDAY[dayDate(day).getDay()]}</span>
            <b>{Number(day.slice(8))}</b>
          </button>
        ))}
      </div>
      <div className={styles.weekTop}>
        <span className={styles.gutter}><small>Dia todo</small></span>
        {weekDays.map(day => {
          const items = byDay.get(day) || []
          const top = items.filter(entry => entry.allDay || entry.kind !== 'event')
          return (
            <div key={day} className={styles.weekTopCell} data-today={day === today || undefined}>
              {top.filter(entry => entry.kind === 'event').map(entry => (
                <button key={entry.id} type="button" className={styles.weekAllDay} style={{ '--ev': entry.color } as CSSProperties} onClick={() => open(entry)} {...quick.bind(() => menuFor(entry))}>{entry.title}</button>
              ))}
              {top.filter(entry => entry.kind !== 'event').map(chip)}
            </div>
          )
        })}
      </div>
      <div className={styles.weekScroll} ref={weekBodyRef}>
        <div className={styles.weekBodyGrid} style={{ height: HOUR * 24 }}>
          <div className={styles.hours}>
            {Array.from({ length: 24 }, (_, hour) => <span key={hour} style={{ top: hour * HOUR }}>{hour ? `${String(hour).padStart(2, '0')}:00` : ''}</span>)}
          </div>
          {weekDays.map(day => (
            <div key={day} className={styles.dayCol} data-today={day === today || undefined} onClick={() => setSelected(day)}>
              {place(byDay.get(day) || []).map(item => {
                const length = item.end - item.start
                return (
                  <button
                    key={item.entry.id}
                    type="button"
                    className={styles.block}
                    data-passed={passed(item.entry) || undefined}
                    data-short={length <= 40 || undefined}
                    style={{ '--ev': item.entry.color, top: (item.start / 60) * HOUR, height: Math.max(22, (length / 60) * HOUR - 2), left: `calc(${(item.lane / item.lanes) * 100}% + 2px)`, width: `calc(${100 / item.lanes}% - 4px)` } as CSSProperties}
                    onClick={event => { event.stopPropagation(); open(item.entry) }}
                    {...quick.bind(() => menuFor(item.entry))}
                  >
                    <strong>{item.entry.title}</strong>
                    <span>{item.entry.time}{item.entry.end ? ` – ${item.entry.end}` : ''}</span>
                  </button>
                )
              })}
              {day === today ? <i className={styles.nowLine} style={{ top: (nowMinutes / 60) * HOUR }} /> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const weekMobile = (
    <>
      <div className={styles.weekStrip}>
        {weekDays.map(day => {
          const items = byDay.get(day) || []
          return (
            <button key={day} type="button" data-active={selected === day || undefined} data-today={day === today || undefined} onClick={() => setSelected(day)}>
              <span>{WEEKDAY[dayDate(day).getDay()]}</span>
              <em><b>{Number(day.slice(8))}</b><i>{items.slice(0, 3).map(entry => <u key={entry.id} style={{ background: entry.color }} />)}</i></em>
            </button>
          )
        })}
      </div>
      {dayBlock(selected, byDay.get(selected) || [])}
    </>
  )

  /* -------------------------------------------------------------- Mês */
  const monthOffset = dayDate(monthAnchor).getDay()
  const monthCells: (string | null)[] = [...Array(monthOffset).fill(null), ...Array.from({ length: monthLength(monthAnchor) }, (_, index) => `${monthAnchor.slice(0, 8)}${String(index + 1).padStart(2, '0')}`)]
  while (monthCells.length % 7) monthCells.push(null)
  const monthRows = monthCells.length / 7

  const monthCell = (day: string | null, index: number) => {
    if (!day) return <div key={`blank${index}`} className={styles.cellBlank} aria-hidden="true" />
    const items = byDay.get(day) || []
    if (mobile) {
      return (
        <button key={day} type="button" className={styles.cellMobile} data-today={day === today || undefined} data-selected={selected === day || undefined} onClick={() => setSelected(day)}>
          <b>{Number(day.slice(8))}</b>
          <i>{items.slice(0, 3).map(entry => <u key={entry.id} style={{ background: entry.color }} />)}</i>
        </button>
      )
    }
    const lines = items.filter(entry => entry.kind === 'event' || entry.kind === 'task')
    const shown = lines.slice(0, 3)
    const habits = items.filter(entry => entry.kind === 'habit')
    const finance = items.filter(entry => entry.kind === 'finance')
    const rest = lines.length - shown.length
    return (
      <div key={day} role="button" tabIndex={0} className={styles.cell} data-today={day === today || undefined} data-selected={selected === day || undefined} onClick={() => setSelected(day)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(day) } }}>
        <b>{Number(day.slice(8))}</b>
        <span className={styles.cellItems}>
          {shown.map(entry => entry.kind === 'event'
            ? <span key={entry.id} className={styles.cellEvent} data-passed={passed(entry) || undefined} style={{ '--ev': entry.color } as CSSProperties}>{entry.allDay ? null : <em>{entry.time}</em>}{entry.title}</span>
            : <span key={entry.id} className={styles.cellTask} data-done={entry.done || undefined} style={{ '--ev': PRIORITY_COLOR[entry.priority] || 'var(--ds-muted)' } as CSSProperties}><u />{entry.title}</span>)}
          {rest > 0 ? <span className={styles.cellMore}>+{rest} mais</span> : null}
        </span>
        {habits.length || finance.length ? (
          <span className={styles.cellMeta}>
            {habits.length ? <span><Icon name="autorenew" size={11} />{habits.length}</span> : null}
            {finance.length ? <span><Icon name="payments" size={11} />{finance.length}</span> : null}
          </span>
        ) : null}
      </div>
    )
  }

  const monthView = (
    <div className={styles.monthWrap}>
      {mobile ? (
        <div className={styles.monthTitle}>
          <strong>{monthTitle(monthAnchor)}</strong>
          <span>
            <button type="button" aria-label="Mês anterior" onClick={() => step(-1)}><Icon name="chevron_left" size={22} filled={false} /></button>
            <button type="button" aria-label="Próximo mês" onClick={() => step(1)}><Icon name="chevron_right" size={22} filled={false} /></button>
          </span>
        </div>
      ) : null}
      <div className={styles.month} style={{ '--rows': monthRows } as CSSProperties}>
        {WEEKDAY.map(name => <div key={name} className={styles.monthHead}>{name}</div>)}
        {monthCells.map(monthCell)}
      </div>
      <aside className={styles.monthSide}>{dayBlock(selected, byDay.get(selected) || [])}</aside>
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
        <div className={styles.segmented} role="tablist" aria-label="Visualização">
          {([['list', 'Lista'], ['week', 'Semana'], ['month', 'Mês']] as [Mode, string][]).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={mode === id} data-active={mode === id || undefined} onClick={() => setMode(id)}>{label}</button>
          ))}
        </div>
        <div className={styles.nav}>
          {mode !== 'list' ? <button type="button" className={styles.navStep} data-hide-mobile={mode === 'month' || undefined} aria-label="Anterior" onClick={() => step(-1)}><Icon name="chevron_left" size={20} filled={false} /></button> : null}
          <button type="button" className={styles.todayButton} onClick={goToday}>Hoje</button>
          {mode !== 'list' ? <button type="button" className={styles.navStep} data-hide-mobile={mode === 'month' || undefined} aria-label="Próximo" onClick={() => step(1)}><Icon name="chevron_right" size={20} filled={false} /></button> : null}
          <button ref={filterRef} type="button" className={styles.filterButton} data-active={hiddenKinds > 0 || undefined} onClick={() => setFilterOpen(true)} aria-label="O que mostrar"><Icon name="tune" size={20} filled={false} /></button>
        </div>
      </header>

      {filterOpen ? (
        <Floating anchor={filterRef} title="Mostrar na agenda" width={300} onClose={() => setFilterOpen(false)}>
          <div className={styles.filterList}>
            {KINDS.map(kind => (
              <div key={kind.id} className={styles.filterRow}>
                <Icon name={kind.icon} size={20} filled={false} />
                <span>{kind.label}</span>
                <button type="button" role="switch" aria-checked={visible(kind.id)} aria-label={kind.label} className={styles.switch} data-on={visible(kind.id) || undefined} onClick={() => patchShow(kind.id, !visible(kind.id))}><i /></button>
              </div>
            ))}
          </div>
        </Floating>
      ) : null}

      {mode === 'list' && mobile ? strip : null}
      {overduePanel}

      {mode === 'list' ? (
        <div className={styles.listLayout}>
          <div className={styles.listMain}>
            {listDays.map(day => <div key={day} data-day-section={day} className={styles.daySlot}>{dayBlock(day, byDay.get(day) || [])}</div>)}
            <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
          </div>
          {!mobile ? renderMini() : null}
        </div>
      ) : null}
      {mode === 'week' ? (mobile ? weekMobile : weekDesktop) : null}
      {mode === 'month' ? monthView : null}
      {quick.element}
    </div>
  )
}
