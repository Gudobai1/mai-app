'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addDays, plannerItems } from '../../lib/v2/planner'
import { dateKey, emptyState, flushRemoteSync, hydrateRemoteState, loadState, type MaiState, normalizeState, persistState, subscribeSyncStatus, type SyncStatus } from '../../lib/v2/state'
import { drivePreviewUrl, uploadDataUrlToDrive } from './DriveAsset'

type Row = Record<string, any>
type Calendar = { id: string; nome: string; cor: string; primary?: boolean; acesso?: string }
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
type AssetPath = Array<string | number>
type EmbeddedAsset = { path: AssetPath; dataUrl: string }
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const DATA_URL = /^data:([^;,]+)?(?:;[^,]*)?,/i

function findEmbeddedAsset(value: unknown, path: AssetPath = []): EmbeddedAsset | null {
  if (typeof value === 'string') return DATA_URL.test(value) ? { path, dataUrl: value } : null
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findEmbeddedAsset(value[index], [...path, index])
      if (found) return found
    }
    return null
  }
  if (!value || typeof value !== 'object') return null
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const found = findEmbeddedAsset(item, [...path, key])
    if (found) return found
  }
  return null
}

function valueAtPath(value: unknown, path: AssetPath): unknown {
  let cursor: any = value
  for (const part of path) {
    if (cursor == null) return undefined
    cursor = cursor[part as any]
  }
  return cursor
}

function replaceAtPath(value: unknown, path: AssetPath, replacement: string): unknown {
  if (!path.length) return replacement
  const [head, ...rest] = path
  if (Array.isArray(value)) {
    const next = [...value]
    next[Number(head)] = replaceAtPath(next[Number(head)], rest, replacement)
    return next
  }
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const next = { ...source }
  const key = String(head)
  next[key] = replaceAtPath(source[key], rest, replacement)
  return next
}

function mimeFromDataUrl(value: string) {
  return DATA_URL.exec(value)?.[1] || 'application/octet-stream'
}

function extensionFromMime(mime: string) {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/svg+xml') return 'svg'
  if (mime === 'text/plain') return 'txt'
  if (mime === 'application/pdf') return 'pdf'
  return (mime.split('/')[1] || 'bin').split('+')[0].replace(/[^a-z0-9]+/gi, '') || 'bin'
}

