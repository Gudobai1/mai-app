'use client'

import { useMemo, useState } from 'react'
import { plannerItems, type PlannerItem } from '../../lib/v2/planner'
import type { MaiState } from '../../lib/v2/state'
import type { AppView, Row } from './app-types'
import type { InspectableItem } from './ContextDrawer'
import { MaiIcon } from './MaiIcons'

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []

type Props = {
  state: MaiState
  today: string
  commit: (change: (current: MaiState) => MaiState) => void
  navigate: (view: AppView) => void
  inspect: (item: InspectableItem) => void
  onSearch: () => void
  onMore: () => void
}

type TodayFilters = { project: string; priority: string; status: 'open' | 'all' }

const priorityColor = (value: unknown) => {
  const priority = Number(value || 4)
  if (priority === 1) return '#c85b52'
  if (priority === 2) return '#c28a3d'
  if (priority === 3) return '#7c9274'
  return '#b8beb7'
}

const dateKey = (value: unknown) => String(value || '').slice(0, 10)
const timeKey = (value: unknown) => String(value || '').includes('T') ? String(value).slice(11, 16) : ''

function eventOrigin(raw: Row) {
  const isGoogle = ['google', 'gcalendar'].includes(String(raw.tipo || '').toLowerCase()) || Boolean(raw.calendario_id || raw.calendarId)
  const calendarName = String(raw.calendario_nome || raw.calendar_name || raw.calendarName || raw.nome_calendario || '').trim()
  if (isGoogle) return calendarName ? `Google Agenda · ${calendarName}` : 'Google Agenda'
  return String(raw.categoria_nome || raw.categoria || raw.origem || 'Compromisso')
}

