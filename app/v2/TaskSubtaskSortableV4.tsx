'use client'

import { useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { LegacyTask, MaiState } from '../../lib/v2/state'
import { MaiIcon } from './MaiIcons'

type Props = {
  parentId: string
  tasks: LegacyTask[]
  commit: (change: (current: MaiState) => MaiState) => void
  onToggle: (id: string) => void
  onOpen: (id: string) => void
}

type DragState = {
  pointerId: number
  sourceId: string
  offsetY: number
  left: number
  width: number
  height: number
}

type GhostState = {
  id: string
  left: number
  top: number
  width: number
  height: number
}

const dateOnly = (value: unknown) => String(value || '').slice(0, 10)
const priorityColor = (value: unknown) => Number(value || 4) === 1 ? '#c85b52' : Number(value || 4) === 2 ? '#c28a3d' : Number(value || 4) === 3 ? '#7c9274' : '#8d958b'

function formatDate(value: string) {
  if (!value) return 'Dentro desta tarefa'
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function moveId(order: string[], sourceId: string, targetId: string, after: boolean) {
  if (!sourceId || !targetId || sourceId === targetId) return order
  const sourceIndex = order.indexOf(sourceId)
  if (sourceIndex < 0) return order

  const next = [...order]
  next.splice(sourceIndex, 1)
  const targetIndex = next.indexOf(targetId)
  if (targetIndex < 0) return order
  next.splice(after ? targetIndex + 1 : targetIndex, 0, sourceId)
  return next
}

export function TaskSubtaskSortableV4({ parentId, tasks, commit, onToggle, onOpen }: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const orderRef = useRef<string[] | null>(null)
  const [order, setOrderState] = useState<string[] | null>(null)
  const [draggingId, setDraggingId] = useState('')
  const [ghost, setGhost] = useState<GhostState | null>(null)

  const taskMap = useMemo(() => new Map(tasks.map(task => [String(task.id), task])), [tasks])
  const displayedTasks = useMemo(() => {
    if (!order) return tasks
    return order.map(id => taskMap.get(id)).filter((task): task is LegacyTask => Boolean(task))
  }, [order, taskMap, tasks])
  const draggedTask = draggingId ? taskMap.get(draggingId) : undefined

  function setOrder(next: string[] | null) {
    orderRef.current = next
    setOrderState(next)
  }

  function persistOrder(next: string[] | null) {
    if (!next?.length) return
    const rank = new Map(next.map((id, index) => [id, index]))
    commit(current => ({
      ...current,
      tasks: current.tasks.map(task => String(task.parent_id || '') === parentId && rank.has(String(task.id))
        ? { ...task, ordem: rank.get(String(task.id))! }
        : task),
    }))
  }

  function resetDrag() {
    dragRef.current = null
    setDraggingId('')
    setGhost(null)
    setOrder(null)
    if (typeof document !== 'undefined') delete document.body.dataset.maiTaskV4SubtaskDragging
  }

  function targetAtY(clientY: number, sourceId: string) {
    const root = listRef.current
    if (!root) return null
    const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-mai-task-v4-subtask-id]'))
      .filter(row => row.dataset.maiTaskV4SubtaskId && row.dataset.maiTaskV4SubtaskId !== sourceId)
      .map(row => {
        const rect = row.getBoundingClientRect()
        return { id: String(row.dataset.maiTaskV4SubtaskId), top: rect.top, center: rect.top + rect.height / 2 }
      })
      .sort((a, b) => a.top - b.top)

    if (!rows.length) return null
    if (clientY <= rows[0].center) return { id: rows[0].id, after: false }
    const last = rows[rows.length - 1]
    if (clientY >= last.center) return { id: last.id, after: true }

    let nearest = rows[0]
    let nearestDistance = Math.abs(clientY - nearest.center)
    for (const row of rows.slice(1)) {
      const distance = Math.abs(clientY - row.center)
      if (distance < nearestDistance) {
        nearest = row
        nearestDistance = distance
      }
    }
    return { id: nearest.id, after: clientY >= nearest.center }
  }

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    const row = event.currentTarget.closest<HTMLElement>('[data-mai-task-v4-subtask-id]')
    if (!row) return

    event.preventDefault()
    event.stopPropagation()
    const rect = row.getBoundingClientRect()
    const nextOrder = tasks.map(task => String(task.id))
    dragRef.current = {
      pointerId: event.pointerId,
      sourceId: id,
      offsetY: event.clientY - rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    }
    setOrder(nextOrder)
    setDraggingId(id)
    setGhost({ id, left: rect.left, top: rect.top, width: rect.width, height: rect.height })
    document.body.dataset.maiTaskV4SubtaskDragging = 'true'
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch {}
    try { if (event.pointerType !== 'mouse') navigator.vibrate?.(10) } catch {}
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = dragRef.current
    if (!current || current.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()

    setGhost({
      id: current.sourceId,
      left: current.left,
      top: event.clientY - current.offsetY,
      width: current.width,
      height: current.height,
    })

    const target = targetAtY(event.clientY, current.sourceId)
    if (!target) return
    const currentOrder = orderRef.current || tasks.map(task => String(task.id))
    const next = moveId(currentOrder, current.sourceId, target.id, target.after)
    if (next.length === currentOrder.length && next.every((id, index) => id === currentOrder[index])) return
    setOrder(next)
  }

  function finishDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = dragRef.current
    if (!current || current.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const finalOrder = orderRef.current
    persistOrder(finalOrder)
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
    resetDrag()
  }

  function cancelDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = dragRef.current
    if (!current || current.pointerId !== event.pointerId) return
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
    resetDrag()
  }

  return <>
    <div ref={listRef} className="mai-task-v4-subtask-list mai-task-v4-subtask-sortable-list">
      {displayedTasks.map(child => {
        const id = String(child.id)
        const dragging = id === draggingId
        return <div
          className="mai-task-v4-subtask mai-task-v4-subtask-sortable"
          key={id}
          data-mai-task-v4-subtask-id={id}
          data-dragging={dragging || undefined}
        >
          <button
            type="button"
            className="mai-task-v4-subtask-drag-handle"
            aria-label={`Mover ${child.titulo}`}
            title="Segure e arraste para mover"
            onPointerDown={event => beginDrag(event, id)}
            onPointerMove={moveDrag}
            onPointerUp={finishDrag}
            onPointerCancel={cancelDrag}
            onClick={event => { event.preventDefault(); event.stopPropagation() }}
          ><span className="material-symbols-rounded">drag_indicator</span></button>
          <button type="button" className="mai-task-v4-subtask-check" data-done={child.concluida === true || undefined} style={!child.concluida ? { borderColor: priorityColor(child.prioridade) } : undefined} onClick={() => onToggle(id)}>{child.concluida ? '✓' : ''}</button>
          <button type="button" className="mai-task-v4-subtask-main" onClick={() => onOpen(id)}><strong>{child.titulo}</strong><small>{formatDate(dateOnly(child.data_vencimento))}</small></button>
          <MaiIcon name="chevron" size={13}/>
        </div>
      })}
    </div>

    {ghost && draggedTask ? <div
      className="mai-task-v4-subtask mai-task-v4-subtask-drag-ghost"
      aria-hidden="true"
      style={{ left: ghost.left, top: ghost.top, width: ghost.width, minHeight: ghost.height } as CSSProperties}
    >
      <span className="mai-task-v4-subtask-drag-handle"><span className="material-symbols-rounded">drag_indicator</span></span>
      <span className="mai-task-v4-subtask-check" data-done={draggedTask.concluida === true || undefined} style={!draggedTask.concluida ? { borderColor: priorityColor(draggedTask.prioridade) } : undefined}>{draggedTask.concluida ? '✓' : ''}</span>
      <span className="mai-task-v4-subtask-main"><strong>{draggedTask.titulo}</strong><small>{formatDate(dateOnly(draggedTask.data_vencimento))}</small></span>
      <MaiIcon name="chevron" size={13}/>
    </div> : null}
  </>
}
