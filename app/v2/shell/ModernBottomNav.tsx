'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Icon, IconButton } from '../../ds'
import type { AppView, Row } from '../app-types'
import type { MaiState } from '../../../lib/v2/state'
import { ProjectMark } from './ProjectMark'
import { NAV_ALIAS, NAV_GROUPS } from './nav'
import { normalizeSidebar, sidebarHidden, sidebarIconName } from './sidebar-config'
import styles from './ModernShell.module.css'

type Props = {
  state: MaiState
  activeProjectId?: string
  onNewProject?: (parentId?: string) => void
  view: AppView
  searchOpen: boolean
  navigate: (view: AppView) => void
  onSearch: () => void
  onSettings: () => void
  onToggleTheme: () => void
  dark: boolean
}

/** Áreas com botão próprio na barra; as demais ficam na folha de módulos. */
const barViews = new Set(['today', 'upcoming'])
/** Tarefas não aparece como item: o acesso é por Entrada e Projetos, como no desktop. */
const hiddenFromSheet = new Set(['today', 'upcoming', 'tasks'])

export function ModernBottomNav({ state, activeProjectId, onNewProject, view, searchOpen, navigate, onSearch, onSettings, onToggleTheme, dark }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    setSheetOpen(false)
  }, [view])

  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSheetOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetOpen])

  /* Projetos como no menu do desktop: Entrada + árvore de projetos (sem item "Tarefas"). */
  const projects = ((Array.isArray(state.projects) ? state.projects : []) as Row[]).filter(project => project.ativo !== false)
  const ids = new Set(projects.map(project => String(project.id)))
  const roots = projects.filter(project => !project.parent_id || !ids.has(String(project.parent_id)))
  const childrenOf = (id: string) => projects.filter(project => String(project.parent_id || '') === id)
  const renderProject = (project: Row, depth = 0): ReactNode => {
    const id = String(project.id)
    const current = view === 'tasks' && activeProjectId === id
    return (
      <div key={id}>
        <button type="button" className={styles.sheetItem} style={depth ? { paddingLeft: 4 + depth * 22 } : undefined} aria-current={current ? 'page' : undefined} onClick={() => go(`project:${id}` as AppView)}>
          <ProjectMark project={project} />
          <span>{String(project.nome || 'Projeto')}</span>
          <Icon name="chevron_right" size={20} filled={false} />
        </button>
        {childrenOf(id).map(child => renderProject(child, depth + 1))}
      </div>
    )
  }

  const go = (next: AppView) => {
    setSheetOpen(false)
    navigate(next)
  }

  const tab = (id: AppView, label: string, icon: string) => {
    const active = view === id && !sheetOpen && !searchOpen
    return (
      <button type="button" className={styles.tab} aria-current={active ? 'page' : undefined} onClick={() => go(id)}>
        <Icon name={icon} size={24} filled={active} />
        <span>{label}</span>
      </button>
    )
  }

  const modulesActive = sheetOpen || (!barViews.has(String(view)) && !searchOpen)
  const side = normalizeSidebar(state.configs.sidebar, Boolean(state.configs.hideInbox))
  const sheetGroups = NAV_GROUPS.map(group => ({ ...group, items: group.items.filter(item => !hiddenFromSheet.has(String(item.id)) && !sidebarHidden(side, String(item.id))) })).filter(group => group.items.length)

  return (
    <>
      {sheetOpen ? (
        <div className={styles.sheetLayer}>
          <button type="button" className={styles.scrim} aria-label="Fechar" onClick={() => setSheetOpen(false)} />
          <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="mai-modules-title">
            <header className={styles.sheetHeader}>
              <h2 id="mai-modules-title" className={styles.sheetTitle}>Mais</h2>
              <div className={styles.sheetHeaderActions}>
                <IconButton icon={dark ? 'dark_mode' : 'light_mode'} label={dark ? 'Usar tema claro' : 'Usar tema escuro'} size={40} onClick={onToggleTheme} aria-pressed={dark} />
                <IconButton icon="close" label="Fechar" size={40} onClick={() => setSheetOpen(false)} />
              </div>
            </header>

            {sheetGroups.map((group, index) => (
              <div key={index}>
                {group.label ? <h3 className={styles.sheetGroupLabel}>{group.label}</h3> : null}
                <div className={styles.sheetGrid}>
                  {group.items.map(item => (
                    <button key={String(item.id)} type="button" className={styles.sheetItem} aria-current={(NAV_ALIAS[view] ?? view) === item.id ? 'page' : undefined} onClick={() => go(item.id)}>
                      {side.icons ? <Icon name={sidebarIconName(side, String(item.id), item.icon)} size={22} filled={(NAV_ALIAS[view] ?? view) === item.id} /> : <span aria-hidden="true" />}
                      <span>{item.label}</span>
                      <Icon name="chevron_right" size={20} filled={false} />
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div>
              <h3 className={styles.sheetGroupLabel}>Projetos</h3>
              <div className={styles.sheetGrid}>
                {sidebarHidden(side, 'inbox') ? null : (
                  <button type="button" className={styles.sheetItem} aria-current={view === 'tasks' && activeProjectId === 'entrada' ? 'page' : undefined} onClick={() => go('inbox' as AppView)}>
                    {side.icons ? <Icon name={sidebarIconName(side, 'inbox', 'inbox')} size={22} filled={view === 'tasks' && activeProjectId === 'entrada'} /> : <span aria-hidden="true" />}
                    <span>Entrada</span>
                    <Icon name="chevron_right" size={20} filled={false} />
                  </button>
                )}
                {roots.map(project => renderProject(project))}
                {onNewProject ? (
                  <button type="button" className={styles.sheetItem} onClick={() => { setSheetOpen(false); onNewProject() }}>
                    <Icon name="add" size={22} filled={false} />
                    <span>Adicionar projeto</span>
                    <span aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className={styles.sheetRows}>
              <button type="button" className={styles.sheetRow} onClick={() => { setSheetOpen(false); onSettings() }}>
                <Icon name="tune" size={22} filled={false} />
                <span>Ajustes</span>
                <Icon name="chevron_right" size={20} />
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <nav className={styles.mobileNav} aria-label="Navegação principal">
        {tab('today', 'Hoje', 'today')}
        {tab('upcoming', 'Em breve', 'event_upcoming')}
        <button type="button" className={styles.tab} aria-current={searchOpen && !sheetOpen ? 'page' : undefined} onClick={() => { setSheetOpen(false); onSearch() }}>
          <Icon name="search" size={24} filled={searchOpen} weight={searchOpen ? 600 : 400} />
          <span>Pesquisa</span>
        </button>
        <button type="button" className={styles.tab} aria-expanded={sheetOpen} aria-current={modulesActive && !sheetOpen ? 'page' : undefined} onClick={() => setSheetOpen(value => !value)}>
          <Icon name="menu" size={24} filled={false} weight={modulesActive ? 600 : 400} />
          <span>Mais</span>
        </button>
      </nav>
    </>
  )
}
