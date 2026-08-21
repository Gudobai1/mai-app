'use client'

import { useMemo, useState } from 'react'
import type { LegacyTask, MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import type { Row } from './app-types'
import { MaiIcon } from './MaiIcons'

type Mode = 'today' | 'upcoming'

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
  const [completedOpen, setCompletedOpen] = useState(false)
  const projects = useMemo(() => rows(state.projects).filter(project => project.ativo !== false) as ProjectRow[], [state.projects])
  const projectMap = useMemo(() => new Map(projects.map(project => [String(project.id), project])), [projects])

  const open = useMemo(() => state.tasks.filter(task => {
    if (task.concluida) return false
    const day = dayOf(task)
    return mode === 'today' ? day === today : Boolean(day && day > today)
  }).sort((a, b) => dayOf(a).localeCompare(dayOf(b)) || (timeOf(a) || '99:99').localeCompare(timeOf(b) || '99:99') || Number(a.ordem || 0) - Number(b.ordem || 0)), [state.tasks, mode, today])

  const completedToday = useMemo(() => mode === 'today'
    ? state.tasks.filter(task => task.concluida && dayOf(task) === today).sort((a,b) => String(b.concluida_em || '').localeCompare(String(a.concluida_em || '')))
    : [], [state.tasks, mode, today])

  const groups = useMemo(() => {
    if (mode === 'today') return [[today, open]] as [string, LegacyTask[]][]
    const map = new Map<string, LegacyTask[]>()
    open.forEach(task => {
      const day = dayOf(task)
      if (!map.has(day)) map.set(day, [])
      map.get(day)!.push(task)
    })
    return [...map.entries()]
  }, [open, mode, today])

  function toggle(task: LegacyTask) {
    commit(current => ({ ...current, tasks: current.tasks.map(item => item.id === task.id ? { ...item, concluida: !item.concluida, concluida_em: !item.concluida ? new Date().toISOString() : '' } : item) }))
  }

  function inspectTask(task: LegacyTask) {
    inspect({ kind: 'task', sourceId: task.id, title: task.titulo, date: dayOf(task), time: timeOf(task), raw: task as Row })
  }

  function identity(projectId: unknown) {
    const key = String(projectId || 'entrada')
    return projectMap.get(key) || { id: 'entrada', nome: 'Entrada', cor: '#8e968d', icone: 'inbox' }
  }

  function renderTask(task: LegacyTask, completed = false) {
    const project = identity(task.projeto_id)
    const children = state.tasks.filter(child => String(child.parent_id || '') === String(task.id))
    const doneChildren = children.filter(child => child.concluida).length
    return <article className="mai-v3-task-row" data-selected={selectedId === task.id} key={`${completed ? 'done-' : ''}${task.id}`}>
      <button className="mai-v3-task-check" data-completed={completed || undefined} aria-label={completed ? `Reabrir ${task.titulo}` : `Concluir ${task.titulo}`} style={completed ? undefined : { borderColor: priorityColor(task.prioridade) }} onClick={() => toggle(task)}>{completed ? '✓' : ''}</button>
      <button className="mai-v3-task-body" onClick={() => inspectTask(task)}>
        <strong>{task.titulo}</strong>
        <small>
          <span>{naturalDate(dayOf(task), today)}</span>
          <span>-</span>
          <span className="mai-v3-task-project">{project.imagem_url ? <img src={String(project.imagem_url)} alt=""/> : <i style={{ background: String(project.cor || '#8e968d') }}><MaiIcon name={String(project.icone || (project.id === 'entrada' ? 'inbox' : 'folder'))} size={10}/></i>} {String(project.nome || 'Entrada')}</span>
          {children.length ? <><span>·</span><span>{doneChildren} de {children.length}</span></> : null}
        </small>
      </button>
      <button className="mai-v3-task-more" aria-label={`Opções de ${task.titulo}`} onClick={() => inspectTask(task)}>•••</button>
    </article>
  }

  return <div className="mai-v4-task-date-view">
    {groups.map(([day, tasks]) => <section key={day} className="mai-v4-task-date-group">
      <header><h2>{formatHeading(day, today)}</h2><span>{tasks.length}</span></header>
      <div className="mai-v3-task-list">{tasks.map(task => renderTask(task))}{!tasks.length ? <div className="mai-v3-empty-line">{mode === 'today' ? 'Nenhuma tarefa para hoje.' : 'Nenhuma tarefa futura.'}</div> : null}</div>
    </section>)}

    {mode === 'upcoming' && !groups.length ? <div className="mai-v3-empty-line">Nenhuma tarefa futura.</div> : null}

    {mode === 'today' && completedToday.length ? <div className="mai-v3-completed-wrap">
      <button className="mai-v3-completed-toggle" onClick={() => setCompletedOpen(value => !value)}><MaiIcon name="chevron" size={14}/><span>Concluídas · {completedToday.length}</span></button>
      {completedOpen ? <div className="mai-v3-task-list mai-v3-completed-list">{completedToday.map(task => renderTask(task, true))}</div> : null}
    </div> : null}
  </div>
}
