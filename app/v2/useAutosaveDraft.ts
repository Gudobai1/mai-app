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

export function useAutosaveDraft<T>({ value, enabled = true, delay = 260, identity = '', save, serialize }: Options<T>) {
  const saveRef = useRef(save)
  const baselineRef = useRef('')
  const identityRef = useRef(identity)
  const readyRef = useRef(false)
  const latestValueRef = useRef<T | null | undefined>(value)
  const latestSnapshotRef = useRef('')
  const enabledRef = useRef(enabled)

  useEffect(() => { saveRef.current = save }, [save])
  useEffect(() => { enabledRef.current = enabled }, [enabled])

  useEffect(() => {
    if (identityRef.current === identity) return
    identityRef.current = identity
    baselineRef.current = ''
    latestSnapshotRef.current = ''
    readyRef.current = false
  }, [identity])

  useEffect(() => {
    latestValueRef.current = value
    if (!enabled || value == null) {
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
