'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import styles from './mai-v2.module.css'
import { createTask, dateKey, emptyState, LegacyTask, loadState, MaiState, persistState } from '../../lib/v2/state'
import { AreaView, SecondaryView } from './V2Areas'

type View = 'inbox' | 'today' | 'upcoming' | SecondaryView | `project:${string}`
type Project = { id: string; name: string; color: string }
type Calendar = { id: string; nome: string; cor: string; primary?: boolean; acesso?: string }
type CalendarEvent = Record<string, unknown>

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
const eventDate = (event: CalendarEvent) => String(event.data_inicio || '').slice(0, 10)
const eventTime = (event: CalendarEvent) => String(event.hora_inicio || '')

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
    }))
}

function sameProject(task: LegacyTask, projectId: string) {
  return String(task.projeto_id || 'entrada') === projectId
}

export function MaiV2App() {
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
  const quickInput = useRef<HTMLInputElement>(null)

  const projects = useMemo(() => projectList(state.projects), [state.projects])
  const events = useMemo(() => rows(state.events), [state.events])
  const openTasks = useMemo(() => state.tasks.filter(task => !task.concluida), [state.tasks])
  const completedTasks = useMemo(() => state.tasks.filter(task => task.concluida), [state.tasks])
  const selectedTask = useMemo(() => state.tasks.find(task => task.id === selectedTaskId) || null, [state.tasks, selectedTaskId])
  const isSecondary = secondaryAreas.some(area => area.id === view)

  useEffect(() => {
    const saved = loadState()
    setToday(dateKey())
    setState(saved)
    setReady(true)
    void checkGoogle(saved)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
      if (event.key === 'Escape') {
        setSearchOpen(false)
        setSettingsOpen(false)
        setSelectedTaskId(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function commit(change: (current: MaiState) => MaiState) {
    setState(current => persistState(change(current)))
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

  async function syncCalendarEvents(calendarIds: string[]) {
    setCalendarBusy(true)
    try {
      const baseDay = today || dateKey()
      const start = new Date(`${addDays(baseDay, -14)}T00:00:00`)
      const end = new Date(`${addDays(baseDay, 61)}T23:59:59`)
      const payload = await googleRpc('getGoogleCalendarPeriodo', [start.toISOString(), end.toISOString(), calendarIds])
      const nextEvents = Array.isArray(payload?.eventos) ? payload.eventos : []
      setState(current => ({ ...current, events: nextEvents }))
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
      tasks: current.tasks.map(task => task.id === id ? { ...task, concluida: !task.concluida } : task),
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
  const projectTasks = openTasks.filter(task => sameProject(task, projectId))
  const visibleCompleted = completedTasks.filter(task => {
    if (isSecondary) return false
    if (view === 'inbox') return sameProject(task, 'entrada')
    if (view === 'today') return taskDate(task) === today
    if (view.startsWith('project:')) return sameProject(task, projectId)
    return taskDate(task) > today && taskDate(task) <= addDays(today, 14)
  })

  const upcomingDays = today ? Array.from({ length: 14 }, (_, index) => addDays(today, index + 1)) : []
  const habitRows = rows(state.habits).filter(habit => habit.ativo !== false && habit.ocultar_agenda !== true)
  const habitEntryRows = rows(state.habitEntries)
  const goalRows = rows(state.goals).filter(goal => goal.status !== 'Concluída')
  const financeRows = rows((state.finance as Record<string, unknown>)?.transactions).filter(item => item.status !== 'pago')
  const healthGoals = (state.health as Record<string, any>)?.goals || {}
  const healthDiary = (state.health as Record<string, any>)?.diary || {}
  const todayExtras: { id: string; title: string; meta: string; target: SecondaryView }[] = [
    ...habitRows.filter(habit => !habitEntryRows.some(entry => String(entry.habito_id) === String(habit.id) && String(entry.data || '').slice(0, 10) === today)).map(habit => ({ id: `habit-${habit.id}`, title: String(habit.nome || 'Rotina'), meta: habit.hora ? `Rotina · ${habit.hora}` : 'Rotina', target: 'habits' as const })),
    ...goalRows.filter(goal => String(goal.prazo || '').slice(0, 10) === today).map(goal => ({ id: `goal-${goal.id}`, title: String(goal.titulo || 'Meta'), meta: 'Meta com prazo hoje', target: 'goals' as const })),
    ...financeRows.filter(item => String(item.data || '').slice(0, 10) === today).map(item => ({ id: `finance-${item.id}`, title: String(item.titulo || 'Lançamento'), meta: `${item.tipo === 'receita' ? 'Receita' : 'Despesa'} pendente`, target: 'finance' as const })),
    ...(Object.keys(healthGoals).length && !healthDiary[today] ? [{ id: 'health-checkin', title: 'Registrar bem-estar', meta: 'Check-in de hoje', target: 'health' as const }] : []),
  ]

  function extrasForDate(day: string) {
    return [
      ...goalRows.filter(goal => String(goal.prazo || '').slice(0, 10) === day).map(goal => ({ id: `goal-${goal.id}`, title: String(goal.titulo || 'Meta'), meta: 'Meta', target: 'goals' as SecondaryView })),
      ...financeRows.filter(item => String(item.data || '').slice(0, 10) === day).map(item => ({ id: `finance-${item.id}`, title: String(item.titulo || 'Lançamento'), meta: item.tipo === 'receita' ? 'Receita' : 'Despesa', target: 'finance' as SecondaryView })),
    ]
  }
  const searchResults = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR')
    if (!query) return []
    return state.tasks.filter(task => `${task.titulo} ${task.descricao || ''}`.toLocaleLowerCase('pt-BR').includes(query)).slice(0, 20)
  }, [search, state.tasks])

  function TaskRow({ task }: { task: LegacyTask }) {
    const due = taskDate(task)
    const project = projects.find(item => item.id === String(task.projeto_id))
    return (
      <div className={styles.taskRow} data-completed={task.concluida === true}>
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

  function EventRow({ event }: { event: CalendarEvent }) {
    const url = String(event.url || '')
    const body = (
      <>
        <span className={styles.eventTime}>{eventTime(event) || 'Dia todo'}</span>
        <span className={styles.eventBody}><strong>{String(event.titulo || 'Compromisso')}</strong><small>Google Agenda</small></span>
        {url && <Icon name="external" size={15} />}
      </>
    )
    return url
      ? <a className={styles.eventRow} href={url} target="_blank" rel="noreferrer">{body}</a>
      : <div className={styles.eventRow}>{body}</div>
  }

  function ContextRow({ item }: { item: { id: string; title: string; meta: string; target: SecondaryView } }) {
    return <button className={styles.contextRow} onClick={() => navigate(item.target)}><span>○</span><span><strong>{item.title}</strong><small>{item.meta}</small></span><b>›</b></button>
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

        <button className={styles.addTaskButton} onClick={openComposer}><Icon name="plus" />Adicionar tarefa</button>
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
            <button key={project.id} data-active={projectId === project.id} onClick={() => navigate(`project:${project.id}`)}>
              <i style={{ background: project.color }} /><span>{project.name}</span><b>{openTasks.filter(task => sameProject(task, project.id)).length || ''}</b>
            </button>
          ))}
          {!projects.length && ready && <small>Crie um projeto quando precisar separar um trabalho.</small>}
        </nav>

        <div className={styles.areasHeader}><button onClick={() => setAreasOpen(value => !value)}><Icon name="chevron" size={15} /><span>Áreas</span></button></div>
        {areasOpen && <nav className={styles.areasNav} aria-label="Outras áreas">
          {secondaryAreas.map(area => <button key={area.id} data-active={view === area.id} onClick={() => navigate(area.id)}><Icon name={area.icon} /><span>{area.label}</span></button>)}
        </nav>}

        <button className={styles.googleButton} onClick={openGoogleSettings}>
          <span className={styles.googleMark}>G</span><span><strong>Google</strong><small>{googleConnected === null ? 'Verificando conexão' : googleConnected ? 'Agenda e Drive conectados' : 'Conectar Agenda e Drive'}</small></span><Icon name="settings" size={17} />
        </button>
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
            <button className={styles.syncButton} onClick={() => googleConnected ? syncCalendarEvents(state.configs.calendarios || []) : openGoogleSettings()} title="Atualizar Google Agenda" data-busy={calendarBusy}><Icon name="sync" /></button>
          </header>

          {!ready ? <div className={styles.loading}>Carregando...</div> : (
            <>
              {view === 'inbox' && <section className={styles.listSection}>{inboxTasks.map(task => <TaskRow key={task.id} task={task} />)}{!inboxTasks.length && <div className={styles.empty}><strong>Sua entrada está livre</strong><span>Capture aqui tudo que não pode esquecer.</span></div>}<AddLine /></section>}

              {view === 'today' && <>
                {overdueTasks.length > 0 && <section className={styles.listSection}><h2 className={styles.overdueTitle}>Atrasadas <span>{overdueTasks.length}</span></h2>{overdueTasks.map(task => <TaskRow key={task.id} task={task} />)}</section>}
                <section className={styles.listSection}>
                  {(todayTasks.length > 0 || events.some(event => eventDate(event) === today) || todayExtras.length > 0) && <h2>Hoje <span>{todayTasks.length + events.filter(event => eventDate(event) === today).length + todayExtras.length}</span></h2>}
                  {[...todayTasks].sort((a, b) => taskTime(a).localeCompare(taskTime(b))).map(task => <TaskRow key={task.id} task={task} />)}
                  {events.filter(event => eventDate(event) === today).sort((a, b) => eventTime(a).localeCompare(eventTime(b))).map(event => <EventRow key={String(event.id)} event={event} />)}
                  {todayExtras.map(item => <ContextRow key={item.id} item={item} />)}
                  {!todayTasks.length && !events.some(event => eventDate(event) === today) && !todayExtras.length && !overdueTasks.length && <div className={styles.empty}><strong>Dia livre</strong><span>Nada marcado para hoje.</span></div>}
                  <AddLine />
                </section>
              </>}

              {view === 'upcoming' && <div className={styles.upcomingList}>
                {upcomingDays.map(day => {
                  const dayTasks = openTasks.filter(task => taskDate(task) === day)
                  const dayEvents = events.filter(event => eventDate(event) === day)
                  const dayExtras = extrasForDate(day)
                  return <section className={styles.dayGroup} key={day}><h2><span>{formatDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}</span><b>{dayTasks.length + dayEvents.length + dayExtras.length || ''}</b></h2>{dayTasks.map(task => <TaskRow key={task.id} task={task} />)}{dayEvents.sort((a, b) => eventTime(a).localeCompare(eventTime(b))).map(event => <EventRow key={String(event.id)} event={event} />)}{dayExtras.map(item => <ContextRow key={item.id} item={item} />)}{!dayTasks.length && !dayEvents.length && !dayExtras.length && <small className={styles.noItems}>Nenhum item</small>}</section>
                })}
                <AddLine />
              </div>}

              {isSecondary && <AreaView view={view as SecondaryView} state={state} today={today} commit={commit} googleRpc={googleRpc} />}

              {view.startsWith('project:') && <section className={styles.listSection}>{projectTasks.map(task => <TaskRow key={task.id} task={task} />)}{!projectTasks.length && <div className={styles.empty}><strong>Projeto vazio</strong><span>Adicione a primeira tarefa deste projeto.</span></div>}<AddLine /></section>}

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
            <label className={styles.detailField}><span>Data</span><input type="date" value={taskDate(selectedTask)} onChange={event => updateTask(selectedTask.id, { data_vencimento: event.target.value })} /></label>
            <label className={styles.detailField}><span>Projeto</span><select value={String(selectedTask.projeto_id || 'entrada')} onChange={event => updateTask(selectedTask.id, { projeto_id: event.target.value })}><option value="entrada">Entrada</option>{projects.map(project => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
            <label className={styles.detailField}><span>Prioridade</span><select value={selectedTask.prioridade || 4} onChange={event => updateTask(selectedTask.id, { prioridade: Number(event.target.value) })}><option value={1}>P1 · Urgente</option><option value={2}>P2 · Alta</option><option value={3}>P3 · Média</option><option value={4}>P4 · Normal</option></select></label>
            <label className={styles.detailField}><span>Recorrência</span><select value={selectedTask.repeticao || ''} onChange={event => updateTask(selectedTask.id, { repeticao: event.target.value })}><option value="">Não repetir</option><option value="diaria">Todos os dias</option><option value="semanal">Toda semana</option><option value="mensal">Todo mês</option><option value="anual">Todo ano</option></select></label>
            <label className={styles.detailField}><span>Seção</span><input value={selectedTask.secao || ''} onChange={event => updateTask(selectedTask.id, { secao: event.target.value })} placeholder="Nome da seção" /></label>
            <label className={styles.drawerToggle}><input type="checkbox" checked={selectedTask.ocultar_agenda === true} onChange={event => updateTask(selectedTask.id, { ocultar_agenda: event.target.checked })} /><span>Não mostrar na agenda</span></label>

            <section className={styles.taskExtras}><h3>Subtarefas <span>{rows(selectedTask.subtarefas).filter(item => item.concluida).length}/{rows(selectedTask.subtarefas).length}</span></h3>{rows(selectedTask.subtarefas).map(item => <div className={styles.subtaskRow} key={String(item.id)}><button data-done={item.concluida === true} onClick={() => toggleSubtask(item.id)}>{item.concluida ? '✓' : ''}</button><span>{String(item.titulo || item.title || 'Subtarefa')}</span><button onClick={() => removeSubtask(item.id)}>×</button></div>)}<div className={styles.inlineCreate}><input value={subtaskDraft} onChange={event => setSubtaskDraft(event.target.value)} placeholder="Adicionar subtarefa" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addSubtask() } }} /><button onClick={addSubtask}>Adicionar</button></div></section>

            <section className={styles.taskExtras}><h3>Notas</h3>{rows(selectedTask.notas).map((note, index) => <div className={styles.taskNote} key={String(note.id || index)}><span>{typeof note === 'string' ? note : String(note.texto || note.text || '')}</span><button onClick={() => updateTask(selectedTask.id, { notas: rows(selectedTask.notas).filter((_, position) => position !== index) })}>×</button></div>)}<div className={styles.inlineCreate}><input value={taskNoteDraft} onChange={event => setTaskNoteDraft(event.target.value)} placeholder="Adicionar nota" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addTaskNote() } }} /><button onClick={addTaskNote}>Adicionar</button></div></section>

            <section className={styles.taskExtras}><h3>Anexos</h3>{rows(selectedTask.anexos).map((file, index) => <div className={styles.taskAttachment} key={String(file.idDrive || file.id || index)}><a href={String(file.url || '#')} target="_blank" rel="noreferrer">{String(file.nome || file.name || 'Arquivo')}</a><button onClick={() => updateTask(selectedTask.id, { anexos: rows(selectedTask.anexos).filter((_, position) => position !== index) })}>×</button></div>)}<label className={styles.uploadTaskButton}>{taskAttachmentBusy ? 'Enviando...' : 'Anexar do computador'}<input type="file" hidden disabled={taskAttachmentBusy} onChange={event => void uploadTaskAttachment(event.target.files?.[0])} /></label></section>
          </div>
          <footer><button onClick={() => deleteTask(selectedTask.id)}><Icon name="trash" size={16} />Excluir tarefa</button></footer>
        </aside>
      </>}

      {searchOpen && <div className={styles.modalLayer} onMouseDown={() => setSearchOpen(false)}>
        <section className={styles.searchModal} onMouseDown={event => event.stopPropagation()}>
          <label><Icon name="search" /><input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar tarefas" /><kbd>Esc</kbd></label>
          <div className={styles.searchResults}>{!search.trim() ? <p>Digite para encontrar qualquer tarefa.</p> : searchResults.length ? searchResults.map(task => <button key={task.id} onClick={() => { setSearchOpen(false); setSelectedTaskId(task.id) }}><span className={styles.searchCheck}>{task.concluida ? '✓' : ''}</span><span><strong>{task.titulo}</strong><small>{taskDate(task) ? formatDate(taskDate(task), { day: 'numeric', month: 'short' }) : 'Sem data'}</small></span></button>) : <p>Nenhuma tarefa encontrada.</p>}</div>
        </section>
      </div>}

      {settingsOpen && <div className={styles.modalLayer} onMouseDown={() => setSettingsOpen(false)}>
        <section className={styles.settingsModal} onMouseDown={event => event.stopPropagation()}>
          <header><div><h2>Google</h2><p>Agenda e Drive conectados ao MAI.</p></div><button onClick={() => setSettingsOpen(false)}><Icon name="close" /></button></header>
          {calendarBusy && !calendars.length ? <div className={styles.settingsLoading}>Carregando conexão...</div> : googleConnected ? <>
            <div className={styles.connectionRow}><span className={styles.googleMark}>G</span><span><strong>Conta conectada</strong><small>Sincronização ativa</small></span><i /></div>
            <div className={styles.calendarSettings}><h3>Calendários visíveis</h3><p>Os escolhidos aparecem em Hoje e Em breve.</p>{calendars.map(calendar => <label key={calendar.id}><input type="checkbox" checked={calendarDraft.includes(calendar.id)} onChange={event => setCalendarDraft(current => event.target.checked ? [...current, calendar.id] : current.filter(id => id !== calendar.id))} /><i style={{ background: calendar.cor }} /><span>{calendar.nome}</span>{calendar.primary && <small>Principal</small>}</label>)}</div>
            <div className={styles.settingsActions}><a href="https://drive.google.com/drive/my-drive" target="_blank" rel="noreferrer">Abrir Google Drive <Icon name="external" size={14} /></a><button onClick={saveCalendars}>Salvar</button></div>
          </> : <div className={styles.connectPanel}><strong>Conecte sua conta Google</strong><p>Seus eventos e arquivos continuarão na sua conta. O MAI apenas organiza o acesso.</p><a href="/api/google/connect">Conectar com Google</a></div>}
        </section>
      </div>}
    </div>
  )
}
