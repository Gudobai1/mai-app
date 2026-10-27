'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { plannerItems, type PlannerItem } from '../../../lib/v2/planner'
import type { MaiState } from '../../../lib/v2/state'
import { Button, Card, Check, Icon, IconButton, IconTile, ListItem, ProgressBar, SectionHeader, Tag, type Tone } from '../../ds'
import type { AppView, Row } from '../app-types'
import type { InspectableItem } from '../ContextDrawer'
import { financeSummary } from '../../../lib/v2/finance-summary'
import { financeCardPaymentState } from '../FinanceTransactionCard'
import { resolveMaiIcon } from '../MaiIcons'
import styles from './TodayModern.module.css'

/*
 * Tela Hoje — visual Moderno.
 *
 * Mantém tudo o que a TodayV4 fazia (seções, ordem e visibilidade salvas,
 * filtros e classificação do topo, concluir tarefa, marcar lançamento como
 * pago, abrir qualquer item no painel lateral) e acrescenta: semana, cartão
 * "A seguir" e registro rápido de hábitos.
 */

type Commit = (change: (current: MaiState) => MaiState) => void

type Props = {
  state: MaiState
  today: string
  commit: Commit
  navigate: (view: AppView) => void
  inspect: (item: InspectableItem) => void
  profileName?: string
  /** Botão "Opções" do topo (filtros e classificação), embutido no cabeçalho. */
  options?: ReactNode
  onSearch: () => void
  onAdd: () => void
}

const DEFAULT_ORDER = ['appointments', 'tasks', 'habits', 'goals', 'finance', 'notes'] as const
type SectionId = typeof DEFAULT_ORDER[number]
const SECTION_LABELS: Record<SectionId, string> = { appointments: 'Compromissos', tasks: 'Tarefas', habits: 'Hábitos', goals: 'Metas', finance: 'Finanças', notes: 'Notas' }

type TodayFilters = { project: string; priority: string }
type SortMode = 'overdue' | 'date' | 'priority' | 'project' | 'title' | 'name'

const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : [])
const values = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const dateKey = (value: unknown) => String(value || '').slice(0, 10)
const timeKey = (value: unknown) => (String(value || '').includes('T') ? String(value).slice(11, 16) : '')
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const isPaid = (value: unknown) => ['pago', 'paga', 'quitado', 'quitada', 'concluido', 'concluida'].includes(String(value || '').toLocaleLowerCase('pt-BR'))
const concluded = (item: Row) => item.concluida === true || String(item.status || '').toLocaleLowerCase('pt-BR').includes('conclu')
const goalDate = (goal: Row) => dateKey(goal.prazo || goal.data || goal.data_limite || goal.deadline)
const txTitle = (item: Row) => String(item.descricao || item.titulo || item.nome || item.categoria || 'Lançamento')
const hiddenFromAgenda = (habit: Row) => habit.ocultar_agenda === true || String(habit.ocultar_agenda || '').toLowerCase() === 'true' || habit.ocultarAgenda === true || habit.mostrar_agenda === false || habit.mostrar_hoje_agenda === false
const failedEntry = (entry?: Row) => entry?.falhou === true || String(entry?.status || '').toLowerCase() === 'falha'
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

const HABIT_TONES: Tone[] = ['lilac', 'sky', 'peach', 'mint', 'rose', 'accent']
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

