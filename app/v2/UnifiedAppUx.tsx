'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import { AppKanban } from './AppKanban'
import { AppSettingsDrawer } from './AppSettingsDrawer'
import { AppTopBar } from './AppTopBar'
import type { AppView, TaskModuleScope } from './app-types'
import { CompletedV4 } from './CompletedV4'
import type { InspectableItem } from './ContextDrawer'
import { ContextDrawerV2 } from './ContextDrawerV2'
import { FinanceV4 } from './FinanceV4'
import { GoalsV4 } from './GoalsV4'
import { HabitsV4 } from './HabitsV4'
import { HealthQuickAddDrawer } from './HealthQuickAddDrawer'
import { MinimalAreas, type SecondaryView } from './MinimalAreas'
import { MobileBottomNav } from './MobileBottomNav'
import { NotesV4 } from './NotesV4'
import { ProjectDrawer } from './ProjectDrawer'
import { QuickCreateDrawer } from './QuickCreateDrawer'
import { SearchOverlay } from './SearchOverlay'
import { SectionInlineAdd } from './SectionInlineAdd'
import { ShellSidebar } from './ShellSidebar'
import { TasksModule } from './TasksModule'
import { TodayV4 } from './TodayV4'
import { UpcomingV4 } from './UpcomingV4'
import { useMaiRuntime } from './useMaiRuntime'
import styles from './unified.module.css'

const secondary: SecondaryView[] = ['habits', 'goals', 'notes', 'finance', 'health', 'files']
type ProjectDialog = { projectId?: string; parentId?: string; tab?: 'details' | 'sections' } | null
type CreateState = { kind: 'task' | 'event'; switchable?: boolean } | null
type GoogleProfile = { name: string; picture?: string; email?: string } | null
type Row = Record<string, any>

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const dateKey = (value: unknown) => String(value || '').slice(0, 10)
const completedStatus = (value: unknown) => ['pago','paga','quitado','quitada','concluido','concluida','concluído','concluída'].includes(String(value || '').toLocaleLowerCase('pt-BR'))
const moduleFilterMap = (state: MaiState) => state.configs.moduleFilters && typeof state.configs.moduleFilters === 'object' ? state.configs.moduleFilters as Record<string, Record<string, any>> : {}
const moduleControlMap = (state: MaiState) => state.configs.moduleControls && typeof state.configs.moduleControls === 'object' ? state.configs.moduleControls as Record<string, Record<string, any>> : {}

function filterTaskTree(tasks: MaiState['tasks'], predicate: (task: MaiState['tasks'][number]) => boolean) {
  const rootIds = new Set(tasks.filter(task => !task.parent_id && predicate(task)).map(task => String(task.id)))
  const visible = new Set(rootIds)
  let changed = true
  while (changed) {
    changed = false
    tasks.forEach(task => {
      const id = String(task.id)
      const parentId = String(task.parent_id || '')
      if (!parentId || visible.has(id) || !visible.has(parentId)) return
      visible.add(id)
      changed = true
    })
  }
  return tasks.filter(task => visible.has(String(task.id)))
}

