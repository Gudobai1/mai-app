'use client'

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent } from 'react'
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
  overId: string
  position: DropPosition
}

type TouchDrag = {
  touchId: number
  sourceId: string
  startX: number
  startY: number
  active: boolean
  overId: string
  position: DropPosition
}

type VisualDrag = {
  sourceId: string
  overId: string
  position: DropPosition
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

export function SortableSubtaskList({ parentId, tasks, commit, onToggle, onOpen }: Props) {
  const [visual, setVisual] = useState<VisualDrag | null>(null)
  const mouseDrag = useRef<MouseDrag | null>(null)
  const touchDrag = useRef<TouchDrag | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressClick = useRef(false)

  useEffect(() => () => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
  }, [])

  function clearHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = null
  }

  function resetVisual() {
    setVisual(null)
  }

  function reorder(sourceId: string, targetId: string, position: DropPosition) {
    if (!sourceId || !targetId || sourceId === targetId) return
    commit(current => {
      const siblings = current.tasks
        .filter(task => String(task.parent_id || '') === parentId)
        .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))

      const sourceIndex = siblings.findIndex(task => String(task.id) === sourceId)
      if (sourceIndex < 0) return current

      const next = [...siblings]
      const [moved] = next.splice(sourceIndex, 1)
      const targetIndex = next.findIndex(task => String(task.id) === targetId)
      if (targetIndex < 0) return current

      const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex
      next.splice(insertIndex, 0, moved)

      const order = new Map(next.map((task, index) => [String(task.id), index]))
      return {
        ...current,
        tasks: current.tasks.map(task => order.has(String(task.id)) ? { ...task, ordem: order.get(String(task.id))! } : task),
      }
    })
  }

  function updateMouseTarget(event: PointerEvent) {
    const current = mouseDrag.current
    if (!current || event.pointerId !== current.pointerId) return

    const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY)
    if (!current.active && distance >= 4) {
      current.active = true
      setVisual({ sourceId: current.sourceId, overId: '', position: 'before' })
    }
    if (!current.active) return

    event.preventDefault()
    const target = dropTarget(event.clientX, event.clientY, current.sourceId)
    if (!target) return

    current.overId = target.id
    current.position = target.position
    setVisual({ sourceId: current.sourceId, overId: target.id, position: target.position })
  }

  function finishMouse(event: PointerEvent) {
    const current = mouseDrag.current
    if (!current || event.pointerId !== current.pointerId) return

    if (current.active) {
      event.preventDefault()
      suppressClick.current = true
      if (current.overId) reorder(current.sourceId, current.overId, current.position)
    }

    mouseDrag.current = null
    resetVisual()
    window.removeEventListener('pointermove', updateMouseTarget)
    window.removeEventListener('pointerup', finishMouse)
    window.removeEventListener('pointercancel', cancelMouse)
  }

  function cancelMouse() {
    mouseDrag.current = null
    resetVisual()
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
      overId: '',
      position: 'before',
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
    if (!target) return

    current.overId = target.id
    current.position = target.position
    setVisual({ sourceId: current.sourceId, overId: target.id, position: target.position })
  }

  function finishTouch(event: TouchEvent) {
    const current = touchDrag.current
    if (!current) return
    clearHold()

    if (current.active) {
      event.preventDefault()
      suppressClick.current = true
      if (current.overId) reorder(current.sourceId, current.overId, current.position)
    }

    touchDrag.current = null
    resetVisual()
    window.removeEventListener('touchmove', updateTouchTarget)
    window.removeEventListener('touchend', finishTouch)
    window.removeEventListener('touchcancel', cancelTouch)
  }

  function cancelTouch() {
    clearHold()
    touchDrag.current = null
    resetVisual()
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
      overId: '',
      position: 'before',
    }

    window.addEventListener('touchend', finishTouch, { passive: false })
    window.addEventListener('touchcancel', cancelTouch)

    clearHold()
    holdTimer.current = setTimeout(() => {
      const current = touchDrag.current
      if (!current || current.sourceId !== id) return
      current.active = true
      setVisual({ sourceId: id, overId: '', position: 'before' })
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
    {tasks.map(child => {
      const id = String(child.id)
      const dragging = visual?.sourceId === id
      const overBefore = visual?.overId === id && visual.position === 'before'
      const overAfter = visual?.overId === id && visual.position === 'after'

      return <div
        className="mai-context-v3-subtask mai-sortable-subtask"
        key={child.id}
        data-mai-subtask-id={id}
        data-subtask-dragging={dragging || undefined}
        data-subtask-over-before={overBefore || undefined}
        data-subtask-over-after={overAfter || undefined}
        onPointerDown={event => beginMouse(event, id)}
        onTouchStart={event => beginTouch(event, id)}
        onClickCapture={captureClick}
        onContextMenu={event => { if (visual?.sourceId === id) event.preventDefault() }}
      >
        <button
          type="button"
          className="mai-subtask-drag-handle"
          aria-label={`Reorganizar ${child.titulo}`}
          title="Segure e arraste para reorganizar"
          onClick={event => { event.preventDefault(); event.stopPropagation() }}
        ><span className="material-symbols-rounded">drag_indicator</span></button>
        <button type="button" className="mai-context-v3-subtask-check" data-done={child.concluida === true} style={!child.concluida ? { borderColor: priorityColor(child.prioridade) } : undefined} onClick={() => onToggle(id)}>{child.concluida ? '✓' : ''}</button>
        <button type="button" className="mai-context-v3-subtask-main" onClick={() => onOpen(id)}><strong>{child.titulo}</strong><small>{dateOnly(child.data_vencimento) ? `${formatDate(dateOnly(child.data_vencimento))} · tarefa com data` : 'Dentro desta tarefa'}</small></button>
        <MaiIcon name="chevron" size={13}/>
      </div>
    })}
  </div>
}
