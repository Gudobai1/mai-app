'use client'

import { useMemo } from 'react'
import type { LegacyTask, MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import type { Row } from './app-types'
import { MaiIcon } from './MaiIcons'

type Mode = 'today' | 'upcoming'
type SortMode = 'manual' | 'date' | 'priority' | 'project' | 'name'

type Props = {
  state: MaiState
  today: string
  mode: Mode
  commit: (change: (current: MaiState) => MaiState) => void
  inspect: (item: InspectableItem) => void
  selectedId?: string
}

type ProjectRow = Row & { id?: string; nome?: string; cor?: string; icone?: string; imagem_url?: string }

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const dayOf = (task: LegacyTask) => String(task.data_vencimento || '').slice(0, 10)
const timeOf = (task: LegacyTask) => String(task.data_vencimento || '').includes('T') ? String(task.data_vencimento).slice(11, 16) : ''
const priorityColor = (value: unknown) => Number(value || 4) === 1 ? '#c85b52' : Number(value || 4) === 2 ? '#c28a3d' : Number(value || 4) === 3 ? '#7c9274' : '#b8beb7'

function naturalDate(key: string, today: string) {
  if (!key) return 'Sem data'
  if (key === today) return 'Hoje'
  const base = new Date(`${today}T12:00:00`)
  const target = new Date(`${key}T12:00:00`)
  const diff = Math.round((target.getTime() - base.getTime()) / 86_400_000)
  if (diff === 1) return 'Amanhã'
  if (diff > 1 && diff < 7) return target.toLocaleDateString('pt-BR', { weekday: 'long' })
  return target.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
}

function formatHeading(key: string, today: string) {
  if (key === today) return 'Hoje'
  return naturalDate(key, today)
}

export function TaskDateView({ state, today, mode, commit, inspect, selectedId }: Props) {
  const projects = useMemo(() => rows(state.projects).filter(project => project.ativo !== false).sort((a, b) => Number(Boolean(b.favorito)) - Number(Boolean(a.favorito)) || Number(a.ordem || 0) - Number(b.ordem || 0) || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity:'base' })) as ProjectRow[], [state.projects])
  const projectMap = useMemo(() => new Map(projects.map(project => [String(project.id), project])), [projects])
  const controls = state.configs.moduleControls && typeof state.configs.moduleControls === 'object' ? state.configs.moduleControls as Record<string, Row> : {}
  const rawSort = String(controls.tasks?.sort || 'manual')
  const sortMode: SortMode = ['manual','date','priority','project','name'].includes(rawSort) ? rawSort as SortMode : 'manual'

  const projectName = (projectId: unknown) => {
    const id = String(projectId || 'entrada')
    if (id === 'entrada') return 'Entrada'
    return String(projectMap.get(id)?.nome || 'Sem projeto')
  }

  const open = useMemo(() => state.tasks.filter(task => {
    if (task.concluida) return false
    const day = dayOf(task)
    return mode === 'today' ? day === today : Boolean(day && day > today)
  }).sort((a, b) => {
    const aDay = dayOf(a), bDay = dayOf(b)
    const aTime = timeOf(a) || '99:99', bTime = timeOf(b) || '99:99'
    const titleCompare = String(a.titulo || '').localeCompare(String(b.titulo || ''), 'pt-BR', { sensitivity:'base' })
    if (sortMode === 'priority') return Number(a.prioridade || 4) - Number(b.prioridade || 4) || aDay.localeCompare(bDay) || aTime.localeCompare(bTime) || titleCompare
    if (sortMode === 'project') return projectName(a.projeto_id).localeCompare(projectName(b.projeto_id), 'pt-BR', { sensitivity:'base' }) || aDay.localeCompare(bDay) || aTime.localeCompare(bTime) || titleCompare
    if (sortMode === 'name') return titleCompare || aDay.localeCompare(bDay) || aTime.localeCompare(bTime)
    if (sortMode === 'manual') return Number(a.ordem || 0) - Number(b.ordem || 0) || aDay.localeCompare(bDay) || aTime.localeCompare(bTime) || titleCompare
    return aDay.localeCompare(bDay) || aTime.localeCompare(bTime) || titleCompare
  }), [state.tasks, mode, today, sortMode, projectMap])

  const dateGroups = useMemo(() => {
    if (mode === 'today') return [[today, open]] as [string, LegacyTask[]][]
    const map = new Map<string, LegacyTask[]>()
    open.forEach(task => {
      const day = dayOf(task)
      if (!map.has(day)) map.set(day, [])
      map.get(day)!.push(task)
    })
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [open, mode, today])

  const projectGroups = useMemo(() => {
    const map = new Map<string, LegacyTask[]>()
    open.forEach(task => {
      const id = String(task.projeto_id || 'entrada')
      if (!map.has(id)) map.set(id, [])
      map.get(id)!.push(task)
    })
    const rank = new Map<string, number>()
    rank.set('entrada', -1)
    projects.forEach((project, index) => rank.set(String(project.id), index))
    return [...map.entries()].sort((a, b) => {
      const ar = rank.get(a[0]) ?? Number.MAX_SAFE_INTEGER
      const br = rank.get(b[0]) ?? Number.MAX_SAFE_INTEGER
      return ar - br || projectName(a[0]).localeCompare(projectName(b[0]), 'pt-BR', { sensitivity:'base' })
    }).map(([id, tasks]) => ({ id, name:projectName(id), tasks }))
  }, [open, projects, projectMap])

  function toggle(task: LegacyTask) {
    commit(current => ({ ...current, tasks: current.tasks.map(item => item.id === task.id ? { ...item, concluida: !item.concluida, concluida_em: !item.concluida ? new Date().toISOString() : '' } : item) }))
  }

  function inspectTask(task: LegacyTask) {
    inspect({ kind: 'task', sourceId: task.id, title: task.titulo, date: dayOf(task), time: timeOf(task), raw: task as Row })
  }

  function identity(projectId: unknown) {
    const key = String(projectId || 'entrada')
    return projectMap.get(key) || { id:key === 'entrada' ? 'entrada' : key, nome:key === 'entrada' ? 'Entrada' : 'Sem projeto', cor:'#8e968d', icone:key === 'entrada' ? 'inbox' : 'folder' }
  }

  function projectBadge(project: ProjectRow) {
    return <span className="mai-item-inline-tag mai-item-project-tag">{project.imagem_url ? <img src={String(project.imagem_url)} alt=""/> : <i style={{ background: String(project.cor || '#8e968d') }}><MaiIcon name={String(project.icone || (project.id === 'entrada' ? 'inbox' : 'folder'))} size={9}/></i>}<span>{String(project.nome || 'Entrada')}</span></span>
  }

  function renderTask(task: LegacyTask) {
    const project = identity(task.projeto_id)
    return <article className="mai-v3-task-row mai-item-row-v2" data-selected={selectedId === task.id} key={task.id} onClick={() => inspectTask(task)}>
      <button className="mai-v3-task-check" data-priority={Number(task.prioridade||4)} aria-label={`Concluir ${task.titulo}`} style={{ borderColor: priorityColor(task.prioridade) }} onClick={event => { event.stopPropagation(); toggle(task) }} />
      <span className="mai-item-copy-v2"><span className="mai-item-titleline-v2"><strong>{task.titulo}</strong></span><span className="mai-item-subline-v2"><span>{naturalDate(dayOf(task), today)}</span><span>·</span>{projectBadge(project)}</span></span>
      <button className="mai-v3-task-more" aria-label={`Opções de ${task.titulo}`} onClick={event => { event.stopPropagation(); inspectTask(task) }}>•••</button>
    </article>
  }

  if (sortMode === 'project') return <div className="mai-v4-task-date-view mai-v4-project-groups">
    {projectGroups.map(group => <section key={group.id} className="mai-v4-task-date-group mai-v4-project-group">
      <header><h2>{group.name}</h2><span>{group.tasks.length}</span></header>
      <div className="mai-v3-task-list">{group.tasks.map(task => renderTask(task))}</div>
    </section>)}
    {!projectGroups.length ? <div className="mai-v3-empty-line">{mode === 'today' ? 'Nenhuma tarefa para hoje.' : 'Nenhuma tarefa futura.'}</div> : null}
  </div>

  return <div className="mai-v4-task-date-view">
    {dateGroups.map(([day, tasks]) => <section key={day} className="mai-v4-task-date-group">
      <header><h2>{formatHeading(day, today)}</h2><span>{tasks.length}</span></header>
      <div className="mai-v3-task-list">{tasks.map(task => renderTask(task))}{!tasks.length ? <div className="mai-v3-empty-line">{mode === 'today' ? 'Nenhuma tarefa para hoje.' : 'Nenhuma tarefa futura.'}</div> : null}</div>
    </section>)}

    {mode === 'upcoming' && !dateGroups.length ? <div className="mai-v3-empty-line">Nenhuma tarefa futura.</div> : null}
  </div>
}
