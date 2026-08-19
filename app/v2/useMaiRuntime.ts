'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addDays, plannerItems } from '../../lib/v2/planner'
import { dateKey, emptyState, flushRemoteSync, hydrateRemoteState, loadState, type MaiState, normalizeState, persistState, subscribeSyncStatus, type SyncStatus } from '../../lib/v2/state'

type Row = Record<string, any>
type Calendar = { id: string; nome: string; cor: string; primary?: boolean; acesso?: string }
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []

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
    if (!confirm('Desconectar Google Agenda e Drive deste navegador?')) return
    await fetch('/api/google/disconnect', { method: 'POST' })
    setGoogleConnected(false)
    setCalendars([])
    setState(current => ({ ...current, events: rows(current.events).filter(event => event.tipo !== 'google' && event.tipo !== 'gcalendar') }))
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

  function logout() {
    if (!confirm('Sair da conta? Os dados locais permanecem neste navegador.')) return
    localStorage.removeItem('mai-supabase-access-token')
    localStorage.removeItem('mai-supabase-refresh-token')
    router.push('/login')
  }

  return {
    state, setState, ready, today, googleConnected, calendars, calendarDraft, setCalendarDraft, calendarBusy,
    syncStatus, undoCount, installPrompt, importRef, commit, undo, googleRpc, syncCalendar, openGoogle,
    saveCalendars, disconnectGoogle, requestNotifications, install, exportData, importData, logout, flushRemoteSync,
  }
}
