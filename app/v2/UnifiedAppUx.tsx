'use client'

import { isDarkMode } from './theme'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, applyAppearance, normalizeAppearance } from '../ds'
import type { MaiState } from '../../lib/v2/state'
import { AgendaView } from './AgendaView'
import { AppSettingsDrawer } from './AppSettingsDrawer'
import { AppTopBar } from './AppTopBar'
import type { AppView, SecondaryView, TaskModuleScope } from './app-types'
import { ItemDetail } from './detail/ItemDetail'
import { ConfirmHost } from './shell/ConfirmDialog'
import { UndoToast } from './shell/UndoToast'
import { AuthorCtx } from './detail/Comments'
import { QuickAdd, type QuickAddKind } from './shell/QuickAdd'
import type { InspectableItem } from './ContextDrawer'
import { FinanceV4 } from './FinanceV4'
import { GoalsModern } from './goals/GoalsModern'
import { HabitsModern } from './habits/HabitsModern'
import { NotesV4 } from './NotesV4'
import { ProjectEditor } from './tasks/ProjectEditor'
import { QuickCreateDrawer } from './QuickCreateDrawer'
import { SearchOverlay } from './SearchOverlay'
import { matchShortcut, normalizeShortcuts } from '../../lib/v2/shortcuts'
import { SectionInlineAdd } from './SectionInlineAdd'
import { ModernBottomNav } from './shell/ModernBottomNav'
import { ModernSidebar } from './shell/ModernSidebar'
import { TasksModern } from './tasks/TasksModern'
import { TodayModern } from './today/TodayModern'
import { EmBreve } from './upcoming/EmBreve'
import { PullToRefresh } from './PullToRefresh'
import { useMaiRuntime } from './useMaiRuntime'
import styles from './unified.module.css'

const secondary: SecondaryView[] = ['habits', 'goals', 'notes', 'finance']
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

  if (view === 'notes') {
    const pinned = String(filters.pinned || 'all')
    if (pinned === 'all') return state
    return { ...state, notes: rows(state.notes).filter(note => pinned === 'pinned' ? note.fixado === true : note.fixado !== true) }
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
  return ['home', 'tasks', 'today', 'inbox', 'upcoming', 'agenda', ...secondary].includes(text as any) || text.startsWith('project:')
}
const scopeFromLegacy = (value: unknown): TaskModuleScope => {
  const text = String(value || '')
  if (['today', 'upcoming', 'entrada', 'late', 'nodate', 'all'].includes(text)) return text as TaskModuleScope
  if (text === 'inbox') return 'entrada'
  if (text.startsWith('project:')) return text as TaskModuleScope
  return 'entrada'
}

