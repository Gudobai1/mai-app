'use client'

import { useEffect, useRef, useState } from 'react'
import { isNativeApp } from '../../lib/native/native'
import { Icon } from '../ds'
import styles from './PullToRefresh.module.css'

/**
 * Puxar para atualizar (só no app Android): arrastar para baixo no topo da tela recarrega
 * os itens (dados da nuvem e do Google), sem recarregar a página inteira.
 */
const THRESHOLD = 72
const MAX = 120

function scrolledAncestor(node: EventTarget | null) {
  let el = node instanceof Element ? node : null
  while (el && el !== document.body && el !== document.documentElement) {
    const style = getComputedStyle(el)
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight && el.scrollTop > 0) return true
    el = el.parentElement
  }
  return false
}

export function PullToRefresh({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const start = useRef<number | null>(null)
  const pullRef = useRef(0)
  const busyRef = useRef(false)
  const refreshRef = useRef(onRefresh)
  refreshRef.current = onRefresh

  useEffect(() => {
    if (!isNativeApp()) return
    const set = (value: number) => { pullRef.current = value; setPull(value) }
    const onStart = (event: TouchEvent) => {
      const target = event.target as Element | null
      if (busyRef.current || event.touches.length !== 1 || window.scrollY > 0 || scrolledAncestor(target) || target?.closest?.('[role="dialog"], [aria-modal="true"], input, textarea, select, [contenteditable="true"]')) { start.current = null; return }
      start.current = event.touches[0].clientY
    }
    const onMove = (event: TouchEvent) => {
      if (start.current === null) return
      const delta = event.touches[0].clientY - start.current
      if (delta <= 0 || window.scrollY > 0) { if (pullRef.current) set(0); return }
      set(Math.min(MAX, delta * 0.5))
    }
    const onEnd = async () => {
      if (start.current === null) return
      start.current = null
      if (pullRef.current >= THRESHOLD * 0.5 + 6 && !busyRef.current) {
        busyRef.current = true
        setBusy(true)
        set(THRESHOLD * 0.6)
        try { await refreshRef.current() } catch {}
        busyRef.current = false
        setBusy(false)
      }
      set(0)
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('touchcancel', onEnd)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  if (!pull && !busy) return null
  const ready = pull >= THRESHOLD * 0.5 + 6
  return (
    <div className={styles.pull} style={{ transform: `translate(-50%, ${pull}px)`, opacity: Math.min(1, pull / 30) }} role="status" aria-live="polite" aria-label={busy ? 'Atualizando' : ready ? 'Solte para atualizar' : 'Puxe para atualizar'}>
      <span className={styles.spin} data-busy={busy || undefined} style={busy ? undefined : { transform: `rotate(${pull * 4}deg)` }}><Icon name="autorenew" size={20} filled={false} /></span>
    </div>
  )
}
