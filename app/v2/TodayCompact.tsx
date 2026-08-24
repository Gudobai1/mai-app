'use client'

import { useMemo, useState } from 'react'
import { plannerItems, type PlannerItem } from '../../lib/v2/planner'
import type { MaiState } from '../../lib/v2/state'
import type { AppView, Row } from './app-types'
import type { InspectableItem } from './ContextDrawer'
import { MaiIcon } from './MaiIcons'

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []

type TodayPart = 'all' | 'header' | 'appointments' | 'tasks'
type Props = {
  state: MaiState
  today: string
  commit: (change: (current: MaiState) => MaiState) => void
  navigate: (view: AppView) => void
  inspect: (item: InspectableItem) => void
  onSearch: () => void
  onMore: () => void
  part?: TodayPart
}

type TodayFilters = { project: string; priority: string; status: 'open' | 'all' }
type TodaySortMode = 'overdue' | 'date' | 'priority' | 'project' | 'title' | 'name'

const priorityColor = (value: unknown) => {
  const priority = Number(value || 4)
  if (priority === 1) return '#c85b52'
  if (priority === 2) return '#c28a3d'
  if (priority === 3) return '#7c9274'
  return '#b8beb7'
}

const dateKey = (value: unknown) => String(value || '').slice(0, 10)
const timeKey = (value: unknown) => String(value || '').includes('T') ? String(value).slice(11, 16) : ''

function naturalDate(key: string, today: string) {
  if (!key) return 'Sem data'
  if (key === today) return 'Hoje'
  const base = new Date(`${today}T12:00:00`)
  const target = new Date(`${key}T12:00:00`)
  const diff = Math.round((target.getTime() - base.getTime()) / 86_400_000)
  if (diff === -1) return 'Ontem'
  return target.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: target.getFullYear() !== base.getFullYear() ? 'numeric' : undefined })
}