export function UnifiedAppUx() {
  const runtime = useMaiRuntime()
  const restoredView = useRef(false)
  const cleanedLegacyKanban = useRef(false)
  const [view, setView] = useState<AppView>('today')
  const [searchOpen, setSearchOpen] = useState(false)
  const [sidebarPeek, setSidebarPeek] = useState(false)
  const peekTimer = useRef<number | null>(null)
  const [search, setSearch] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [projectDialog, setProjectDialog] = useState<ProjectDialog>(null)
  const [selected, setSelected] = useState<InspectableItem | null>(null)
  const [creating, setCreating] = useState<CreateState>(null)
  const [quickAdd, setQuickAdd] = useState<{ kinds: QuickAddKind[]; initial: QuickAddKind; projectId?: string; date?: string } | null>(null)
  const [areaCreateRequest, setAreaCreateRequest] = useState('')
  const [googleProfile, setGoogleProfile] = useState<GoogleProfile>(null)
  const taskScope = scopeFromLegacy(runtime.state.configs.taskModuleScope)
  const activeProjectId = taskScope.startsWith('project:') ? taskScope.slice(8) : 'entrada'
  const viewState = useMemo(() => filteredStateForView(runtime.state, view, runtime.today), [runtime.state, view, runtime.today])
  const currentModuleFilters = moduleFilterMap(runtime.state)[String(view)] || {}

  useEffect(() => {
    let active = true
    fetch('/api/google/profile', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(profile => { if (active && profile?.name) setGoogleProfile(profile) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!runtime.ready || cleanedLegacyKanban.current) return
    cleanedLegacyKanban.current = true
    const controls = moduleControlMap(runtime.state)
    let changed = false
    const next = Object.fromEntries(Object.entries(controls).map(([key,value]) => {
      if (key === 'today' || key === 'tasks' || !Object.prototype.hasOwnProperty.call(value,'layout')) return [key,value]
      const { layout: _layout, ...rest } = value
      changed = true
      return [key,rest]
    }))
    if (changed) runtime.commit(current => ({ ...current, configs:{ ...current.configs, moduleControls:next } }))
  }, [runtime.ready])

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

  const shortcuts = normalizeShortcuts(runtime.state.configs.shortcuts)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const editing = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName || '')
      if ((event.ctrlKey || event.metaKey) && (event.code === 'Space')) { event.preventDefault(); setSearchOpen(true) }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !editing) { event.preventDefault(); runtime.undo() }
      const action = !editing ? matchShortcut(event, shortcuts) : null
      if (action === 'newTask' && view !== 'completed') { event.preventDefault(); contextualAdd() }
      if (action === 'search') { event.preventDefault(); setSearchOpen(true) }
      if (action === 'settings') { event.preventDefault(); setSettingsOpen(true) }
      if (event.key === 'Escape') { setSearchOpen(false); setSettingsOpen(false); setProjectDialog(null); setSelected(null); setCreating(null); setQuickAdd(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, taskScope, shortcuts])

  const isDark = isDarkMode(runtime.state.configs.theme)
  function toggleTheme() {
    runtime.commit(current => ({ ...current, configs: { ...current.configs, theme: isDarkMode(current.configs.theme) ? 'light' : 'dark' } }))
  }

  function setTaskScope(scope: TaskModuleScope) {
    setView('tasks')
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
    setSelected(null)
    runtime.commit(current => ({ ...current, configs: { ...current.configs, lastView: resolved } }))
  }

  function addByType(type: string) {
    if (type === 'context' || type === 'task' || type === 'event') {
      const wantsEvent = type === 'event' || (type === 'context' && (view === 'agenda' || view === 'upcoming'))
      if (view === 'tasks' && type !== 'event') { setQuickAdd({ kinds: ['task'], initial: 'task', projectId: activeProjectId, date: taskScope === 'today' ? runtime.today : '' }); return }
      if (view === 'agenda' || view === 'upcoming') { setQuickAdd({ kinds: ['event', 'task', 'finance'], initial: wantsEvent ? 'event' : 'task', date: runtime.today }); return }
      setQuickAdd({ kinds: ['task', 'event', 'finance'], initial: wantsEvent ? 'event' : 'task', date: runtime.today })
      return
    }
    if (type === 'finance') { setQuickAdd({ kinds: ['task', 'event', 'finance'], initial: 'finance', date: runtime.today }); return }
    if (secondary.includes(type as SecondaryView)) {
      if (view !== type) navigate(type as SecondaryView)
      setAreaCreateRequest(`${type}:${Date.now()}`)
    }
  }

  function contextualAdd(requestedType?: string) {
    if (requestedType) return addByType(requestedType)
    if (view === 'today' || view === 'upcoming' || view === 'tasks' || view === 'agenda') return addByType('context')
    if (view === 'completed') return
    return addByType(view)
  }

  const sidebarAutoHide = Boolean(runtime.state.configs.sidebarAutoHide)
  const appearanceNow = normalizeAppearance(runtime.state.configs.appearance)
  const sidebarCollapsed = sidebarAutoHide || Boolean(runtime.state.configs.sidebarHidden)
  // Ocultar automaticamente nas laterais: a barra vira só ícones (trilho) e abre por cima ao passar o mouse.
  const autoRail = sidebarAutoHide && (appearanceNow.layout === 'left' || appearanceNow.layout === 'right')
  const sidebarMode = autoRail ? 'open' : !sidebarCollapsed ? 'open' : sidebarPeek ? 'peek' : 'hidden'
  useEffect(() => {
    applyAppearance({ ...appearanceNow, rail: autoRail ? !sidebarPeek : appearanceNow.rail })
    document.documentElement.toggleAttribute('data-mai-peek', autoRail && sidebarPeek)
    return () => document.documentElement.removeAttribute('data-mai-peek')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime.state.configs.appearance, autoRail, sidebarPeek])
  const setConfig = (patch: Record<string, unknown>) => runtime.commit(current => ({ ...current, configs: { ...current.configs, ...patch } }))
  const startPeek = () => { if (!sidebarAutoHide) return; if (peekTimer.current) window.clearTimeout(peekTimer.current); setSidebarPeek(true) }
  const endPeek = () => { if (!sidebarCollapsed) return; if (peekTimer.current) window.clearTimeout(peekTimer.current); peekTimer.current = window.setTimeout(() => setSidebarPeek(false), 350) }

  return <div className={`${styles.appShell} mai-v3-shell`} data-view={String(view)} data-sidebar={sidebarMode}>
    {sidebarCollapsed && !sidebarPeek && !autoRail ? <div className="mai-edge" onMouseEnter={sidebarAutoHide ? startPeek : undefined} aria-hidden="true" /> : null}
    {sidebarCollapsed && !sidebarAutoHide ? <button type="button" className="mai-reveal" onClick={() => setConfig({ sidebarHidden: false })} aria-label="Mostrar a barra lateral" title="Mostrar a barra lateral"><Icon name="left_panel_close" size={20} filled={false} /></button> : null}
    <ModernSidebar onNew={() => contextualAdd()} commit={runtime.commit} rail={appearanceNow.rail} canRail={appearanceNow.layout === 'left' || appearanceNow.layout === 'right'} onToggleRail={() => setConfig({ appearance: { ...appearanceNow, rail: !appearanceNow.rail } })} onInspect={setSelected} autoHide={sidebarAutoHide} onToggleHidden={() => setConfig({ sidebarHidden: true })} onAutoHide={value => { setConfig({ sidebarAutoHide: value, sidebarHidden: false }); setSidebarPeek(false) }} onLogout={runtime.logout} onEnter={startPeek} onLeave={endPeek} state={runtime.state} today={runtime.today} view={view} navigate={navigate} onSearch={() => setSearchOpen(true)} onAdd={() => contextualAdd()} onSettings={() => setSettingsOpen(true)} onToggleTheme={toggleTheme} onNewProject={parentId => setProjectDialog(parentId ? { parentId } : {})} onEditProject={id => setProjectDialog({ projectId: id, tab: 'details' })} activeProjectId={activeProjectId} dark={isDark} profile={googleProfile} />

    <main className={`${styles.main} mai-v3-main`}>
      <div key={view} className={`${styles.workspace} mai-v3-workspace mai-view-enter`}>
        {runtime.ready && view !== 'today' && view !== 'tasks' && view !== 'upcoming' && view !== 'finance' ? <AppTopBar state={runtime.state} today={runtime.today} view={view} taskScope={taskScope} commit={runtime.commit} onTaskScopeChange={setTaskScope} onSettings={() => setSettingsOpen(true)} /> : null}
        {!runtime.ready ? <div className={styles.loadingState}>Carregando seu Bukid…</div> : <>
          {view === 'today' ? <TodayModern state={viewState} today={runtime.today} commit={runtime.commit} navigate={navigate} inspect={setSelected} onAddTask={projectId => setQuickAdd({ kinds: ['task'], initial: 'task', projectId, date: runtime.today })} onAddEvent={() => setQuickAdd({ kinds: ['event'], initial: 'event', date: runtime.today })} options={<AppTopBar state={runtime.state} today={runtime.today} view={view} taskScope={taskScope} commit={runtime.commit} onTaskScopeChange={setTaskScope} onSettings={() => setSettingsOpen(true)} />}/> : null}
          {view === 'agenda' ? <AgendaView state={runtime.state} today={runtime.today} connected={runtime.googleConnected} commit={runtime.commit} googleRpc={runtime.googleRpc} refreshEvents={(start, end) => runtime.syncCalendar(runtime.state.configs.calendarios || [], start, end)} openTask={() => navigate('tasks')} openArea={area => navigate(area)} /> : null}
          {view === 'upcoming' ? <EmBreve state={viewState} today={runtime.today} commit={runtime.commit} inspect={setSelected} syncRange={(start, end) => { runtime.syncCalendar(runtime.state.configs.calendarios || [], start, end) }} /> : null}
          {view === 'tasks' ? <TasksModern
            state={runtime.state}
            today={runtime.today}
            scope={taskScope}
            commit={runtime.commit}
            inspect={setSelected}
            onScopeChange={setTaskScope}
            navigate={navigate}
            onAdd={() => contextualAdd()}
            onNewProject={parentId => setProjectDialog(parentId ? { parentId } : {})}
            onEditProject={id => setProjectDialog({ projectId: id, tab: 'details' })}
            onManageSections={id => setProjectDialog({ projectId: id, tab: 'sections' })}
          /> : null}
          {view === 'habits' ? <HabitsModern state={viewState} today={runtime.today} commit={runtime.commit} createRequest={areaCreateRequest} inspect={setSelected}/> : null}
          {view === 'goals' ? <GoalsModern state={viewState} today={runtime.today} commit={runtime.commit} createRequest={areaCreateRequest} inspect={setSelected}/> : null}
          {view === 'notes' ? <NotesV4 state={viewState} today={runtime.today} commit={runtime.commit} createRequest={areaCreateRequest} inspect={setSelected}/> : null}
          {view === 'finance' ? <FinanceV4 state={viewState} today={runtime.today} commit={runtime.commit} createRequest={areaCreateRequest} inspect={setSelected} options={<AppTopBar state={runtime.state} today={runtime.today} view={view} taskScope={taskScope} commit={runtime.commit} onTaskScopeChange={setTaskScope} onSettings={() => setSettingsOpen(true)} />}/> : null}
        </>}
      </div>
    </main>

    <ModernBottomNav onNew={() => contextualAdd()} state={runtime.state} activeProjectId={activeProjectId} onNewProject={parentId => setProjectDialog(parentId ? { parentId } : {})} view={view} searchOpen={searchOpen} navigate={navigate} onSearch={() => setSearchOpen(true)} onSettings={() => setSettingsOpen(true)} onToggleTheme={toggleTheme} dark={isDark} />
    <SectionInlineAdd view={view} onAdd={contextualAdd}/>
    {searchOpen ? <SearchOverlay state={runtime.state} today={runtime.today} commit={runtime.commit} query={search} setQuery={setSearch} onClose={() => setSearchOpen(false)} inspect={setSelected} navigate={navigate} openProject={id => setProjectDialog({ projectId:id, tab:'details' })} /> : null}
    {projectDialog ? <ProjectEditor state={runtime.state} commit={runtime.commit} projectId={projectDialog.projectId} parentId={projectDialog.parentId} initialTab={projectDialog.tab} onClose={() => setProjectDialog(null)} onSaved={id => { const wasCreating = !projectDialog.projectId; setProjectDialog(null); if (wasCreating) setTaskScope(`project:${id}`) }} onRemoved={() => { setProjectDialog(null); setTaskScope('entrada') }} /> : null}
    <PullToRefresh onRefresh={runtime.refreshItems} />
    {settingsOpen ? <AppSettingsDrawer profile={googleProfile} state={runtime.state} commit={runtime.commit} onClose={() => setSettingsOpen(false)} googleConnected={runtime.googleConnected} calendars={runtime.calendars} calendarDraft={runtime.calendarDraft} setCalendarDraft={runtime.setCalendarDraft} calendarBusy={runtime.calendarBusy} saveCalendars={runtime.saveCalendars} disconnectGoogle={runtime.disconnectGoogle} requestNotifications={runtime.requestNotifications} testReminder={runtime.testReminder} installPrompt={runtime.installPrompt} install={runtime.install} exportData={runtime.exportData} importData={runtime.importData} importRef={runtime.importRef} syncStatus={runtime.syncStatus} flushRemoteSync={runtime.flushRemoteSync} logout={runtime.logout} /> : null}
    {quickAdd ? <QuickAdd kinds={quickAdd.kinds} initial={quickAdd.initial} state={runtime.state} today={runtime.today} defaultProjectId={quickAdd.projectId} defaultDate={quickAdd.date} commit={runtime.commit} onFinance={() => addByType('finance')} onClose={() => setQuickAdd(null)} /> : null}
    {creating ? <QuickCreateDrawer kind={creating.kind} allowKindSwitch={creating.switchable} state={runtime.state} today={runtime.today} defaultProjectId={creating.kind === 'task' ? activeProjectId : undefined} defaultDate={view === 'today' || (view === 'tasks' && taskScope === 'today') ? runtime.today : ''} commit={runtime.commit} onClose={() => setCreating(null)} /> : null}
    <UndoToast toast={runtime.toast} onUndo={runtime.undo} onClose={runtime.dismissToast} />
    <ConfirmHost />
    <AuthorCtx.Provider value={googleProfile}>
      {selected?.kind === 'finance' ? <FinanceV4 popupOnly state={runtime.state} today={runtime.today} commit={runtime.commit} inspect={setSelected} openRequest={{ key: `${selected.sourceId}:${selected.date || ''}`, item: selected.raw }} onPopupClose={() => setSelected(null)} /> : null}
      <ItemDetail item={selected?.kind === 'finance' ? null : selected} state={runtime.state} today={runtime.today} commit={runtime.commit} googleRpc={runtime.googleRpc} refreshEvents={() => runtime.syncCalendar(runtime.state.configs.calendarios || [])} onOpenItem={setSelected} onClose={() => setSelected(null)} />
    </AuthorCtx.Provider>
  </div>
}