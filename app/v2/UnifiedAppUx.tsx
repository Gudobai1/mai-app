'use client'

import { useEffect, useRef, useState } from 'react'
import { AppSettingsDrawer } from './AppSettingsDrawer'
import type { AppView, TaskModuleScope } from './app-types'
import { ContextDrawer, type InspectableItem } from './ContextDrawer'
import { FinanceV4 } from './FinanceV4'
import { FloatingAddButton } from './FloatingAddButton'
import { HabitsV4 } from './HabitsV4'
import { HealthQuickAddDrawer } from './HealthQuickAddDrawer'
import { HomeCompact } from './HomeCompact'
import { MaiIcon } from './MaiIcons'
import { MinimalAreas, type SecondaryView } from './MinimalAreas'
import { ProjectDrawer } from './ProjectDrawer'
import { QuickCreateDrawer } from './QuickCreateDrawer'
import { SearchOverlay } from './SearchOverlay'
import { ShellSidebar } from './ShellSidebar'
import { TasksModule } from './TasksModule'
import { useMaiRuntime } from './useMaiRuntime'
import styles from './unified.module.css'

const secondary: SecondaryView[] = ['habits', 'goals', 'notes', 'finance', 'health', 'files']
type ProjectDialog = { projectId?: string; parentId?: string; tab?: 'details' | 'sections' } | null
type CreateState = { kind: 'task' | 'event'; switchable?: boolean } | null