export function TodayCompact({ state, today, commit, inspect, onSearch, onMore }: Props) {
  const [filterOpen, setFilterOpen] = useState(false)
  const [completedOpen, setCompletedOpen] = useState(false)
  const plan = useMemo(() => plannerItems(state, today, today), [state, today])
  const projects = useMemo(() => rows(state.projects).filter(item => item.ativo !== false), [state.projects])
  const projectMap = useMemo(() => new Map(projects.map(project => [String(project.id), project])), [projects])
  const savedFilters: Partial<TodayFilters> = state.configs.todayFilters && typeof state.configs.todayFilters === 'object' ? state.configs.todayFilters as Partial<TodayFilters> : {}
  const filters: TodayFilters = {
    project: String(savedFilters.project || 'all'),
    priority: String(savedFilters.priority || 'all'),
    status: savedFilters.status === 'all' ? 'all' : 'open',
  }

  const plannedEvents = useMemo(() => plan.filter(item => item.kind === 'event'), [plan])
  const spanningEvents = useMemo(() => rows(state.events).filter(event => {
    const start = dateKey(event.data_inicio)
    const end = dateKey(event.data_fim || event.data_termino || event.end)
    return start && end && start < today && end >= today
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
  })), [state.events, today])
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

  const todayTasks = useMemo(() => state.tasks.filter(task => !task.concluida && dateKey(task.data_vencimento) === today), [state.tasks, today])
  const completedToday = useMemo(() => state.tasks.filter(task => task.concluida && dateKey(task.data_vencimento) === today), [state.tasks, today])
  const filteredTasks = useMemo(() => todayTasks.filter(task => {
    if (filters.project !== 'all' && String(task.projeto_id || 'entrada') !== filters.project) return false
    if (filters.priority !== 'all' && String(Number(task.prioridade || 4)) !== filters.priority) return false
    return true
  }).sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0)), [todayTasks, filters.project, filters.priority])

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

  return <div className="mai-v3-today">
    <header className="mai-v3-page-header">
      <div><h1>Hoje</h1><p>{dateLabel}</p></div>
      <div className="mai-v3-page-actions">
        <button aria-label="Buscar" title="Buscar" onClick={onSearch}><MaiIcon name="search" size={18}/></button>
        <div className="mai-v3-filter-wrap">
          <button aria-label="Filtrar" title="Filtrar" data-active={filters.project !== 'all' || filters.priority !== 'all'} onClick={() => setFilterOpen(value => !value)}><span className="material-symbols-rounded">filter_list</span></button>
          {filterOpen ? <div className="mai-v3-filter-popover">
            <label><span>Projeto</span><select value={filters.project} onChange={event => setFilters({ project: event.target.value })}><option value="all">Todos</option><option value="entrada">Entrada</option>{projects.map(project => <option key={String(project.id)} value={String(project.id)}>{String(project.nome)}</option>)}</select></label>
            <label><span>Prioridade</span><select value={filters.priority} onChange={event => setFilters({ priority: event.target.value })}><option value="all">Todas</option><option value="1">Alta</option><option value="2">Média</option><option value="3">Baixa</option><option value="4">Sem prioridade</option></select></label>
            <label><span>Status</span><select value={filters.status} onChange={event => setFilters({ status: event.target.value as TodayFilters['status'] })}><option value="open">Abertas</option><option value="all">Todas</option></select></label>
          </div> : null}
        </div>
        <button aria-label="Mais opções" title="Mais opções" onClick={onMore}><span className="material-symbols-rounded">more_horiz</span></button>
      </div>
    </header>

    <section className="mai-v3-today-section mai-v3-appointments mai-today-unified-section">
      <h2>Compromissos</h2>
      <div className="mai-today-unified-list">{events.map(item => {
        const [hour, minute] = String(item.time || '').split(':').map(Number)
        const passed = todayIsCurrent && item.time && Number.isFinite(hour) && (hour * 60 + (minute || 0)) < nowMinutes
        const label = item.subtitle === 'Em andamento' ? 'Em andamento' : item.raw.dia_inteiro === true || !item.time ? 'Dia inteiro' : item.time
        const eventColor = String(item.raw.categoria_cor || item.color || 'var(--v3-accent)')
        return <button key={item.id} className="mai-today-unified-row" data-passed={Boolean(passed)} onClick={() => inspectPlanner(item)}>
          <i className="mai-today-unified-dot" style={{ borderColor: eventColor }} />
          <span className="mai-today-unified-main"><strong>{item.title}</strong><small className="mai-today-unified-origin">{eventOrigin(item.raw)}</small></span>
          <span className="mai-today-unified-meta"><strong>{label}</strong><small>Hoje</small></span>
        </button>
      })}{!events.length ? <div className="mai-v3-empty-line">Nenhum compromisso para hoje.</div> : null}</div>
    </section>

    <section className="mai-v3-today-section mai-v3-tasks-section mai-today-unified-section">
      <h2>Tarefas</h2>
      <div className="mai-today-unified-list">{filteredTasks.map(task => {
        const project = projectIdentity(task.projeto_id)
        const children = state.tasks.filter(child => String((child as Row).parent_id || '') === String(task.id))
        const doneChildren = children.filter(child => child.concluida).length
        return <article className="mai-today-unified-row" key={task.id}>
          <button className="mai-today-unified-dot" aria-label={`Concluir ${task.titulo}`} style={{ borderColor: priorityColor(task.prioridade) }} onClick={() => toggleTask(task.id)} />
          <button className="mai-today-unified-main" style={{border:0,background:'transparent',textAlign:'left',padding:0}} onClick={() => inspectTask(task)}>
            <strong>{task.titulo}</strong>
            <small className="mai-today-unified-origin">{project.imagem_url ? <img src={String(project.imagem_url)} alt="" /> : <i style={{ background: String(project.cor || '#8e968d') }}><MaiIcon name={String(project.icone || (project.id === 'entrada' ? 'inbox' : 'folder'))} size={9}/></i>}<span>{String(project.nome || 'Entrada')}</span></small>
          </button>
          <span className="mai-today-unified-meta"><strong>Hoje</strong>{children.length ? <small>{doneChildren} de {children.length}</small> : null}</span>
        </article>
      })}{!filteredTasks.length ? <div className="mai-v3-empty-line">Nenhuma tarefa para hoje.</div> : null}</div>

      {filters.status === 'all' || completedToday.length ? <div className="mai-v3-completed-wrap">
        <button className="mai-v3-completed-toggle" onClick={() => setCompletedOpen(value => !value)}><MaiIcon name="chevron" size={14}/><span>Concluídas · {completedToday.length}</span></button>
        {completedOpen ? <div className="mai-today-unified-list mai-v3-completed-list">{completedToday.map(task => {
          const project = projectIdentity(task.projeto_id)
          return <article className="mai-today-unified-row" key={`done-${task.id}`}>
            <button className="mai-today-unified-dot" data-done="true" onClick={() => toggleTask(task.id)}>✓</button>
            <button className="mai-today-unified-main" style={{border:0,background:'transparent',textAlign:'left',padding:0}} onClick={() => inspectTask(task)}><strong>{task.titulo}</strong><small className="mai-today-unified-origin">{project.imagem_url ? <img src={String(project.imagem_url)} alt="" /> : <i style={{ background: String(project.cor || '#8e968d') }}><MaiIcon name={String(project.icone || 'folder')} size={9}/></i>}<span>{String(project.nome || 'Entrada')}</span></small></button>
            <span className="mai-today-unified-meta"><strong>Hoje</strong><small>Concluída</small></span>
          </article>
        })}</div> : null}
      </div> : null}
    </section>
  </div>
}
