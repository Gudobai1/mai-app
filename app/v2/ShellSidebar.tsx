'use client'

import type { MaiState } from '../../lib/v2/state'
import type { AppView } from './app-types'
import { MaiIcon } from './MaiIcons'
import type { SecondaryView } from './MinimalAreas'
import styles from './unified.module.css'

const areas: { id: AppView; label: string; icon: string }[] = [
  { id: 'tasks', label: 'Tarefas', icon: 'inbox' },
  { id: 'habits', label: 'Hábitos', icon: 'habits' },
  { id: 'goals', label: 'Metas', icon: 'goals' },
  { id: 'notes', label: 'Notas', icon: 'notes' },
  { id: 'finance', label: 'Finanças', icon: 'finance' },
  { id: 'health', label: 'Bem-estar', icon: 'health' },
  { id: 'files', label: 'Arquivos', icon: 'files' },
]

type Props = {
  state: MaiState
  view: AppView
  sidebarOpen: boolean
  setSidebarOpen: (value: boolean) => void
  navigate: (view: AppView) => void
  onSearch: () => void
  onSettings: () => void
}

export function ShellSidebar(props: Props) {
  const profileName = String(props.state.configs.profileName || props.state.configs.userName || 'Meu perfil')
  const profileInitial = profileName.trim().slice(0, 1).toLocaleUpperCase('pt-BR') || 'M'

  return <>
    <aside className={`${styles.sidebar} mai-v3-sidebar`} data-open={props.sidebarOpen}>
      <div className={`${styles.brand} mai-v3-brand`}>
        <span>M</span><strong>MAI</strong><button onClick={() => props.setSidebarOpen(false)} aria-label="Fechar menu"><MaiIcon name="close" /></button>
      </div>

      <button className={`${styles.sidebarSearch} mai-v3-search`} onClick={props.onSearch}>
        <MaiIcon name="search" /><span>Buscar</span><kbd>Ctrl K</kbd>
      </button>

      <nav className="mai-v3-nav mai-v3-primary-nav">
        <button className="mai-v3-nav-button" data-active={props.view === 'home'} onClick={() => props.navigate('home')}>
          <span className="mai-v3-nav-label"><MaiIcon name="home" /><span>Início</span></span>
        </button>
      </nav>

      <div className="mai-v3-section-title">Áreas</div>
      <nav className="mai-v3-nav mai-v3-area-nav">
        {areas.map(area => <button className="mai-v3-nav-button" key={area.id} data-active={props.view === area.id} onClick={() => props.navigate(area.id)}>
          <span className="mai-v3-nav-label"><MaiIcon name={area.icon} /><span>{area.label}</span></span>
        </button>)}
      </nav>

      <div className="mai-v3-sidebar-footer">
        <button className="mai-v4-settings-button" onClick={props.onSettings} title="Ajustes" aria-label="Ajustes"><span className="material-symbols-rounded">tune</span></button>
        <button className="mai-v3-profile-button" onClick={props.onSettings}><span className="mai-v3-avatar">{profileInitial}</span><span>{profileName}</span></button>
      </div>
    </aside>
    {props.sidebarOpen ? <button className={`${styles.scrim} mai-v3-scrim`} onClick={() => props.setSidebarOpen(false)} aria-label="Fechar menu" /> : null}
  </>
}
