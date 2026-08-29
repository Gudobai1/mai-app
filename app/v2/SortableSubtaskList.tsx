'use client'

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent } from 'react'
import type { LegacyTask, MaiState } from '../../lib/v2/state'
import { MaiIcon } from './MaiIcons'

type Props = {
  parentId: string
  tasks: LegacyTask[]
  commit: (change: (current: MaiState) => MaiState) => void
  onToggle: (id: string) => void
  onOpen: (id: string) => void
}

type DropPosition = 'before' | 'after'

type MouseDrag = {
  pointerId: number
  sourceId: string
  startX: number
  startY: number
  active: boolean
}

type TouchDrag = {
  touchId: number
  sourceId: string
  startX: number
  startY: number
  active: boolean
}

const dateOnly = (value: unknown) => String(value || '').slice(0, 10)
const priorityColor = (value: unknown) => Number(value || 4) === 1 ? '#c85b52' : Number(value || 4) === 2 ? '#c28a3d' : Number(value || 4) === 3 ? '#7c9274' : '#b8beb7'

function formatDate(value: string) {
  if (!value) return 'Sem data'
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function dropTarget(clientX: number, clientY: number, sourceId: string) {
  const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null
  const row = element?.closest<HTMLElement>('[data-mai-subtask-id]')
  const id = row?.dataset.maiSubtaskId || ''
  if (!row || !id || id === sourceId) return null
  const rect = row.getBoundingClientRect()
  return {
    id,
    position: clientY >= rect.top + rect.height / 2 ? 'after' as const : 'before' as const,
  }
}

function moveId(order: string[], sourceId: string, targetId: string, position: DropPosition) {
  if (!sourceId || !targetId || sourceId === targetId) return order
  const sourceIndex = order.indexOf(sourceId)
  if (sourceIndex < 0) return order

  const next = [...order]
  next.splice(sourceIndex, 1)
  const targetIndex = next.indexOf(targetId)
  if (targetIndex < 0) return order
  next.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, sourceId)
  return next
}

