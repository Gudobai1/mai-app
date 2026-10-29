'use client'

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { financeSummary } from '../../../lib/v2/finance-summary'
import { addDays, eventColor, plannerItems, type PlannerItem } from '../../../lib/v2/planner'
import type { MaiState } from '../../../lib/v2/state'
import { Button, Check, Icon } from '../../ds'
import type { AppView, Row } from '../app-types'
import type { InspectableItem } from '../ContextDrawer'
import { financeCardPaymentState } from '../FinanceTransactionCard'
import { driveAssetUrl } from '../DriveAsset'
import { resolveMaiIcon } from '../MaiIcons'
import { askConfirm } from '../shell/ConfirmDialog'
import { useQuickMenu, type QuickMenuConfig } from '../shell/QuickMenu'
import { AgendaStrip } from './AgendaStrip'
import styles from './TodayModern.module.css'

/*
 * Tela Hoje — visual Moderno.
 *
 * Mostra o dia escolhido na faixa de semanas (hoje por padrão). Mantém as
 * seções, a ordem e a visibilidade salvas (editadas em Opções), filtros e
 * classificação, concluir tarefa, marcar lançamento como pago e abrir
 * qualquer item no painel lateral.
 */

type Commit = (change: (current: MaiState) => MaiState) => void

type Props = {
  state: MaiState
  today: string
  commit: Commit
  navigate: (view: AppView) => void
  inspect: (item: InspectableItem) => void
  /** Botão "Opções" (filtros, classificação e seções). */
  options?: ReactNode
  /** "Adicionar tarefa" no fim de cada projeto. */
  onAddTask?: (projectId?: string) => void
  /** "Adicionar compromisso" no fim da agenda. */
  onAddEvent?: () => void
}

const DEFAULT_ORDER = ['appointments', 'tasks', 'habits', 'goals', 'finance', 'notes'] as const
type SectionId = typeof DEFAULT_ORDER[number]

type TodayFilters = { project: string; priority: string }
type SortMode = 'overdue' | 'date' | 'priority' | 'project' | 'title' | 'name'

const WEEKS_BEFORE = 4
const WEEKS_AFTER = 12

const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : [])
const values = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const dateKey = (value: unknown) => String(value || '').slice(0, 10)
const timeKey = (value: unknown) => (String(value || '').includes('T') ? String(value).slice(11, 16) : '')
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
/** Descrição em uma linha, sem marcação HTML. */
const plainText = (value: unknown) => String(value || '').replace(/<br\s*\/?>|<\/(p|div|li)>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const isPaid = (value: unknown) => ['pago', 'paga', 'quitado', 'quitada', 'concluido', 'concluida'].includes(String(value || '').toLocaleLowerCase('pt-BR'))
const concluded = (item: Row) => item.concluida === true || String(item.status || '').toLocaleLowerCase('pt-BR').includes('conclu')
const goalDate = (goal: Row) => dateKey(goal.prazo || goal.data || goal.data_limite || goal.deadline)
const txTitle = (item: Row) => String(item.descricao || item.titulo || item.nome || item.categoria || 'Lançamento')
const hiddenFromAgenda = (habit: Row) => habit.ocultar_agenda === true || String(habit.ocultar_agenda || '').toLowerCase() === 'true' || habit.ocultarAgenda === true || habit.mostrar_agenda === false || habit.mostrar_hoje_agenda === false
const failedEntry = (entry?: Row) => entry?.falhou === true || String(entry?.status || '').toLowerCase() === 'falha'
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1)

const PRIORITY_COLOR: Record<number, string> = { 1: 'var(--ds-rose-fg)', 2: 'var(--ds-peach-fg)', 3: 'var(--ds-sky-fg)' }

function toKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function naturalDate(key: string, today: string) {
  if (!key) return 'Sem data'
  if (key === today) return 'Hoje'
  const base = new Date(`${today}T12:00:00`)
  const target = new Date(`${key}T12:00:00`)
  const diff = Math.round((target.getTime() - base.getTime()) / 86_400_000)
  if (diff === -1) return 'Ontem'
  if (diff === 1) return 'Amanhã'
  return target.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: target.getFullYear() !== base.getFullYear() ? 'numeric' : undefined }).replace('.', '')
}

