'use client'

import { useMemo, useState } from 'react'
import type { LegacyTask, MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import type { Row, TaskModuleScope } from './app-types'
import { MaiIcon } from './MaiIcons'

type KanbanStatus = 'todo' | 'doing' | 'done'
type SortMode = 'manual' | 'date' | 'priority' | 'project' | 'name'

type Props = {
  state: MaiState
  today: string
  scope: TaskModuleScope
  commit: (change: (current: MaiState) => MaiState) => void
  inspect: (item: InspectableItem) => void
  selectedId?: string
}

type ProjectRow = Row & { id?: string; nome?: string; cor?: string; icone?: string; imagem_url?: string }
type KanbanTask = LegacyTask & { kanban_status?: KanbanStatus }

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const dayOf = (task: LegacyTask) => String(task.data_vencimento || '').slice(0, 10)
const timeOf = (task: LegacyTask) => String(task.data_vencimento || '').includes('T') ? String(task.data_vencimento).slice(11, 16) : ''

function statusOf(task: KanbanTask): KanbanStatus {
  if (task.concluida) return 'done'
  return task.kanban_status === 'doing' ? 'doing' : 'todo'
}

function naturalDate(key: string, today: string) {
  if (!key) return 'Sem data'
  if (key === today) return 'Hoje'
  const base = new Date(`${today}T12:00:00`)
  const target = new Date(`${key}T12:00:00`)
  const diff = Math.round((target.getTime() - base.getTime()) / 86_400_000)
  if (diff === -1) return 'Ontem'
  if (diff === 1) return 'Amanhã'
  if (diff > 1 && diff < 7) return target.toLocaleDateString('pt-BR', { weekday:'long' })
  return target.toLocaleDateString('pt-BR', { day:'numeric', month:'short' }).replace('.', '')
}

function taskFilters(state: MaiState): Row {
  const filters = state.configs.moduleFilters
  if (!filters || typeof filters !== 'object') return {}
  const tasks = (filters as Record<string, Row>).tasks
  return tasks && typeof tasks === 'object' ? tasks : {}
}

function taskControls(state: MaiState): Row {
  const controls = state.configs.moduleControls
  if (!controls || typeof controls !== 'object') return {}
  const tasks = (controls as Record<string, Row>).tasks
  return tasks && typeof tasks === 'object' ? tasks : {}
}

export function TaskKanban({ state, today, scope, commit, inspect, selectedId }: Props) {
  const [dragId, setDragId] = useState('')
  const [overColumn, setOverColumn] = useState<KanbanStatus | ''>('')
  const projects = useMemo(() => rows(state.projects).filter(project => project.ativo !== false) as ProjectRow[], [state.projects])
  const projectMap = useMemo(() => new Map(projects.map(project => [String(project.id), project])), [projects])
  const filter = taskFilters(state)
  const rawSort = String(taskControls(state).sort || 'manual')
  const sortMode: SortMode = ['manual','date','priority','project','name'].includes(rawSort) ? rawSort as SortMode : 'manual'

  const projectName = (projectId: unknown) => {
    const id = String(projectId || 'entrada')
    if (id === 'entrada') return 'Entrada'
    return String(projectMap.get(id)?.nome || 'Sem projeto')
  }

  const scopedTasks = useMemo(() => (state.tasks as KanbanTask[]).filter(task => {
    const day = dayOf(task)
    const projectId = String(task.projeto_id || 'entrada')
    if (scope === 'entrada' && projectId !== 'entrada') return false
    if (scope === 'today' && day !== today) return false
    if (scope === 'upcoming' && !(day && day > today)) return false
    if (scope.startsWith('project:') && projectId !== scope.slice(8)) return false

    const priority = String(Number(task.prioridade || 4))
    if (String(filter.priority || 'all') !== 'all' && priority !== String(filter.priority)) return false

    const dueFilter = String(filter.due || 'all')
    if (dueFilter === 'overdue' && !(day && day < today)) return false
    if (dueFilter === 'today' && day !== today) return false
    if (dueFilter === 'future' && !(day && day > today)) return false
    if (dueFilter === 'none' && Boolean(day)) return false
    return true
  }), [state.tasks, scope, today, filter.priority, filter.due])

  const compare = (a: KanbanTask, b: KanbanTask) => {
    const aDay = dayOf(a) || '9999-99-99', bDay = dayOf(b) || '9999-99-99'
    const aTime = timeOf(a) || '99:99', bTime = timeOf(b) || '99:99'
    const title = String(a.titulo || '').localeCompare(String(b.titulo || ''), 'pt-BR', { sensitivity:'base' })
    if (sortMode === 'date') return aDay.localeCompare(bDay) || aTime.localeCompare(bTime) || title
    if (sortMode === 'priority') return Number(a.prioridade || 4) - Number(b.prioridade || 4) || aDay.localeCompare(bDay) || title
    if (sortMode === 'project') return projectName(a.projeto_id).localeCompare(projectName(b.projeto_id), 'pt-BR', { sensitivity:'base' }) || aDay.localeCompare(bDay) || title
    if (sortMode === 'name') return title || aDay.localeCompare(bDay)
    if (statusOf(a) === 'done' || statusOf(b) === 'done') return String(b.concluida_em || '').localeCompare(String(a.concluida_em || '')) || title
    return Number(a.ordem || 0) - Number(b.ordem || 0) || title
  }

  const columns = useMemo(() => {
    const groups: Record<KanbanStatus, KanbanTask[]> = { todo:[], doing:[], done:[] }
    scopedTasks.forEach(task => groups[statusOf(task)].push(task))
    groups.todo.sort(compare)
    groups.doing.sort(compare)
    groups.done.sort(compare)
    return groups
  }, [scopedTasks, sortMode, projectMap])

  function inspectTask(task: KanbanTask) {
    inspect({ kind:'task', sourceId:task.id, title:task.titulo, date:dayOf(task), time:timeOf(task), raw:task as Row })
  }

  function moveTask(taskId: string, status: KanbanStatus) {
    const now = new Date().toISOString()
    commit(current => ({
      ...current,
      tasks: current.tasks.map(task => {
        if (task.id !== taskId) return task
        if (status === 'done') return { ...task, kanban_status:'done', concluida:true, concluida_em:task.concluida_em || now }
        return { ...task, kanban_status:status, concluida:false, concluida_em:'' }
      }),
    }))
    setDragId('')
    setOverColumn('')
  }

  function projectIdentity(projectId: unknown): ProjectRow {
    const id = String(projectId || 'entrada')
    return projectMap.get(id) || { id, nome:id === 'entrada' ? 'Entrada' : 'Sem projeto', cor:'#8e968d', icone:id === 'entrada' ? 'inbox' : 'folder' }
  }

  const columnMeta: { id:KanbanStatus; title:string; subtitle:string; icon:string }[] = [
    { id:'todo', title:'A fazer', subtitle:'Ainda não iniciadas', icon:'radio_button_unchecked' },
    { id:'doing', title:'Em andamento', subtitle:'Em execução agora', icon:'pending' },
    { id:'done', title:'Concluídas', subtitle:'Finalizadas', icon:'check_circle' },
  ]

  return <div className="mai-kanban-board" aria-label="Kanban de tarefas">
    {columnMeta.map(column => <section
      key={column.id}
      className="mai-kanban-column"
      data-status={column.id}
      data-over={overColumn === column.id || undefined}
      onDragEnter={event => { event.preventDefault(); setOverColumn(column.id) }}
      onDragOver={event => event.preventDefault()}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOverColumn('') }}
      onDrop={event => { event.preventDefault(); if (dragId) moveTask(dragId, column.id) }}
    >
      <header className="mai-kanban-column-head">
        <div><span className="material-symbols-rounded">{column.icon}</span><strong>{column.title}</strong><b>{columns[column.id].length}</b></div>
        <small>{column.subtitle}</small>
      </header>
      <div className="mai-kanban-cards">
        {columns[column.id].map(task => {
          const project = projectIdentity(task.projeto_id)
          const day = dayOf(task)
          const overdue = Boolean(!task.concluida && day && day < today)
          const status = statusOf(task)
          return <article
            key={task.id}
            className="mai-kanban-card"
            data-selected={selectedId === task.id || undefined}
            data-overdue={overdue || undefined}
            draggable
            onDragStart={event => { setDragId(task.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', task.id) }}
            onDragEnd={() => { setDragId(''); setOverColumn('') }}
            onClick={() => inspectTask(task)}
          >
            <div className="mai-kanban-card-top">
              <i className="mai-kanban-priority" data-priority={Number(task.prioridade || 4)} />
              <select value={status} aria-label={`Status de ${task.titulo}`} onClick={event => event.stopPropagation()} onChange={event => moveTask(task.id, event.target.value as KanbanStatus)}>
                <option value="todo">A fazer</option>
                <option value="doing">Em andamento</option>
                <option value="done">Concluída</option>
              </select>
            </div>
            <strong className="mai-kanban-card-title">{task.titulo}</strong>
            {task.descricao ? <p>{String(task.descricao)}</p> : null}
            <div className="mai-kanban-card-meta">
              <span data-overdue={overdue || undefined}><span className="material-symbols-rounded">event</span>{naturalDate(day, today)}{timeOf(task) ? ` · ${timeOf(task)}` : ''}</span>
              <span className="mai-kanban-project">{project.imagem_url ? <img src={String(project.imagem_url)} alt=""/> : <i style={{ background:String(project.cor || '#8e968d') }}><MaiIcon name={String(project.icone || (project.id === 'entrada' ? 'inbox' : 'folder'))} size={9}/></i>}<b>{String(project.nome || 'Entrada')}</b></span>
            </div>
          </article>
        })}
        {!columns[column.id].length ? <div className="mai-kanban-empty"><span className="material-symbols-rounded">space_dashboard</span><small>Solte uma tarefa aqui.</small></div> : null}
      </div>
    </section>)}
  </div>
}