export function TodayCompact({ state, today, commit, inspect, onMore, part = 'all' }: Props) {
  const [filterOpen, setFilterOpen] = useState(false)
  const plan = useMemo(() => plannerItems(state, today, today), [state, today])
  const projects = useMemo(() => rows(state.projects).filter(item => item.ativo !== false), [state.projects])
  const projectMap = useMemo(() => new Map(projects.map(project => [String(project.id), project])), [projects])
  const savedFilters: Partial<TodayFilters> = state.configs.todayFilters && typeof state.configs.todayFilters === 'object' ? state.configs.todayFilters as Partial<TodayFilters> : {}
  const moduleControls = state.configs.moduleControls && typeof state.configs.moduleControls === 'object' ? state.configs.moduleControls as Record<string, Row> : {}
  const rawSort = String(moduleControls.today?.sort || 'overdue')
  const sortMode: TodaySortMode = ['overdue','date','priority','project','title','name'].includes(rawSort) ? rawSort as TodaySortMode : 'overdue'
  const filters: TodayFilters = {
    project: String(savedFilters.project || 'all'),
    priority: String(savedFilters.priority || 'all'),
    status: savedFilters.status === 'all' ? 'all' : 'open',
  }

  const eventDone = (eventId: unknown) => rows(state.eventCompletions).some(entry => String(entry.evento_id || String(entry.chave || '').split('|')[0]) === String(eventId) && dateKey(entry.data || String(entry.chave || '').split('|')[1]) === today && entry.concluida !== false)
  const plannedEvents = useMemo(() => plan.filter(item => item.kind === 'event' && !item.completed), [plan])
  const spanningEvents = useMemo(() => rows(state.events).filter(event => {
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
    color: String(event.categoria_cor || event.calendarColor || event.cor || '#6f8168'),
    completed: false,
    recurring: Boolean(event.repeticao),
    raw: event,
  })), [state.events, state.eventCompletions, today])
  const events = useMemo(() => {
    const seen = new Set<string>()
    return [...spanningEvents, ...plannedEvents].filter(item => {
      const key = `${item.sourceId}:${item.date}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).sort((a, b) => {
      const aRank = a.subtitle === 'Em andamento' ? 0 : a.raw.dia_inteiro === true || !a.time ? 1 : 2
      const bRank = b.subtitle === 'Em andamento' ? 0 : b.raw.dia_inteiro === true || !b.time ? 1 : 2
      return aRank - bRank || `${a.time || '99:99'} ${a.title}`.localeCompare(`${b.time || '99:99'} ${b.title}`, 'pt-BR')
    })
  }, [plannedEvents, spanningEvents])

  const dueTasks = useMemo(() => state.tasks.filter(task => {
    const day = dateKey(task.data_vencimento)
    return !task.concluida && Boolean(day) && day <= today
  }), [state.tasks, today])

  const projectName = (projectId: unknown) => {
    const id = String(projectId || 'entrada')
    if (id === 'entrada') return 'Entrada'
    return String(projectMap.get(id)?.nome || '')
  }

  const filteredTasks = useMemo(() => dueTasks.filter(task => {
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

    const aOverdue = aDay < today
    const bOverdue = bDay < today
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
    return aDay.localeCompare(bDay) || aTime.localeCompare(bTime) || Number(a.ordem || 0) - Number(b.ordem || 0) || titleCompare
  }), [dueTasks, filters.project, filters.priority, sortMode, projectMap, today])

  function setFilters(patch: Partial<TodayFilters>) {
    commit(current => ({ ...current, configs: { ...current.configs, todayFilters: { ...filters, ...patch } } }))
  }

  function toggleTask(id: string) {
    commit(current => ({ ...current, tasks: current.tasks.map(task => task.id === id ? { ...task, concluida: !task.concluida, concluida_em: !task.concluida ? new Date().toISOString() : '' } : task) }))
  }

  function inspectTask(task: Row) {
    inspect({ kind: 'task', sourceId: String(task.id), title: String(task.titulo || 'Tarefa'), date: dateKey(task.data_vencimento), time: timeKey(task.data_vencimento), raw: task })
  }

  const inspectPlanner = (item: PlannerItem) => inspect({ kind: item.kind, sourceId: item.sourceId, title: item.title, date: item.date, time: item.time, raw: item.raw })
  const dateLabel = new Date(`${today}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const now = new Date()
  const todayIsCurrent = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` === today
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  const projectIdentity = (projectId: unknown) => {
    const id = String(projectId || 'entrada')
    const project = projectMap.get(id)
    return project || { id: 'entrada', nome: 'Entrada', cor: '#8e968d', icone: 'inbox' }
  }

  const projectBadge = (project: Row) => <span className="mai-item-project-tag">
    {project.imagem_url ? <img src={String(project.imagem_url)} alt="" /> : <i style={{ background: String(project.cor || '#8e968d') }}><MaiIcon name={String(project.icone || (project.id === 'entrada' ? 'inbox' : 'folder'))} size={9}/></i>}
    <span>{String(project.nome || 'Entrada')}</span>
  </span>

  const header = <header className="mai-v3-page-header">
    <div><h1>Hoje</h1><p>{dateLabel}</p></div>
    <div className="mai-v3-page-actions">
      <div className="mai-v3-filter-wrap">
        <button aria-label="Filtrar" title="Filtrar" data-active={filters.project !== 'all' || filters.priority !== 'all'} onClick={() => setFilterOpen(value => !value)}><span className="material-symbols-rounded">filter_list</span></button>
        {filterOpen ? <div className="mai-v3-filter-popover">
          <label><span>Projeto</span><select value={filters.project} onChange={event => setFilters({ project: event.target.value })}><option value="all">Todos</option><option value="entrada">Entrada</option>{projects.map(project => <option key={String(project.id)} value={String(project.id)}>{String(project.nome)}</option>)}</select></label>
          <label><span>Prioridade</span><select value={filters.priority} onChange={event => setFilters({ priority: event.target.value })}><option value="all">Todas</option><option value="1">Alta</option><option value="2">Média</option><option value="3">Baixa</option><option value="4">Sem prioridade</option></select></label>
          <label><span>Status</span><select value={filters.status} onChange={event => setFilters({ status: event.target.value as TodayFilters['status'] })}><option value="open">Abertas</option><option value="all">Todas</option></select></label>
        </div> : null}
      </div>
      <button aria-label="Personalizar Hoje" title="Personalizar Hoje" onClick={onMore}><span className="material-symbols-rounded">more_horiz</span></button>
    </div>
  </header>

  const appointments = <section className="mai-v3-today-section mai-v3-appointments mai-today-unified-section">
    <h2>Compromissos</h2>
    <div className="mai-today-unified-list">{events.map(item => {
      const [hour, minute] = String(item.time || '').split(':').map(Number)
      const passed = todayIsCurrent && item.time && Number.isFinite(hour) && (hour * 60 + (minute || 0)) < nowMinutes
      const detail = item.subtitle === 'Em andamento' ? 'Em andamento' : item.raw.dia_inteiro === true || !item.time ? 'Dia inteiro' : item.time
      const eventColor = String(item.raw.categoria_cor || item.color || 'var(--v3-accent)')
      return <button key={item.id} className="mai-today-unified-row mai-item-row-v2" data-passed={Boolean(passed)} onClick={() => inspectPlanner(item)}>
        <span className="mai-event-item-icon" style={{ color: eventColor }}><MaiIcon name="calendar" size={16}/></span>
        <span className="mai-item-copy-v2"><span className="mai-item-titleline-v2"><strong>{item.title}</strong></span><span className="mai-item-subline-v2"><span>Hoje</span><span>·</span><span>{detail}</span></span></span>
      </button>
    })}{!events.length ? <div className="mai-v3-empty-line">Nenhum compromisso para hoje.</div> : null}</div>
  </section>

  const tasks = <section className="mai-v3-today-section mai-v3-tasks-section mai-today-unified-section">
    <h2>Tarefas</h2>
    <div className="mai-today-unified-list">{filteredTasks.map(task => {
      const project = projectIdentity(task.projeto_id)
      const taskDay = dateKey(task.data_vencimento)
      return <article className="mai-today-unified-row mai-item-row-v2" key={task.id} onClick={() => inspectTask(task)}>
        <button className="mai-today-unified-dot" data-priority={Number(task.prioridade || 4)} aria-label={`Concluir ${task.titulo}`} style={{ borderColor: priorityColor(task.prioridade) }} onClick={event => { event.stopPropagation(); toggleTask(task.id) }} />
        <span className="mai-item-copy-v2"><span className="mai-item-titleline-v2"><strong>{task.titulo}</strong></span><span className="mai-item-subline-v2"><span>{naturalDate(taskDay, today)}</span><span>·</span>{projectBadge(project)}</span></span>
      </article>
    })}{!filteredTasks.length ? <div className="mai-v3-empty-line">Nenhuma tarefa pendente para hoje.</div> : null}</div>
  </section>

  if (part === 'header') return header
  if (part === 'appointments') return appointments
  if (part === 'tasks') return tasks
  return <div className="mai-v3-today">{header}{appointments}{tasks}</div>
}
