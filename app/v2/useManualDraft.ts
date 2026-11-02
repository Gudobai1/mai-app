'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { askUnsaved } from './shell/unsaved'

type Options<T> = {
  value: T | null | undefined
  enabled?: boolean
  /** Muda quando o rascunho passa a ser outro item (reinicia a comparação). */
  identity?: string
  save: (value: T) => void | Promise<void>
  serialize?: (value: T) => string
  /** Como chamar o item no aviso (ex.: "hábito"). */
  what?: string
}

/**
 * Rascunho com salvamento manual: nada é gravado sozinho.
 * `dirty` indica alterações pendentes; `saveNow` grava; `requestClose` avisa antes de descartar.
 */
export function useManualDraft<T>({ value, enabled = true, identity = '', save, serialize, what = 'item' }: Options<T>) {
  const baseline = useRef('')
  const ready = useRef(false)
  const identityRef = useRef(identity)
  const latest = useRef<T | null | undefined>(value)
  const saveRef = useRef(save)
  saveRef.current = save
  latest.current = value
  const [, force] = useState(0)

  const snapshot = enabled && value != null ? (serialize ? serialize(value) : JSON.stringify(value)) : ''

  if (identityRef.current !== identity) { identityRef.current = identity; ready.current = false }
  if (!ready.current && snapshot) { ready.current = true; baseline.current = snapshot }

  const dirty = ready.current && Boolean(snapshot) && snapshot !== baseline.current
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot

  const saveNow = useCallback(async () => {
    const current = latest.current
    if (current == null) return
    await saveRef.current(current)
    baseline.current = snapshotRef.current
    force(count => count + 1)
  }, [])

  /** Fecha avisando se há alterações pendentes. */
  const requestClose = useCallback(async (close: () => void) => {
    if (dirtyRef.current) {
      const answer = await askUnsaved(what)
      if (answer === 'stay') return
      if (answer === 'save') await saveNow()
    }
    close()
  }, [saveNow, what])

  // Avisa ao fechar a aba com alterações pendentes.
  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  return { dirty, saveNow, requestClose }
}