function filteredStateForView(state: MaiState, view: AppView, today: string): MaiState {
  const filters = moduleFilterMap(state)[String(view)] || {}

  if (view === 'tasks') {
    const priority = String(filters.priority || 'all')
    const due = String(filters.due || 'all')
    const filtered = filterTaskTree(state.tasks, task => {
      if (priority !== 'all' && String(Number(task.prioridade || 4)) !== priority) return false
      const day = dateKey(task.data_vencimento)
      if (due === 'overdue') return Boolean(day) && day < today && task.concluida !== true
      if (due === 'today') return day === today
      if (due === 'future') return Boolean(day) && day > today
      if (due === 'none') return !day
      return true
    })
    return { ...state, tasks: filtered }
  }

  if (view === 'habits') {
    const status = String(filters.status || 'all')
    if (status === 'all') return state
    const todayEntries = rows(state.habitEntries).filter(entry => dateKey(entry.data) === today)
    const filtered = rows(state.habits).filter(habit => {
      const entry = todayEntries.find(item => String(item.habito_id) === String(habit.id))
      const done = Number(entry?.valor || 0) >= Math.max(1, Number(habit.meta || 1))
      return status === 'done' ? done : !done
    })
    return { ...state, habits: filtered }
  }

  if (view === 'goals') {
    const status = String(filters.status || 'all')
    const priority = String(filters.priority || 'all')
    const filtered = rows(state.goals).filter(goal => {
      const text = String(goal.status || '').toLocaleLowerCase('pt-BR')
      const done = goal.concluida === true || text.includes('conclu')
      if (done) return false
      const paused = text.includes('paus')
      if (status === 'active' && paused) return false
      if (status === 'paused' && !paused) return false
      if (priority !== 'all' && String(Number(goal.prioridade || 4)) !== priority) return false
      return true
    })
    return { ...state, goals: filtered }
  }

  if (view === 'notes') {
    const pinned = String(filters.pinned || 'all')
    if (pinned === 'all') return state
    return { ...state, notes: rows(state.notes).filter(note => pinned === 'pinned' ? note.fixado === true : note.fixado !== true) }
  }

  if (view === 'finance') {
    const tabs = state.configs.areaTabs && typeof state.configs.areaTabs === 'object' ? state.configs.areaTabs as Record<string, string> : {}
    if ((tabs.finance || 'overview') !== 'transactions') return state
    const type = String(filters.type || 'all')
    const status = String(filters.status || 'all')
    const finance = state.finance || {}
    const filtered = rows(finance.transactions).filter(item => {
      const isIncome = String(item.tipo || '').toLocaleLowerCase('pt-BR') === 'receita'
      if (type === 'income' && !isIncome) return false
      if (type === 'expense' && isIncome) return false
      const isPaid = completedStatus(item.status) || (Number(item.valor || 0) > 0 && Number(item.valor_pago || 0) >= Number(item.valor || 0))
      if (status === 'paid' && !isPaid) return false
      if (status === 'pending' && isPaid) return false
      return true
    })
    return { ...state, finance: { ...finance, transactions: filtered } }
  }

  if (view === 'health') {
    const period = String(filters.period || '30')
    if (period === 'all') return state
    const days = Math.max(1, Number(period) || 30)
    const health = state.health || {}
    const diary = health.diary && typeof health.diary === 'object' ? health.diary as Record<string, Row> : {}
    const start = new Date(`${today}T12:00:00`)
    start.setDate(start.getDate() - (days - 1))
    const startKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
    const filteredDiary = Object.fromEntries(Object.entries(diary).filter(([key]) => key >= startKey && key <= today))
    return { ...state, health: { ...health, diary: filteredDiary } }
  }

  if (view === 'completed') {
    const kind = String(filters.kind || 'all')
    if (kind === 'all') return state
    const emptyFinance = { ...(state.finance || {}), transactions: [] }
    return {
      ...state,
      tasks: kind === 'task' ? state.tasks : [],
      taskCompletions: kind === 'task' ? state.taskCompletions : [],
      events: kind === 'event' ? state.events : [],
      eventCompletions: kind === 'event' ? state.eventCompletions : [],
      habits: kind === 'habit' ? state.habits : [],
      habitEntries: kind === 'habit' ? state.habitEntries : [],
      goals: kind === 'goal' ? state.goals : [],
      notes: kind === 'note' ? state.notes : [],
      finance: kind === 'finance' ? state.finance : emptyFinance,
    }
  }

  return state
}

const validView = (value: unknown): value is AppView => {
  const text = String(value || '')
  return ['home', 'tasks', 'today', 'inbox', 'upcoming', 'completed', ...secondary].includes(text as any) || text.startsWith('project:')
}
const scopeFromLegacy = (value: unknown): TaskModuleScope => {
  const text = String(value || '')
  if (text === 'today' || text === 'upcoming' || text === 'entrada') return text as TaskModuleScope
  if (text === 'inbox') return 'entrada'
  if (text.startsWith('project:')) return text as TaskModuleScope
  return 'entrada'
}

