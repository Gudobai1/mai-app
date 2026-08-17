'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './mai-v2.module.css'
import { createTask, dateKey, emptyState, flushRemoteSync, hydrateRemoteState, LegacyTask, loadState, MaiState, nextRepeat, normalizeState, persistState, subscribeSyncStatus, SyncStatus } from '../../lib/v2/state'
import { AreaView, SecondaryView } from './V2Areas'
import { AgendaView } from './AgendaView'
import { PlannerItem, plannerItems } from '../../lib/v2/planner'

type View = 'inbox' | 'today' | 'upcoming' | SecondaryView | `project:${string}`
type Project = { id: string; name: string; color: string; parentId: string; order: number; sections: string[]; raw: CalendarEvent }
type Calendar = { id: string; nome: string; cor: string; primary?: boolean; acesso?: string }
type CalendarEvent = Record<string, unknown>
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const iconPaths: Record<string, string> = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  plus: 'M12 5v14M5 12h14',
  search: 'm20 20-4.5-4.5M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  inbox: 'M4 5h16v14H4zM4 14h5l2 3h2l2-3h5',
  today: 'M6 3v3m12-3v3M4 8h16v12H4zM8 12h4v4H8z',
  upcoming: 'M6 3v3m12-3v3M4 8h16v12H4zM8 12h8m-8 4h5',
  hash: 'M10 3 8 21m8-18-2 18M4 9h16M3 15h16',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6l-.04.08H10l-.04-.08a1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1l-.08-.04V10L4 9.96a1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.88L4.2 7.02 7.02 4.2l.06.06A1.7 1.7 0 0 0 8.96 4.6a1.7 1.7 0 0 0 1-.6l.04-.08h3.96L14 4a1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.08.4.3.75.6 1l.08.04V14L20 14.04c-.3.25-.52.6-.6.96Z',
  calendar: 'M6 3v3m12-3v3M4 8h16v12H4z',
  chevron: 'm9 18 6-6-6-6',
  close: 'M6 6l12 12M18 6 6 18',
  external: 'M14 4h6v6m0-6-9 9M20 13v7H4V4h7',
  sync: 'M20 7h-5V2M4 17h5v5M19 12a7 7 0 0 0-12-5l-2 2m0 3a7 7 0 0 0 12 5l2-2',
  trash: 'M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  habits: 'M17 2l4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3',
  goals: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-5a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-3a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  notes: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  finance: 'M3 6h16v14H3zM3 9h18v7h-5a3 3 0 0 1 0-6h5',
  health: 'M12 21S3 15.5 3 9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 9 2.5C21 15.5 12 21 12 21Z',
  files: 'M3 6h7l2 2h9v11H3z',
}

const secondaryAreas: { id: SecondaryView; label: string; icon: string }[] = [
  { id: 'habits', label: 'Rotinas', icon: 'habits' },
  { id: 'goals', label: 'Metas', icon: 'goals' },
  { id: 'notes', label: 'Notas', icon: 'notes' },
  { id: 'finance', label: 'Finanças', icon: 'finance' },
  { id: 'health', label: 'Bem-estar', icon: 'health' },
  { id: 'files', label: 'Arquivos', icon: 'files' },
]

function Icon({ name, size = 19 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={iconPaths[name]} />
    </svg>
  )
}

const rows = (value: unknown) => Array.isArray(value) ? value as CalendarEvent[] : []
const taskDate = (task: LegacyTask) => String(task.data_vencimento || '').slice(0, 10)
const taskTime = (task: LegacyTask) => String(task.data_vencimento || '').includes('T') ? String(task.data_vencimento).slice(11, 16) : ''

function addDays(key: string, amount: number) {
  const date = new Date(`${key}T12:00:00`)
  date.setDate(date.getDate() + amount)
  return dateKey(date)
}

function formatDate(key: string, options: Intl.DateTimeFormatOptions) {
  return new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR', options)
}

function projectList(value: unknown): Project[] {
  return rows(value)
    .filter(item => item.ativo !== false)
    .map((item, index) => ({
      id: String(item.id || `projeto-${index}`),
      name: String(item.nome || item.name || 'Projeto sem nome'),
      color: String(item.cor || item.color || ['#7a8f72', '#8d786b', '#6f8398', '#8c7b9b'][index % 4]),
      parentId: String(item.parent_id || ''),
      order: Number(item.ordem ?? index),
      sections: Array.isArray(item.secoes) ? item.secoes.map(String) : [],
      raw: item,
    }))
    .sort((a, b) => a.order - b.order)
}

function sameProject(task: LegacyTask, projectId: string) {
  return String(task.projeto_id || 'entrada') === projectId
}

