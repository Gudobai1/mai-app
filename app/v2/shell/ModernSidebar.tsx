'use client'

import { useState } from 'react'
import type { MaiState } from '../../../lib/v2/state'
import { Icon } from '../../ds'
import type { AppView } from '../app-types'
import { driveAssetUrl } from '../DriveAsset'
import { NAV_ALIAS, todayCounts, type NavItem } from './nav'
import styles from './ModernShell.module.css'

type GoogleProfile = { name: string; picture?: string; email?: string } | null
type Row = Record<string, any>

type Props = {
  state: MaiState
  today: string
  view: AppView
  navigate: (view: AppView) => void
  onSearch: () => void
  onAdd: () => void
  onSettings: () => void
  onToggleTheme: () => void
  onNewProject?: (parentId?: string) => void
  /** Projeto aberto no momento (para destacar na lista). */
  activeProjectId?: string
  dark: boolean
  profile?: GoogleProfile
}

/*
 * Menu lateral — padrão visual do app (conceito Todoist 6).
 * Buscar no topo, dois grupos de áreas, projetos com foto no fim e perfil
 * com o botão de configurações no rodapé.
 */
const PLAN: NavItem[] = [
  { id: 'today', label: 'Hoje', icon: 'today' },
  { id: 'upcoming', label: 'Em breve', icon: 'event_upcoming' },
  { id: 'completed', label: 'Concluídos', icon: 'task_alt' },
]
const ORGANIZE: NavItem[] = [
  { id: 'finance', label: 'Finanças', icon: 'account_balance_wallet' },
  { id: 'habits', label: 'Hábitos', icon: 'autorenew' },
  { id: 'goals', label: 'Metas', icon: 'flag' },
  { id: 'notes', label: 'Notas', icon: 'sticky_note_2' },
  { id: 'files', label: 'Arquivos', icon: 'folder' },
]

const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : [])

export function ModernSidebar({ state, today, view, navigate, onSearch, onSettings, onNewProject, activeProjectId, profile }: Props) {
  const profileName = String(profile?.name || state.configs.profileName || state.configs.userName || 'Meu perfil')
  const profileInitial = profileName.trim().slice(0, 1).toLocaleUpperCase('pt-BR') || 'M'
  const counts = todayCounts(state, today)
  const [open, setOpen] = useState<Set<string>>(new Set())

  const projects = rows(state.projects).filter(project => project.ativo !== false)
  const ids = new Set(projects.map(project => String(project.id)))
  const roots = projects.filter(project => !project.parent_id || !ids.has(String(project.parent_id)))
  const childrenOf = (id: string) => projects.filter(project => String(project.parent_id || '') === id)
  const openCount = (id: string) => state.tasks.filter(task => !task.concluida && !task.parent_id && String(task.projeto_id || '') === id).length

  const toggle = (id: string) => setOpen(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const renderItem = (item: NavItem) => {
    const active = (NAV_ALIAS[view] ?? view) === item.id
    const badge = item.id === 'today' && counts.due > 0 ? counts.due : 0
    return (
      <button
        key={String(item.id)}
        type="button"
        className={styles.item}
        aria-current={active ? 'page' : undefined}
        onClick={() => navigate(item.id)}
      >
        <Icon name={item.icon} size={21} filled={active} />
        <span className={styles.itemLabel}>{item.label}</span>
        {badge ? (
          <span className={styles.badge} title={counts.overdue ? `${counts.overdue} atrasada(s)` : undefined}>{badge}</span>
        ) : null}
      </button>
    )
  }

  const photo = (project: Row) => {
    const image = driveAssetUrl(project.imagem_url)
    if (image) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img className={styles.projectPhoto} src={image} alt="" loading="lazy" />
    }
    return (
      <span className={styles.projectPhoto} style={{ background: String(project.cor || 'var(--ds-line-strong)') }} aria-hidden="true">
        {String(project.nome || '?').trim().slice(0, 1).toLocaleUpperCase('pt-BR')}
      </span>
    )
  }

  const renderProject = (project: Row, depth = 0) => {
    const id = String(project.id)
    const kids = childrenOf(id)
    const expanded = open.has(id)
    const current = view === 'tasks' && activeProjectId === id
    const count = openCount(id)
    return (
      <div key={id} className={styles.projectBlock}>
        <div className={styles.projectRow} style={depth ? { paddingLeft: 12 + depth * 18 } : undefined} data-active={current || undefined}>
          <button type="button" className={styles.projectButton} aria-current={current ? 'page' : undefined} onClick={() => navigate(`project:${id}`)}>
            {photo(project)}
            <span className={styles.itemLabel}>{String(project.nome || 'Projeto')}</span>
            {count ? <span className={styles.projectCount}>{count}</span> : null}
          </button>
          <button
            type="button"
            className={styles.chevron}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Recolher' : 'Expandir'} ${String(project.nome || 'projeto')}`}
            onClick={() => toggle(id)}
          >
            <Icon name={expanded ? 'expand_more' : 'chevron_right'} size={20} filled={false} />
          </button>
        </div>
        {expanded ? (
          <div className={styles.subProjects}>
            {kids.map(child => renderProject(child, depth + 1))}
            {onNewProject ? (
              <button type="button" className={styles.addProject} style={{ paddingLeft: 12 + (depth + 1) * 18 }} onClick={() => onNewProject(id)}>
                <Icon name="add" size={18} filled={false} />
                <span>Adicionar subprojeto</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <aside className={styles.sidebar} aria-label="Menu principal">
      <button type="button" className={styles.search} onClick={onSearch}>
        <Icon name="search" size={20} filled={false} />
        <span>Buscar</span>
        <span className={styles.kbd}>Ctrl K</span>
      </button>

      <nav className={styles.nav} aria-label="Áreas">
        <div className={styles.group}>
          <div className={styles.groupLabel}>Planejar</div>
          {PLAN.map(renderItem)}
        </div>
        <div className={styles.group}>
          <div className={styles.groupLabel}>Organizar</div>
          {ORGANIZE.map(renderItem)}
        </div>
        <div className={styles.group}>
          <div className={styles.groupLabel}>Projetos</div>
          {roots.map(project => renderProject(project))}
          {onNewProject ? (
            <button type="button" className={styles.addProject} onClick={() => onNewProject()}>
              <Icon name="add" size={20} filled={false} />
              <span>Adicionar projeto</span>
            </button>
          ) : null}
        </div>
      </nav>

      <div className={styles.footer}>
        <div className={styles.profileRow}>
          <span className={styles.avatar}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {profile?.picture ? <img src={profile.picture} alt="" referrerPolicy="no-referrer" /> : profileInitial}
          </span>
          <span className={styles.profileName} title={profile?.email || profileName}>{profileName}</span>
          <button type="button" className={styles.settingsButton} onClick={onSettings} aria-label="Configurações" title="Configurações">
            <Icon name="settings" size={22} filled={false} />
          </button>
        </div>
      </div>
    </aside>
  )
}