export function UnifiedAppUx() {
  const runtime = useMaiRuntime()
  const restoredView = useRef(false)
  const [view, setView] = useState<AppView>('today')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [projectDialog, setProjectDialog] = useState<ProjectDialog>(null)
  const [selected, setSelected] = useState<InspectableItem | null>(null)
  const [creating, setCreating] = useState<CreateState>(null)
  const [healthCreating, setHealthCreating] = useState(false)
  const [areaCreateRequest, setAreaCreateRequest] = useState('')
  const [googleProfile, setGoogleProfile] = useState<GoogleProfile>(null)
  const taskScope = scopeFromLegacy(runtime.state.configs.taskModuleScope)
  const activeProjectId = taskScope.startsWith('project:') ? taskScope.slice(8) : 'entrada'
  const advanced = runtime.state.configs.advancedAreas && typeof runtime.state.configs.advancedAreas === 'object' ? runtime.state.configs.advancedAreas as Record<string,boolean> : {}
  const viewState = useMemo(() => filteredStateForView(runtime.state, view, runtime.today), [runtime.state, view, runtime.today])
  const currentModuleFilters = moduleFilterMap(runtime.state)[String(view)] || {}
  const currentModuleControl = moduleControlMap(runtime.state)[String(view)] || {}
  const globalKanban = view !== 'tasks' && view !== 'home' && view !== 'inbox' && !String(view).startsWith('project:') && currentModuleControl.layout === 'kanban'
  const fileKind = String(currentModuleFilters.kind || 'all')

  useEffect(() => {
    let active = true
    fetch('/api/google/profile', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(profile => { if (active && profile?.name) setGoogleProfile(profile) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!runtime.ready || restoredView.current) return
    restoredView.current = true
    const saved = runtime.state.configs.lastView
    if (!validView(saved)) return
    const text = String(saved)
    if (text === 'home') {
      setView('today')
      runtime.commit(current => ({ ...current, configs: { ...current.configs, lastView: 'today' } }))
      return
    }
    if (text === 'inbox' || text.startsWith('project:')) {
      setView('tasks')
      runtime.commit(current => ({ ...current, configs: { ...current.configs, lastView: 'tasks', taskModuleScope: scopeFromLegacy(text) } }))
      return
    }
    setView(saved)
  }, [runtime.ready, runtime.state.configs.lastView])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const editing = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName || '')
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true) }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !editing) { event.preventDefault(); runtime.undo() }
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'q' && !editing && view !== 'completed') { event.preventDefault(); contextualAdd() }
      if (event.key === 'Escape') { setSearchOpen(false); setSettingsOpen(false); setProjectDialog(null); setSelected(null); setCreating(null); setHealthCreating(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, taskScope])

  function setTaskScope(scope: TaskModuleScope) {
    setView('tasks')
    setSidebarOpen(false)
    setSelected(null)
    runtime.commit(current => ({ ...current, configs: { ...current.configs, lastView: 'tasks', taskModuleScope: scope } }))
  }

  function navigate(next: AppView) {
    const text = String(next)
    if (text === 'inbox' || text.startsWith('project:')) {
      setTaskScope(scopeFromLegacy(text))
      return
    }
    const resolved = text === 'home' ? 'today' : next
    setView(resolved as AppView)
    setSidebarOpen(false)
    setSelected(null)
    runtime.commit(current => ({ ...current, configs: { ...current.configs, lastView: resolved } }))
  }

  function addByType(type: string) {
    if (type === 'context') {
      if (view === 'today' || view === 'upcoming') { setCreating({ kind: 'task', switchable: true }); return }
      if (view === 'tasks') { setCreating({ kind: 'task' }); return }
    }
    if (type === 'task' || type === 'event') { setCreating({ kind: type }); return }
    if (type === 'health') { if (view !== 'health') navigate('health'); setHealthCreating(true); return }
    if (secondary.includes(type as SecondaryView)) {
      if (view !== type) navigate(type as SecondaryView)
      setAreaCreateRequest(`${type}:${Date.now()}`)
    }
  }

  function contextualAdd(requestedType?: string) {
    if (requestedType) return addByType(requestedType)
    if (view === 'today' || view === 'upcoming' || view === 'tasks') return addByType('context')
    if (view === 'completed') return
    return addByType(view)
  }

  async function moduleGoogleRpc(method: string, args?: unknown[]) {
    const response = await runtime.googleRpc(method, args)
    if (view !== 'files' || method !== 'getDriveContent' || fileKind === 'all' || !response || typeof response !== 'object') return response
    const source = response as Row
    const filteredItems = rows(source.items).filter(item => {
      const folder = item.tipo === 'folder' || item.mimeType === 'application/vnd.google-apps.folder'
      return fileKind === 'folder' ? folder : !folder
    })
    return { ...source, items: filteredItems }
  }

  return <div className={`${styles.appShell} mai-v3-shell`}>
    <ShellSidebar state={runtime.state} view={view} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} navigate={navigate} onSearch={() => setSearchOpen(true)} onSettings={() => setSettingsOpen(true)} profile={googleProfile} />

    <main className={`${styles.main} mai-v3-main`}>
      <div className={`${styles.workspace} mai-v3-workspace`}>
        {runtime.ready ? <AppTopBar state={runtime.state} today={runtime.today} view={view} taskScope={taskScope} commit={runtime.commit} onTaskScopeChange={setTaskScope} onSettings={() => setSettingsOpen(true)} /> : null}
        {!runtime.ready ? <div className={styles.loadingState}>Carregando seu MAI…</div> : globalKanban ? <AppKanban view={view as any} state={viewState} today={runtime.today} commit={runtime.commit} inspect={setSelected}/> : <>
          {view === 'today' ? <TodayV4 state={viewState} today={runtime.today} commit={runtime.commit} navigate={navigate} inspect={setSelected} onSearch={() => setSearchOpen(true)} onMore={() => setSettingsOpen(true)}/> : null}
          {view === 'upcoming' ? <UpcomingV4 state={viewState} today={runtime.today} commit={runtime.commit} inspect={setSelected}/> : null}
          {view === 'completed' ? <CompletedV4 state={viewState} today={runtime.today} commit={runtime.commit} inspect={setSelected}/> : null}
          {view === 'tasks' ? <TasksModule
            state={viewState}
            today={runtime.today}
            scope={taskScope}
            commit={runtime.commit}
            googleRpc={runtime.googleRpc}
            inspect={setSelected}
            selectedId={selected?.kind === 'task' ? selected.sourceId : ''}
            onScopeChange={setTaskScope}
            navigate={navigate}
            onSearch={() => setSearchOpen(true)}
            onSettings={() => setSettingsOpen(true)}
            onNewProject={() => setProjectDialog({})}
            onEditProject={id => setProjectDialog({ projectId: id, tab: 'details' })}
            onManageSections={id => setProjectDialog({ projectId: id, tab: 'sections' })}
          /> : null}
          {view === 'habits' && !advanced.habits ? <HabitsV4 state={viewState} today={runtime.today} commit={runtime.commit} createRequest={areaCreateRequest} inspect={setSelected}/> : null}
          {view === 'goals' && !advanced.goals ? <GoalsV4 state={viewState} today={runtime.today} commit={runtime.commit} createRequest={areaCreateRequest} inspect={setSelected}/> : null}
          {view === 'notes' && !advanced.notes ? <NotesV4 state={viewState} today={runtime.today} commit={runtime.commit} createRequest={areaCreateRequest} inspect={setSelected}/> : null}
          {view === 'finance' && !advanced.finance ? <FinanceV4 state={viewState} today={runtime.today} commit={runtime.commit} createRequest={areaCreateRequest} inspect={setSelected}/> : null}
          {secondary.includes(view as SecondaryView) && !(view === 'habits' && !advanced.habits) && !(view === 'goals' && !advanced.goals) && !(view === 'notes' && !advanced.notes) && !(view === 'finance' && !advanced.finance) ? <MinimalAreas key={view === 'files' ? `files:${fileKind}` : String(view)} view={view as SecondaryView} state={viewState} today={runtime.today} commit={runtime.commit} googleRpc={moduleGoogleRpc} createRequest={areaCreateRequest} inspect={setSelected} /> : null}
        </>}
      </div>
    </main>

    <MobileBottomNav view={view} searchOpen={searchOpen} navigate={navigate} onSearch={() => setSearchOpen(true)} onSettings={() => setSettingsOpen(true)} />
    <SectionInlineAdd view={view} onAdd={contextualAdd}/>
    {searchOpen ? <SearchOverlay state={runtime.state} query={search} setQuery={setSearch} onClose={() => setSearchOpen(false)} inspect={setSelected} navigate={navigate} openProject={id => setProjectDialog({ projectId:id, tab:'details' })} /> : null}
    {projectDialog ? <ProjectDrawer state={runtime.state} commit={runtime.commit} projectId={projectDialog.projectId} parentId={projectDialog.parentId} initialTab={projectDialog.tab} onClose={() => setProjectDialog(null)} onSaved={id => { const wasCreating = !projectDialog.projectId; setProjectDialog(null); if (wasCreating) setTaskScope(`project:${id}`) }} onRemoved={() => { setProjectDialog(null); setTaskScope('entrada') }} /> : null}
    {settingsOpen ? <AppSettingsDrawer state={runtime.state} commit={runtime.commit} onClose={() => setSettingsOpen(false)} onPersonalizeToday={() => setSettingsOpen(false)} googleConnected={runtime.googleConnected} calendars={runtime.calendars} calendarDraft={runtime.calendarDraft} setCalendarDraft={runtime.setCalendarDraft} calendarBusy={runtime.calendarBusy} saveCalendars={runtime.saveCalendars} disconnectGoogle={runtime.disconnectGoogle} requestNotifications={runtime.requestNotifications} installPrompt={runtime.installPrompt} install={runtime.install} exportData={runtime.exportData} importData={runtime.importData} importRef={runtime.importRef} syncStatus={runtime.syncStatus} flushRemoteSync={runtime.flushRemoteSync} logout={runtime.logout} /> : null}
    {creating ? <QuickCreateDrawer kind={creating.kind} allowKindSwitch={creating.switchable} state={runtime.state} today={runtime.today} defaultProjectId={creating.kind === 'task' ? activeProjectId : undefined} defaultDate={view === 'today' || (view === 'tasks' && taskScope === 'today') ? runtime.today : ''} commit={runtime.commit} onClose={() => setCreating(null)} /> : null}
    {healthCreating ? <HealthQuickAddDrawer state={runtime.state} today={runtime.today} commit={runtime.commit} onClose={() => setHealthCreating(false)}/> : null}
    <ContextDrawerV2 item={selected} state={runtime.state} today={runtime.today} commit={runtime.commit} googleRpc={runtime.googleRpc} refreshEvents={() => runtime.syncCalendar(runtime.state.configs.calendarios || [])} onClose={() => setSelected(null)} />
  </div>
}