export function SortableSubtaskList({ parentId, tasks, commit, onToggle, onOpen }: Props) {
  const [draggedId, setDraggedId] = useState('')
  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null)
  const previewOrderRef = useRef<string[] | null>(null)
  const mouseDrag = useRef<MouseDrag | null>(null)
  const touchDrag = useRef<TouchDrag | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressClick = useRef(false)

  const taskMap = useMemo(() => new Map(tasks.map(task => [String(task.id), task])), [tasks])
  const displayedTasks = useMemo(() => {
    if (!previewOrder) return tasks
    const ordered = previewOrder.map(id => taskMap.get(id)).filter((task): task is LegacyTask => Boolean(task))
    const known = new Set(previewOrder)
    return [...ordered, ...tasks.filter(task => !known.has(String(task.id)))]
  }, [previewOrder, taskMap, tasks])

  useEffect(() => () => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    restoreDocumentDragState()
  }, [])

  function clearHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = null
  }

  function setOrder(order: string[] | null) {
    previewOrderRef.current = order
    setPreviewOrder(order)
  }

  function beginPreview(sourceId: string) {
    const order = tasks.map(task => String(task.id))
    setOrder(order)
    setDraggedId(sourceId)
    document.body.dataset.maiSubtaskDragging = 'true'
    document.body.style.userSelect = 'none'
  }

  function restoreDocumentDragState() {
    if (typeof document === 'undefined') return
    delete document.body.dataset.maiSubtaskDragging
    document.body.style.userSelect = ''
  }

  function previewMove(sourceId: string, targetId: string, position: DropPosition) {
    const current = previewOrderRef.current || tasks.map(task => String(task.id))
    const next = moveId(current, sourceId, targetId, position)
    if (next.length === current.length && next.every((id, index) => id === current[index])) return
    setOrder(next)
  }

  function persistPreview() {
    const order = previewOrderRef.current
    if (!order?.length) return
    const rank = new Map(order.map((id, index) => [id, index]))
    commit(current => ({
      ...current,
      tasks: current.tasks.map(task => String(task.parent_id || '') === parentId && rank.has(String(task.id))
        ? { ...task, ordem: rank.get(String(task.id))! }
        : task),
    }))
  }

  function finishDrag(save: boolean) {
    if (save) persistPreview()
    clearHold()
    mouseDrag.current = null
    touchDrag.current = null
    setDraggedId('')
    setOrder(null)
    restoreDocumentDragState()
  }

  function updateMouseTarget(event: PointerEvent) {
    const current = mouseDrag.current
    if (!current || event.pointerId !== current.pointerId) return

    const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY)
    if (!current.active && distance >= 4) {
      current.active = true
      suppressClick.current = true
      beginPreview(current.sourceId)
    }
    if (!current.active) return

    event.preventDefault()
    const target = dropTarget(event.clientX, event.clientY, current.sourceId)
    if (target) previewMove(current.sourceId, target.id, target.position)
  }

  function finishMouse(event: PointerEvent) {
    const current = mouseDrag.current
    if (!current || event.pointerId !== current.pointerId) return
    if (current.active) event.preventDefault()
    finishDrag(current.active)
    window.removeEventListener('pointermove', updateMouseTarget)
    window.removeEventListener('pointerup', finishMouse)
    window.removeEventListener('pointercancel', cancelMouse)
  }

  function cancelMouse() {
    finishDrag(false)
    window.removeEventListener('pointermove', updateMouseTarget)
    window.removeEventListener('pointerup', finishMouse)
    window.removeEventListener('pointercancel', cancelMouse)
  }

  function beginMouse(event: ReactPointerEvent<HTMLDivElement>, id: string) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    const target = event.target as HTMLElement | null
    if (target?.closest('.mai-context-v3-subtask-check')) return

    mouseDrag.current = {
      pointerId: event.pointerId,
      sourceId: id,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    }

    window.addEventListener('pointermove', updateMouseTarget, { passive: false })
    window.addEventListener('pointerup', finishMouse, { passive: false })
    window.addEventListener('pointercancel', cancelMouse)
  }

  function touchById(event: TouchEvent, id: number) {
    return Array.from(event.touches).find(touch => touch.identifier === id)
      || Array.from(event.changedTouches).find(touch => touch.identifier === id)
  }

  function updateTouchTarget(event: TouchEvent) {
    const current = touchDrag.current
    if (!current) return
    const touch = touchById(event, current.touchId)
    if (!touch) return

    if (!current.active) {
      if (Math.hypot(touch.clientX - current.startX, touch.clientY - current.startY) > 12) cancelTouch()
      return
    }

    event.preventDefault()
    const target = dropTarget(touch.clientX, touch.clientY, current.sourceId)
    if (target) previewMove(current.sourceId, target.id, target.position)
  }

  function finishTouch(event: TouchEvent) {
    const current = touchDrag.current
    if (!current) return
    clearHold()
    if (current.active) {
      event.preventDefault()
      suppressClick.current = true
    }
    finishDrag(current.active)
    window.removeEventListener('touchmove', updateTouchTarget)
    window.removeEventListener('touchend', finishTouch)
    window.removeEventListener('touchcancel', cancelTouch)
  }

  function cancelTouch() {
    finishDrag(false)
    window.removeEventListener('touchmove', updateTouchTarget)
    window.removeEventListener('touchend', finishTouch)
    window.removeEventListener('touchcancel', cancelTouch)
  }

  function beginTouch(event: ReactTouchEvent<HTMLDivElement>, id: string) {
    if (event.touches.length !== 1) return
    const target = event.target as HTMLElement | null
    if (target?.closest('.mai-context-v3-subtask-check')) return

    const touch = event.touches[0]
    touchDrag.current = {
      touchId: touch.identifier,
      sourceId: id,
      startX: touch.clientX,
      startY: touch.clientY,
      active: false,
    }

    window.addEventListener('touchend', finishTouch, { passive: false })
    window.addEventListener('touchcancel', cancelTouch)

    clearHold()
    holdTimer.current = setTimeout(() => {
      const current = touchDrag.current
      if (!current || current.sourceId !== id) return
      current.active = true
      suppressClick.current = true
      beginPreview(id)
      window.addEventListener('touchmove', updateTouchTarget, { passive: false })
      holdTimer.current = null
      try { navigator.vibrate?.(8) } catch {}
    }, 280)
  }

  function captureClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!suppressClick.current) return
    suppressClick.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  return <div className="mai-context-v3-subtask-list mai-sortable-subtask-list">
    {displayedTasks.map(child => {
      const id = String(child.id)
      const dragging = draggedId === id

      return <div
        className="mai-context-v3-subtask mai-sortable-subtask"
        key={child.id}
        data-mai-subtask-id={id}
        data-subtask-dragging={dragging || undefined}
        onPointerDown={event => beginMouse(event, id)}
        onTouchStart={event => beginTouch(event, id)}
        onClickCapture={captureClick}
        onContextMenu={event => { if (dragging) event.preventDefault() }}
      >
        <button
          type="button"
          className="mai-subtask-drag-handle"
          aria-label={`Reorganizar ${child.titulo}`}
          title="Arraste a subtarefa para reorganizar"
          onClick={event => { event.preventDefault(); event.stopPropagation() }}
        ><span className="material-symbols-rounded">drag_indicator</span></button>
        <button type="button" className="mai-context-v3-subtask-check" data-done={child.concluida === true} style={!child.concluida ? { borderColor: priorityColor(child.prioridade) } : undefined} onClick={() => onToggle(id)}>{child.concluida ? '✓' : ''}</button>
        <button type="button" className="mai-context-v3-subtask-main" onClick={() => onOpen(id)}><strong>{child.titulo}</strong><small>{dateOnly(child.data_vencimento) ? `${formatDate(dateOnly(child.data_vencimento))} · tarefa com data` : 'Dentro desta tarefa'}</small></button>
        <MaiIcon name="chevron" size={13}/>
      </div>
    })}
  </div>
}
