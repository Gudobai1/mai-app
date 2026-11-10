'use client'

import { applyAppearance } from '../ds'
import { isDarkMode, normalizeMode, normalizeTheme } from './theme'
import { logoDataUrl, themeLogoColor } from './logo'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { describeChange, type ChangeInfo } from '../../lib/v2/changes'
import { animateExit, trackItems } from '../../lib/v2/exit'
import { addDays } from '../../lib/v2/planner'
import { buildReminders, normalizeReminders, reminderTitle } from '../../lib/v2/reminders'
import { createTask, dateKey, emptyState, flushRemoteSync, hydrateRemoteState, loadState, type MaiState, normalizeState, persistState, subscribeSyncStatus, type SyncStatus } from '../../lib/v2/state'
import { drivePreviewUrl, uploadDataUrlToDrive } from './DriveAsset'
import { isNativeApp, nativePlugin, syncSystemBars } from '../../lib/native/native'

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
  const stateRef = useRef<MaiState>(state)
  stateRef.current = state
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const toastId = useRef(0)
  useEffect(() => trackItems(), [])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 6000)
    return () => window.clearTimeout(timer)
  }, [toast])
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
    const apply = () => {
      const root = document.documentElement
      if (root.dataset.maiTheme && (root.dataset.maiTheme !== (isDarkMode(state.configs.theme) ? 'dark' : 'light') || root.dataset.maiColor !== normalizeTheme(state.configs.accentColor))) {
        root.classList.add('mai-theme-fade')
        window.setTimeout(() => root.classList.remove('mai-theme-fade'), 320)
      }
      const dark = isDarkMode(state.configs.theme)
      document.documentElement.dataset.maiTheme = dark ? 'dark' : 'light'
      delete document.documentElement.dataset.maiAccent
      document.documentElement.dataset.maiColor = normalizeTheme(state.configs.accentColor)
      // Barra do navegador/PWA acompanha o tema escolhido no app.
      let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      if (!meta) {
        meta = document.createElement('meta')
        meta.name = 'theme-color'
        document.head.appendChild(meta)
      }
      meta.content = dark ? '#1E1E1E' : '#FFFFFF'
      applyLogoIcons(themeLogoColor(state.configs.accentColor))
      syncSystemBars()
    }
    apply()
    if (normalizeMode(state.configs.theme) !== 'system' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [state.configs.theme, state.configs.accentColor])

  // Aparência personalizada (ícones, fonte, cor): vale para o app todo.
  useEffect(() => { applyAppearance(state.configs.appearance) }, [state.configs.appearance])

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
    if (isNativeApp()) void nativePlugin('LocalNotifications')?.checkPermissions?.().then((result: { display?: string }) => setNotificationPermission(result?.display === 'granted' ? 'granted' : result?.display === 'denied' ? 'denied' : 'default')).catch(() => null)
    else if ('Notification' in window) setNotificationPermission(Notification.permission)
    const install = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent) }
    window.addEventListener('beforeinstallprompt', install)
    const timer = window.setInterval(() => setToday(dateKey()), 60_000)
    return () => { window.removeEventListener('beforeinstallprompt', install); window.clearInterval(timer) }
  }, [])

  // Navegador/desktop: avisa enquanto o app está aberto (regra única em lib/v2/reminders.ts).
  useEffect(() => {
    if (!ready || !today || state.configs.notificationsEnabled !== true || notificationPermission !== 'granted' || !('Notification' in window) || isNativeApp()) return
    const config = normalizeReminders(state.configs.reminders)
    const notify = () => {
      const now = Date.now()
      buildReminders(state, today, today, addDays(today, 8), config).forEach(reminder => {
        const key = `bukid-reminder-${reminder.id}-${new Date(reminder.at).toISOString()}`
        if (reminder.at > now || now - reminder.at > 120_000 || localStorage.getItem(key)) return
        new Notification(reminder.title, { body: reminder.body, icon: '/mai-icon.svg', tag: reminder.id, silent: config.look.silent })
        localStorage.setItem(key, new Date().toISOString())
      })
    }
    notify()
    const timer = window.setInterval(notify, 30_000)
    return () => window.clearInterval(timer)
  }, [notificationPermission, ready, state, today])

  // App Android: agenda os lembretes dos próximos 7 dias no sistema, para tocarem mesmo com o app fechado.
  useEffect(() => {
    if (!ready || !today || !isNativeApp()) return
    const plugin = nativePlugin('LocalNotifications')
    if (!plugin) return
    const timer = window.setTimeout(async () => {
      try {
        const pending = await plugin.getPending?.()
        if (pending?.notifications?.length) await plugin.cancel({ notifications: pending.notifications })
        if (state.configs.notificationsEnabled !== true || notificationPermission !== 'granted') return
        const now = Date.now()
        const notifications = buildReminders(state, today, today, addDays(today, 8), normalizeReminders(state.configs.reminders))
          .filter(reminder => reminder.at > now + 5_000 && reminder.at < now + 7 * 86_400_000)
          .slice(0, 60)
          .map(reminder => ({ id: Math.abs([...reminder.id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 7)) % 2_000_000_000 + 1, title: reminder.title, body: reminder.body, schedule: { at: new Date(reminder.at), allowWhileIdle: true } }))
        if (notifications.length) await plugin.schedule({ notifications })
      } catch { /* sem plugin ou sem permissão: o aviso por navegador não se aplica aqui */ }
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [notificationPermission, ready, state, today])

  // App Android: texto/link compartilhado de outro app vira tarefa na Entrada.
  useEffect(() => {
    if (!ready || !isNativeApp()) return
    const plugin = nativePlugin('BukidNative')
    if (!plugin) return
    const add = (share?: { title?: string; text?: string }) => {
      const text = String(share?.text || '').trim()
      const title = String(share?.title || '').trim()
      if (!text && !title) return
      const [first, ...rest] = (title || text).split(/\r?\n/)
      const task = createTask(first.slice(0, 140))
      const body = [title ? text : rest.join('\n')].join('').trim()
      commit(current => ({ ...current, tasks: [{ ...task, descricao: body }, ...current.tasks] }))
    }
    void Promise.resolve(plugin.getPendingShare?.()).then(add).catch(() => null)
    const handle = plugin.addListener?.('shareReceived', add)
    return () => { void Promise.resolve(handle).then(item => item?.remove?.()) }
  }, [ready]) // eslint-disable-line react-hooks/exhaustive-deps

  function commit(change: (current: MaiState) => MaiState) {
    const apply = () => {
      setUndoCount(count => Math.min(50, count + 1))
      setState(current => {
        history.current = [...history.current.slice(-49), current]
        return persistState(change(current))
      })
    }
    // Excluir/arquivar/concluir: o item sai com uma animação curta e aparece o botão "Desfazer".
    let info: ChangeInfo | null = null
    try { info = describeChange(stateRef.current, change(stateRef.current)) } catch { info = null }
    if (!info) return apply()
    const found = info
    const run = found.kind === 'complete' ? Promise.resolve() : animateExit(found.titles)
    void run.then(() => {
      apply()
      toastId.current += 1
      setToast({ id: toastId.current, text: found.text })
    })
  }

  function undo() {
    const previous = history.current.pop()
    if (!previous) return
    setToast(null)
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
    if (!confirm('Desconectar a conta Google e sair do Bukid neste navegador?')) return
    await fetch('/api/google/disconnect', { method: 'POST' }).catch(() => null)
    localStorage.removeItem('mai-supabase-access-token')
    localStorage.removeItem('mai-supabase-refresh-token')
    setGoogleConnected(false)
    setCalendars([])
    router.replace('/login')
    router.refresh()
  }

  /** Dispara um aviso agora, com o texto e a aparência configurados, para conferir se está funcionando. */
  async function testReminder() {
    const config = normalizeReminders(state.configs.reminders)
    const title = reminderTitle(config, 'Aviso de teste')
    const body = [config.look.project ? 'Projeto de exemplo' : '', config.look.time ? `às ${new Date().toTimeString().slice(0, 5)}` : ''].filter(Boolean).join(' · ') || 'Está funcionando'
    if (isNativeApp()) {
      const plugin = nativePlugin('LocalNotifications')
      if (!plugin) return alert('As notificações do app não estão disponíveis nesta versão.')
      await plugin.schedule({ notifications: [{ id: 2_000_000_001, title, body, schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true } }] })
      return
    }
    if (!('Notification' in window)) return alert('Este navegador não oferece notificações.')
    if (Notification.permission !== 'granted') return alert('Ative as notificações primeiro.')
    new Notification(title, { body, icon: '/mai-icon.svg', tag: 'bukid-teste', silent: config.look.silent })
  }

  async function requestNotifications() {
    if (isNativeApp()) {
      const plugin = nativePlugin('LocalNotifications')
      if (!plugin) return alert('As notificações do app não estão disponíveis nesta versão.')
      if (state.configs.notificationsEnabled === true && notificationPermission === 'granted') {
        commit(current => ({ ...current, configs: { ...current.configs, notificationsEnabled: false } }))
        return
      }
      const result = await plugin.requestPermissions()
      const granted = result?.display === 'granted'
      setNotificationPermission(granted ? 'granted' : 'denied')
      if (granted) commit(current => ({ ...current, configs: { ...current.configs, notificationsEnabled: true } }))
      return
    }
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

  /** Puxar para atualizar: recarrega só os dados (nuvem + Google), sem recarregar a página. */
  const refreshItems = async () => {
    await Promise.resolve(flushRemoteSync()).catch(() => null)
    const hydrated = await hydrateRemoteState(loadState())
    setState(current => Date.parse(String(current.meta?.updatedAt || '')) > Date.parse(String(hydrated.meta?.updatedAt || '')) ? current : hydrated)
    await checkGoogle(hydrated)
  }

  return {
    refreshItems, toast, dismissToast: () => setToast(null), state, setState, ready, today, googleConnected, calendars, calendarDraft, setCalendarDraft, calendarBusy,
    syncStatus, undoCount, installPrompt, importRef, commit, undo, googleRpc, syncCalendar, openGoogle,
    saveCalendars, disconnectGoogle, requestNotifications, testReminder, install, exportData, importData, logout, flushRemoteSync,
  }
}


/* Favicon e ícone de "adicionar à tela inicial" acompanham a cor do tema escolhido. */
function applyLogoIcons(color: string) {
  try {
    document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach(node => node.remove())
    const icon = document.createElement('link')
    icon.rel = 'icon'
    icon.type = 'image/svg+xml'
    icon.href = logoDataUrl(color)
    document.head.appendChild(icon)
    const image = new Image()
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 180
        canvas.height = 180
        canvas.getContext('2d')?.drawImage(image, 0, 0, 180, 180)
        const touch = document.createElement('link')
        touch.rel = 'apple-touch-icon'
        touch.href = canvas.toDataURL('image/png')
        document.head.appendChild(touch)
      } catch {}
    }
    image.src = logoDataUrl(color, false)
  } catch {}
}
