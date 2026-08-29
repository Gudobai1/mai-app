'use client'

import { useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { LegacyTask, MaiState } from '../../lib/v2/state'
import { MaiIcon } from './MaiIcons'

type Props = {
  parentId: string
  tasks: LegacyTask[]
  commit: (change: (current: MaiState) => MaiState) => void
  onToggle: (id: string) => void
  onOpen: (id: string) => void
}

type TouchDrag = {
  pointerId: number
  sourceId: string
  active: boolean
  startX: number
  startY: number
}

const dateOnly = (value: unknown) => String(value || '').slice(0, 10)
const priorityColor = (value: unknown) => Number(value || 4) === 1 ? '#c85b52' : Number(value || 4) === 2 ? '#c28a3d' : Number(value || 4) === 3 ? '#7c9274' : '#b8beb7'

function formatDate(value: string) {
  if (!value) return 'Sem data'
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function SortableSubtaskList({ parentId, tasks, commit, onToggle, onOpen }: Props) {
  const [draggedId, setDraggedId] = useState('')
  const [overId, setOverId] = useState('')
  const touchDrag = useRef<TouchDrag | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function resetDrag() {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = null
    touchDrag.current = null
    setDraggedId('')
    setOverId('')
  }

  function reorder(sourceId: string, targetId: string) {
    if (!sourceId || !targetId || sourceId === targetId) return
    commit(current => {
      const siblings = current.tasks
        .filter(task => String(task.parent_id || '') === parentId)
        .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
      const sourceIndex = siblings.findIndex(task => String(task.id) === sourceId)
      const targetIndex = siblings.findIndex(task => String(task.id) === targetId)
      if (sourceIndex < 0 || targetIndex < 0) return current

      const nextSiblings = [...siblings]
      const [moved] = nextSiblings.splice(sourceIndex, 1)
      nextSiblings.splice(Math.min(targetIndex, nextSiblings.length), 0, moved)
      const order = new Map(nextSiblings.map((task, index) => [String(task.id), index]))
      return {
        ...current,
        tasks: current.tasks.map(task => order.has(String(task.id)) ? { ...task, ordem: order.get(String(task.id))! } : task),
      }
    })
  }

  function dragStart(event: DragEvent<HTMLButtonElement>, id: string) {
    event.stopPropagation()
    setDraggedId(id)
    setOverId(id)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }

  function touchStart(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    if (event.pointerType === 'mouse') return
    event.stopPropagation()
    const target = event.currentTarget
    touchDrag.current = {
      pointerId: event.pointerId,
      sourceId: id,
      active: false,
      startX: event.clientX,
      startY: event.clientY,
    }
    holdTimer.current = setTimeout(() => {
      const current = touchDrag.current
      if (!current || current.sourceId !== id) return
      current.active = true
      setDraggedId(id)
      setOverId(id)
      try { target.setPointerCapture(current.pointerId) } catch {}
      holdTimer.current = null
    }, 260)
  }

  function touchMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = touchDrag.current
    if (!current) return
    if (!current.active) {
      if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 8) resetDrag()
      return
    }
    event.preventDefault()
    const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
    const row = element?.closest<HTMLElement>('[data-mai-subtask-id]')
    const id = row?.dataset.maiSubtaskId || ''
    if (id) setOverId(id)
  }

  function touchEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = touchDrag.current
    if (current?.active) {
      event.preventDefault()
      event.stopPropagation()
      if (draggedId && overId) reorder(draggedId, overId)
    }
    resetDrag()
  }

  return <div className="mai-context-v3-subtask-list mai-sortable-subtask-list">
    {tasks.map(child => <div
      className="mai-context-v3-subtask mai-sortable-subtask"
      key={child.id}
      data-mai-subtask-id={String(child.id)}
      data-subtask-dragging={draggedId === String(child.id) || undefined}
      data-subtask-over={Boolean(draggedId) && overId === String(child.id) && draggedId !== String(child.id) || undefined}
      onDragOver={event => {
        if (!draggedId) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setOverId(String(child.id))
      }}
      onDrop={event => {
        event.preventDefault()
        event.stopPropagation()
        reorder(draggedId || event.dataTransfer.getData('text/plain'), String(child.id))
        resetDrag()
      }}
    >
      <button
        type="button"
        className="mai-subtask-drag-handle"
        aria-label={`Reorganizar ${child.titulo}`}
        title="Segure e arraste para reorganizar"
        draggable
        onDragStart={event => dragStart(event, String(child.id))}
        onDragEnd={resetDrag}
        onPointerDown={event => touchStart(event, String(child.id))}
        onPointerMove={touchMove}
        onPointerUp={touchEnd}
        onPointerCancel={resetDrag}
      ><span className="material-symbols-rounded">drag_indicator</span></button>
      <button type="button" className="mai-context-v3-subtask-check" data-done={child.concluida === true} style={!child.concluida ? { borderColor: priorityColor(child.prioridade) } : undefined} onClick={() => onToggle(String(child.id))}>{child.concluida ? '✓' : ''}</button>
      <button type="button" className="mai-context-v3-subtask-main" onClick={() => onOpen(String(child.id))}><strong>{child.titulo}</strong><small>{dateOnly(child.data_vencimento) ? `${formatDate(dateOnly(child.data_vencimento))} · tarefa com data` : 'Dentro desta tarefa'}</small></button>
      <MaiIcon name="chevron" size={13}/>
    </div>)}
  </div>
}
