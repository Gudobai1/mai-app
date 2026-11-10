'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { MaiState } from '../../../lib/v2/state'
import { Icon } from '../../ds'
import type { AppView } from '../app-types'
import { ProjectMark } from './ProjectMark'
import { normalizeReminders } from '../../../lib/v2/reminders'
import { normalizeSidebar, sidebarHidden, sidebarIconName } from './sidebar-config'
import { NAV_ALIAS, todayCounts, type NavItem } from './nav'
import { NotificationPanel } from './NotificationPanel'
import { alertCount, buildAlerts, type AlertItem } from '../../../lib/v2/alerts'
import type { InspectableItem } from '../ContextDrawer'
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
  /** Barra recolhida (botão ou ocultar automático) e se o recolher é automático. */
  autoHide: boolean
  onToggleHidden: () => void
  onAutoHide: (value: boolean) => void
  onLogout: () => void
  /** Chamado ao tirar o mouse da barra (para recolher no modo automático). */
  onLeave: () => void
  onEnter: () => void
  /** Abre um item (aviso do sino) no popup padrão. */
  onInspect: (item: InspectableItem) => void
}

/*
 * Menu lateral — padrão visual do app (conceito Todoist 6).
 * Buscar no topo, dois grupos de áreas, projetos com foto no fim e perfil
 * com o botão de configurações no rodapé.
 */
const PLAN: NavItem[] = [
  { id: 'today', label: 'Hoje', icon: 'today' },
  { id: 'upcoming', label: 'Em breve', icon: 'event_upcoming' },
]
const ORGANIZE: NavItem[] = [
  { id: 'finance', label: 'Finanças', icon: 'account_balance_wallet' },
  { id: 'habits', label: 'Hábitos', icon: 'autorenew' },
  { id: 'goals', label: 'Metas', icon: 'flag' },
  { id: 'notes', label: 'Notas', icon: 'sticky_note_2' },
]

const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : [])