function habitEligible(habit: Row, day: string) {
  const start = dateKey(habit.data_inicio || habit.criado_em)
  if (start && day < start) return false
  const match = String(habit.repeticao || '').match(/^intervalo:(\d+)$/)
  if (match) {
    if (!start) return true
    const interval = Math.max(1, Number(match[1]) || 1)
    const diff = Math.round((new Date(`${day}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / 86_400_000)
    return diff % interval === 0
  }
  const days = values(habit.dias_semana).map(Number).filter(value => Number.isInteger(value) && value >= 0 && value <= 6)
  return !days.length || days.includes(new Date(`${day}T12:00:00`).getDay())
}


/* Links dentro da descrição ficam clicáveis (azul e sublinhado). */
function renderDescription(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, index) => /^https?:\/\//.test(part)
    ? <a key={index} className={styles.descLink} href={part} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()}>{part}</a>
    : part)
}

function untilLabel(minutes: number) {
  if (minutes <= 0) return 'agora'
  if (minutes < 60) return `em ${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `em ${hours} h ${rest} min` : `em ${hours} h`
}

function minutesOf(time: string) {
  const [hour, minute] = String(time || '').split(':').map(Number)
  return Number.isFinite(hour) ? hour * 60 + (Number.isFinite(minute) ? minute : 0) : NaN
}

export function TodayModern({ state, today, commit, navigate, inspect, options, onAddTask, onAddEvent }: Props) {
  const [clock, setClock] = useState(() => new Date())
  const [selected, setSelected] = useState(today)
  const weeksRef = useRef<HTMLDivElement | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleCollapsed = (id: string) => setCollapsed(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  // Quando o dia vira, volta para o novo "hoje".
  useEffect(() => { setSelected(today) }, [today])

  const day = selected
  const isToday = day === today

  /* ---------------------------------------------------------- Preferências */

  const savedOrder = Array.isArray(state.configs.todayListOrder) ? state.configs.todayListOrder.map(String).filter((id): id is SectionId => DEFAULT_ORDER.includes(id as SectionId)) : []
  const order: SectionId[] = [...savedOrder, ...DEFAULT_ORDER.filter(id => !savedOrder.includes(id))]
  const hidden = new Set(Array.isArray(state.configs.todayListHidden) ? state.configs.todayListHidden.map(String) : [])
  const savedFilters: Partial<TodayFilters> = state.configs.todayFilters && typeof state.configs.todayFilters === 'object' ? (state.configs.todayFilters as Partial<TodayFilters>) : {}
  const filters: TodayFilters = { project: String(savedFilters.project || 'all'), priority: String(savedFilters.priority || 'all') }
  const moduleControls = state.configs.moduleControls && typeof state.configs.moduleControls === 'object' ? (state.configs.moduleControls as Record<string, Row>) : {}
  const rawSort = String(moduleControls.today?.sort || 'overdue')
  const sortMode: SortMode = (['overdue', 'date', 'priority', 'project', 'title', 'name'] as const).includes(rawSort as SortMode) ? (rawSort as SortMode) : 'overdue'

  /* ---------------------------------------------------------------- Projetos */

  const projects = useMemo(() => rows(state.projects).filter(item => item.ativo !== false), [state.projects])
  const projectMap = useMemo(() => new Map(projects.map(project => [String(project.id), project])), [projects])
  const projectName = (projectId: unknown) => {
    const id = String(projectId || 'entrada')
    if (id === 'entrada') return 'Entrada'
    return String(projectMap.get(id)?.nome || 'Sem projeto')
  }
  const projectImage = (projectId: unknown) => driveAssetUrl(projectMap.get(String(projectId || ''))?.imagem_url)
  const projectColor = (projectId: unknown) => String(projectMap.get(String(projectId || ''))?.cor || 'var(--ds-line-strong)')

  /* ------------------------------------------------------------------ Tempo */

  const clockIsToday = toKey(clock) === today
  const nowMinutes = clock.getHours() * 60 + clock.getMinutes()

  /* ------------------------------------------------------- Faixa de semanas */

  const weeks = useMemo(() => {
    const base = new Date(`${today}T12:00:00`)
    const sunday = new Date(base)
    sunday.setDate(base.getDate() - base.getDay())
    sunday.setDate(sunday.getDate() - WEEKS_BEFORE * 7)
    const total = (WEEKS_BEFORE + 1 + WEEKS_AFTER) * 7
    const all = Array.from({ length: total }, (_, index) => {
      const date = new Date(sunday)
      date.setDate(sunday.getDate() + index)
      return date
    })
    const load = new Map<string, number>()
    plannerItems(state, toKey(all[0]), toKey(all[all.length - 1])).forEach(item => {
      if ((item.kind === 'task' || item.kind === 'event') && !item.completed) load.set(item.date, (load.get(item.date) || 0) + 1)
    })
    const list = all.map(date => {
      const key = toKey(date)
      return {
        key,
        name: date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
        number: date.getDate(),
        month: date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
        load: Math.min(load.get(key) || 0, 5),
        isToday: key === today,
        isPast: key < today,
      }
    })
    return Array.from({ length: WEEKS_BEFORE + 1 + WEEKS_AFTER }, (_, index) => list.slice(index * 7, index * 7 + 7))
  }, [state, today])

  // Abre já na semana atual.
  useLayoutEffect(() => {
    const element = weeksRef.current
    if (element) element.scrollLeft = element.clientWidth * WEEKS_BEFORE
  }, [today])

  const weekIndexOf = (key: string) => weeks.findIndex(week => week.some(item => item.key === key))

  const scrollToWeek = (index: number, smooth = true) => {
    const element = weeksRef.current
    if (!element) return
    const clamped = Math.max(0, Math.min(weeks.length - 1, index))
    element.scrollTo({ left: clamped * element.clientWidth, behavior: smooth ? 'smooth' : 'auto' })
  }

  // Rodinha do mouse sobre a faixa: uma semana por gesto. Touchpad lateral segue nativo.
  useEffect(() => {
    const element = weeksRef.current
    if (!element) return
    let locked = false
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
      event.preventDefault()
      if (locked || Math.abs(event.deltaY) < 4) return
      locked = true
      const current = Math.round(element.scrollLeft / element.clientWidth)
      scrollToWeek(current + (event.deltaY > 0 ? 1 : -1))
      window.setTimeout(() => { locked = false }, 380)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks.length])

  // Arrastar com o mouse (no toque, a rolagem nativa já faz isso).
  const drag = useRef<{ startX: number; startLeft: number; moved: boolean; pointerId: number } | null>(null)
  const suppressClick = useRef(false)

  const onWeeksPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    const element = weeksRef.current
    if (!element) return
    drag.current = { startX: event.clientX, startLeft: element.scrollLeft, moved: false, pointerId: event.pointerId }
  }

  const onWeeksPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current
    const element = weeksRef.current
    if (!state || !element) return
    const delta = event.clientX - state.startX
    if (!state.moved && Math.abs(delta) > 6) {
      state.moved = true
      element.setPointerCapture(state.pointerId)
      element.style.scrollSnapType = 'none'
      element.style.cursor = 'grabbing'
    }
    if (state.moved) element.scrollLeft = state.startLeft - delta
  }

  const endDrag = () => {
    const state = drag.current
    const element = weeksRef.current
    drag.current = null
    if (!state || !element || !state.moved) return
    suppressClick.current = true
    window.setTimeout(() => { suppressClick.current = false }, 0)
    const delta = element.scrollLeft - state.startLeft
    const startWeek = Math.round(state.startLeft / element.clientWidth)
    const target = Math.abs(delta) > element.clientWidth * 0.15 ? startWeek + (delta > 0 ? 1 : -1) : startWeek
    element.style.cursor = ''
    scrollToWeek(target)
    window.setTimeout(() => { element.style.scrollSnapType = '' }, 420)
  }

  // Teclado: ← → mudam o dia e passam de semana sozinhos.
  const onDayKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, key: string) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const date = new Date(`${key}T12:00:00`)
    date.setDate(date.getDate() + (event.key === 'ArrowRight' ? 1 : -1))
    const next = toKey(date)
    const index = weekIndexOf(next)
    if (index < 0) return
    setSelected(next)
    if (index !== weekIndexOf(key)) scrollToWeek(index)
    window.requestAnimationFrame(() => {
      const button = weeksRef.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)
      button?.focus({ preventScroll: true })
    })
  }

  const goToToday = () => {
    setSelected(today)
    const element = weeksRef.current
    if (element) element.scrollTo({ left: element.clientWidth * WEEKS_BEFORE, behavior: 'smooth' })
  }

  /* --------------------------------------------------------- Compromissos */

  const plan = useMemo(() => plannerItems(state, day, day), [state, day])
  const events = useMemo(() => {
    const eventDone = (eventId: unknown) => rows(state.eventCompletions).some(entry => String(entry.evento_id || String(entry.chave || '').split('|')[0]) === String(eventId) && dateKey(entry.data || String(entry.chave || '').split('|')[1]) === day && entry.concluida !== false)
    const planned = plan.filter(item => item.kind === 'event' && !item.completed)
    const spanning: PlannerItem[] = rows(state.events).filter(event => {
      const start = dateKey(event.data_inicio)
      const end = dateKey(event.data_fim || event.data_termino || event.end)
      return start && end && start < day && end >= day && !eventDone(event.id)
    }).map(event => ({
      id: `span:${event.id}:${day}`,
      sourceId: String(event.id),
      kind: 'event' as const,
      date: day,
      time: String(event.hora_inicio || ''),
      title: String(event.titulo || 'Compromisso'),
      subtitle: 'Em andamento',
      color: eventColor(event),
      completed: false,
      recurring: Boolean(event.repeticao),
      raw: event,
    }))
    const seen = new Set<string>()
    return [...spanning, ...planned].filter(item => {
      const key = `${item.sourceId}:${item.date}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).sort((a, b) => {
      const rank = (item: PlannerItem) => (item.subtitle === 'Em andamento' ? 0 : item.raw.dia_inteiro === true || !item.time ? 1 : 2)
      return rank(a) - rank(b) || `${a.time || '99:99'} ${a.title}`.localeCompare(`${b.time || '99:99'} ${b.title}`, 'pt-BR')
    })
  }, [plan, state.events, state.eventCompletions, day])

  const eventPassed = (item: PlannerItem) => {
    if (day < today) return true
    if (!isToday || !clockIsToday || !item.time || item.raw.dia_inteiro === true || item.subtitle === 'Em andamento') return false
    const end = minutesOf(String(item.raw.hora_fim || ''))
    const start = minutesOf(item.time)
    return Number.isFinite(end) ? end <= nowMinutes : Number.isFinite(start) && start < nowMinutes
  }

  const eventIsNow = (item: PlannerItem) => {
    if (!isToday || !clockIsToday) return false
    if (item.subtitle === 'Em andamento') return true
    if (!item.time || item.raw.dia_inteiro === true) return false
    return minutesOf(item.time) <= nowMinutes && !eventPassed(item)
  }

  /* ---------------------------------------------------------------- Tarefas */

  const tasks = useMemo(() => state.tasks.filter(task => {
    const due = dateKey(task.data_vencimento)
    if (task.concluida || !due) return false
    if (isToday ? due > today : due !== day) return false
    if (filters.project !== 'all' && String(task.projeto_id || 'entrada') !== filters.project) return false
    if (filters.priority !== 'all' && String(Number(task.prioridade || 4)) !== filters.priority) return false
    return true
  }).sort((a, b) => {
    const aDay = dateKey(a.data_vencimento)
    const bDay = dateKey(b.data_vencimento)
    const aTime = timeKey(a.data_vencimento) || '99:99'
    const bTime = timeKey(b.data_vencimento) || '99:99'
    const titleCompare = String(a.titulo || '').localeCompare(String(b.titulo || ''), 'pt-BR', { sensitivity: 'base' })
    if (sortMode === 'priority') return Number(a.prioridade || 4) - Number(b.prioridade || 4) || aDay.localeCompare(bDay) || aTime.localeCompare(bTime) || titleCompare
    if (sortMode === 'project') return projectName(a.projeto_id).localeCompare(projectName(b.projeto_id), 'pt-BR', { sensitivity: 'base' }) || aDay.localeCompare(bDay) || aTime.localeCompare(bTime) || titleCompare
    if (sortMode === 'title' || sortMode === 'name') return titleCompare || aDay.localeCompare(bDay) || aTime.localeCompare(bTime)
    if (sortMode === 'date') return aDay.localeCompare(bDay) || aTime.localeCompare(bTime) || titleCompare
    const aLate = aDay < today
    const bLate = bDay < today
    if (aLate !== bLate) return aLate ? -1 : 1
    return aDay.localeCompare(bDay) || aTime.localeCompare(bTime) || Number(a.ordem || 0) - Number(b.ordem || 0) || titleCompare
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [state.tasks, today, day, isToday, filters.project, filters.priority, sortMode, projectMap])


  function toggleTask(id: string) {
    commit(current => ({ ...current, tasks: current.tasks.map(task => (task.id === id ? { ...task, concluida: !task.concluida, concluida_em: !task.concluida ? new Date().toISOString() : '' } : task)) }))
  }

  const inspectTask = (task: Row) => inspect({ kind: 'task', sourceId: String(task.id), title: String(task.titulo || 'Tarefa'), date: dateKey(task.data_vencimento), time: timeKey(task.data_vencimento), raw: task })
  const inspectPlanner = (item: PlannerItem) => inspect({ kind: item.kind, sourceId: item.sourceId, title: item.title, date: item.date, time: item.time, raw: item.raw })

  /* ---------------------------------------------------------------- Hábitos */

  const canLogHabits = day <= today
  const dayEntries = rows(state.habitEntries).filter(entry => dateKey(entry.data) === day)
  const habits = rows(state.habits).filter(habit => habit.ativo !== false && !hiddenFromAgenda(habit) && habitEligible(habit, day)).map((habit, index) => {
    const entry = dayEntries.find(item => String(item.habito_id) === String(habit.id))
    const target = Math.max(1, Number(habit.meta || 1))
    const value = Number(entry?.valor || 0)
    const failed = failedEntry(entry)
    const done = !failed && value >= target
    const quantitative = target > 1 || Boolean(habit.unidade)
    return { habit, entry, target, value, failed, done, quantitative }
  }).sort((a, b) => Number(a.done) - Number(b.done))
  const habitsDone = habits.filter(item => item.done).length

  function logHabit(item: (typeof habits)[number]) {
    if (!canLogHabits) return
    const habitId = item.habit.id
    commit(current => {
      const all = rows(current.habitEntries)
      const existing = all.find(entry => String(entry.habito_id) === String(habitId) && dateKey(entry.data) === day)
      const others = all.filter(entry => !(String(entry.habito_id) === String(habitId) && dateKey(entry.data) === day))
      if (!item.quantitative) {
        if (existing && !failedEntry(existing) && Number(existing.valor || 0) > 0) return { ...current, habitEntries: others }
        return { ...current, habitEntries: [...others, { id: existing?.id || uid('hr'), habito_id: habitId, data: day, valor: item.target, falhou: false, status: '', criado_em: existing?.criado_em || new Date().toISOString() }] }
      }
      const currentValue = existing && !failedEntry(existing) ? Number(existing.valor || 0) : 0
      const nextValue = currentValue >= item.target ? 0 : currentValue + 1
      if (nextValue === 0) return { ...current, habitEntries: others }
      return { ...current, habitEntries: [...others, { id: existing?.id || uid('hr'), habito_id: habitId, data: day, valor: nextValue, falhou: false, status: '', criado_em: existing?.criado_em || new Date().toISOString() }] }
    })
  }

  const habitValueLabel = (item: (typeof habits)[number]) => {
    if (item.failed) return 'Não feito'
    if (item.quantitative) return `${item.value} de ${item.target}${item.habit.unidade ? ` ${String(item.habit.unidade)}` : ''}`
    return item.done ? 'Feito' : 'Pendente'
  }

  /* ------------------------------------------------------------------ Metas */

  const goals = rows(state.goals).filter(goal => {
    const due = goalDate(goal)
    return Boolean(due) && (isToday ? due <= today : due === day) && !concluded(goal)
  }).sort((a, b) => goalDate(a).localeCompare(goalDate(b)))

  /* ---------------------------------------------------------------- Finanças */

  const summary = useMemo(() => financeSummary(state, today), [state, today])
  const finance = state.finance || {}
  const transactions = rows(finance.transactions).filter(item => {
    const due = dateKey(item.data)
    return Boolean(due) && (isToday ? due <= today : due === day) && !item.ignorar_calculo && !isPaid(item.status) && item.ocultar_inicio !== true && item.ocultar_home !== true
  }).sort((a, b) => dateKey(a.data).localeCompare(dateKey(b.data)))

  function toggleFinancePaid(item: Row) {
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

  /* ------------------------------------------------------------------- Notas */

  const notes = rows(state.notes).filter(note => note.ativo !== false && note.arquivado !== true && !concluded(note) && dateKey(note.data || note.updated_at || note.criado_em) === day).sort((a, b) => String(b.data || b.updated_at || '').localeCompare(String(a.data || a.updated_at || ''))).slice(0, 8)

  /* ------------------------------------------------------- Edição rápida */

  const quick = useQuickMenu()
  const [openSubs, setOpenSubs] = useState<Set<string>>(new Set())
  const tomorrow = addDays(today, 1)
  const nextMonday = (() => { const date = new Date(`${today}T12:00:00`); const add = ((8 - date.getDay()) % 7) || 7; return addDays(today, add) })()
  const dateChoices = [
    { label: 'Hoje', icon: 'today', value: today },
    { label: 'Amanhã', icon: 'wb_sunny', value: tomorrow },
    { label: 'Próx. semana', icon: 'date_range', value: nextMonday },
  ]

  function patchTask(id: string, patch: Row) {
    commit(current => ({ ...current, tasks: current.tasks.map(task => String(task.id) === id ? { ...task, ...patch } : task) }))
  }

  function taskMenu(task: Row): QuickMenuConfig {
    const id = String(task.id)
    const due = dateKey(task.data_vencimento)
    const time = timeKey(task.data_vencimento)
    const priority = Number(task.prioridade || 4)
    const title = String(task.titulo || 'Tarefa')
    return {
      title,
      subtitle: `${projectName(task.projeto_id)}${task.secao ? ` · ${String(task.secao)}` : ''}`,
      groups: [
        { label: 'Data', inline: true, options: [
          ...dateChoices.map(choice => ({ label: choice.label, icon: choice.icon, active: due === choice.value, onSelect: () => patchTask(id, { data_vencimento: `${choice.value}${time ? `T${time}` : ''}` }) })),
          { label: 'Sem data', icon: 'event_busy', active: !due, onSelect: () => patchTask(id, { data_vencimento: '' }) },
        ] },
        { label: 'Prioridade', inline: true, options: [1, 2, 3, 4].map(level => ({
          label: ['Alta', 'Média', 'Baixa', 'Nenhuma'][level - 1],
          icon: 'flag',
          color: PRIORITY_COLOR[level] || 'var(--ds-muted)',
          active: priority === level,
          onSelect: () => patchTask(id, { prioridade: level }),
        })) },
        { options: [
          { label: task.concluida ? 'Reabrir tarefa' : 'Concluir', icon: task.concluida ? 'undo' : 'check_circle', onSelect: () => toggleTask(id) },
          { label: 'Abrir detalhes', icon: 'open_in_full', onSelect: () => inspectTask(task) },
          { label: 'Excluir', icon: 'delete', tone: 'danger', onSelect: async () => {
            if (!(await askConfirm({ title: 'Excluir tarefa?', message: `“${title}” será excluída. Não dá para desfazer.` }))) return
            commit(current => ({ ...current, tasks: current.tasks.filter(item => String(item.id) !== id && String(item.parent_id || '') !== id) }))
          } },
        ] },
      ],
    }
  }

  function toggleEventDone(item: PlannerItem) {
    const key = `${item.sourceId}|${item.date}|${item.time || ''}`
    commit(current => {
      const completions = rows(current.eventCompletions)
      const exists = completions.some(entry => entry.chave === key || (String(entry.evento_id) === item.sourceId && dateKey(entry.data) === item.date && entry.concluida !== false))
      return {
        ...current,
        eventCompletions: exists
          ? completions.filter(entry => !(entry.chave === key || (String(entry.evento_id) === item.sourceId && dateKey(entry.data) === item.date)))
          : [...completions, { chave: key, evento_id: item.sourceId, data: item.date, hora: item.time, concluida: true, atualizado_em: new Date().toISOString() }],
      }
    })
  }

  function patchEvent(id: string, patch: (event: Row) => Row) {
    commit(current => ({ ...current, events: rows(current.events).map(event => String(event.id) === id ? patch(event) : event) }))
  }

  function eventMenu(item: PlannerItem): QuickMenuConfig {
    const google = item.raw.tipo === 'google' || item.raw.tipo === 'gcalendar'
    const id = item.sourceId
    const start = dateKey(item.raw.data_inicio)
    const end = dateKey(item.raw.data_fim)
    const moveTo = (target: string) => patchEvent(id, event => {
      const shift = Math.round((new Date(`${target}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / 86400000)
      return { ...event, data_inicio: target, ...(end ? { data_fim: addDays(end, shift) } : {}) }
    })
    const done = Boolean(item.completed)
    return {
      title: item.title,
      subtitle: `${item.time ? `${item.time} · ` : ''}${google ? String(item.raw.calendario_nome || 'Google Agenda') : String(item.raw.categoria || 'MAI')}`,
      groups: [
        google || !start ? { options: [] } : { label: 'Mover para', inline: true, options: dateChoices.map(choice => ({ label: choice.label, icon: choice.icon, active: start === choice.value, onSelect: () => moveTo(choice.value) })) },
        { options: [
          { label: done ? 'Desmarcar concluído' : 'Marcar como concluído', icon: done ? 'undo' : 'check_circle', onSelect: () => toggleEventDone(item) },
          { label: 'Abrir detalhes', icon: 'open_in_full', onSelect: () => inspectPlanner(item) },
          ...(google && item.raw.url ? [{ label: 'Abrir no Google Agenda', icon: 'open_in_new', onSelect: () => { window.open(String(item.raw.url), '_blank', 'noopener') } }] : []),
          ...(!google ? [{ label: 'Excluir', icon: 'delete', tone: 'danger' as const, onSelect: async () => {
            if (!(await askConfirm({ title: 'Excluir compromisso?', message: `“${item.title}” será excluído. Não dá para desfazer.` }))) return
            commit(current => ({ ...current, events: rows(current.events).filter(event => String(event.id) !== id), eventCompletions: rows(current.eventCompletions).filter(entry => String(entry.evento_id) !== id) }))
          } }] : []),
        ] },
      ],
    }
  }

  function setHabitEntry(habitId: unknown, next: { valor: number; falhou: boolean } | null) {
    commit(current => {
      const all = rows(current.habitEntries)
      const existing = all.find(entry => String(entry.habito_id) === String(habitId) && dateKey(entry.data) === day)
      const others = all.filter(entry => !(String(entry.habito_id) === String(habitId) && dateKey(entry.data) === day))
      if (!next) return { ...current, habitEntries: others }
      return { ...current, habitEntries: [...others, { id: existing?.id || uid('hr'), habito_id: habitId, data: day, valor: next.valor, falhou: next.falhou, status: next.falhou ? 'falha' : '', criado_em: existing?.criado_em || new Date().toISOString() }] }
    })
  }

  function habitMenu(item: (typeof habits)[number]): QuickMenuConfig {
    const name = String(item.habit.nome || 'Hábito')
    const id = item.habit.id
    const disabled = !canLogHabits
    return {
      title: name,
      subtitle: disabled ? 'Dia futuro: só dá para abrir os detalhes' : habitValueLabel(item),
      groups: [
        disabled ? { options: [] } : { label: item.quantitative ? `Progresso · ${item.value} de ${item.target}` : undefined, inline: true, options: [
          ...(item.quantitative ? [
            { label: '−1', icon: 'remove', onSelect: () => setHabitEntry(id, item.value > 1 ? { valor: item.value - 1, falhou: false } : null) },
            { label: '+1', icon: 'add', onSelect: () => setHabitEntry(id, { valor: item.value + 1, falhou: false }) },
          ] : []),
          { label: item.done ? 'Feito' : 'Concluir', icon: 'check', color: 'var(--ds-success)', active: item.done, onSelect: () => setHabitEntry(id, item.done ? null : { valor: item.target, falhou: false }) },
          { label: 'Falhou', icon: 'close', color: 'var(--ds-danger)', active: item.failed, onSelect: () => setHabitEntry(id, item.failed ? null : { valor: 0, falhou: true }) },
        ] },
        { options: [
          ...(!disabled && (item.entry) ? [{ label: 'Limpar registro do dia', icon: 'backspace', onSelect: () => setHabitEntry(id, null) }] : []),
          { label: 'Abrir detalhes', icon: 'open_in_full', onSelect: () => inspect({ kind: 'habit', sourceId: String(id), title: name, date: day, raw: item.habit }) },
        ] },
      ],
    }
  }

  function patchTransaction(id: string, patch: Row) {
    commit(current => ({ ...current, finance: { ...current.finance, transactions: rows(current.finance.transactions).map(row => String(row.id) === id ? { ...row, ...patch } : row) } }))
  }

  function financeMenu(item: Row): QuickMenuConfig {
    const id = String(item.id)
    const due = dateKey(item.data)
    const income = String(item.tipo || '').toLocaleLowerCase('pt-BR') === 'receita'
    const payment = financeCardPaymentState(item)
    const paid = payment.status === 'pago'
    const title = txTitle(item)
    return {
      title,
      subtitle: `${income ? '+' : '-'}${money.format(payment.remaining || payment.total)} · ${naturalDate(due, today)}`,
      groups: [
        { label: 'Vencimento', inline: true, options: dateChoices.map(choice => ({ label: choice.label, icon: choice.icon, active: due === choice.value, onSelect: () => patchTransaction(id, { data: choice.value, dia_mes: Number(choice.value.slice(8)) }) })) },
        { options: [
          { label: paid ? 'Marcar como pendente' : income ? 'Marcar como recebido' : 'Marcar como pago', icon: paid ? 'undo' : 'check_circle', onSelect: () => toggleFinancePaid(item) },
          { label: 'Abrir detalhes', icon: 'open_in_full', onSelect: () => inspect({ kind: 'finance', sourceId: id, title, date: due, raw: item }) },
          { label: 'Excluir', icon: 'delete', tone: 'danger', onSelect: async () => {
            if (!(await askConfirm({ title: 'Excluir lançamento?', message: `“${title}” será excluído. Não dá para desfazer.` }))) return
            commit(current => ({ ...current, finance: { ...current.finance, transactions: rows(current.finance.transactions).filter(row => String(row.id) !== id) } }))
          } },
        ] },
      ],
    }
  }

  /* ---------------------------------------------------------------- Seções */

  const financeMode = ['summary', 'bills'].includes(String(state.configs.todayFinanceMode)) ? String(state.configs.todayFinanceMode) : 'both'

  const toggleSubs = (id: string) => setOpenSubs(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const chevronFor = (id: string, label: string) => (
    <button type="button" className={styles.chevron} aria-expanded={!collapsed.has(id)} aria-label={`${collapsed.has(id) ? 'Expandir' : 'Recolher'} ${label}`} onClick={() => toggleCollapsed(id)}>
      <Icon name={collapsed.has(id) ? 'chevron_right' : 'expand_more'} size={20} filled={false} />
    </button>
  )

  const head = (id: string, title: string, meta?: string) => (
    <div className={styles.secHead}>
      <h2>{title}</h2>
      {meta ? <span className={styles.secMeta}>{meta}</span> : null}
      {chevronFor(id, title)}
    </div>
  )

  const addRow = (label: string, onClick?: () => void) => onClick ? (
    <button type="button" className={styles.addRow} onClick={onClick}>
      <Icon name="add" size={20} filled={false} />
      <span>{label}</span>
    </button>
  ) : null

  const renderTask = (task: Row) => {
    const due = dateKey(task.data_vencimento)
    const late = due < today
    const time = timeKey(task.data_vencimento)
    const priority = Number(task.prioridade || 4)
    const title = String(task.titulo || 'Tarefa')
    const description = plainText(task.descricao)
    const when = due ? `${naturalDate(due, today)}${time ? ` · ${time}` : ''}` : ''
    const taskId = String(task.id)
    const children = state.tasks.filter(item => String(item.parent_id || '') === taskId)
    const expanded = openSubs.has(taskId)
    const projectLabel = `${projectName(task.projeto_id)}${task.secao ? ` / ${String(task.secao)}` : ''}`
    return (
      <Fragment key={taskId}>
      <div role="listitem" className={`${styles.item} ${styles.itemWrap} ${styles.task} ${task.concluida ? styles.itemPassed : ''}`} {...quick.bind(() => taskMenu(task))}>
        <Check className={styles.itemCheck} checked={Boolean(task.concluida)} late={late} data-priority={!task.concluida && PRIORITY_COLOR[priority] ? priority : undefined} style={!task.concluida && PRIORITY_COLOR[priority] ? ({ '--check-color': PRIORITY_COLOR[priority] } as CSSProperties) : undefined} label={`Concluir: ${title}`} onCheckedChange={() => toggleTask(String(task.id))} />
        <div className={styles.taskMain} onClick={() => inspectTask(task)}>
          <button type="button" className={styles.taskTitleBtn}>{title}</button>
          {description ? <div className={styles.taskDesc}>{renderDescription(description)}</div> : null}
          <div className={styles.taskMeta}>
            {when ? <span className={`${styles.dateTag} ${late ? styles.dateLate : due === today ? styles.dateToday : ''}`}><Icon name="calendar_today" size={14} filled={false} />{when}</span> : null}
            {children.length ? (
              <button type="button" className={styles.subChip} data-open={expanded || undefined} onClick={event => { event.stopPropagation(); toggleSubs(taskId) }} aria-expanded={expanded} title={`${children.filter(child => child.concluida).length}/${children.length} subtarefas`} aria-label={`${expanded ? 'Esconder' : 'Mostrar'} subtarefas de ${title} (${children.filter(child => child.concluida).length} de ${children.length} concluídas)`}>
                <span>{children.filter(child => child.concluida).length}/{children.length}</span>
                <Icon name={expanded ? 'expand_more' : 'chevron_right'} size={20} filled={false} />
              </button>
            ) : null}
            <span className={styles.projLabel}>{projectLabel}<b style={{ color: projectColor(task.projeto_id) }}>#</b></span>
          </div>
        </div>
      </div>
      {expanded && children.length ? (
        <div className={styles.subList} role="list" aria-label={`Subtarefas de ${title}`}>
          {[...children].sort((a, b) => Number(Boolean(a.concluida)) - Number(Boolean(b.concluida)) || Number(a.ordem || 0) - Number(b.ordem || 0)).map(child => {
            const childId = String(child.id)
            const childDue = dateKey(child.data_vencimento)
            const childLate = Boolean(childDue) && childDue < today && !child.concluida
            const childPriority = Number(child.prioridade || 4)
            return (
              <div key={childId} role="listitem" className={styles.subRow} data-done={child.concluida || undefined}>
                <button type="button" className={styles.subCheck} data-done={child.concluida || undefined} data-late={childLate || undefined} style={!child.concluida && PRIORITY_COLOR[childPriority] ? ({ borderColor: PRIORITY_COLOR[childPriority] } as CSSProperties) : undefined} aria-label={child.concluida ? `Reabrir subtarefa ${String(child.titulo || '')}` : `Concluir subtarefa ${String(child.titulo || '')}`} onClick={() => toggleTask(childId)}>
                  {child.concluida ? <Icon name="check" size={11} /> : null}
                </button>
                <button type="button" className={styles.subTitle} onClick={() => inspectTask(child)}>{String(child.titulo || 'Subtarefa')}</button>
                {childDue ? <span className={styles.subMeta} data-late={childLate || undefined}>{naturalDate(childDue, today)}</span> : null}
              </div>
            )
          })}
        </div>
      ) : null}
      </Fragment>
    )
  }

  // Sempre agrupadas por projeto; as atrasadas ficam dentro do projeto delas.
  const taskGroups = useMemo(() => {
    const grouped = new Map<string, Row[]>()
    tasks.forEach(task => {
      const id = String(task.projeto_id || 'entrada')
      if (!grouped.has(id)) grouped.set(id, [])
      grouped.get(id)!.push(task)
    })
    const projectOrder = (id: string) => id === 'entrada' ? -1 : projects.findIndex(project => String(project.id) === id)
    return [...grouped.entries()]
      .sort(([a], [b]) => projectOrder(a) - projectOrder(b))
      .map(([id, items]) => {
        const sections = rows(projectMap.get(id)?.secoes).map(String)
        const sectionIndex = (task: Row) => { const index = sections.indexOf(String(task.secao || '')); return index < 0 ? (task.secao ? sections.length : -1) : index }
        return { id, name: id === 'entrada' ? 'Entrada' : projectName(id), items: [...items].sort((a, b) => sectionIndex(a) - sectionIndex(b)) }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, projectMap])

  /* Hábitos: semana (seg–dom) do dia mostrado e sequência atual. */
  const entryByKey = new Map(rows(state.habitEntries).map(entry => [`${entry.habito_id}|${dateKey(entry.data)}`, entry]))
  // 'full' = meta cumprida; 'part' = algum progresso (conta para a sequência mesmo sem completar).
  const levelOn = (habit: Row, key: string): '' | 'full' | 'part' => {
    const entry = entryByKey.get(`${habit.id}|${key}`)
    if (!entry || failedEntry(entry)) return ''
    const value = Number(entry.valor || 0)
    if (value >= Math.max(1, Number(habit.meta || 1))) return 'full'
    return value > 0 ? 'part' : ''
  }
  const pctOn = (habit: Row, key: string) => {
    const entry = entryByKey.get(`${habit.id}|${key}`)
    if (!entry || failedEntry(entry)) return 0
    return Math.max(0, Math.min(100, Math.round((Number(entry.valor || 0) / Math.max(1, Number(habit.meta || 1))) * 100)))
  }
  const weekStart = addDays(day, -((new Date(`${day}T12:00:00`).getDay()) % 7))
  const weekKeys = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  const streakOf = (habit: Row) => {
    let count = 0
    let cursor = day
    if (!levelOn(habit, cursor)) cursor = addDays(cursor, -1)
    for (let step = 0; step < 400; step += 1) {
      if (!habitEligible(habit, cursor)) { cursor = addDays(cursor, -1); continue }
      if (!levelOn(habit, cursor)) break
      count += 1
      cursor = addDays(cursor, -1)
    }
    return count
  }

  /* Finanças: atrasados e do dia, com o mesmo cartão das tarefas. */
  const monthEnd = (() => { const base = new Date(`${today}T12:00:00`); return new Date(base.getFullYear(), base.getMonth() + 1, 0) })()
  const monthEndLabel = monthEnd.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace(/\./g, '')
  const lateTransactions = isToday ? transactions.filter(item => dateKey(item.data) < today) : []
  const dayTransactions = isToday ? transactions.filter(item => dateKey(item.data) >= today) : transactions

  const renderTransaction = (item: Row) => {
    const due = dateKey(item.data)
    const income = String(item.tipo || '').toLocaleLowerCase('pt-BR') === 'receita'
    const payment = financeCardPaymentState(item)
    const title = txTitle(item)
    const late = due < today
    return (
      <div key={String(item.id)} role="listitem" className={`${styles.item} ${styles.itemWrap} ${payment.status === 'pago' ? styles.itemPassed : ''}`} {...quick.bind(() => financeMenu(item))}>
        <Check className={styles.itemCheck} checked={payment.status === 'pago'} late={late} label={`${income ? 'Marcar como recebido' : 'Marcar como pago'}: ${title}`} onCheckedChange={() => toggleFinancePaid(item)} />
        <button type="button" className={styles.itemButton} onClick={() => inspect({ kind: 'finance', sourceId: String(item.id), title, date: due, raw: item })}>
          <span className={styles.taskBody}>
            <span className={styles.taskTitle}>{title}{payment.status === 'parcial' ? <span className={styles.partial}>Parcial</span> : null}</span>
            <span className={styles.taskSub}>
              <span className={`${styles.dateTag} ${late ? styles.dateLate : due === today ? styles.dateToday : ''}`}><Icon name="calendar_today" size={13} filled={false} />{naturalDate(due, today)}</span>
            </span>
          </span>
          <span className={`${styles.amount} ${income ? styles.positive : styles.negative}`}>{income ? '+' : '−'} {money.format(payment.remaining || payment.total)}</span>
        </button>
      </div>
    )
  }

  const sections: Record<SectionId, ReactNode> = {
    appointments: (
      <section className={styles.block} aria-label="Agenda">
        {head('appointments', 'Agenda', events.length ? plural(events.length, 'compromisso', 'compromissos') : undefined)}
        {!collapsed.has('appointments') ? (
          <>
            {events.length ? <AgendaStrip items={events} nowMinutes={isToday && clockIsToday ? nowMinutes : null} isPassed={eventPassed} onOpen={inspectPlanner} onToggle={toggleEventDone} bind={item => quick.bind(() => eventMenu(item))} /> : <div className={styles.empty}>{isToday ? 'Nada na agenda hoje.' : 'Nada na agenda neste dia.'}</div>}
            {addRow('Adicionar compromisso', onAddEvent)}
          </>
        ) : null}
      </section>
    ),
    tasks: (
      <section className={styles.block} aria-label="Tarefas">
        {tasks.length ? (
          <div className={styles.projectGroups}>
            {taskGroups.map(group => (
              <section key={group.id} className={styles.projectGroup} aria-label={group.name}>
                <header className={styles.projectHead}>
                  {projectImage(group.id) ? <img className={styles.projectHeadImg} src={projectImage(group.id)} alt="" loading="lazy" /> : <span className={styles.projectHeadDot} style={{ background: group.id === 'entrada' ? 'var(--ds-accent)' : projectColor(group.id) }} aria-hidden="true">{group.name.trim().slice(0, 1).toLocaleUpperCase('pt-BR')}</span>}
                  <strong>{group.name}</strong>
                  <span className={styles.projectCount}>{group.items.length}</span>
                  {chevronFor(`p:${group.id}`, group.name)}
                </header>
                {!collapsed.has(`p:${group.id}`) ? (
                  <>
                    <div role="list" className={styles.items}>{group.items.map(task => renderTask(task))}</div>
                    {addRow('Adicionar tarefa', onAddTask ? () => onAddTask(group.id) : undefined)}
                  </>
                ) : null}
              </section>
            ))}
          </div>
        ) : (
          <>
            <div className={styles.empty}>{isToday ? 'Nada pendente para hoje.' : 'Nenhuma tarefa neste dia.'}</div>
            {addRow('Adicionar tarefa', onAddTask ? () => onAddTask() : undefined)}
          </>
        )}
      </section>
    ),
    habits: (
      <section className={styles.block} aria-label="Hábitos">
        {head('habits', 'Hábitos', habits.length ? `${habitsDone}/${habits.length}` : undefined)}
        {!collapsed.has('habits') ? (
          habits.length ? (
            <div className={styles.habitList} role="list">
              {habits.map(item => {
                const name = String(item.habit.nome || 'Hábito')
                const color = String(item.habit.cor_hex || 'var(--ds-accent)')
                const streak = streakOf(item.habit)
                return (
                  <div key={String(item.habit.id)} role="listitem" className={styles.habitRow} style={{ '--hc': color } as CSSProperties} {...quick.bind(() => habitMenu(item))}>
                    <button type="button" className={styles.habitRing} data-done={item.done || undefined} data-failed={item.failed || undefined} data-partial={(!item.done && !item.failed && item.value > 0) || undefined} disabled={!canLogHabits} onClick={() => logHabit(item)} aria-label={item.quantitative ? `Registrar mais 1 em ${name}` : item.done ? `Desmarcar ${name}` : `Marcar ${name}`}>
                      {item.done ? <Icon name="check" size={12} weight={600} /> : item.failed ? <span aria-hidden="true">×</span> : null}
                    </button>
                    <button type="button" className={styles.habitBody} onClick={() => inspect({ kind: 'habit', sourceId: String(item.habit.id), title: name, date: day, raw: item.habit })}>
                      <span className={styles.habitTitle} style={{ color: color }}>{name}</span>
                      {(() => {
                        const sub = [item.quantitative || item.failed ? habitValueLabel(item) : '', plainText(item.habit.descricao)].filter(Boolean).join(' · ')
                        return sub ? <span className={styles.habitDesc}>{sub}</span> : null
                      })()}
                    </button>
                    <span className={styles.habitDots} aria-hidden="true">
                      {weekKeys.map(key => <i key={key} style={{ ['--p' as string]: pctOn(item.habit, key) }} data-on={levelOn(item.habit, key) === 'full' || undefined} data-part={levelOn(item.habit, key) === 'part' || undefined} data-today={key === day || undefined} />)}
                    </span>
                    <span className={styles.streak} data-on={streak > 0 || undefined} title={`Sequência de ${streak} ${streak === 1 ? 'dia' : 'dias'}`}><Icon name="local_fire_department" size={15} />{streak}</span>
                  </div>
                )
              })}
            </div>
          ) : <div className={styles.empty}>Nenhum hábito previsto.</div>
        ) : null}
      </section>
    ),
    goals: (
      <section className={styles.block} aria-label="Metas">
        {head('goals', 'Metas', goals.length ? String(goals.length) : undefined)}
        {!collapsed.has('goals') ? (
          goals.length ? (
            <div className={styles.items}>
              {goals.map(goal => {
                const total = Math.max(1, Number(goal.progresso_total || 100))
                const pct = Math.max(0, Math.min(100, Math.round((Number(goal.progresso_atual || 0) / total) * 100)))
                const due = goalDate(goal)
                const title = String(goal.titulo || 'Meta')
                return (
                  <button key={String(goal.id)} type="button" className={`${styles.item} ${styles.goal}`} onClick={() => inspect({ kind: 'goal', sourceId: String(goal.id), title, date: due, raw: goal })} aria-label={`${title}, ${pct}%`}>
                    <Icon name="flag" size={16} className={styles.goalIcon} />
                    <span className={styles.itemTitle}>{title}</span>
                    <span className={`${styles.itemMeta} ${due < today ? styles.late : ''}`}>{naturalDate(due, today)}</span>
                    <span className={styles.goalPct}>{pct}%</span>
                    <span className={styles.goalBar} style={{ width: `${pct}%` }} />
                  </button>
                )
              })}
            </div>
          ) : <div className={styles.empty}>Nenhuma meta vencendo.</div>
        ) : null}
      </section>
    ),
    finance: (
      <section className={styles.block} aria-label="Finanças">
        {head('finance', 'Finanças')}
        {!collapsed.has('finance') ? (
          <div className={styles.financeStack}>
            {financeMode !== 'bills' ? (
              <button type="button" className={styles.balance} onClick={() => navigate('finance')} aria-label="Abrir Finanças">
                <span className={styles.balanceRow}>
                  <span className={styles.balanceCell}>
                    <span className={styles.balanceLabel}>Saldo atual</span>
                    <strong className={styles.balanceValue}>{money.format(summary.balance)}</strong>
                  </span>
                  <span className={`${styles.balanceCell} ${styles.balanceEnd}`}>
                    <span className={styles.balanceLabel}>A receber no mês</span>
                    <b className={`${styles.balanceStatValue} ${styles.positive}`}>{money.format(summary.toReceive)}</b>
                  </span>
                </span>
                <span className={styles.balanceRow}>
                  <span className={styles.balanceCell}>
                    <span className={styles.balanceLabel}>Previsto em {monthEndLabel}</span>
                    <strong className={styles.balanceForecastValue}>{money.format(summary.projected)}</strong>
                  </span>
                  <span className={`${styles.balanceCell} ${styles.balanceEnd}`}>
                    <span className={styles.balanceLabel}>A pagar no mês</span>
                    <b className={`${styles.balanceStatValue} ${styles.negative}`}>{money.format(summary.toPay)}</b>
                  </span>
                </span>
              </button>
            ) : null}
            {financeMode !== 'summary' ? (
              transactions.length ? (
                <>
                  <div role="list" className={styles.items}>{[...lateTransactions, ...dayTransactions].map(renderTransaction)}</div>
                </>
              ) : financeMode === 'bills' ? <div className={styles.empty}>Nenhuma conta {isToday ? 'hoje' : 'neste dia'}.</div> : null
            ) : null}
          </div>
        ) : null}
      </section>
    ),
    notes: (
      <section className={styles.block} aria-label="Notas">
        {head('notes', 'Notas', notes.length ? String(notes.length) : undefined)}
        {!collapsed.has('notes') ? (
          notes.length ? (
            <div className={styles.items}>
              {notes.map(note => {
                const title = String(note.titulo || 'Sem título')
                return (
                  <button key={String(note.id)} type="button" className={styles.item} onClick={() => inspect({ kind: 'note', sourceId: String(note.id), title, date: dateKey(note.data || note.updated_at || note.criado_em), raw: note })}>
                    <Icon name="sticky_note_2" size={16} className={styles.noteIcon} />
                    <span className={styles.itemTitle}>{title}</span>
                  </button>
                )
              })}
            </div>
          ) : <div className={styles.empty}>Nenhuma nota.</div>
        ) : null}
      </section>
    ),
  }

  /* ---------------------------------------------------------------- Página */

  const dayLabel = capitalize(new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })).replace(/^([^,]+)-feira/, '$1').replace(/^([^,]+?)( \d)/, '$1,$2')
  const shortDayLabel = capitalize(new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, ''))
  const title = isToday ? 'Hoje' : naturalDate(day, today) === 'Amanhã' || naturalDate(day, today) === 'Ontem' ? naturalDate(day, today) : capitalize(new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' }))
  const taskCountLabel = plural(tasks.length, 'tarefa', 'tarefas')

  // Colunas do computador. No celular vira uma coluna só, na ordem salva.
  const COLUMN: Record<SectionId, 'main' | 'side'> = { tasks: 'main', appointments: 'side', notes: 'side', habits: 'side', finance: 'side', goals: 'side' }
  const visible = order.filter(id => !hidden.has(id) && !(id === 'goals' && !goals.length) && !(id === 'notes' && !notes.length))
  const column = (name: 'main' | 'side', extra?: ReactNode) => (
    <div className={`${styles.column} ${styles[`col_${name}`]}`}>
      {extra}
      {visible.filter(id => COLUMN[id] === name).map(id => (
        <div key={id} className={styles.slot} data-sec={id} style={{ order: visible.indexOf(id) + 1 }}>{sections[id]}</div>
      ))}
    </div>
  )

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.greeting}>{title}</h1>
          <p className={styles.subline}>
            <span className={styles.dateLong}>{dayLabel}</span>
            <span className={styles.dateShort}>{shortDayLabel}</span>
            <span className={styles.dot} aria-hidden="true">·</span>
            <span>{taskCountLabel}</span>
          </p>
        </div>
        <div className={styles.headerActions}>
          {!isToday ? <Button variant="secondary" size="sm" pill icon="undo" onClick={goToToday}>Hoje</Button> : null}
          {options ? <div className={styles.options}>{options}</div> : null}
        </div>
      </header>

      <div className={styles.board}>
        {column('main')}
        {column('side')}
      </div>
      {quick.element}
    </div>
  )
}
