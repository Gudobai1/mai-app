'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { plannerItems } from '../../lib/v2/planner'
import { UnifiedAgenda } from './UnifiedAgenda'
import { AppSettingsDrawer } from './AppSettingsDrawer'
import type { AppView } from './app-types'
import { ContextDrawer, type InspectableItem } from './ContextDrawer'
import { MaiIcon } from './MaiIcons'
import { ProjectDrawer } from './ProjectDrawer'
import { QuickCreateDrawer } from './QuickCreateDrawer'
import { SearchOverlay } from './SearchOverlay'
import { ShellSidebar } from './ShellSidebar'
import { TodayCompact } from './TodayCompact'
import { TodaySettingsDrawer } from './TodaySettingsDrawer'
import { UnifiedAreas, type SecondaryView } from './UnifiedAreas'
import { UnifiedTasks, type TaskWorkspaceView } from './UnifiedTasks'
import { UpcomingCompact } from './UpcomingCompact'
import { useMaiRuntime } from './useMaiRuntime'
import styles from './unified.module.css'

const secondary: SecondaryView[] = ['habits', 'goals', 'notes', 'finance', 'health', 'files']

export function UnifiedAppUx() {
  const runtime = useMaiRuntime()
  const router = useRouter()
  const [view, setView] = useState<AppView>('today')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [todaySettingsOpen, setTodaySettingsOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const [selected, setSelected] = useState<InspectableItem | null>(null)
  const [creating, setCreating] = useState<'task' | 'event' | null>(null)
  const [areaCreateRequest, setAreaCreateRequest] = useState('')

  const todayPlan = runtime.today ? plannerItems(runtime.state, runtime.today, runtime.today) : []
  const overdue = runtime.state.tasks.filter(task => !task.concluida && String(task.data_vencimento || '').slice(0, 10) && String(task.data_vencimento || '').slice(0, 10) < runtime.today)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const editing = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName || '')
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true) }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !editing) { event.preventDefault(); runtime.undo() }
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'q' && !editing) { event.preventDefault(); setCreating('task') }
      if (event.key === 'Escape') { setSearchOpen(false); setSettingsOpen(false); setTodaySettingsOpen(false); setProjectOpen(false); setSelected(null); setCreating(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [runtime.undo])

  function navigate(next: AppView) { setView(next); setSidebarOpen(false); setSelected(null) }
  function quickAdd(type: string) {
    if (type === 'task' || type === 'event') { setCreating(type); return }
    navigate(type as SecondaryView)
    setAreaCreateRequest(`${type}:${Date.now()}`)
  }

  return <div className={styles.appShell}>
    <ShellSidebar state={runtime.state} view={view} todayCount={todayPlan.filter(item => !item.completed).length} overdueCount={overdue.length} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} navigate={navigate} onQuickAdd={quickAdd} onSearch={() => setSearchOpen(true)} onNewProject={() => setProjectOpen(true)} undo={runtime.undo} undoCount={runtime.undoCount} onGoogle={() => { setSettingsOpen(true); void runtime.openGoogle() }} googleConnected={runtime.googleConnected} syncStatus={runtime.syncStatus} onSyncClick={() => runtime.syncStatus.phase === 'local' ? router.push('/login') : runtime.syncStatus.phase === 'error' ? void runtime.flushRemoteSync() : setSettingsOpen(true)} />

    <main className={styles.main}>
      <div className={styles.mobileTop}><button onClick={() => setSidebarOpen(true)}><MaiIcon name="menu" /></button><strong>MAI</strong><button onClick={() => setCreating('task')}><MaiIcon name="plus" /></button></div>
      <div className={styles.workspace}>
        {!runtime.ready ? <div className={styles.loadingState}>Carregando seu MAI…</div> : <>
          {view === 'today' ? <TodayCompact state={runtime.state} today={runtime.today} commit={runtime.commit} navigate={navigate} inspect={setSelected} onPersonalize={() => setTodaySettingsOpen(true)} onNewTask={() => setCreating('task')} /> : null}
          {view === 'inbox' || view.startsWith('project:') ? <UnifiedTasks state={runtime.state} today={runtime.today} view={view as TaskWorkspaceView} commit={runtime.commit} googleRpc={runtime.googleRpc} onOpenAgenda={() => navigate('agenda')} /> : null}
          {view === 'upcoming' ? <UpcomingCompact state={runtime.state} today={runtime.today} inspect={setSelected} onAgenda={() => navigate('agenda')} /> : null}
          {view === 'agenda' ? <UnifiedAgenda state={runtime.state} today={runtime.today} connected={runtime.googleConnected} commit={runtime.commit} googleRpc={runtime.googleRpc} refreshEvents={(start, end) => runtime.syncCalendar(runtime.state.configs.calendarios || [], start, end)} openTask={id => { const task = runtime.state.tasks.find(item => item.id === id); if (task) setSelected({ kind: 'task', sourceId: task.id, title: task.titulo, date: String(task.data_vencimento || '').slice(0, 10), raw: task as Record<string, any> }) }} openArea={navigate} /> : null}
          {secondary.includes(view as SecondaryView) ? <UnifiedAreas view={view as SecondaryView} state={runtime.state} today={runtime.today} commit={runtime.commit} googleRpc={runtime.googleRpc} createRequest={areaCreateRequest} /> : null}
        </>}
      </div>
    </main>

    {searchOpen ? <SearchOverlay state={runtime.state} query={search} setQuery={setSearch} onClose={() => setSearchOpen(false)} inspect={setSelected} navigate={navigate} /> : null}
    {projectOpen ? <ProjectDrawer state={runtime.state} commit={runtime.commit} onClose={() => setProjectOpen(false)} onCreated={id => { setProjectOpen(false); navigate(`project:${id}`) }} /> : null}
    {todaySettingsOpen ? <TodaySettingsDrawer state={runtime.state} commit={runtime.commit} onClose={() => setTodaySettingsOpen(false)} /> : null}
    {settingsOpen ? <AppSettingsDrawer state={runtime.state} commit={runtime.commit} onClose={() => setSettingsOpen(false)} onPersonalizeToday={() => { setSettingsOpen(false); setTodaySettingsOpen(true) }} googleConnected={runtime.googleConnected} calendars={runtime.calendars} calendarDraft={runtime.calendarDraft} setCalendarDraft={runtime.setCalendarDraft} calendarBusy={runtime.calendarBusy} saveCalendars={runtime.saveCalendars} disconnectGoogle={runtime.disconnectGoogle} requestNotifications={runtime.requestNotifications} installPrompt={runtime.installPrompt} install={runtime.install} exportData={runtime.exportData} importData={runtime.importData} importRef={runtime.importRef} syncStatus={runtime.syncStatus} flushRemoteSync={runtime.flushRemoteSync} logout={runtime.logout} /> : null}
    {creating ? <QuickCreateDrawer kind={creating} state={runtime.state} today={runtime.today} commit={runtime.commit} onClose={() => setCreating(null)} /> : null}
    <ContextDrawer item={selected} state={runtime.state} today={runtime.today} commit={runtime.commit} googleRpc={runtime.googleRpc} refreshEvents={() => runtime.syncCalendar(runtime.state.configs.calendarios || [])} onClose={() => setSelected(null)} />
  </div>
}
