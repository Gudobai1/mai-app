'use client'

import { useMemo, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { AppView, Row } from './app-types'
import { MaiIcon } from './MaiIcons'
import type { SecondaryView } from './UnifiedAreas'
import styles from './unified.module.css'

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []

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
  sidebarOpen: boolean
  setSidebarOpen: (value: boolean) => void
  navigate: (view: AppView) => void
  onSearch: () => void
  onSettings: () => void
  onNewProject: () => void
  onEditProject: (id: string) => void
  onManageSections: (id: string) => void
  commit: (change: (current: MaiState) => MaiState) => void
}

function projectTree(projects: Row[]) {
  const active = projects.filter(project => project.ativo !== false)
  const activeIds = new Set(active.map(project => String(project.id)))
  const children = new Map<string, Row[]>()
  active.forEach(project => {
    const rawParent = String(project.parent_id || '')
    const parent = rawParent && activeIds.has(rawParent) ? rawParent : ''
    if (!children.has(parent)) children.set(parent, [])
    children.get(parent)!.push(project)
  })
  const sort = (items: Row[]) => items.sort((a, b) => Number(Boolean(b.fixado)) - Number(Boolean(a.fixado)) || Number(a.ordem || 0) - Number(b.ordem || 0) || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
  children.forEach(sort)
  const result: { project: Row; depth: number }[] = []
  const seen = new Set<string>()
  const walk = (parent: string, depth: number) => (children.get(parent) || []).forEach(project => {
    const id = String(project.id)
    if (seen.has(id)) return
    seen.add(id)
    result.push({ project, depth })
    walk(id, Math.min(depth + 1, 3))
  })
  walk('', 0)
  active.filter(project => !seen.has(String(project.id))).forEach(project => result.push({ project, depth: 0 }))
  return result
}

export function ShellSidebar(props: Props) {
  const [menuId, setMenuId] = useState('')
  const [dragId, setDragId] = useState('')
  const projectsOpen = props.state.configs.sidebarProjectsOpen !== false
  const projects = useMemo(() => projectTree(rows(props.state.projects)), [props.state.projects])
  const profileName = String(props.state.configs.profileName || props.state.configs.userName || 'Meu perfil')
  const profileInitial = profileName.trim().slice(0, 1).toLocaleUpperCase('pt-BR') || 'M'

  function setProjectsOpen(value: boolean) {
    props.commit(current => ({ ...current, configs: { ...current.configs, sidebarProjectsOpen: value } }))
  }

  function reorder(sourceId: string, targetId: string) {
    if (!sourceId || sourceId === targetId) return
    const active = rows(props.state.projects).filter(project => project.ativo !== false)
    const ordered = [...active].sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
    const source = ordered.findIndex(item => String(item.id) === sourceId)
    const target = ordered.findIndex(item => String(item.id) === targetId)
    if (source < 0 || target < 0) return
    const next = [...ordered]
    const [moved] = next.splice(source, 1)
    next.splice(target, 0, moved)
    const order = new Map(next.map((item, index) => [String(item.id), index]))
    props.commit(current => ({ ...current, projects: rows(current.projects).map(project => order.has(String(project.id)) ? { ...project, ordem: order.get(String(project.id)) } : project) }))
  }

  function move(projectId: string, delta: number) {
    const ordered = projects.map(entry => entry.project)
    const index = ordered.findIndex(project => String(project.id) === projectId)
    const target = Math.max(0, Math.min(ordered.length - 1, index + delta))
    if (index < 0 || index === target) return
    reorder(projectId, String(ordered[target].id))
    setMenuId('')
  }

  function toggleFavorite(projectId: string) {
    props.commit(current => ({ ...current, projects: rows(current.projects).map(project => String(project.id) === projectId ? { ...project, fixado: project.fixado !== true } : project) }))
    setMenuId('')
  }

  return <>
    <aside className={`${styles.sidebar} mai-v3-sidebar`} data-open={props.sidebarOpen}>
      <div className={`${styles.brand} mai-v3-brand`}>
        <span>M</span><strong>MAI</strong><button onClick={() => props.setSidebarOpen(false)}><MaiIcon name="close" /></button>
      </div>

      <button className={`${styles.sidebarSearch} mai-v3-search`} onClick={props.onSearch}>
        <MaiIcon name="search" /><span>Buscar</span><kbd>Ctrl K</kbd>
      </button>

      <nav className="mai-v3-nav mai-v3-primary-nav">
        <div className="mai-v3-inbox-wrap">
          <div className="mai-v3-inbox-row">
            <button className="mai-v3-nav-button" data-active={props.view === 'inbox'} onClick={() => props.navigate('inbox')}>
              <span className="mai-v3-nav-label"><MaiIcon name="inbox" /><span>Entrada</span></span>
            </button>
            <button className="mai-v3-project-toggle" aria-label={projectsOpen ? 'Recolher projetos' : 'Mostrar projetos'} onClick={() => setProjectsOpen(!projectsOpen)}><MaiIcon name="chevron" size={15} /></button>
            <button className="mai-v3-project-add" aria-label="Novo projeto" onClick={props.onNewProject}><MaiIcon name="plus" size={15} /></button>
          </div>

          {projectsOpen ? <div className="mai-v3-project-list">{projects.map(({ project, depth }, index) => {
            const id = String(project.id)
            const active = props.view === `project:${id}`
            return <div className="mai-v3-project-row" key={id} style={{ '--mai-project-depth': depth } as React.CSSProperties} draggable onDragStart={() => setDragId(id)} onDragEnd={() => setDragId('')} onDragOver={event => event.preventDefault()} onDrop={() => { reorder(dragId, id); setDragId('') }}>
              <button className="mai-v3-project-button" data-active={active} onClick={() => props.navigate(`project:${id}`)}>
                <span className="mai-v3-project-label">
                  {project.imagem_url ? <img src={String(project.imagem_url)} alt="" /> : <i style={{ background: String(project.cor || '#6f8168') }}><MaiIcon name={String(project.icone || 'folder')} size={13} /></i>}
                  <span>{String(project.nome || 'Projeto')}</span>
                </span>
              </button>
              <button className="mai-v3-project-more" aria-label={`Opções de ${String(project.nome || 'projeto')}`} onClick={() => setMenuId(current => current === id ? '' : id)}>•••</button>
              {menuId === id ? <div className="mai-v3-project-menu">
                <button onClick={() => toggleFavorite(id)}>{project.fixado === true ? 'Desafixar do topo' : 'Fixar no topo'}</button>
                <button disabled={index === 0} onClick={() => move(id, -1)}>Mover para cima</button>
                <button disabled={index === projects.length - 1} onClick={() => move(id, 1)}>Mover para baixo</button>
                <button onClick={() => { setMenuId(''); props.onManageSections(id) }}>Gerenciar seções</button>
                <button onClick={() => { setMenuId(''); props.onEditProject(id) }}>Editar projeto</button>
              </div> : null}
            </div>
          })}</div> : null}
        </div>

        <button className="mai-v3-nav-button" data-active={props.view === 'today'} onClick={() => props.navigate('today')}><span className="mai-v3-nav-label"><MaiIcon name="today" /><span>Hoje</span></span></button>
        <button className="mai-v3-nav-button" data-active={props.view === 'upcoming'} onClick={() => props.navigate('upcoming')}><span className="mai-v3-nav-label"><MaiIcon name="upcoming" /><span>Em breve</span></span></button>
      </nav>

      <div className="mai-v3-section-title">Áreas</div>
      <nav className="mai-v3-nav mai-v3-area-nav">{areas.map(area => <button className="mai-v3-nav-button" key={area.id} data-active={props.view === area.id} onClick={() => props.navigate(area.id)}><span className="mai-v3-nav-label"><MaiIcon name={area.icon} /><span>{area.label}</span></span></button>)}</nav>

      <div className="mai-v3-sidebar-footer">
        <button className="mai-v3-footer-button" onClick={props.onSettings}><MaiIcon name="settings" size={18}/><span>Configurações</span></button>
        <button className="mai-v3-profile-button" onClick={props.onSettings}><span className="mai-v3-avatar">{profileInitial}</span><span>{profileName}</span></button>
      </div>
    </aside>
    {props.sidebarOpen ? <button className={`${styles.scrim} mai-v3-scrim`} onClick={() => props.setSidebarOpen(false)} /> : null}
  </>
}