export function useMaiRuntime() {
  const router = useRouter()
  const [state, setState] = useState<MaiState>(() => emptyState())
  const [ready, setReady] = useState(false)
  const [today, setToday] = useState('')
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null)
  const [calendars, setCalendars] = useState<Calendar[]>([])
  const [calendarDraft, setCalendarDraft] = useState<string[]>([])
  const [calendarBusy, setCalendarBusy] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ phase: 'local', message: 'Salvo neste dispositivo' })
  const [undoCount, setUndoCount] = useState(0)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default')
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const history = useRef<MaiState[]>([])
  const importRef = useRef<HTMLInputElement>(null)
  const assetMigrations = useRef(new Set<string>())

  useEffect(() => {
    const saved = loadState()
    setToday(dateKey())
    setState(saved)
    setReady(true)
    const unsubscribe = subscribeSyncStatus(setSyncStatus)
    void hydrateRemoteState(saved).then(hydrated => {
      setState(current => Date.parse(String(current.meta?.updatedAt || '')) > Date.parse(String(hydrated.meta?.updatedAt || '')) ? current : hydrated)
      return checkGoogle(hydrated)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    document.documentElement.dataset.maiTheme = String(state.configs.theme || 'light')
    document.documentElement.dataset.maiAccent = String(state.configs.accentPalette || 'sage')
  }, [state.configs.theme, state.configs.accentPalette])

  // Regra global de persistência do MAI:
  // dados/configs/referências ficam no estado (cache + Supabase); bytes ficam no Drive.
  // Também migra automaticamente data URLs antigas deixadas por versões anteriores.
  useEffect(() => {
    if (!ready || googleConnected !== true) return
    const embedded = findEmbeddedAsset(state)
    if (!embedded || assetMigrations.current.has(embedded.dataUrl)) return
    assetMigrations.current.add(embedded.dataUrl)

    void (async () => {
      try {
        const mime = mimeFromDataUrl(embedded.dataUrl)
        const extension = extensionFromMime(mime)
        const asset = await uploadDataUrlToDrive(embedded.dataUrl, `MAI - asset-${Date.now()}.${extension}`, mime)
        const reference = drivePreviewUrl(asset.idDrive)
        setState(current => {
          if (valueAtPath(current, embedded.path) !== embedded.dataUrl) return current
          return persistState(replaceAtPath(current, embedded.path, reference) as MaiState)
        })
      } catch {
        // Mantém o conteúdo local para não perder dados; uma próxima alteração tenta novamente.
      } finally {
        assetMigrations.current.delete(embedded.dataUrl)
      }
    })()
  }, [ready, googleConnected, state])

  useEffect(() => {
    if ('Notification' in window) setNotificationPermission(Notification.permission)
    const install = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent) }
    window.addEventListener('beforeinstallprompt', install)
    const timer = window.setInterval(() => setToday(dateKey()), 60_000)
    return () => { window.removeEventListener('beforeinstallprompt', install); window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    if (!ready || !today || state.configs.notificationsEnabled !== true || notificationPermission !== 'granted' || !('Notification' in window)) return
    const notify = () => {
      const now = new Date()
      if (dateKey(now) !== today) return
      const current = now.getHours() * 60 + now.getMinutes()
      plannerItems(state, today, today).forEach(item => {
        if (item.completed || !item.time) return
        const [hour, minute] = item.time.split(':').map(Number)
        const difference = current - (hour * 60 + minute)
        const key = `mai-notified-${item.id}`
        if (difference < 0 || difference > 2 || localStorage.getItem(key)) return
        new Notification(`MAI · ${item.title}`, { body: `${item.subtitle} · ${item.time}`, icon: '/mai-icon.svg', tag: item.id })
        localStorage.setItem(key, new Date().toISOString())
      })
    }
    notify()
    const timer = window.setInterval(notify, 30_000)
    return () => window.clearInterval(timer)
  }, [notificationPermission, ready, state, today])

  function commit(change: (current: MaiState) => MaiState) {
    setUndoCount(count => Math.min(50, count + 1))
    setState(current => {
      history.current = [...history.current.slice(-49), current]
      return persistState(change(current))
    })
  }

  function undo() {
    const previous = history.current.pop()
    if (!previous) return
    setUndoCount(history.current.length)
    setState(persistState(previous))
  }

  async function googleRpc(method: string, args: unknown[] = []) {
    const response = await fetch('/api/google/rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, args }) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Não foi possível acessar o Google')
    return data.payload
  }

  async function checkGoogle(snapshot: MaiState) {
    try {
      const response = await fetch('/api/google/status', { cache: 'no-store' })
      const data = await response.json()
      const connected = data.connected === true
      setGoogleConnected(connected)
      if (connected) void syncCalendar(snapshot.configs.calendarios || [])
    } catch { setGoogleConnected(false) }
  }

  async function syncCalendar(ids: string[], startKey?: string, endKey?: string) {
    setCalendarBusy(true)
    try {
      const base = today || dateKey()
      const start = new Date(`${startKey || addDays(base, -14)}T00:00:00`)
      const end = new Date(`${endKey || addDays(base, 61)}T23:59:59`)
      const payload = await googleRpc('getGoogleCalendarPeriodo', [start.toISOString(), end.toISOString(), ids])
      const colors = new Map(calendars.map(item => [item.id, item.cor]))
      const nextEvents = rows(payload?.eventos).map(event => ({ ...event, calendarColor: colors.get(String(event.calendario_id)) || event.cor || '#4285f4' }))
      setState(current => ({ ...current, events: [...rows(current.events).filter(event => event.tipo !== 'google' && event.tipo !== 'gcalendar'), ...nextEvents] }))
    } catch {} finally { setCalendarBusy(false) }
  }

  async function openGoogle() {
    setCalendarBusy(true)
    try {
      const response = await fetch('/api/google/status', { cache: 'no-store' })
      const status = await response.json()
      const connected = status.connected === true
      setGoogleConnected(connected)
      if (!connected) return
      const list = await googleRpc('getListaCalendarios') as Calendar[]
      const safe = Array.isArray(list) ? list : []
      setCalendars(safe)
      const saved = state.configs.calendarios || []
      setCalendarDraft(saved.length ? saved : safe.filter(item => item.primary).map(item => item.id))
    } catch { setGoogleConnected(false) } finally { setCalendarBusy(false) }
  }

  async function saveCalendars() {
    commit(current => ({ ...current, configs: { ...current.configs, calendarios: calendarDraft } }))
    await syncCalendar(calendarDraft)
  }

  async function disconnectGoogle() {
    if (!confirm('Desconectar a conta Google e sair do MAI neste navegador?')) return
    await fetch('/api/google/disconnect', { method: 'POST' }).catch(() => null)
    localStorage.removeItem('mai-supabase-access-token')
    localStorage.removeItem('mai-supabase-refresh-token')
    setGoogleConnected(false)
    setCalendars([])
    router.replace('/login')
    router.refresh()
  }

  async function requestNotifications() {
    if (!('Notification' in window)) return alert('Este navegador não oferece notificações.')
    if (state.configs.notificationsEnabled === true && notificationPermission === 'granted') {
      commit(current => ({ ...current, configs: { ...current.configs, notificationsEnabled: false } }))
      return
    }
    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
    if (permission === 'granted') commit(current => ({ ...current, configs: { ...current.configs, notificationsEnabled: true } }))
  }

  async function install() {
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') setInstallPrompt(null)
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `mai-backup-${dateKey()}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function importData(file?: File) {
    if (!file || !confirm('Substituir os dados atuais pelo backup?')) return
    try { setState(persistState(normalizeState(JSON.parse(await file.text())))) }
    catch { alert('Backup inválido.') }
    finally { if (importRef.current) importRef.current.value = '' }
  }

  async function logout() {
    if (!confirm('Sair da conta? Os dados sincronizados permanecem no Supabase.')) return
    await fetch('/api/google/disconnect', { method: 'POST' }).catch(() => null)
    localStorage.removeItem('mai-supabase-access-token')
    localStorage.removeItem('mai-supabase-refresh-token')
    router.replace('/login')
    router.refresh()
  }

  return {
    state, setState, ready, today, googleConnected, calendars, calendarDraft, setCalendarDraft, calendarBusy,
    syncStatus, undoCount, installPrompt, importRef, commit, undo, googleRpc, syncCalendar, openGoogle,
    saveCalendars, disconnectGoogle, requestNotifications, install, exportData, importData, logout, flushRemoteSync,
  }
}
