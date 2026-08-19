'use client'

import type { MaiState, SyncStatus } from '../../lib/v2/state'
import type { AppView } from './app-types'
import { MaiIcon } from './MaiIcons'
import type { SecondaryView } from './UnifiedAreas'
import styles from './unified.module.css'

const areas: { id: SecondaryView; label: string; icon: string }[] = [
  { id: 'habits', label: 'Rotinas', icon: 'habits' },
  { id: 'goals', label: 'Metas', icon: 'goals' },
  { id: 'notes', label: 'Notas', icon: 'notes' },
  { id: 'finance', label: 'Finanças', icon: 'finance' },
  { id: 'health', label: 'Bem-estar', icon: 'health' },
  { id: 'files', label: 'Arquivos', icon: 'files' },
]

type Props = {
  state: MaiState
  view: AppView
  todayCount: number
  overdueCount: number
  sidebarOpen: boolean
  setSidebarOpen: (value: boolean) => void
  navigate: (view: AppView) => void
  onSearch: () => void
  undo: () => void
  undoCount: number
  onSettings: () => void
  onGoogle: () => void
  googleConnected: boolean | null
  syncStatus: SyncStatus
  onSyncClick: () => void
}

export function ShellSidebar(props: Props) {
  const openTasks = props.state.tasks.filter(task => !task.concluida)
  const inboxCount = openTasks.filter(task => String(task.projeto_id || 'entrada') === 'entrada').length

  return <>
    <aside className={styles.sidebar} data-open={props.sidebarOpen}>
      <div className={styles.brand}><span>M</span><strong>MAI</strong><button onClick={() => props.setSidebarOpen(false)}><MaiIcon name="close" /></button></div>
      <button className={styles.sidebarSearch} onClick={props.onSearch}><MaiIcon name="search" /><span>Buscar</span><kbd>Ctrl K</kbd></button>

      <nav className={styles.primaryNav}>
        <button data-active={props.view === 'inbox' || props.view.startsWith('project:')} onClick={() => props.navigate('inbox')}><MaiIcon name="inbox" /><span>Entrada</span><b>{inboxCount || ''}</b></button>
        <button data-active={props.view === 'today'} onClick={() => props.navigate('today')}><MaiIcon name="today" /><span>Hoje</span><b>{props.todayCount + props.overdueCount || ''}</b></button>
        <button data-active={props.view === 'upcoming'} onClick={() => props.navigate('upcoming')}><MaiIcon name="upcoming" /><span>Em breve</span></button>
      </nav>

      <div className={styles.sidebarSectionHead}><span>Áreas</span></div>
      <nav className={styles.areaNav}>{areas.map(area => <button key={area.id} data-active={props.view === area.id} onClick={() => props.navigate(area.id)}><MaiIcon name={area.icon} /><span>{area.label}</span></button>)}</nav>

      <div className={styles.sidebarBottom}>
        <button onClick={props.undo} disabled={!props.undoCount}><span>↶</span><span>Desfazer</span><kbd>Ctrl Z</kbd></button>
        <button onClick={props.onSettings}><MaiIcon name="settings" size={18}/><span><strong>Configurações</strong><small>Aparência e preferências</small></span><span/></button>
        <button onClick={props.onGoogle}><span className={styles.googleMark}>G</span><span><strong>Google</strong><small>{props.googleConnected === null ? 'Verificando' : props.googleConnected ? 'Agenda e Drive conectados' : 'Conectar Agenda e Drive'}</small></span><MaiIcon name="settings" size={16} /></button>
        <button className={styles.syncButtonSide} data-phase={props.syncStatus.phase} onClick={props.onSyncClick}><i /><span>{props.syncStatus.message}</span></button>
      </div>
    </aside>
    {props.sidebarOpen ? <button className={styles.scrim} onClick={() => props.setSidebarOpen(false)} /> : null}
  </>
}