function greetingFor(hour: number) {
  if (hour < 5) return 'Boa noite'
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
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

export function TodayModern({ state, today, commit, inspect, profileName, options, onSearch, onAdd }: Props) {
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const customizeRef = useRef<HTMLDivElement | null>(null)
  const [clock, setClock] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!customizeOpen) return
    const onDown = (event: MouseEvent) => {
      if (customizeRef.current && !customizeRef.current.contains(event.target as Node)) setCustomizeOpen(false)
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setCustomizeOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [customizeOpen])

  /* ---------------------------------------------------------- Preferências */

  const savedOrder = Array.isArray(state.configs.todayListOrder) ? state.configs.todayListOrder.map(String).filter((id): id is SectionId => DEFAULT_ORDER.includes(id as SectionId)) : []
  const order: SectionId[] = [...savedOrder, ...DEFAULT_ORDER.filter(id => !savedOrder.includes(id))]
  const hidden = new Set(Array.isArray(state.configs.todayListHidden) ? state.configs.todayListHidden.map(String) : [])
  const savedFilters: Partial<TodayFilters> = state.configs.todayFilters && typeof state.configs.todayFilters === 'object' ? (state.configs.todayFilters as Partial<TodayFilters>) : {}
  const filters: TodayFilters = { project: String(savedFilters.project || 'all'), priority: String(savedFilters.priority || 'all') }
  const moduleControls = state.configs.moduleControls && typeof state.configs.moduleControls === 'object' ? (state.configs.moduleControls as Record<string, Row>) : {}
  const rawSort = String(moduleControls.today?.sort || 'overdue')
  const sortMode: SortMode = (['overdue', 'date', 'priority', 'project', 'title', 'name'] as const).includes(rawSort as SortMode) ? (rawSort as SortMode) : 'overdue'

  function toggleHidden(id: SectionId) {
    const next = new Set(hidden)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    commit(current => ({ ...current, configs: { ...current.configs, todayListHidden: [...next] } }))
  }

  function moveSection(id: SectionId, delta: number) {
    const next = [...order]
    const index = next.indexOf(id)
    const target = index + delta
    if (index < 0 || target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    commit(current => ({ ...current, configs: { ...current.configs, todayListOrder: next } }))
  }

  /* ---------------------------------------------------------------- Projetos */

  const projects = useMemo(() => rows(state.projects).filter(item => item.ativo !== false).sort((a, b) => Number(Boolean(b.favorito)) - Number(Boolean(a.favorito)) || Number(a.ordem || 0) - Number(b.ordem || 0) || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' })), [state.projects])
  const projectMap = useMemo(() => new Map(projects.map(project => [String(project.id), project])), [projects])
  const projectName = (projectId: unknown) => {
    const id = String(projectId || 'entrada')
    if (id === 'entrada') return 'Entrada'
    return String(projectMap.get(id)?.nome || 'Sem projeto')
  }
  const projectColor = (projectId: unknown) => String(projectMap.get(String(projectId || ''))?.cor || 'var(--ds-line-strong)')

  /* ------------------------------------------------------------------ Tempo */

  const todayIsCurrent = toKey(clock) === today
  const nowMinutes = clock.getHours() * 60 + clock.getMinutes()

  /* -------------------------------------------------------------- Semana */

  const week = useMemo(() => {
    const base = new Date(`${today}T12:00:00`)
    const offset = (base.getDay() + 6) % 7
    const monday = new Date(base)
    monday.setDate(base.getDate() - offset)
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday)
      date.setDate(monday.getDate() + index)
      return date
    })
    const start = toKey(days[0])
    const end = toKey(days[6])
    const load = new Map<string, number>()
    plannerItems(state, start, end).forEach(item => {
      if ((item.kind === 'task' || item.kind === 'event') && !item.completed) load.set(item.date, (load.get(item.date) || 0) + 1)
    })
    return days.map(date => {
      const key = toKey(date)
      return {
        key,
        name: date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
        number: date.getDate(),
        load: Math.min(load.get(key) || 0, 6),
        isToday: key === today,
        isPast: key < today,
      }
    })
  }, [state, today])

  /* --------------------------------------------------------- Compromissos */

  const plan = useMemo(() => plannerItems(state, today, today), [state, today])
  const eventDone = (eventId: unknown) => rows(state.eventCompletions).some(entry => String(entry.evento_id || String(entry.chave || '').split('|')[0]) === String(eventId) && dateKey(entry.data || String(entry.chave || '').split('|')[1]) === today && entry.concluida !== false)
  const events = useMemo(() => {
    const planned = plan.filter(item => item.kind === 'event' && !item.completed)
    const spanning: PlannerItem[] = rows(state.events).filter(event => {
      const start = dateKey(event.data_inicio)
      const end = dateKey(event.data_fim || event.data_termino || event.end)
      return start && end && start < today && end >= today && !eventDone(event.id)
    }).map(event => ({
      id: `span:${event.id}:${today}`,
      sourceId: String(event.id),
      kind: 'event' as const,
      date: today,
      time: String(event.hora_inicio || ''),
      title: String(event.titulo || 'Compromisso'),
      subtitle: 'Em andamento',
      color: String(event.categoria_cor || event.calendarColor || event.cor || ''),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, state.events, state.eventCompletions, today])

  const eventPassed = (item: PlannerItem) => {
    if (!todayIsCurrent || !item.time || item.raw.dia_inteiro === true || item.subtitle === 'Em andamento') return false
    const end = minutesOf(String(item.raw.hora_fim || ''))
    const start = minutesOf(item.time)
    return Number.isFinite(end) ? end <= nowMinutes : Number.isFinite(start) && start < nowMinutes
  }

  const nextEvent = todayIsCurrent
    ? events.find(item => item.time && item.raw.dia_inteiro !== true && item.subtitle !== 'Em andamento' && minutesOf(item.time) >= nowMinutes)
    : undefined

  /* ---------------------------------------------------------------- Tarefas */

  const tasks = useMemo(() => state.tasks.filter(task => {
    const day = dateKey(task.data_vencimento)
    if (task.concluida || !day || day > today) return false
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
  }), [state.tasks, today, filters.project, filters.priority, sortMode, projectMap])

  const lateCount = tasks.filter(task => dateKey(task.data_vencimento) < today).length

  function toggleTask(id: string) {
    commit(current => ({ ...current, tasks: current.tasks.map(task => (task.id === id ? { ...task, concluida: !task.concluida, concluida_em: !task.concluida ? new Date().toISOString() : '' } : task)) }))
  }

  const inspectTask = (task: Row) => inspect({ kind: 'task', sourceId: String(task.id), title: String(task.titulo || 'Tarefa'), date: dateKey(task.data_vencimento), time: timeKey(task.data_vencimento), raw: task })
  const inspectPlanner = (item: PlannerItem) => inspect({ kind: item.kind, sourceId: item.sourceId, title: item.title, date: item.date, time: item.time, raw: item.raw })

  /* ---------------------------------------------------------------- Hábitos */

  const todayEntries = rows(state.habitEntries).filter(entry => dateKey(entry.data) === today)
  const habits = rows(state.habits).filter(habit => habit.ativo !== false && !hiddenFromAgenda(habit) && habitEligible(habit, today)).map((habit, index) => {
    const entry = todayEntries.find(item => String(item.habito_id) === String(habit.id))
    const target = Math.max(1, Number(habit.meta || 1))
    const value = Number(entry?.valor || 0)
    const failed = failedEntry(entry)
    const done = !failed && value >= target
    const quantitative = target > 1 || Boolean(habit.unidade)
    return { habit, entry, target, value, failed, done, quantitative, tone: HABIT_TONES[index % HABIT_TONES.length] }
  }).sort((a, b) => Number(a.done) - Number(b.done))
  const habitsDone = habits.filter(item => item.done).length

  function logHabit(item: (typeof habits)[number]) {
    const habitId = item.habit.id
    commit(current => {
      const all = rows(current.habitEntries)
      const existing = all.find(entry => String(entry.habito_id) === String(habitId) && dateKey(entry.data) === today)
      const others = all.filter(entry => !(String(entry.habito_id) === String(habitId) && dateKey(entry.data) === today))
      if (!item.quantitative) {
        // Sim/não: alterna entre feito e sem registro.
        if (existing && !failedEntry(existing) && Number(existing.valor || 0) > 0) return { ...current, habitEntries: others }
        return { ...current, habitEntries: [...others, { id: existing?.id || uid('hr'), habito_id: habitId, data: today, valor: item.target, falhou: false, status: '', criado_em: existing?.criado_em || new Date().toISOString() }] }
      }
      // Quantitativo: soma 1 por toque; ao passar da meta, volta a zero.
      const currentValue = existing && !failedEntry(existing) ? Number(existing.valor || 0) : 0
      const nextValue = currentValue >= item.target ? 0 : currentValue + 1
      if (nextValue === 0) return { ...current, habitEntries: others }
      return { ...current, habitEntries: [...others, { id: existing?.id || uid('hr'), habito_id: habitId, data: today, valor: nextValue, falhou: false, status: '', criado_em: existing?.criado_em || new Date().toISOString() }] }
    })
  }

  const habitValueLabel = (item: (typeof habits)[number]) => {
    if (item.failed) return 'Não feito'
    if (item.quantitative) return `${item.value} de ${item.target}${item.habit.unidade ? ` ${String(item.habit.unidade)}` : ''}`
    return item.done ? 'Feito' : 'Pendente'
  }

  /* ------------------------------------------------------------------ Metas */

  const goals = rows(state.goals).filter(goal => {
    const day = goalDate(goal)
    return Boolean(day) && day <= today && !concluded(goal)
  }).sort((a, b) => goalDate(a).localeCompare(goalDate(b)))

  /* ---------------------------------------------------------------- Finanças */

  const finance = state.finance || {}
  const financeCandidates = rows(finance.transactions).filter(item => {
    const day = dateKey(item.data)
    return Boolean(day) && day <= today && !item.ignorar_calculo && !isPaid(item.status)
  }).sort((a, b) => dateKey(a.data).localeCompare(dateKey(b.data)))
  const transactions = financeCandidates.filter(item => item.ocultar_inicio !== true && item.ocultar_home !== true)

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

  const notes = rows(state.notes).filter(note => note.ativo !== false && note.arquivado !== true && !concluded(note) && dateKey(note.data || note.updated_at || note.criado_em) === today).sort((a, b) => String(b.data || b.updated_at || '').localeCompare(String(a.data || a.updated_at || ''))).slice(0, 8)

  /* ---------------------------------------------------------------- Seções */

  const summary = useMemo(() => financeSummary(state, today), [state, today])
  const monthName = new Date(`${today}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long' })
  const weekMax = Math.max(1, ...summary.weekExpenses.map(item => item.value))

  const renderTask = (task: Row) => {
    const day = dateKey(task.data_vencimento)
    const late = day < today
    const time = timeKey(task.data_vencimento)
    const priority = Number(task.prioridade || 4)
    return (
      <ListItem
        key={String(task.id)}
        leading={<Check checked={Boolean(task.concluida)} late={late} label={`Concluir: ${String(task.titulo || 'tarefa')}`} onCheckedChange={() => toggleTask(String(task.id))} />}
        title={String(task.titulo || 'Tarefa')}
        onOpen={() => inspectTask(task)}
        subtitle={<>
          <span className={styles.projectTag}><span className={styles.projectDot} style={{ background: projectColor(task.projeto_id) }} />{projectName(task.projeto_id)}</span>
          <span className={late ? styles.late : undefined}>{naturalDate(day, today)}{time ? ` · ${time}` : ''}</span>
        </>}
        trailing={PRIORITY_COLOR[priority] ? <span className={styles.priority} title={`Prioridade ${priority}`} style={{ color: PRIORITY_COLOR[priority] }}><Icon name="flag" size={18} /></span> : undefined}
      />
    )
  }

  const taskGroups = useMemo(() => {
    if (sortMode !== 'project') return []
    const grouped = new Map<string, Row[]>()
    tasks.forEach(task => {
      const id = String(task.projeto_id || 'entrada')
      if (!grouped.has(id)) grouped.set(id, [])
      grouped.get(id)!.push(task)
    })
    return [...grouped.entries()].map(([id, items]) => ({ id, name: projectName(id), items }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, sortMode, projectMap])

  const sections: Record<SectionId, ReactNode> = {
    appointments: (
      <Card padding="md">
        <SectionHeader title="Agenda" meta={events.length ? plural(events.length, 'compromisso', 'compromissos') : undefined} />
        {events.length ? (
          <div className={styles.eventList}>
            {events.map(item => {
              const color = String(item.raw.categoria_cor || item.color || '') || 'var(--ds-accent)'
              const detail = item.subtitle === 'Em andamento' ? 'Em andamento' : item.raw.dia_inteiro === true || !item.time ? 'Dia inteiro' : `${item.time}${item.raw.hora_fim ? ` – ${String(item.raw.hora_fim).slice(0, 5)}` : ''}`
              const passed = eventPassed(item)
              return (
                <button key={item.id} type="button" className={`${styles.event} ${passed ? styles.rowPassed : ''}`} onClick={() => inspectPlanner(item)}>
                  <span className={styles.eventTile} style={{ background: `color-mix(in srgb, ${color} 18%, var(--ds-surface))`, color }}><Icon name="event" size={20} /></span>
                  <span className={styles.rowBody}>
                    <span className={`${styles.rowTitle} ${passed ? styles.strike : ''}`}>{item.title}</span>
                    <span className={styles.rowSub}>{detail}{item.recurring ? <Icon name="repeat" size={14} /> : null}</span>
                  </span>
                </button>
              )
            })}
          </div>
        ) : <div className={styles.empty}>Nenhum compromisso para hoje.</div>}
      </Card>
    ),
    tasks: (
      <Card padding="md">
        <SectionHeader title="Tarefas" meta={tasks.length ? (lateCount ? `${tasks.length} · ${lateCount} atrasada${lateCount === 1 ? '' : 's'}` : String(tasks.length)) : undefined} />
        {tasks.length ? (
          sortMode === 'project' && taskGroups.length ? (
            <div role="list">
              {taskGroups.map(group => (
                <div key={group.id}>
                  <div className={styles.groupLabel}><span>{group.name}</span><span>{group.items.length}</span></div>
                  {group.items.map(renderTask)}
                </div>
              ))}
            </div>
          ) : <div role="list">{tasks.map(renderTask)}</div>
        ) : <div className={styles.empty}>Nada pendente para hoje. Aproveite!</div>}
      </Card>
    ),
    habits: (
      <Card padding="md">
        <SectionHeader title="Hábitos" meta={habits.length ? `${habitsDone} de ${habits.length}` : undefined} />
        {habits.length ? (
          <div className={styles.habits}>
            {habits.map(item => {
              const name = String(item.habit.nome || 'Hábito')
              return (
                <div key={String(item.habit.id)} className={styles.habit}>
                  <button type="button" className={styles.habitMain} onClick={() => logHabit(item)} aria-label={item.quantitative ? `Registrar mais 1 em ${name}` : item.done ? `Desmarcar ${name}` : `Marcar ${name} como feito`} title={item.quantitative ? 'Toque para somar 1' : 'Toque para marcar'}>
                    <IconTile icon={item.done ? 'check' : resolveMaiIcon(String(item.habit.icone || 'repeat'))} tone={item.done ? 'mint' : item.tone} solid={item.done} size={40} />
                  </button>
                  <button type="button" className={styles.habitInfo} onClick={() => inspect({ kind: 'habit', sourceId: String(item.habit.id), title: name, date: today, raw: item.habit })}>
                    <span className={styles.habitName}>{name}</span>
                    <span className={styles.habitValue}>{habitValueLabel(item)}</span>
                  </button>
                </div>
              )
            })}
          </div>
        ) : <div className={styles.empty}>Nenhum hábito previsto para hoje.</div>}
      </Card>
    ),
    goals: (
      <Card padding="md">
        <SectionHeader title="Metas" meta={goals.length ? String(goals.length) : undefined} />
        {goals.length ? (
          <div className={styles.rows}>
            {goals.map(goal => {
              const total = Math.max(1, Number(goal.progresso_total || 100))
              const pct = Math.max(0, Math.min(100, Math.round((Number(goal.progresso_atual || 0) / total) * 100)))
              const day = goalDate(goal)
              const title = String(goal.titulo || 'Meta')
              return (
                <button key={String(goal.id)} type="button" className={styles.row} onClick={() => inspect({ kind: 'goal', sourceId: String(goal.id), title, date: day, raw: goal })}>
                  <IconTile icon="flag" tone="lilac" />
                  <span className={styles.rowBody}>
                    <span className={styles.rowTitle}>{title}</span>
                    <span className={styles.rowSub}><span className={day < today ? styles.late : undefined}>{naturalDate(day, today)}</span><span>· {pct}%</span></span>
                    <span className={styles.goalProgress}><ProgressBar value={pct} tone="lilac" label={`Progresso de ${title}`} height={6} /></span>
                  </span>
                </button>
              )
            })}
          </div>
        ) : <div className={styles.empty}>Nenhuma meta vencendo hoje.</div>}
      </Card>
    ),
    finance: (
      <div className={styles.stack}>
        {summary.hasData ? (
          <Card variant="inverse" padding="md">
            <div className={styles.balanceHead}><span>Saldo atual</span><Icon name="account_balance_wallet" size={22} /></div>
            <div className={styles.balanceValue}>{money.format(summary.balance)}</div>
            <div className={summary.monthResult >= 0 ? styles.balancePositive : styles.balanceNegative}>
              {summary.monthResult >= 0 ? '+' : '−'}{money.format(Math.abs(summary.monthResult))} em {monthName}
            </div>
            <div className={styles.bars} aria-label="Gastos de cada dia desta semana">
              {summary.weekExpenses.map(item => (
                <span key={item.date} className={styles.barSlot} title={`${naturalDate(item.date, today)}: ${money.format(item.value)}`}>
                  <span className={`${styles.bar} ${item.date === today ? styles.barToday : ''}`} style={{ height: `${Math.max(6, Math.round((item.value / weekMax) * 100))}%` }} />
                </span>
              ))}
            </div>
            <div className={styles.barsLegend}><span>Gastos da semana</span><span>{money.format(summary.weekExpenses.reduce((sum, item) => sum + item.value, 0))}</span></div>
          </Card>
        ) : null}
        <Card padding="md">
          <SectionHeader title="A pagar" meta={transactions.length ? String(transactions.length) : undefined} />
          {transactions.length ? (
            <div className={styles.rows}>
              {transactions.map(item => {
                const day = dateKey(item.data)
                const income = String(item.tipo || '').toLocaleLowerCase('pt-BR') === 'receita'
                const payment = financeCardPaymentState(item)
                const title = txTitle(item)
                return (
                  <div key={String(item.id)} className={styles.rowWrap}>
                    <Check checked={payment.status === 'pago'} late={day < today} label={`${income ? 'Marcar como recebido' : 'Marcar como pago'}: ${title}`} onCheckedChange={() => toggleFinancePaid(item)} />
                    <button type="button" className={styles.row} onClick={() => inspect({ kind: 'finance', sourceId: String(item.id), title, date: day, raw: item })}>
                      <span className={styles.rowBody}>
                        <span className={styles.rowTitle}>{title}</span>
                        <span className={styles.rowSub}>
                          <span className={day < today ? styles.late : undefined}>{naturalDate(day, today)}</span>
                          {payment.status === 'parcial' ? <Tag tone="peach">Parcial</Tag> : null}
                        </span>
                      </span>
                      <span className={`${styles.amount} ${income ? styles.amountIncome : ''}`}>{income ? '+' : ''}{money.format(payment.remaining || payment.total)}</span>
                    </button>
                  </div>
                )
              })}
            </div>
          ) : <div className={styles.empty}>{financeCandidates.length ? 'Nenhum lançamento visível na tela inicial.' : 'Nada para pagar hoje.'}</div>}
        </Card>
      </div>
    ),
    notes: (
      <Card padding="md">
        <SectionHeader title="Notas" meta={notes.length ? String(notes.length) : undefined} />
        {notes.length ? (
          <div className={styles.rows}>
            {notes.map(note => {
              const title = String(note.titulo || 'Sem título')
              return (
                <button key={String(note.id)} type="button" className={styles.row} onClick={() => inspect({ kind: 'note', sourceId: String(note.id), title, date: dateKey(note.data || note.updated_at || note.criado_em), raw: note })}>
                  <IconTile icon="sticky_note_2" tone="peach" />
                  <span className={styles.rowBody}><span className={styles.rowTitle}>{title}</span></span>
                </button>
              )
            })}
          </div>
        ) : <div className={styles.empty}>Nenhuma nota de hoje.</div>}
      </Card>
    ),
  }

  /* ---------------------------------------------------------------- Página */

  const firstName = String(profileName || '').trim().split(/\s+/)[0]
  const greeting = `${greetingFor(clock.getHours())}${firstName && firstName !== 'Meu' ? `, ${firstName}` : ''}`
  const rawDate = new Date(`${today}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const dateLabel = rawDate.charAt(0).toLocaleUpperCase('pt-BR') + rawDate.slice(1)

  // Colunas do computador (como no mockup). No celular vira uma coluna só, na ordem salva.
  const COLUMN: Record<SectionId, 'main' | 'middle' | 'side'> = { tasks: 'main', appointments: 'middle', notes: 'middle', habits: 'side', finance: 'side', goals: 'side' }
  const visible = order.filter(id => !hidden.has(id))
  const column = (name: 'main' | 'middle' | 'side', extra?: ReactNode) => (
    <div className={`${styles.column} ${styles[`col_${name}`]}`}>
      {extra}
      {visible.filter(id => COLUMN[id] === name).map(id => (
        <div key={id} className={styles.slot} style={{ order: visible.indexOf(id) + 1 }}>{sections[id]}</div>
      ))}
    </div>
  )

  const nextCard = nextEvent ? (
    <div className={styles.slot} style={{ order: 0 }}>
      <Card variant="accent" padding="lg">
        <div className={styles.nextHead}>
          <span className={styles.nextIcon}><Icon name="event" size={24} /></span>
          <span className={styles.nextEyebrow}>A seguir · {untilLabel(minutesOf(nextEvent.time) - nowMinutes)}</span>
        </div>
        <div className={styles.nextRow}>
          <div className={styles.nextBody}>
            <div className={styles.nextTitle}>{nextEvent.title}</div>
            <div className={styles.nextMeta}>{nextEvent.time}{nextEvent.raw.hora_fim ? ` – ${String(nextEvent.raw.hora_fim).slice(0, 5)}` : ''}</div>
          </div>
          <Button variant="onAccent" pill onClick={() => inspectPlanner(nextEvent)}>Detalhes</Button>
        </div>
      </Card>
    </div>
  ) : null

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div className={styles.eyebrow}>{dateLabel}</div>
          <h1 className={styles.greeting}>{greeting}</h1>
          <div className={styles.summary}>
            <Tag tone="sky" icon="event">{plural(events.length, 'compromisso', 'compromissos')}</Tag>
            <Tag tone="neutral" icon="checklist">{plural(tasks.length, 'tarefa', 'tarefas')}</Tag>
            {lateCount ? <Tag tone="rose" icon="schedule">{plural(lateCount, 'atrasada', 'atrasadas')}</Tag> : null}
            {habits.length ? <Tag tone="mint" icon="autorenew">{habitsDone} de {habits.length} hábitos</Tag> : null}
          </div>
        </div>
        <div className={styles.headerActions} ref={customizeRef}>
          <button type="button" className={styles.searchButton} onClick={onSearch}>
            <Icon name="search" size={20} filled={false} />
            <span>Buscar ou criar…</span>
            <span className={styles.kbd}>Ctrl K</span>
          </button>
          <Button icon="add" onClick={onAdd} className={styles.newButton}>Novo</Button>
          {options ? <div className={styles.options}>{options}</div> : null}
          <IconButton icon="dashboard_customize" label="Personalizar Hoje" filled={false} onClick={() => setCustomizeOpen(value => !value)} aria-expanded={customizeOpen} />
          {customizeOpen ? (
            <div className={styles.customize} role="dialog" aria-label="Personalizar Hoje">
              <span className={styles.customizeTitle}>Seções da tela Hoje</span>
              {order.map((id, index) => (
                <div key={id} className={styles.customizeRow}>
                  <button type="button" className={styles.customizeToggle} aria-pressed={!hidden.has(id)} onClick={() => toggleHidden(id)}>
                    <Icon name={hidden.has(id) ? 'check_box_outline_blank' : 'check_box'} size={22} filled={!hidden.has(id)} />
                    <span>{id === 'appointments' ? 'Agenda' : id === 'finance' ? 'Finanças' : SECTION_LABELS[id]}</span>
                  </button>
                  <IconButton icon="arrow_upward" label={`Mover ${SECTION_LABELS[id]} para cima`} variant="ghost" size={36} disabled={index === 0} onClick={() => moveSection(id, -1)} />
                  <IconButton icon="arrow_downward" label={`Mover ${SECTION_LABELS[id]} para baixo`} variant="ghost" size={36} disabled={index === order.length - 1} onClick={() => moveSection(id, 1)} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      <div className={styles.week} aria-label="Semana">
        {week.map(day => (
          <div key={day.key} className={`${styles.day} ${day.isToday ? styles.dayToday : day.isPast ? styles.dayPast : ''}`} aria-current={day.isToday ? 'date' : undefined}>
            <span className={styles.dayName}>{day.name}</span>
            <span className={styles.dayNumber}>{day.number}</span>
            <span className={styles.dayLoad} style={{ width: day.load ? day.load * 6 : 0 }} aria-hidden="true" />
          </div>
        ))}
      </div>

      <div className={styles.board}>
        {column('main', nextCard)}
        {column('middle')}
        {column('side')}
      </div>
    </div>
  )
}
