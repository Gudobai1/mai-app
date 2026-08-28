'use client'

import { useEffect, useRef } from 'react'

type MaybePromise = void | Promise<void>

type Options<T> = {
  value: T | null | undefined
  enabled?: boolean
  delay?: number
  identity?: string
  save: (value: T) => MaybePromise
  serialize?: (value: T) => string
}

const shouldPersistNewItemImmediately = <T,>(value: T) => {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (record._persisted !== false) return false
  const label = String(record.nome ?? record.titulo ?? '').trim()
  return Boolean(label)
}

export function useAutosaveDraft<T>({ value, enabled = true, delay = 260, identity = '', save, serialize }: Options<T>) {
  const saveRef = useRef(save)
  const baselineRef = useRef('')
  const identityRef = useRef(identity)
  const readyRef = useRef(false)
  const latestValueRef = useRef<T | null | undefined>(value)
  const latestSnapshotRef = useRef('')
  const enabledRef = useRef(enabled)

  useEffect(() => { saveRef.current = save }, [save])

  useEffect(() => {
    if (identityRef.current === identity) return

    const latest = latestValueRef.current
    const snapshot = latestSnapshotRef.current
    if (enabledRef.current && latest != null && readyRef.current && snapshot && snapshot !== baselineRef.current) {
      baselineRef.current = snapshot
      void saveRef.current(latest)
    }

    identityRef.current = identity
    baselineRef.current = ''
    latestSnapshotRef.current = ''
    readyRef.current = false
  }, [identity])

  useEffect(() => {
    const previous = latestValueRef.current
    const previousSnapshot = latestSnapshotRef.current
    const wasEnabled = enabledRef.current

    latestValueRef.current = value
    enabledRef.current = enabled

    if (!enabled || value == null) {
      if (wasEnabled && previous != null && readyRef.current && previousSnapshot && previousSnapshot !== baselineRef.current) {
        baselineRef.current = previousSnapshot
        void saveRef.current(previous)
      }
      readyRef.current = false
      baselineRef.current = ''
      latestSnapshotRef.current = ''
      return
    }

    const snapshot = serialize ? serialize(value) : JSON.stringify(value)
    latestSnapshotRef.current = snapshot
    if (!readyRef.current) {
      readyRef.current = true
      baselineRef.current = snapshot
      return
    }
    if (snapshot === baselineRef.current) return

    // Itens novos precisam existir no estado assim que recebem um nome/título válido.
    // Depois da primeira persistência, o próprio editor marca _persisted=true e
    // as alterações seguintes voltam ao debounce normal do autosave.
    if (shouldPersistNewItemImmediately(value)) {
      baselineRef.current = snapshot
      void saveRef.current(value)
      return
    }

    const timer = window.setTimeout(() => {
      baselineRef.current = snapshot
      void saveRef.current(value)
    }, delay)

    return () => window.clearTimeout(timer)
  }, [value, enabled, delay, identity, serialize])

  useEffect(() => () => {
    const latest = latestValueRef.current
    if (!enabledRef.current || latest == null || !readyRef.current) return
    const snapshot = latestSnapshotRef.current
    if (!snapshot || snapshot === baselineRef.current) return
    baselineRef.current = snapshot
    void saveRef.current(latest)
  }, [])
}