export function ModernSidebar({ state, today, view, navigate, onSearch, onSettings, onToggleTheme, onNewProject, activeProjectId, dark, profile, autoHide, onToggleHidden, onAutoHide, onLogout, onLeave, onEnter, onInspect }: Props) {
  const profileName = String(profile?.name || state.configs.profileName || state.configs.userName || 'Meu perfil')
  const profileInitial = profileName.trim().slice(0, 1).toLocaleUpperCase('pt-BR') || 'M'
  const counts = todayCounts(state, today)
  const side = normalizeSidebar(state.configs.sidebar, Boolean(state.configs.hideInbox))
  const sideIcon = (id: string, fallback: string, size = 22) => (side.icons ? <Icon name={sidebarIconName(side, id, fallback)} size={size} filled={false} style={{ color: 'var(--sidebar-icon-color, var(--ds-muted))', flexShrink: 0 }} /> : null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState(false)
  const [bell, setBell] = useState(false)
  const bellRef = useRef<HTMLButtonElement | null>(null)
  const [minute, setMinute] = useState(0)
  useEffect(() => { const timer = window.setInterval(() => setMinute(value => value + 1), 60_000); return () => window.clearInterval(timer) }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const alerts = useMemo(() => buildAlerts(state, today, new Date()), [state, today, minute])
  const remindersLook = normalizeReminders(state.configs.reminders).look
  const attention = alertCount(alerts)
  const openAlert = (entry: AlertItem) => {
    setBell(false)
    const { item } = entry
    onInspect({ kind: item.kind === 'finance' ? 'finance' : item.kind === 'goal' ? 'goal' : item.kind === 'event' ? 'event' : item.kind === 'habit' ? 'habit' : 'task', sourceId: item.sourceId, title: item.title, date: item.date, time: item.time, raw: item.raw })
  }
  const menuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!menu) return
    const close = (event: Event) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(false) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key) }
  }, [menu])

  const projects = rows(state.projects).filter(project => project.ativo !== false)
  const ids = new Set(projects.map(project => String(project.id)))
  const roots = projects.filter(project => !project.parent_id || !ids.has(String(project.parent_id)))
  const childrenOf = (id: string) => projects.filter(project => String(project.parent_id || '') === id)
  const openCount = (id: string) => state.tasks.filter(task => !task.concluida && !task.parent_id && String(task.projeto_id || '') === id).length

  const inboxCount = state.tasks.filter(task => !task.concluida && !task.parent_id && (!String(task.projeto_id || '') || String(task.projeto_id) === 'entrada')).length

  const toggle = (id: string) => setOpen(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const renderItem = (item: NavItem) => {
    if (sidebarHidden(side, String(item.id))) return null
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
        {sideIcon(String(item.id), item.icon)}
        <span className={styles.itemLabel}>{item.label}</span>
        {badge ? (
          <span className={styles.badge} title={counts.overdue ? `${counts.overdue} atrasada(s)` : undefined}>{badge}</span>
        ) : null}
      </button>
    )
  }

  const photo = (project: Row) => <ProjectMark project={project} />

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
    <aside className={styles.sidebar} aria-label="Menu principal" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className={styles.userTop}>
        <div className={styles.profileWrap} ref={menuRef}>
          <button type="button" className={styles.profilePill} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(value => !value)} title={profile?.email || profileName}>
            <span className={styles.avatar}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {profile?.picture ? <img src={profile.picture} alt="" referrerPolicy="no-referrer" /> : profileInitial}
            </span>
            <span className={styles.profileName}>{profileName}</span>
            <Icon name={menu ? 'expand_less' : 'expand_more'} size={18} filled={false} />
          </button>
          {menu ? (
            <div className={styles.userMenu} role="menu">
              <button type="button" role="menuitem" onClick={() => { setMenu(false); onSettings() }}><Icon name="settings" size={18} filled={false} /><span className={styles.userMenuLabel}>Configurações</span></button>
              <button type="button" role="menuitem" onClick={() => { setMenu(false); onToggleTheme() }}><Icon name={dark ? 'light_mode' : 'dark_mode'} size={18} filled={false} /><span className={styles.userMenuLabel}>{dark ? 'Tema claro' : 'Tema escuro'}</span></button>
              <button type="button" role="menuitemcheckbox" aria-checked={autoHide} onClick={() => onAutoHide(!autoHide)}>
                <Icon name="left_panel_close" size={18} filled={false} /><span className={styles.userMenuLabel}>Ocultar a barra automaticamente</span>
                {autoHide ? <Icon name="check" size={18} filled={false} /> : null}
              </button>
              <div className={styles.userMenuLine} />
              <button type="button" role="menuitem" data-tone="danger" onClick={() => { setMenu(false); onLogout() }}><Icon name="logout" size={18} filled={false} /><span className={styles.userMenuLabel}>Sair</span></button>
            </div>
          ) : null}
        </div>
        <button ref={bellRef} type="button" className={styles.topIcon} onClick={() => setBell(value => !value)} aria-haspopup="dialog" aria-expanded={bell} aria-label={attention ? `${attention} avisos` : 'Notificações'} title={attention ? `${attention} avisos` : 'Notificações'}>
          <Icon name="notifications" size={20} filled={false} />
          {attention && remindersLook.bell === 'dot' ? <i className={styles.dot} aria-hidden="true" /> : null}
          {attention && remindersLook.bell === 'count' ? <b className={styles.bellCount} aria-hidden="true">{attention > 9 ? '9+' : attention}</b> : null}
        </button>
        {bell ? <NotificationPanel look={remindersLook} alerts={alerts} anchor={bellRef.current} onOpen={openAlert} onClose={() => setBell(false)} /> : null}
        <button type="button" className={styles.topIcon} onClick={autoHide ? () => onAutoHide(false) : onToggleHidden} aria-label={autoHide ? 'Fixar a barra lateral' : 'Ocultar a barra lateral'} title={autoHide ? 'Fixar a barra lateral' : 'Ocultar a barra lateral'}>
          <Icon name="left_panel_close" size={20} filled={false} />
        </button>
      </div>
      {sidebarHidden(side, 'search') ? null : <button type="button" className={styles.search} onClick={onSearch}>
        {sideIcon('search', 'search', 20)}
        <span>Buscar</span>
        <span className={styles.kbd}>Ctrl Espaço</span>
      </button>}

      <nav className={styles.nav} aria-label="Áreas">
        <div className={styles.group}>
          <div className={styles.groupLabel}>Planejar</div>
          {sidebarHidden(side, 'inbox') ? null : (
            <button type="button" className={styles.item} aria-current={view === 'tasks' && activeProjectId === 'entrada' ? 'page' : undefined} onClick={() => navigate('inbox' as AppView)}>
              {sideIcon('inbox', 'inbox')}
              <span className={styles.itemLabel}>Entrada</span>
              {inboxCount ? <span className={styles.badge}>{inboxCount}</span> : null}
            </button>
          )}
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

    </aside>
  )
}