export function MaiV2App() {
  const router = useRouter()
  const [state, setState] = useState<MaiState>(() => emptyState())
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<View>('today')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDate, setDraftDate] = useState('')
  const [draftProject, setDraftProject] = useState('entrada')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [subtaskDraft, setSubtaskDraft] = useState('')
  const [taskNoteDraft, setTaskNoteDraft] = useState('')
  const [taskAttachmentBusy, setTaskAttachmentBusy] = useState(false)
  const [selectedSubtaskId, setSelectedSubtaskId] = useState<string | null>(null)
  const [nestedSubtaskDraft, setNestedSubtaskDraft] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [areasOpen, setAreasOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null)
  const [calendars, setCalendars] = useState<Calendar[]>([])
  const [calendarDraft, setCalendarDraft] = useState<string[]>([])
  const [calendarBusy, setCalendarBusy] = useState(false)
  const [today, setToday] = useState('')
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ phase: 'local', message: 'Salvo neste dispositivo' })
  const [projectDraft, setProjectDraft] = useState<CalendarEvent | null>(null)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickRequest, setQuickRequest] = useState('')
  const [agendaCreateRequest, setAgendaCreateRequest] = useState(0)
  const [todaySettingsOpen, setTodaySettingsOpen] = useState(false)
  const [taskPriorityFilter, setTaskPriorityFilter] = useState('all')
  const [taskListSort, setTaskListSort] = useState('manual')
  const [undoCount, setUndoCount] = useState(0)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default')
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const quickInput = useRef<HTMLInputElement>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const historyRef = useRef<MaiState[]>([])

  const projects = useMemo(() => projectList(state.projects), [state.projects])
  const openTasks = useMemo(() => state.tasks.filter(task => !task.concluida), [state.tasks])
  const completedTasks = useMemo(() => state.tasks.filter(task => task.concluida), [state.tasks])
  const selectedTask = useMemo(() => state.tasks.find(task => task.id === selectedTaskId) || null, [state.tasks, selectedTaskId])
  const selectedSubtask = useMemo(() => rows(selectedTask?.subtarefas).find(item => String(item.id) === selectedSubtaskId) || null, [selectedTask, selectedSubtaskId])
  const isSecondary = secondaryAreas.some(area => area.id === view)
  const todayPlan = useMemo(() => today ? plannerItems(state, today, today) : [], [state, today])

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
  }, [state.configs.theme])

  useEffect(() => {
    if ('Notification' in window) setNotificationPermission(Notification.permission)
    const onInstall = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onInstall)
    const dayTimer = window.setInterval(() => setToday(dateKey()), 60_000)
    return () => {
      window.removeEventListener('beforeinstallprompt', onInstall)
      window.clearInterval(dayTimer)
    }
  }, [])

  useEffect(() => {
    if (!ready || !today || state.configs.notificationsEnabled !== true || notificationPermission !== 'granted' || !('Notification' in window)) return
    const notifyDueItems = () => {
      const now = new Date()
      if (dateKey(now) !== today) return
      const currentMinute = now.getHours() * 60 + now.getMinutes()
      plannerItems(state, today, today).forEach(item => {
        if (item.completed || !item.time) return
        const [hour, minute] = item.time.split(':').map(Number)
        const difference = currentMinute - (hour * 60 + minute)
        const storageKey = `mai-notified-${item.id}`
        if (difference < 0 || difference > 2 || localStorage.getItem(storageKey)) return
        const kindLabel = ({ task: 'Tarefa', event: 'Compromisso', habit: 'Rotina', finance: 'Finanças', goal: 'Meta' } as const)[item.kind]
        new Notification(`MAI · ${item.title}`, { body: `${item.subtitle || kindLabel} · ${item.time}`, icon: '/mai-icon.svg', tag: item.id })
        localStorage.setItem(storageKey, new Date().toISOString())
      })
    }
    notifyDueItems()
    const timer = window.setInterval(notifyDueItems, 30_000)
    return () => window.clearInterval(timer)
  }, [notificationPermission, ready, state, today])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
      const target = event.target as HTMLElement | null
      const editing = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName || '')
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !editing) {
        event.preventDefault()
        undoLast()
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'q' && !editing) {
        event.preventDefault()
        setQuickAddOpen(value => !value)
      }
      if (event.key === 'Escape') {
        setSearchOpen(false)
        setSettingsOpen(false)
        setSelectedTaskId(null)
        setProjectDraft(null)
        setQuickAddOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function commit(change: (current: MaiState) => MaiState) {
    setUndoCount(count => Math.min(count + 1, 50))
    setState(current => {
      historyRef.current = [...historyRef.current.slice(-49), current]
      return persistState(change(current))
    })
  }

  function undoLast() {
    const previous = historyRef.current.pop()
    if (!previous) return
    setUndoCount(historyRef.current.length)
    setState(persistState(previous))
  }

  async function requestNotifications() {
    if (!('Notification' in window)) { alert('Este navegador não oferece notificações para aplicativos web.'); return }
    if (state.configs.notificationsEnabled === true && notificationPermission === 'granted') {
      commit(current => ({ ...current, configs: { ...current.configs, notificationsEnabled: false } }))
      return
    }
    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
    if (permission === 'granted') commit(current => ({ ...current, configs: { ...current.configs, notificationsEnabled: true } }))
    else alert('Permita notificações nas configurações do navegador para receber lembretes.')
  }

  async function installApp() {
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') setInstallPrompt(null)
  }

  async function googleRpc(method: string, args: unknown[] = []) {
    const response = await fetch('/api/google/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method, args }),
    })
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
      if (connected) void syncCalendarEvents(snapshot.configs.calendarios || [])
    } catch {
      setGoogleConnected(false)
    }
  }

  async function syncCalendarEvents(calendarIds: string[], rangeStart?: string, rangeEnd?: string) {
    setCalendarBusy(true)
    try {
      const baseDay = today || dateKey()
      const start = new Date(`${rangeStart || addDays(baseDay, -14)}T00:00:00`)
      const end = new Date(`${rangeEnd || addDays(baseDay, 61)}T23:59:59`)
      const payload = await googleRpc('getGoogleCalendarPeriodo', [start.toISOString(), end.toISOString(), calendarIds])
      const colors = new Map(calendars.map(calendar => [calendar.id, calendar.cor]))
      const nextEvents = (Array.isArray(payload?.eventos) ? payload.eventos : []).map((event: CalendarEvent) => ({ ...event, calendarColor: colors.get(String(event.calendario_id)) || event.cor || '#4285f4' }))
      setState(current => ({ ...current, events: [...rows(current.events).filter(event => event.tipo !== 'google' && event.tipo !== 'gcalendar'), ...nextEvents] }))
    } catch {
      // A lista local continua disponível caso a rede ou o Google falhe.
    } finally {
      setCalendarBusy(false)
    }
  }

  async function openGoogleSettings() {
    setSettingsOpen(true)
    setCalendarBusy(true)
    try {
      const response = await fetch('/api/google/status', { cache: 'no-store' })
      const status = await response.json()
      const connected = status.connected === true
      setGoogleConnected(connected)
      if (!connected) return
      const list = await googleRpc('getListaCalendarios') as Calendar[]
      const safeList = Array.isArray(list) ? list : []
      setCalendars(safeList)
      const saved = state.configs.calendarios || []
      setCalendarDraft(saved.length ? saved : safeList.filter(calendar => calendar.primary).map(calendar => calendar.id))
    } catch {
      setGoogleConnected(false)
    } finally {
      setCalendarBusy(false)
    }
  }

  async function saveCalendars() {
    commit(current => ({
      ...current,
      configs: { ...current.configs, calendarios: calendarDraft },
    }))
    setSettingsOpen(false)
    await syncCalendarEvents(calendarDraft)
  }

  async function disconnectGoogle() {
    if (!confirm('Desconectar Google Agenda e Drive deste navegador?')) return
    await fetch('/api/google/disconnect', { method: 'POST' })
    setGoogleConnected(false)
    setCalendars([])
    setState(current => ({ ...current, events: rows(current.events).filter(event => event.tipo !== 'google' && event.tipo !== 'gcalendar') }))
  }

  function toggleTheme() {
    commit(current => ({ ...current, configs: { ...current.configs, theme: current.configs.theme === 'dark' ? 'light' : 'dark' } }))
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
    if (!file || !confirm('Substituir os dados atuais pelo conteúdo deste backup?')) return
    try {
      const next = persistState(normalizeState(JSON.parse(await file.text())))
      setState(next)
      setSettingsOpen(false)
    } catch { alert('Este arquivo não é um backup válido do MAI.') }
    finally { if (importInput.current) importInput.current.value = '' }
  }

  function logout() {
    if (!confirm('Sair da conta do MAI? Seus dados locais serão mantidos.')) return
    localStorage.removeItem('mai-supabase-access-token')
    localStorage.removeItem('mai-supabase-refresh-token')
    router.push('/login')
  }

  function navigate(next: View) {
    setView(next)
    setSidebarOpen(false)
    setSelectedTaskId(null)
    setShowCompleted(false)
    if (next === 'today') setDraftDate(today || dateKey())
    else if (next === 'upcoming') setDraftDate(addDays(today || dateKey(), 1))
    else setDraftDate('')
    if (next.startsWith('project:')) setDraftProject(next.slice(8))
    else setDraftProject('entrada')
  }

  function openComposer() {
    if (view === 'today' && !draftDate) setDraftDate(today || dateKey())
    if (view === 'upcoming' && !draftDate) setDraftDate(addDays(today || dateKey(), 1))
    if (view.startsWith('project:')) setDraftProject(view.slice(8))
    setComposerOpen(true)
    requestAnimationFrame(() => quickInput.current?.focus())
  }

  function addTask(event: FormEvent) {
    event.preventDefault()
    const title = draftTitle.trim()
    if (!title) return
    const task: LegacyTask = {
      ...createTask(title),
      data_vencimento: draftDate,
      projeto_id: draftProject || 'entrada',
    }
    commit(current => ({ ...current, tasks: [...current.tasks, task] }))
    setDraftTitle('')
    setComposerOpen(false)
  }

  function updateTask(id: string, patch: Partial<LegacyTask>) {
    commit(current => ({
      ...current,
      tasks: current.tasks.map(task => task.id === id ? { ...task, ...patch } : task),
    }))
  }

  function toggleTask(id: string) {
    commit(current => ({
      ...current,
      tasks: current.tasks.map(task => {
        if (task.id !== id) return task
        if (!task.concluida && task.repeticao && task.data_vencimento) return {
          ...task,
          data_vencimento: nextRepeat(task.data_vencimento, task.repeticao),
          concluida: false,
          concluida_em: new Date().toISOString(),
          subtarefas: rows(task.subtarefas).map(subtask => ({ ...subtask, concluida: false })),
        }
        return { ...task, concluida: !task.concluida, concluida_em: !task.concluida ? new Date().toISOString() : '' }
      }),
    }))
  }

  function deleteTask(id: string) {
    if (!window.confirm('Excluir esta tarefa?')) return
    commit(current => ({ ...current, tasks: current.tasks.filter(task => task.id !== id) }))
    setSelectedTaskId(null)
  }

  function addSubtask() {
    if (!selectedTask || !subtaskDraft.trim()) return
    updateTask(selectedTask.id, { subtarefas: [...rows(selectedTask.subtarefas), { id: `sub-${crypto.randomUUID()}`, titulo: subtaskDraft.trim(), concluida: false }] })
    setSubtaskDraft('')
  }

  function toggleSubtask(subtaskId: unknown) {
    if (!selectedTask) return
    updateTask(selectedTask.id, { subtarefas: rows(selectedTask.subtarefas).map(item => String(item.id) === String(subtaskId) ? { ...item, concluida: !item.concluida } : item) })
  }

  function removeSubtask(subtaskId: unknown) {
    if (!selectedTask) return
    updateTask(selectedTask.id, { subtarefas: rows(selectedTask.subtarefas).filter(item => String(item.id) !== String(subtaskId)) })
  }

  function updateSubtask(subtaskId: unknown, patch: CalendarEvent) {
    if (!selectedTask) return
    updateTask(selectedTask.id, { subtarefas: rows(selectedTask.subtarefas).map(item => String(item.id) === String(subtaskId) ? { ...item, ...patch } : item) })
  }

  function addNestedSubtask() {
    if (!selectedSubtask || !nestedSubtaskDraft.trim()) return
    updateSubtask(selectedSubtask.id, { subtarefas: [...rows(selectedSubtask.subtarefas), { id: `sub-${crypto.randomUUID()}`, titulo: nestedSubtaskDraft.trim(), concluida: false, descricao: '', data_vencimento: '', prioridade: 4, anexos: [] }] })
    setNestedSubtaskDraft('')
  }

  function addTaskNote() {
    if (!selectedTask || !taskNoteDraft.trim()) return
    updateTask(selectedTask.id, { notas: [...rows(selectedTask.notas), { id: `tn-${crypto.randomUUID()}`, texto: taskNoteDraft.trim(), data: new Date().toISOString() }] })
    setTaskNoteDraft('')
  }

  async function uploadTaskAttachment(file?: File) {
    if (!selectedTask || !file) return
    setTaskAttachmentBusy(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file) })
      const result = await googleRpc('salvarAnexoDrive', [dataUrl, file.name, file.type])
      const item = result?.item || result
      updateTask(selectedTask.id, { anexos: [...rows(selectedTask.anexos), { idDrive: item.id || item.idDrive, nome: item.name || item.nome || file.name, tipo: item.tipo || file.type, url: item.url || item.webViewLink || '' }] })
    } finally { setTaskAttachmentBusy(false) }
  }

  async function renameTaskAttachment(file: CalendarEvent, index: number) {
    if (!selectedTask || !file.idDrive) return
    const name = prompt('Novo nome do arquivo:', String(file.nome || file.name || ''))
    if (!name?.trim()) return
    await googleRpc('renomearDriveItem', [file.idDrive, name.trim()])
    updateTask(selectedTask.id, { anexos: rows(selectedTask.anexos).map((item, position) => position === index ? { ...item, nome: name.trim() } : item) })
  }

  async function removeTaskAttachment(file: CalendarEvent, index: number) {
    if (!selectedTask) return
    if (file.idDrive && confirm('Também mover este arquivo para a lixeira do Google Drive?')) await googleRpc('trashDriveItem', [file.idDrive]).catch(() => null)
    updateTask(selectedTask.id, { anexos: rows(selectedTask.anexos).filter((_, position) => position !== index) })
  }

  async function convertTaskToEvent() {
    if (!selectedTask) return
    if (!googleConnected) { await openGoogleSettings(); return }
    const day = taskDate(selectedTask) || today
    const time = taskTime(selectedTask) || '09:00'
    await googleRpc('salvarEventoAgenda', [{ titulo: selectedTask.titulo, descricao: selectedTask.descricao || '', data_inicio: day, hora_inicio: time, hora_fim: time, dia_inteiro: !taskTime(selectedTask), repeticao: selectedTask.repeticao || '', calendario_id: state.configs.calendarios?.[0] || 'primary' }])
    commit(current => ({ ...current, tasks: current.tasks.filter(task => task.id !== selectedTask.id) }))
    setSelectedTaskId(null)
    await syncCalendarEvents(state.configs.calendarios || [])
  }

  function reorderTasks(sourceId: string, targetId: string) {
    if (sourceId === targetId) return
    commit(current => { const list = [...current.tasks]; const source = list.findIndex(task => task.id === sourceId); const target = list.findIndex(task => task.id === targetId); if (source < 0 || target < 0) return current; const [moved] = list.splice(source, 1); list.splice(target, 0, moved); return { ...current, tasks: list.map((task, index) => ({ ...task, ordem: index })) } })
  }

  function addProject(event: FormEvent) {
    event.preventDefault()
    const name = newProjectName.trim()
    if (!name) return
    const id = `p-${crypto.randomUUID()}`
    const project = { id, nome: name, cor: '#73866c', ativo: true, criado_em: new Date().toISOString() }
    commit(current => ({ ...current, projects: [...rows(current.projects), project] }))
    setNewProjectName('')
    setNewProjectOpen(false)
    navigate(`project:${id}`)
  }

  const projectId = view.startsWith('project:') ? view.slice(8) : ''
  const activeProject = projects.find(project => project.id === projectId)
  const areaLabel = secondaryAreas.find(area => area.id === view)?.label
  const viewTitle = view === 'inbox' ? 'Entrada' : view === 'today' ? 'Hoje' : view === 'upcoming' ? 'Em breve' : areaLabel || activeProject?.name || 'Projeto'
  const viewSubtitle = view === 'today' && today
    ? formatDate(today, { weekday: 'long', day: 'numeric', month: 'long' })
    : view === 'upcoming' ? 'Próximos 14 dias' : ''
  const inboxTasks = openTasks.filter(task => sameProject(task, 'entrada'))
  const overdueTasks = openTasks.filter(task => taskDate(task) && taskDate(task) < today).sort((a, b) => taskDate(a).localeCompare(taskDate(b)))
  const todayTasks = openTasks.filter(task => taskDate(task) === today)
  const todaySections = (Array.isArray(state.configs.todaySections) ? state.configs.todaySections : ['tasks', 'events', 'habits', 'finance', 'goals', 'health']).map(String)
  const todaySort = String(state.configs.todaySort || 'time')
  const sortedTodayTasks = [...todayTasks].sort((a, b) => todaySort === 'priority' ? Number(a.prioridade || 4) - Number(b.prioridade || 4) : todaySort === 'name' ? a.titulo.localeCompare(b.titulo, 'pt-BR') : taskTime(a).localeCompare(taskTime(b)))
  const projectTasks = openTasks.filter(task => sameProject(task, projectId))
  const visibleCompleted = completedTasks.filter(task => {
    if (isSecondary) return false
    if (view === 'inbox') return sameProject(task, 'entrada')
    if (view === 'today') return taskDate(task) === today
    if (view.startsWith('project:')) return sameProject(task, projectId)
    return taskDate(task) > today && taskDate(task) <= addDays(today, 14)
  })

  const healthGoals = (state.health as Record<string, any>)?.goals || {}
  const healthDiary = (state.health as Record<string, any>)?.diary || {}
  const searchResults = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR')
    if (!query) return []
    const clean = (value: unknown) => String(value || '').replace(/<[^>]*>/g, ' ')
    const matches = (...values: unknown[]) => values.map(clean).join(' ').toLocaleLowerCase('pt-BR').includes(query)
    return [
      ...state.tasks.filter(task => matches(task.titulo, task.descricao)).map(task => ({ id: task.id, kind: 'task', title: task.titulo, meta: taskDate(task) || 'Sem data' })),
      ...projects.filter(project => matches(project.name)).map(project => ({ id: project.id, kind: 'project', title: project.name, meta: 'Projeto' })),
      ...rows(state.events).filter(item => matches(item.titulo, item.descricao)).map(item => ({ id: String(item.id), kind: 'event', title: String(item.titulo || 'Compromisso'), meta: `${String(item.data_inicio || '').slice(0, 10)} · Agenda` })),
      ...rows(state.habits).filter(item => matches(item.nome)).map(item => ({ id: String(item.id), kind: 'habits', title: String(item.nome), meta: 'Rotina' })),
      ...rows(state.goals).filter(item => matches(item.titulo, item.descricao)).map(item => ({ id: String(item.id), kind: 'goals', title: String(item.titulo || item.nome), meta: 'Meta' })),
      ...rows(state.notes).filter(item => matches(item.titulo, item.conteudo)).map(item => ({ id: String(item.id), kind: 'notes', title: String(item.titulo || 'Sem título'), meta: 'Nota' })),
      ...rows(state.finance.transactions).filter(item => matches(item.titulo, item.observacao, item.categoria)).map(item => ({ id: String(item.id), kind: 'finance', title: String(item.titulo || 'Lançamento'), meta: 'Finanças' })),
      ...rows(state.health.trackers).filter(item => matches(item.nome, item.categoria)).map(item => ({ id: String(item.id), kind: 'health', title: String(item.nome), meta: 'Bem-estar' })),
    ].slice(0, 40)
  }, [search, state, projects])

  function openSearchResult(result: { id: string; kind: string }) {
    setSearchOpen(false)
    setSearch('')
    if (result.kind === 'task') setSelectedTaskId(result.id)
    else if (result.kind === 'project') navigate(`project:${result.id}`)
    else if (result.kind === 'event') navigate('upcoming')
    else navigate(result.kind as SecondaryView)
  }

  function quickAdd(type: string) {
    setQuickAddOpen(false)
    if (type === 'task') { openComposer(); return }
    if (type === 'event') { navigate('upcoming'); setAgendaCreateRequest(value => value + 1); return }
    const target = type as SecondaryView
    navigate(target)
    setQuickRequest(`${type}:${Date.now()}`)
  }

  function saveProject(event: FormEvent) {
    event.preventDefault()
    if (!projectDraft) return
    const name = String(projectDraft.nome || '').trim()
    if (!name) return
    const sections = String(projectDraft.sectionText || '').split('\n').map(value => value.trim()).filter(Boolean)
    const next: CalendarEvent = { ...projectDraft, id: projectDraft.id || `p-${crypto.randomUUID()}`, nome: name, secoes: sections, parent_id: projectDraft.parent_id || '', ordem: Number(projectDraft.ordem ?? projects.length), cor: projectDraft.cor || '#73866c', ativo: true }
    delete next.sectionText
    commit(current => ({ ...current, projects: rows(current.projects).some(item => String(item.id) === String(next.id)) ? rows(current.projects).map(item => String(item.id) === String(next.id) ? next : item) : [...rows(current.projects), next] }))
    setProjectDraft(null)
  }

  function projectDepth(project: Project) {
    let depth = 0; let parent = project.parentId; const visited = new Set<string>()
    while (parent && depth < 4 && !visited.has(parent)) { visited.add(parent); depth += 1; parent = projects.find(item => item.id === parent)?.parentId || '' }
    return depth
  }

  function deleteProject() {
    if (!projectDraft?.id || !confirm('Excluir este projeto? As tarefas serão movidas para a Entrada.')) return
    const id = String(projectDraft.id)
    commit(current => ({ ...current, projects: rows(current.projects).filter(item => String(item.id) !== id).map(item => String(item.parent_id || '') === id ? { ...item, parent_id: '' } : item), tasks: current.tasks.map(task => String(task.projeto_id) === id ? { ...task, projeto_id: 'entrada', secao: '' } : task) }))
    setProjectDraft(null)
    navigate('inbox')
  }

  function TaskRow({ task }: { task: LegacyTask }) {
    const due = taskDate(task)
    const project = projects.find(item => item.id === String(task.projeto_id))
    return (
      <div className={styles.taskRow} data-completed={task.concluida === true} draggable onDragStart={event => event.dataTransfer.setData('text/mai-task', task.id)} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); reorderTasks(event.dataTransfer.getData('text/mai-task'), task.id) }}>
        <button
          className={styles.check}
          data-priority={task.prioridade || 4}
          onClick={() => toggleTask(task.id)}
          aria-label={task.concluida ? 'Reabrir tarefa' : 'Concluir tarefa'}
        >{task.concluida ? '✓' : ''}</button>
        <button className={styles.taskBody} onClick={() => setSelectedTaskId(task.id)}>
          <strong>{task.titulo}</strong>
          {task.descricao && <span className={styles.description}>{task.descricao}</span>}
          <span className={styles.taskMeta}>
            {due && <em data-overdue={!task.concluida && due < today}>{due === today ? 'Hoje' : formatDate(due, { day: 'numeric', month: 'short' })}{taskTime(task) ? ` · ${taskTime(task)}` : ''}</em>}
            {project && <em><i style={{ background: project.color }} />{project.name}</em>}
          </span>
        </button>
        <button className={styles.rowAction} onClick={() => setSelectedTaskId(task.id)} aria-label="Abrir detalhes"><Icon name="more" /></button>
      </div>
    )
  }

  function ContextRow({ item }: { item: { id: string; title: string; meta: string; target: SecondaryView } }) {
    return <button className={styles.contextRow} onClick={() => navigate(item.target)}><span>○</span><span><strong>{item.title}</strong><small>{item.meta}</small></span><b>›</b></button>
  }

  function togglePlannerItem(item: PlannerItem) {
    if (item.kind === 'task') { toggleTask(item.sourceId); return }
    if (item.kind === 'habit') {
      commit(current => { const entries = rows(current.habitEntries); const exists = entries.some(entry => String(entry.habito_id) === item.sourceId && String(entry.data).slice(0, 10) === item.date); return { ...current, habitEntries: exists ? entries.filter(entry => !(String(entry.habito_id) === item.sourceId && String(entry.data).slice(0, 10) === item.date)) : [...entries, { id: `reg-${crypto.randomUUID()}`, habito_id: item.sourceId, data: item.date, valor: Number(item.raw.meta || 1), criado_em: new Date().toISOString() }] } })
      return
    }
    if (item.kind === 'event') {
      const key = `${item.sourceId}|${item.date}|${item.time || ''}`
      commit(current => { const completions = rows(current.eventCompletions); const exists = completions.some(entry => entry.chave === key); return { ...current, eventCompletions: exists ? completions.filter(entry => entry.chave !== key) : [...completions, { chave: key, evento_id: item.sourceId, data: item.date, hora: item.time, concluida: true, atualizado_em: new Date().toISOString() }] } })
      return
    }
    if (item.kind === 'goal') {
      commit(current => ({ ...current, goals: rows(current.goals).map(goal => String(goal.id) === item.sourceId ? { ...goal, status: 'Concluída', progresso_atual: Number(goal.progresso_total || goal.progresso_atual || 100) } : goal) }))
      return
    }
    if (item.raw.fixo_id) {
      const key = `${item.raw.fixo_id}|${item.date.slice(0, 7)}`
      commit(current => { const list = rows(current.finance.fixedOccurrences); const next = { chave: key, fixo_id: item.raw.fixo_id, competencia: item.date.slice(0, 7), status: item.completed ? 'pendente' : 'pago', valor_pago: item.completed ? 0 : Number(item.raw.valor || 0) }; return { ...current, finance: { ...current.finance, fixedOccurrences: list.some(entry => entry.chave === key) ? list.map(entry => entry.chave === key ? { ...entry, ...next } : entry) : [...list, next] } } })
    } else commit(current => ({ ...current, finance: { ...current.finance, transactions: rows(current.finance.transactions).map(transaction => String(transaction.id) === item.sourceId ? { ...transaction, status: item.completed ? 'pendente' : 'pago', valor_pago: item.completed ? 0 : Number(transaction.valor || 0) } : transaction) } }))
  }

  function TodayPlannerRow({ item }: { item: PlannerItem }) {
    const target: SecondaryView = item.kind === 'habit' ? 'habits' : item.kind === 'finance' ? 'finance' : item.kind === 'goal' ? 'goals' : 'notes'
    return <div className={styles.todayPlannerRow} data-completed={item.completed}><button style={{ borderColor: item.color, background: item.completed ? item.color : '' }} onClick={() => togglePlannerItem(item)}>{item.completed ? '✓' : ''}</button><button onClick={() => item.kind === 'event' ? navigate('upcoming') : navigate(target)}><strong>{item.title}</strong><small>{item.time ? `${item.time} · ` : ''}{item.subtitle}{item.recurring ? ' · recorrente' : ''}</small></button>{item.kind === 'event' && item.raw.url && <a href={String(item.raw.url)} target="_blank" rel="noreferrer"><Icon name="external" size={14} /></a>}</div>
  }

  function organizeTasks(list: LegacyTask[]) {
    const filtered = taskPriorityFilter === 'all' ? [...list] : list.filter(task => Number(task.prioridade || 4) === Number(taskPriorityFilter))
    return filtered.sort((a, b) => taskListSort === 'date' ? taskDate(a).localeCompare(taskDate(b)) : taskListSort === 'priority' ? Number(a.prioridade || 4) - Number(b.prioridade || 4) : taskListSort === 'name' ? a.titulo.localeCompare(b.titulo, 'pt-BR') : Number(a.ordem || 0) - Number(b.ordem || 0))
  }

  function TaskListToolbar() {
    return <div className={styles.taskListToolbar}><select value={taskPriorityFilter} onChange={event => setTaskPriorityFilter(event.target.value)}><option value="all">Todas as prioridades</option><option value="1">P1 · Urgente</option><option value="2">P2 · Alta</option><option value="3">P3 · Média</option><option value="4">P4 · Normal</option></select><select value={taskListSort} onChange={event => setTaskListSort(event.target.value)}><option value="manual">Ordem manual</option><option value="date">Data</option><option value="priority">Prioridade</option><option value="name">Nome</option></select></div>
  }

  function AddLine() {
    if (!composerOpen) return <button className={styles.addLine} onClick={openComposer}><Icon name="plus" size={17} />Adicionar tarefa</button>
    return (
      <form className={styles.composer} onSubmit={addTask}>
        <input ref={quickInput} value={draftTitle} onChange={event => setDraftTitle(event.target.value)} placeholder="Nome da tarefa" autoComplete="off" />
        <div className={styles.composerFields}>
          <label><Icon name="calendar" size={15} /><input type="date" value={draftDate} onChange={event => setDraftDate(event.target.value)} /></label>
          <label><Icon name="hash" size={15} /><select value={draftProject} onChange={event => setDraftProject(event.target.value)}><option value="entrada">Entrada</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <span />
          <button type="button" onClick={() => { setComposerOpen(false); setDraftTitle('') }}>Cancelar</button>
          <button type="submit" disabled={!draftTitle.trim()}>Adicionar</button>
        </div>
      </form>
    )
  }

  return (
    <div className={styles.app}>
      <aside className={styles.sidebar} data-open={sidebarOpen}>
        <div className={styles.accountTop}>
          <div className={styles.avatar}>M</div>
          <strong>MAI</strong>
          <button onClick={() => setSidebarOpen(false)} aria-label="Fechar menu"><Icon name="close" /></button>
        </div>

        <div className={styles.quickAddWrap}>
          <button className={styles.addTaskButton} onClick={() => setQuickAddOpen(value => !value)}><Icon name="plus" />Adicionar</button>
          {quickAddOpen && <div className={styles.quickAddMenu}>{[
            ['task', 'Tarefa', 'inbox'], ['event', 'Compromisso', 'calendar'], ['habits', 'Rotina', 'habits'], ['finance', 'Transação', 'finance'], ['notes', 'Nota', 'notes'], ['goals', 'Meta', 'goals'], ['health', 'Bem-estar', 'health'], ['files', 'Arquivo', 'files'],
          ].map(([id, label, icon]) => <button key={id} onClick={() => quickAdd(id)}><Icon name={icon} size={17} /><span>{label}</span></button>)}</div>}
        </div>
        <button className={styles.searchButton} onClick={() => setSearchOpen(true)}><Icon name="search" /><span>Buscar</span><kbd>Ctrl K</kbd></button>

        <nav className={styles.primaryNav} aria-label="Navegação principal">
          <button data-active={view === 'inbox'} onClick={() => navigate('inbox')}><Icon name="inbox" /><span>Entrada</span><b>{inboxTasks.length || ''}</b></button>
          <button data-active={view === 'today'} onClick={() => navigate('today')}><Icon name="today" /><span>Hoje</span><b>{overdueTasks.length + todayTasks.length || ''}</b></button>
          <button data-active={view === 'upcoming'} onClick={() => navigate('upcoming')}><Icon name="upcoming" /><span>Em breve</span></button>
        </nav>

        <div className={styles.projectsHeader}><span>Meus projetos</span><button onClick={() => setNewProjectOpen(value => !value)} aria-label="Criar projeto"><Icon name="plus" size={16} /></button></div>
        {newProjectOpen && <form className={styles.projectComposer} onSubmit={addProject}><input autoFocus value={newProjectName} onChange={event => setNewProjectName(event.target.value)} placeholder="Nome do projeto" /><button>Adicionar</button></form>}
        <nav className={styles.projectNav} aria-label="Projetos">
          {projects.map(project => (
            <button key={project.id} data-active={projectId === project.id} onClick={() => navigate(`project:${project.id}`)} style={{ paddingLeft: `${10 + projectDepth(project) * 16}px` }}>
              <i style={{ background: project.color }} /><span>{project.name}</span><b>{openTasks.filter(task => sameProject(task, project.id)).length || ''}</b>
            </button>
          ))}
          {!projects.length && ready && <small>Crie um projeto quando precisar separar um trabalho.</small>}
        </nav>

        <div className={styles.areasHeader}><button onClick={() => setAreasOpen(value => !value)}><Icon name="chevron" size={15} /><span>Áreas</span></button></div>
        {areasOpen && <nav className={styles.areasNav} aria-label="Outras áreas">
          {secondaryAreas.map(area => <button key={area.id} data-active={view === area.id} onClick={() => navigate(area.id)}><Icon name={area.icon} /><span>{area.label}</span></button>)}
        </nav>}

        <button className={styles.undoButton} onClick={undoLast} disabled={!undoCount}><span>↶</span><span>Desfazer</span><kbd>Ctrl Z</kbd></button>
        <button className={styles.googleButton} onClick={openGoogleSettings}>
          <span className={styles.googleMark}>G</span><span><strong>Google</strong><small>{googleConnected === null ? 'Verificando conexão' : googleConnected ? 'Agenda e Drive conectados' : 'Conectar Agenda e Drive'}</small></span><Icon name="settings" size={17} />
        </button>
        <button className={styles.syncState} data-phase={syncStatus.phase} onClick={() => syncStatus.phase === 'local' ? router.push('/login') : syncStatus.phase === 'error' ? void flushRemoteSync() : undefined}><i /><span>{syncStatus.message}</span></button>
      </aside>

      {sidebarOpen && <button className={styles.scrim} aria-label="Fechar menu" onClick={() => setSidebarOpen(false)} />}

      <main className={styles.main}>
        <div className={styles.mobileBar}>
          <button onClick={() => setSidebarOpen(true)} aria-label="Abrir menu"><Icon name="menu" /></button>
          <strong>MAI</strong>
          <button onClick={openComposer} aria-label="Adicionar tarefa"><Icon name="plus" /></button>
        </div>

        <section className={styles.workspace}>
          <header className={styles.viewHeader}>
            <div><h1>{viewTitle}</h1>{viewSubtitle && <p>{viewSubtitle}</p>}</div>
            <div className={styles.headerActions}>{view === 'today' && <button className={styles.syncButton} onClick={() => setTodaySettingsOpen(true)} title="Personalizar Hoje"><Icon name="settings" /></button>}{activeProject && <button className={styles.syncButton} onClick={() => setProjectDraft({ ...activeProject.raw, sectionText: activeProject.sections.join('\n') })} title="Configurar projeto"><Icon name="settings" /></button>}<button className={styles.syncButton} onClick={() => googleConnected ? syncCalendarEvents(state.configs.calendarios || []) : openGoogleSettings()} title="Atualizar Google Agenda" data-busy={calendarBusy}><Icon name="sync" /></button></div>
          </header>

          {!ready ? <div className={styles.loading}>Carregando...</div> : (
            <>
              {view === 'inbox' && <section className={styles.listSection}><TaskListToolbar />{organizeTasks(inboxTasks).map(task => <TaskRow key={task.id} task={task} />)}{!inboxTasks.length && <div className={styles.empty}><strong>Sua entrada está livre</strong><span>Capture aqui tudo que não pode esquecer.</span></div>}<AddLine /></section>}

              {view === 'today' && <>
                {overdueTasks.length > 0 && <section className={styles.listSection}><h2 className={styles.overdueTitle}>Atrasadas <span>{overdueTasks.length}</span></h2>{overdueTasks.map(task => <TaskRow key={task.id} task={task} />)}</section>}
                {todaySections.includes('tasks') && <section className={styles.listSection}><h2>Tarefas <span>{todayTasks.length || ''}</span></h2>{sortedTodayTasks.map(task => <TaskRow key={task.id} task={task} />)}<AddLine /></section>}
                {todaySections.includes('events') && <section className={styles.listSection}><h2>Compromissos <span>{todayPlan.filter(item => item.kind === 'event').length || ''}</span></h2>{todayPlan.filter(item => item.kind === 'event').map(item => <TodayPlannerRow key={item.id} item={item} />)}{!todayPlan.some(item => item.kind === 'event') && <small className={styles.noItems}>Nenhum compromisso</small>}</section>}
                {todaySections.includes('habits') && <section className={styles.listSection}><h2>Rotinas <span>{todayPlan.filter(item => item.kind === 'habit').length || ''}</span></h2>{todayPlan.filter(item => item.kind === 'habit').map(item => <TodayPlannerRow key={item.id} item={item} />)}{!todayPlan.some(item => item.kind === 'habit') && <small className={styles.noItems}>Nenhuma rotina</small>}</section>}
                {todaySections.includes('finance') && todayPlan.some(item => item.kind === 'finance') && <section className={styles.listSection}><h2>Finanças <span>{todayPlan.filter(item => item.kind === 'finance').length}</span></h2>{todayPlan.filter(item => item.kind === 'finance').map(item => <TodayPlannerRow key={item.id} item={item} />)}</section>}
                {todaySections.includes('goals') && todayPlan.some(item => item.kind === 'goal') && <section className={styles.listSection}><h2>Metas <span>{todayPlan.filter(item => item.kind === 'goal').length}</span></h2>{todayPlan.filter(item => item.kind === 'goal').map(item => <TodayPlannerRow key={item.id} item={item} />)}</section>}
                {todaySections.includes('health') && Object.keys(healthGoals).length > 0 && <section className={styles.listSection}><h2>Bem-estar</h2><ContextRow item={{ id: 'health-checkin', title: healthDiary[today] ? 'Ver diário de hoje' : 'Registrar bem-estar', meta: healthDiary[today] ? 'Registros atualizados' : 'Check-in pendente', target: 'health' }} /></section>}
                {!todayTasks.length && !todayPlan.length && !overdueTasks.length && <div className={styles.empty}><strong>Dia livre</strong><span>Nada marcado para hoje.</span></div>}
              </>}

              {view === 'upcoming' && <AgendaView state={state} today={today} connected={googleConnected} commit={commit} googleRpc={googleRpc} refreshEvents={(start, end) => syncCalendarEvents(state.configs.calendarios || [], start, end)} openTask={setSelectedTaskId} openArea={navigate} createRequest={agendaCreateRequest} />}

              {isSecondary && <AreaView view={view as SecondaryView} state={state} today={today} commit={commit} googleRpc={googleRpc} createRequest={quickRequest} />}

              {view.startsWith('project:') && <section className={styles.listSection}><TaskListToolbar />{activeProject?.sections.map(section => { const sectionTasks = organizeTasks(projectTasks.filter(task => String(task.secao || '') === section)); return <section className={styles.projectSection} key={section}><h2>{section}<span>{sectionTasks.length || ''}</span></h2>{sectionTasks.map(task => <TaskRow key={task.id} task={task} />)}</section> })}{organizeTasks(projectTasks.filter(task => !task.secao || !activeProject?.sections.includes(String(task.secao)))).map(task => <TaskRow key={task.id} task={task} />)}{!projectTasks.length && <div className={styles.empty}><strong>Projeto vazio</strong><span>Adicione a primeira tarefa deste projeto.</span></div>}<AddLine /></section>}

              {visibleCompleted.length > 0 && <section className={styles.completedSection}><button onClick={() => setShowCompleted(value => !value)}><Icon name="chevron" size={15} /><span>Concluídas</span><b>{visibleCompleted.length}</b></button>{showCompleted && <div>{visibleCompleted.map(task => <TaskRow key={task.id} task={task} />)}</div>}</section>}
            </>
          )}
        </section>
      </main>

      {selectedTask && <>
        <button className={styles.drawerScrim} onClick={() => setSelectedTaskId(null)} aria-label="Fechar detalhes" />
        <aside className={styles.taskDrawer}>
          <header><span>Detalhes da tarefa</span><button onClick={() => setSelectedTaskId(null)} aria-label="Fechar"><Icon name="close" /></button></header>
          <div className={styles.drawerContent}>
            <div className={styles.drawerTitle}><button className={styles.check} data-priority={selectedTask.prioridade || 4} onClick={() => toggleTask(selectedTask.id)}>{selectedTask.concluida ? '✓' : ''}</button><textarea value={selectedTask.titulo} onChange={event => updateTask(selectedTask.id, { titulo: event.target.value })} rows={2} /></div>
            <label className={styles.detailField}><span>Descrição</span><textarea value={selectedTask.descricao || ''} onChange={event => updateTask(selectedTask.id, { descricao: event.target.value })} placeholder="Adicione detalhes..." rows={5} /></label>
            <label className={styles.detailField}><span>Data e horário</span><input type="datetime-local" value={selectedTask.data_vencimento ? (String(selectedTask.data_vencimento).includes('T') ? String(selectedTask.data_vencimento).slice(0, 16) : `${taskDate(selectedTask)}T09:00`) : ''} onChange={event => updateTask(selectedTask.id, { data_vencimento: event.target.value })} /></label>
            <label className={styles.detailField}><span>Projeto</span><select value={String(selectedTask.projeto_id || 'entrada')} onChange={event => updateTask(selectedTask.id, { projeto_id: event.target.value })}><option value="entrada">Entrada</option>{projects.map(project => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
            <label className={styles.detailField}><span>Prioridade</span><select value={selectedTask.prioridade || 4} onChange={event => updateTask(selectedTask.id, { prioridade: Number(event.target.value) })}><option value={1}>P1 · Urgente</option><option value={2}>P2 · Alta</option><option value={3}>P3 · Média</option><option value={4}>P4 · Normal</option></select></label>
            <label className={styles.detailField}><span>Recorrência</span><select value={selectedTask.repeticao || ''} onChange={event => updateTask(selectedTask.id, { repeticao: event.target.value })}><option value="">Não repetir</option><option value="diariamente">Todos os dias</option><option value="semanalmente">Toda semana</option><option value="mensalmente">Todo mês</option><option value="anualmente">Todo ano</option><option value="intervalo:2">A cada 2 dias</option><option value="semanal:1,2,3,4,5">Dias úteis</option></select></label>
            <label className={styles.detailField}><span>Seção</span><input list="project-sections" value={selectedTask.secao || ''} onChange={event => updateTask(selectedTask.id, { secao: event.target.value })} placeholder="Nome da seção" /><datalist id="project-sections">{projects.find(project => project.id === String(selectedTask.projeto_id))?.sections.map(section => <option value={section} key={section} />)}</datalist></label>
            <label className={styles.drawerToggle}><input type="checkbox" checked={selectedTask.ocultar_agenda === true} onChange={event => updateTask(selectedTask.id, { ocultar_agenda: event.target.checked })} /><span>Não mostrar na agenda</span></label>

            <section className={styles.taskExtras}><h3>Subtarefas <span>{rows(selectedTask.subtarefas).filter(item => item.concluida).length}/{rows(selectedTask.subtarefas).length}</span></h3>{rows(selectedTask.subtarefas).map(item => <div className={styles.subtaskRow} key={String(item.id)}><button data-done={item.concluida === true} onClick={() => toggleSubtask(item.id)}>{item.concluida ? '✓' : ''}</button><button className={styles.subtaskTitle} onClick={() => setSelectedSubtaskId(String(item.id))}>{String(item.titulo || item.title || 'Subtarefa')}</button><button onClick={() => removeSubtask(item.id)}>×</button></div>)}<div className={styles.inlineCreate}><input value={subtaskDraft} onChange={event => setSubtaskDraft(event.target.value)} placeholder="Adicionar subtarefa" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addSubtask() } }} /><button onClick={addSubtask}>Adicionar</button></div></section>

            <section className={styles.taskExtras}><h3>Notas</h3>{rows(selectedTask.notas).map((note, index) => <div className={styles.taskNote} key={String(note.id || index)}><span>{typeof note === 'string' ? note : String(note.texto || note.text || '')}</span><button onClick={() => updateTask(selectedTask.id, { notas: rows(selectedTask.notas).filter((_, position) => position !== index) })}>×</button></div>)}<div className={styles.inlineCreate}><input value={taskNoteDraft} onChange={event => setTaskNoteDraft(event.target.value)} placeholder="Adicionar nota" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addTaskNote() } }} /><button onClick={addTaskNote}>Adicionar</button></div></section>

            <section className={styles.taskExtras}><h3>Anexos</h3>{rows(selectedTask.anexos).map((file, index) => <div className={styles.taskAttachmentFull} key={String(file.idDrive || file.id || index)}><a href={String(file.url || '#')} target="_blank" rel="noreferrer">{String(file.nome || file.name || 'Arquivo')}</a><button onClick={() => void renameTaskAttachment(file, index)}>Renomear</button><button onClick={() => void removeTaskAttachment(file, index)}>×</button></div>)}<label className={styles.uploadTaskButton}>{taskAttachmentBusy ? 'Enviando...' : 'Anexar do computador'}<input type="file" hidden disabled={taskAttachmentBusy} onChange={event => void uploadTaskAttachment(event.target.files?.[0])} /></label></section>
            <button className={styles.convertButton} onClick={() => void convertTaskToEvent()}><Icon name="calendar" size={16} />Transformar em compromisso</button>
          </div>
          <footer><button onClick={() => deleteTask(selectedTask.id)}><Icon name="trash" size={16} />Excluir tarefa</button></footer>
        </aside>
      </>}

      {selectedTask && selectedSubtask && <><button className={styles.subtaskScrim} onClick={() => setSelectedSubtaskId(null)} aria-label="Fechar subtarefa" /><aside className={styles.subtaskDrawer}><header><span>Subtarefa</span><button onClick={() => setSelectedSubtaskId(null)}><Icon name="close" /></button></header><div><label><span>Título</span><input value={String(selectedSubtask.titulo || '')} onChange={event => updateSubtask(selectedSubtask.id, { titulo: event.target.value })} /></label><label><span>Descrição</span><textarea rows={4} value={String(selectedSubtask.descricao || '')} onChange={event => updateSubtask(selectedSubtask.id, { descricao: event.target.value })} /></label><label><span>Data e horário</span><input type="datetime-local" value={String(selectedSubtask.data_vencimento || '')} onChange={event => updateSubtask(selectedSubtask.id, { data_vencimento: event.target.value })} /></label><label><span>Prioridade</span><select value={Number(selectedSubtask.prioridade || 4)} onChange={event => updateSubtask(selectedSubtask.id, { prioridade: Number(event.target.value) })}><option value={1}>P1 · Urgente</option><option value={2}>P2 · Alta</option><option value={3}>P3 · Média</option><option value={4}>P4 · Normal</option></select></label><label><span>Recorrência</span><select value={String(selectedSubtask.repeticao || '')} onChange={event => updateSubtask(selectedSubtask.id, { repeticao: event.target.value })}><option value="">Não repetir</option><option value="diariamente">Todos os dias</option><option value="semanalmente">Toda semana</option><option value="mensalmente">Todo mês</option></select></label><section><h3>Etapas internas</h3>{rows(selectedSubtask.subtarefas).map((nested, index) => <div key={String(nested.id || index)}><button onClick={() => updateSubtask(selectedSubtask.id, { subtarefas: rows(selectedSubtask.subtarefas).map((item, position) => position === index ? { ...item, concluida: !item.concluida } : item) })}>{nested.concluida ? '✓' : '○'}</button><span>{String(nested.titulo || '')}</span><button onClick={() => updateSubtask(selectedSubtask.id, { subtarefas: rows(selectedSubtask.subtarefas).filter((_, position) => position !== index) })}>×</button></div>)}<div className={styles.inlineCreate}><input value={nestedSubtaskDraft} onChange={event => setNestedSubtaskDraft(event.target.value)} placeholder="Adicionar etapa" /><button onClick={addNestedSubtask}>Adicionar</button></div></section></div></aside></>}

      {todaySettingsOpen && <div className={styles.modalLayer} onMouseDown={() => setTodaySettingsOpen(false)}><section className={styles.todaySettings} onMouseDown={event => event.stopPropagation()}><header><div><h2>Personalizar Hoje</h2><p>Escolha o que precisa aparecer quando você abre o MAI.</p></div><button onClick={() => setTodaySettingsOpen(false)}><Icon name="close" /></button></header><label><span>Ordenar tarefas</span><select value={todaySort} onChange={event => commit(current => ({ ...current, configs: { ...current.configs, todaySort: event.target.value } }))}><option value="time">Horário</option><option value="priority">Prioridade</option><option value="name">Nome</option></select></label><div>{[['tasks', 'Tarefas'], ['events', 'Compromissos'], ['habits', 'Rotinas'], ['finance', 'Finanças'], ['goals', 'Metas'], ['health', 'Bem-estar']].map(([id, label]) => <label key={id}><input type="checkbox" checked={todaySections.includes(id)} onChange={event => commit(current => { const sections = (Array.isArray(current.configs.todaySections) ? current.configs.todaySections : []).map(String); return { ...current, configs: { ...current.configs, todaySections: event.target.checked ? [...new Set([...sections, id])] : sections.filter(section => section !== id) } } })} /><span>{label}</span></label>)}</div><footer><button onClick={() => commit(current => ({ ...current, configs: { ...current.configs, todaySections: ['tasks', 'events', 'habits', 'finance', 'goals', 'health'], todaySort: 'time' } }))}>Restaurar padrão</button><button onClick={() => setTodaySettingsOpen(false)}>Concluído</button></footer></section></div>}

      {projectDraft && <div className={styles.modalLayer} onMouseDown={() => setProjectDraft(null)}><form className={styles.projectEditor} onSubmit={saveProject} onMouseDown={event => event.stopPropagation()}>
        <header><div><h2>{projectDraft.id ? 'Editar projeto' : 'Novo projeto'}</h2><p>Organize tarefas sem complicar.</p></div><button type="button" onClick={() => setProjectDraft(null)}><Icon name="close" /></button></header>
        <label><span>Nome</span><input autoFocus value={String(projectDraft.nome || '')} onChange={event => setProjectDraft({ ...projectDraft, nome: event.target.value })} /></label>
        <div className={styles.projectEditorGrid}><label><span>Cor</span><input type="color" value={String(projectDraft.cor || '#73866c')} onChange={event => setProjectDraft({ ...projectDraft, cor: event.target.value })} /></label><label><span>Projeto principal</span><select value={String(projectDraft.parent_id || '')} onChange={event => setProjectDraft({ ...projectDraft, parent_id: event.target.value })}><option value="">Nenhum</option>{projects.filter(project => project.id !== String(projectDraft.id)).map(project => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label></div>
        <label><span>Seções, uma por linha</span><textarea rows={6} value={String(projectDraft.sectionText || '')} onChange={event => setProjectDraft({ ...projectDraft, sectionText: event.target.value })} placeholder={'Planejamento\nEm andamento\nConcluído'} /></label>
        <footer>{projectDraft.id ? <button type="button" className={styles.dangerButton} onClick={deleteProject}>Excluir projeto</button> : <span />}<div><button type="button" onClick={() => setProjectDraft(null)}>Cancelar</button><button>Salvar</button></div></footer>
      </form></div>}

      {searchOpen && <div className={styles.modalLayer} onMouseDown={() => setSearchOpen(false)}>
        <section className={styles.searchModal} onMouseDown={event => event.stopPropagation()}>
          <label><Icon name="search" /><input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar em todo o MAI" /><kbd>Esc</kbd></label>
          <div className={styles.searchResults}>{!search.trim() ? <p>Busque tarefas, projetos, compromissos, rotinas, metas, notas, finanças e saúde.</p> : searchResults.length ? searchResults.map(result => <button key={`${result.kind}-${result.id}`} onClick={() => openSearchResult(result)}><span className={styles.searchCheck}>○</span><span><strong>{result.title}</strong><small>{result.meta}</small></span></button>) : <p>Nenhum resultado encontrado.</p>}</div>
        </section>
      </div>}

      {settingsOpen && <div className={styles.modalLayer} onMouseDown={() => setSettingsOpen(false)}>
        <section className={styles.settingsModal} onMouseDown={event => event.stopPropagation()}>
          <header><div><h2>Configurações</h2><p>Conta, aparência, dados e Google.</p></div><button onClick={() => setSettingsOpen(false)}><Icon name="close" /></button></header>
          <div className={styles.appSettings}>
            <button onClick={toggleTheme}><span><strong>Aparência</strong><small>{state.configs.theme === 'dark' ? 'Tema escuro' : 'Tema claro'}</small></span><b>Alternar</b></button>
            <button onClick={() => void requestNotifications()}><span><strong>Lembretes</strong><small>{notificationPermission === 'denied' ? 'Bloqueados no navegador' : state.configs.notificationsEnabled === true ? 'Notificações ativadas' : 'Notificações desativadas'}</small></span><b>{state.configs.notificationsEnabled === true ? 'Desativar' : 'Ativar'}</b></button>
            {installPrompt && <button onClick={() => void installApp()}><span><strong>Instalar o MAI</strong><small>Abrir como aplicativo neste dispositivo</small></span><b>Instalar</b></button>}
            <button onClick={() => void flushRemoteSync()}><span><strong>Sincronização</strong><small>{syncStatus.message}</small></span><b>Sincronizar</b></button>
            <button onClick={exportData}><span><strong>Backup dos dados</strong><small>Baixar um arquivo JSON</small></span><b>Exportar</b></button>
            <button onClick={() => importInput.current?.click()}><span><strong>Restaurar backup</strong><small>Importar dados do MAI antigo ou deste app</small></span><b>Importar</b></button>
            <input ref={importInput} type="file" accept="application/json,.json" hidden onChange={event => void importData(event.target.files?.[0])} />
          </div>
          <div className={styles.settingsDivider}><span>Google Agenda e Drive</span></div>
          {calendarBusy && !calendars.length ? <div className={styles.settingsLoading}>Carregando conexão...</div> : googleConnected ? <>
            <div className={styles.connectionRow}><span className={styles.googleMark}>G</span><span><strong>Conta conectada</strong><small>Sincronização ativa</small></span><i /></div>
            <div className={styles.calendarSettings}><h3>Calendários visíveis</h3><p>Os escolhidos aparecem em Hoje e Em breve.</p>{calendars.map(calendar => <label key={calendar.id}><input type="checkbox" checked={calendarDraft.includes(calendar.id)} onChange={event => setCalendarDraft(current => event.target.checked ? [...current, calendar.id] : current.filter(id => id !== calendar.id))} /><i style={{ background: calendar.cor }} /><span>{calendar.nome}</span>{calendar.primary && <small>Principal</small>}</label>)}</div>
            <div className={styles.settingsActions}><button className={styles.disconnectButton} onClick={disconnectGoogle}>Desconectar Google</button><a href="https://drive.google.com/drive/my-drive" target="_blank" rel="noreferrer">Abrir Drive <Icon name="external" size={14} /></a><button onClick={saveCalendars}>Salvar calendários</button></div>
          </> : <div className={styles.connectPanel}><strong>Conecte sua conta Google</strong><p>Seus eventos e arquivos continuarão na sua conta. O MAI apenas organiza o acesso.</p><a href="/api/google/connect">Conectar com Google</a></div>}
          <div className={styles.settingsDivider}><span>Conta do MAI</span></div><button className={styles.logoutButton} onClick={logout}>Sair da conta</button>
        </section>
      </div>}
    </div>
  )
}
