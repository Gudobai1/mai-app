'use client'

import { useCallback, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'

/**
 * "Mãozinha" das visualizações em colunas (docs/PADROES.md): no desktop, segurar o botão do mouse num espaço vazio e arrastar rola para o lado.
 * No celular nada muda (o arrastar do dedo já rola). Cartões, botões e campos continuam com o próprio comportamento.
 * Use: `const grab = useDragScroll()` e `<div {...grab} data-grab>`; o estilo vem de `no-underline.css` → `[data-grab]`.
 */
// Só campos de texto e cartões arrastáveis (mover item entre colunas) ficam de fora; botões e linhas também puxam o quadro.
const SKIP = 'input, textarea, select, [contenteditable="true"], [draggable="true"]'

export function useDragScroll() {
  const state = useRef<{ x: number; left: number; moved: boolean; id: number } | null>(null)
  const suppress = useRef(false)

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    if ((event.target as HTMLElement).closest(SKIP)) return
    state.current = { x: event.clientX, left: event.currentTarget.scrollLeft, moved: false, id: event.pointerId }
  }, [])

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const current = state.current
    if (!current) return
    const delta = event.clientX - current.x
    if (!current.moved && Math.abs(delta) > 4) {
      current.moved = true
      event.currentTarget.setPointerCapture(current.id)
      event.currentTarget.dataset.grabbing = 'true'
    }
    if (current.moved) event.currentTarget.scrollLeft = current.left - delta
  }, [])

  const onClickCapture = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (suppress.current) { event.preventDefault(); event.stopPropagation() }
  }, [])

  const end = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const current = state.current
    state.current = null
    delete event.currentTarget.dataset.grabbing
    if (current?.moved) {
      suppress.current = true
      window.setTimeout(() => { suppress.current = false }, 0)
      if (event.currentTarget.hasPointerCapture(current.id)) event.currentTarget.releasePointerCapture(current.id)
    }
  }, [])

  return { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end, onClickCapture }
}
