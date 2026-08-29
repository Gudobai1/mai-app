'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import type { LegacyTask, MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import type { Row } from './app-types'
import { MaiIcon } from './MaiIcons'

type Commit = (change: (current: MaiState) => MaiState) => void

type SelectionContextValue = {
  selectedIds: Set<string>
  selectedTasks: LegacyTask[]
  allSelectedCompleted: boolean
  toggle: (id: string) => void
  clear: () => void
  editSelected: () => void
  setCompleted: () => void
  moveToProject: (projectId: string) => void
  setPriority: (priority: number) => void
  removeSelected: () => void
}

const TaskSelectionContext = createContext<SelectionContextValue | null>(null)

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const dayOf = (task: LegacyTask) => String(task.data_vencimento || '').slice(0, 10)
const timeOf = (task: LegacyTask) => String(task.data_vencimento || '').includes('T') ? String(task.data_vencimento).slice(11, 16) : ''

export function TaskSelectionProvider({
  state,
  scopeKey,
  commit,
  inspect,
  children,
}: {
  state: MaiState
  scopeKey: string
  commit: Commit
  inspect: (item: InspectableItem) => void
  children: ReactNode
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setSelectedIds(new Set())
  }, [scopeKey])

  useEffect(() => {
    setSelectedIds(current => {
      if (!current.size) return current
      const available = new Set(state.tasks.map(task => String(task.id)))
      const next = new Set([...current].filter(id => available.has(id)))
      if (next.size === current.size && [...next].every(id => current.has(id))) return current
      return next
    })
  }, [state.tasks])

  const selectedTasks = useMemo(() => state.tasks.filter(task => selectedIds.has(String(task.id))), [state.tasks, selectedIds])
  const allSelectedCompleted = selectedTasks.length > 0 && selectedTasks.every(task => task.concluida === true)

  function toggle(id: string) {
    setSelectedIds(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clear() {
    setSelectedIds(new Set())
  }

  function editSelected() {
    if (selectedTasks.length !== 1) return
    const task = selectedTasks[0]
    clear()
    inspect({
      kind: 'task',
      sourceId: String(task.id),
      title: String(task.titulo || 'Tarefa'),
      date: dayOf(task),
      time: timeOf(task),
      raw: task as Row,
    })
  }

  function setCompleted() {
    if (!selectedTasks.length) return
    const target = !allSelectedCompleted
    const ids = new Set(selectedTasks.map(task => String(task.id)))
    const completedAt = target ? new Date().toISOString() : ''
    commit(current => ({
      ...current,
      tasks: current.tasks.map(task => ids.has(String(task.id)) ? { ...task, concluida: target, concluida_em: completedAt } : task),
    }))
    clear()
  }

  function moveToProject(projectId: string) {
    if (!selectedTasks.length || !projectId) return
    const ids = new Set(selectedTasks.map(task => String(task.id)))
    commit(current => ({
      ...current,
      tasks: current.tasks.map(task => ids.has(String(task.id)) ? { ...task, projeto_id: projectId, secao: '' } : task),
    }))
    clear()
  }

  function setPriority(priority: number) {
    if (!selectedTasks.length) return
    const ids = new Set(selectedTasks.map(task => String(task.id)))
    commit(current => ({
      ...current,
      tasks: current.tasks.map(task => ids.has(String(task.id)) ? { ...task, prioridade: priority } : task),
    }))
    clear()
  }

  function removeSelected() {
    if (!selectedTasks.length) return
    const count = selectedTasks.length
    if (!confirm(`Excluir ${count === 1 ? 'a tarefa selecionada' : `${count} tarefas selecionadas`}?`)) return
    const ids = new Set(selectedTasks.map(task => String(task.id)))
    commit(current => {
      const byId = new Map(current.tasks.map(task => [String(task.id), task]))
      const next = current.tasks
        .filter(task => !ids.has(String(task.id)))
        .map(task => {
          let parentId = String(task.parent_id || '')
          if (!parentId || !ids.has(parentId)) return task
          const seen = new Set<string>()
          while (parentId && ids.has(parentId) && !seen.has(parentId)) {
            seen.add(parentId)
            parentId = String(byId.get(parentId)?.parent_id || '')
          }
          return { ...task, parent_id: parentId || undefined }
        })
      return { ...current, tasks: next }
    })
    clear()
  }

  const value = useMemo<SelectionContextValue>(() => ({
    selectedIds,
    selectedTasks,
    allSelectedCompleted,
    toggle,
    clear,
    editSelected,
    setCompleted,
    moveToProject,
    setPriority,
    removeSelected,
  }), [selectedIds, selectedTasks, allSelectedCompleted])

  return <TaskSelectionContext.Provider value={value}>{children}</TaskSelectionContext.Provider>
}

export function useTaskSelection() {
  const value = useContext(TaskSelectionContext)
  if (!value) throw new Error('useTaskSelection precisa estar dentro de TaskSelectionProvider')
  return value
}

export function TaskSelectionBar({ state }: { state: MaiState }) {
  const selection = useTaskSelection()
  if (!selection.selectedTasks.length) return null

  const projects = rows(state.projects)
    .filter(project => project.ativo !== false)
    .sort((a, b) => Number(Boolean(b.favorito)) - Number(Boolean(a.favorito)) || Number(a.ordem || 0) - Number(b.ordem || 0) || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' }))

  const count = selection.selectedTasks.length
  return <div className="mai-task-selection-bar" role="toolbar" aria-label="Ações das tarefas selecionadas">
    <div className="mai-task-selection-summary">
      <span className="material-symbols-rounded">check_box</span>
      <strong>{count} selecionada{count === 1 ? '' : 's'}</strong>
      <small>Ctrl/Cmd + clique · segure no celular</small>
    </div>
    <div className="mai-task-selection-actions">
      {count === 1 ? <button type="button" onClick={selection.editSelected}><MaiIcon name="edit" size={15}/>Editar</button> : null}
      <button type="button" onClick={selection.setCompleted}><MaiIcon name={selection.allSelectedCompleted ? 'undo' : 'check'} size={15}/>{selection.allSelectedCompleted ? 'Reabrir' : 'Concluir'}</button>
      <label className="mai-task-selection-select">
        <span className="material-symbols-rounded">drive_file_move</span>
        <select aria-label="Mover tarefas selecionadas" value="" onChange={event => selection.moveToProject(event.target.value)}>
          <option value="" disabled>Mover</option>
          <option value="entrada">Entrada</option>
          {projects.map(project => <option key={String(project.id)} value={String(project.id)}>{String(project.nome || 'Projeto')}</option>)}
        </select>
      </label>
      <label className="mai-task-selection-select">
        <span className="material-symbols-rounded">flag</span>
        <select aria-label="Alterar prioridade das tarefas selecionadas" value="" onChange={event => selection.setPriority(Number(event.target.value))}>
          <option value="" disabled>Prioridade</option>
          <option value="1">Alta</option>
          <option value="2">Média</option>
          <option value="3">Baixa</option>
          <option value="4">Sem prioridade</option>
        </select>
      </label>
      <button type="button" className="mai-task-selection-danger" onClick={selection.removeSelected}><MaiIcon name="delete" size={15}/>Excluir</button>
      <button type="button" className="mai-task-selection-close" onClick={selection.clear} aria-label="Limpar seleção"><MaiIcon name="close" size={15}/></button>
    </div>
  </div>
}

type SelectableTaskRowProps = Omit<ComponentPropsWithoutRef<'article'>, 'onClick'> & {
  taskId: string
  onOpen: () => void
}

export function SelectableTaskRow({ taskId, onOpen, children, ...props }: SelectableTaskRowProps) {
  const selection = useTaskSelection()
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const suppressClick = useRef(false)

  function clearLongPress() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = null
    touchStart.current = null
  }

  function pointerDown(event: ReactPointerEvent<HTMLElement>) {
    props.onPointerDown?.(event)
    if (event.defaultPrevented || event.pointerType === 'mouse') return
    const target = event.target as HTMLElement | null
    if (target?.closest('button,a,input,select,textarea,[contenteditable="true"]')) return
    touchStart.current = { x: event.clientX, y: event.clientY }
    longPressTimer.current = setTimeout(() => {
      suppressClick.current = true
      selection.toggle(taskId)
      longPressTimer.current = null
      touchStart.current = null
    }, 420)
  }

  function pointerMove(event: ReactPointerEvent<HTMLElement>) {
    props.onPointerMove?.(event)
    if (!longPressTimer.current || !touchStart.current) return
    if (Math.hypot(event.clientX - touchStart.current.x, event.clientY - touchStart.current.y) > 10) clearLongPress()
  }

  function pointerEnd(event: ReactPointerEvent<HTMLElement>) {
    props.onPointerUp?.(event)
    clearLongPress()
  }

  function click(event: ReactMouseEvent<HTMLElement>) {
    if (suppressClick.current) {
      suppressClick.current = false
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      event.stopPropagation()
      selection.toggle(taskId)
      return
    }
    onOpen()
  }

  const selected = selection.selectedIds.has(taskId)
  return <article
    {...props}
    aria-selected={selected || undefined}
    data-batch-selected={selected || undefined}
    onClick={click}
    onPointerDown={pointerDown}
    onPointerMove={pointerMove}
    onPointerUp={pointerEnd}
    onPointerCancel={event => { props.onPointerCancel?.(event); clearLongPress() }}
    onContextMenu={event => {
      if (suppressClick.current) event.preventDefault()
      props.onContextMenu?.(event)
    }}
  >{children}</article>
}