const validView = (value: unknown): value is AppView => {
  const text = String(value || '')
  return ['home', 'tasks', 'today', 'inbox', 'upcoming', ...secondary].includes(text as any) || text.startsWith('project:')
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
  const [view, setView] = useState<AppView>('home')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [projectDialog, setProjectDialog] = useState<ProjectDialog>(null)
  const [selected, setSelected] = useState<InspectableItem | null>(null)
  const [creating, setCreating] = useState<CreateState>(null)
  const [healthCreating, setHealthCreating] = useState(false)
  const [areaCreateRequest, setAreaCreateRequest] = useState('')
  const taskScope = scopeFromLegacy(runtime.state.configs.taskModuleScope)
  const activeProjectId = taskScope.startsWith('project:') ? taskScope.slice(8) : 'entrada'
  const advanced = runtime.state.configs.advancedAreas && typeof runtime.state.configs.advancedAreas === 'object' ? runtime.state.configs.advancedAreas as Record<string,boolean> : {}

  useEffect(() => {
    if (!runtime.ready || restoredView.current) return
    restoredView.current = true
    const saved = runtime.state.configs.lastView
    if (!validView(saved)) return
    const text = String(saved)
    if (text === 'today' || text === 'upcoming' || text === 'inbox' || text.startsWith('project:')) {
      setView('tasks')
      runtime.commit(current => ({ ...current, configs: { ...current.configs, lastView: 'tasks', taskModuleScope: scopeFromLegacy(text) } }))
    } else setView(saved)
  }, [runtime.ready, runtime.state.configs.lastView])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const editing = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName || '')
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true) }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !editing) { event.preventDefault(); runtime.undo() }
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'q' && !editing) { event.preventDefault(); contextualAdd() }
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
    if (text === 'today' || text === 'upcoming' || text === 'inbox' || text.startsWith('project:')) {
      setTaskScope(scopeFromLegacy(text))
      return
    }
    setView(next)
    setSidebarOpen(false)
    setSelected(null)
    runtime.commit(current => ({ ...current, configs: { ...current.configs, lastView: next } }))
  }

  function addByType(type: string) {
    if (type === 'context') {
      if (view === 'home') { setCreating({ kind: 'task', switchable: true }); return }
      if (view === 'tasks') {
        if (taskScope === 'today' || taskScope === 'upcoming') setCreating({ kind: 'task', switchable: true })
        else setCreating({ kind: 'task' })
        return
      }
    }
    if (type === 'task' || type === 'event') { setCreating({ kind: type }); return }
    if (type === 'health') { if (view !== 'health') navigate('health'); setHealthCreating(true); return }
    if (secondary.includes(type as SecondaryView)) {
      if (view !== type) navigate(type as SecondaryView)
      setAreaCreateRequest(`${type}:${Date.now()}`)
    }
  }

  function contextualAdd() {
    if (view === 'home' || view === 'tasks') return addByType('context')
    return addByType(view)
  }

  return <div className={`${styles.appShell} mai-v3-shell`}>
    <ShellSidebar state={runtime.state} view={view} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} navigate={navigate} onSearch={() => setSearchOpen(true)} onSettings={() => setSettingsOpen(true)} />

    <main className={`${styles.main} mai-v3-main`}>
      <div className={styles.mobileTop}><button onClick={() => setSidebarOpen(true)}><MaiIcon name="menu" /></button><strong>MAI</strong><span /></div>
      <div className={`${styles.workspace} mai-v3-workspace`}>
        {!runtime.ready ? <div className={styles.loadingState}>Carregando seu MAI…</div> : <>
          {view === 'home' ? <HomeCompact state={runtime.state} today={runtime.today} navigate={navigate} onSearch={() => setSearchOpen(true)}/> : null}
          {view === 'tasks' ? <TasksModule
            state={runtime.state}
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
          {view === 'habits' && !advanced.habits ? <HabitsV4 state={runtime.state} today={runtime.today} commit={runtime.commit} createRequest={areaCreateRequest}/> : null}
          {view === 'finance' && !advanced.finance ? <FinanceV4 state={runtime.state} today={runtime.today} commit={runtime.commit} createRequest={areaCreateRequest} inspect={setSelected}/> : null}
          {secondary.includes(view as SecondaryView) && !(view === 'habits' && !advanced.habits) && !(view === 'finance' && !advanced.finance) ? <MinimalAreas view={view as SecondaryView} state={runtime.state} today={runtime.today} commit={runtime.commit} googleRpc={runtime.googleRpc} createRequest={areaCreateRequest} inspect={setSelected} /> : null}
        </>}
      </div>
    </main>

    <FloatingAddButton view={view} onAdd={addByType}/>
    {searchOpen ? <SearchOverlay state={runtime.state} query={search} setQuery={setSearch} onClose={() => setSearchOpen(false)} inspect={setSelected} navigate={navigate} /> : null}
    {projectDialog ? <ProjectDrawer state={runtime.state} commit={runtime.commit} projectId={projectDialog.projectId} parentId={projectDialog.parentId} initialTab={projectDialog.tab} onClose={() => setProjectDialog(null)} onSaved={id => { const wasCreating = !projectDialog.projectId; setProjectDialog(null); if (wasCreating) setTaskScope(`project:${id}`) }} onRemoved={() => { setProjectDialog(null); setTaskScope('entrada') }} /> : null}
    {settingsOpen ? <AppSettingsDrawer state={runtime.state} commit={runtime.commit} onClose={() => setSettingsOpen(false)} onPersonalizeToday={() => setSettingsOpen(false)} googleConnected={runtime.googleConnected} calendars={runtime.calendars} calendarDraft={runtime.calendarDraft} setCalendarDraft={runtime.setCalendarDraft} calendarBusy={runtime.calendarBusy} saveCalendars={runtime.saveCalendars} disconnectGoogle={runtime.disconnectGoogle} requestNotifications={runtime.requestNotifications} installPrompt={runtime.installPrompt} install={runtime.install} exportData={runtime.exportData} importData={runtime.importData} importRef={runtime.importRef} syncStatus={runtime.syncStatus} flushRemoteSync={runtime.flushRemoteSync} logout={runtime.logout} /> : null}
    {creating ? <QuickCreateDrawer kind={creating.kind} allowKindSwitch={creating.switchable} state={runtime.state} today={runtime.today} defaultProjectId={creating.kind === 'task' ? activeProjectId : undefined} defaultDate={view === 'tasks' && taskScope === 'today' ? runtime.today : view === 'home' ? runtime.today : ''} commit={runtime.commit} onClose={() => setCreating(null)} /> : null}
    {healthCreating ? <HealthQuickAddDrawer state={runtime.state} today={runtime.today} commit={runtime.commit} onClose={() => setHealthCreating(false)}/> : null}
    <ContextDrawer item={selected} state={runtime.state} today={runtime.today} commit={runtime.commit} googleRpc={runtime.googleRpc} refreshEvents={() => runtime.syncCalendar(runtime.state.configs.calendarios || [])} onClose={() => setSelected(null)} />
  </div>
}
