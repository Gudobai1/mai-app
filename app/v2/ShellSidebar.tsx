'use client'

import { useMemo, useState } from 'react'
import type { MaiState, SyncStatus } from '../../lib/v2/state'
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

function flattenProjects(projects: Row[]) {
  const ids = new Set(projects.map(item => String(item.id)))
  const children = new Map<string, Row[]>()
  projects.forEach(project => {
    const parent = project.parent_id && ids.has(String(project.parent_id)) ? String(project.parent_id) : ''
    if (!children.has(parent)) children.set(parent, [])
    children.get(parent)!.push(project)
  })
  children.forEach(list => list.sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0)))
  const result: { project: Row; depth: number }[] = []
  const walk = (parent: string, depth: number) => (children.get(parent) || []).forEach(project => {
    result.push({ project, depth })
    if (depth < 4) walk(String(project.id), depth + 1)
  })
  walk('', 0)
  return result
}

type Props = {
  state: MaiState
  view: AppView
  todayCount: number
  overdueCount: number
  sidebarOpen: boolean
  setSidebarOpen: (value: boolean) => void
  navigate: (view: AppView) => void
  onQuickAdd: (type: string) => void
  onSearch: () => void
  onNewProject: () => void
  undo: () => void
  undoCount: number
  onGoogle: () => void
  googleConnected: boolean | null
  syncStatus: SyncStatus
  onSyncClick: () => void
}

export function ShellSidebar(props: Props) {
  const [areasOpen, setAreasOpen] = useState(true)
  const [quickOpen, setQuickOpen] = useState(false)
  const projects = useMemo(() => rows(props.state.projects).filter(item => item.ativo !== false), [props.state.projects])
  const tree = useMemo(() => flattenProjects(projects), [projects])
  const openTasks = useMemo(() => props.state.tasks.filter(task => !task.concluida), [props.state.tasks])

  const quick = [
    ['task', 'Tarefa', 'inbox'], ['event', 'Compromisso', 'calendar'], ['habits', 'Rotina', 'habits'],
    ['finance', 'Transação', 'finance'], ['notes', 'Nota', 'notes'], ['goals', 'Meta', 'goals'],
    ['health', 'Bem-estar', 'health'], ['files', 'Arquivo', 'files'],
  ]

  return <>
    <aside className={styles.sidebar} data-open={props.sidebarOpen}>
      <div className={styles.brand}><span>M</span><strong>MAI</strong><button onClick={() => props.setSidebarOpen(false)}><MaiIcon name="close" /></button></div>
      <div className={styles.addWrap}>
        <button className={styles.mainAdd} onClick={() => setQuickOpen(value => !value)}><MaiIcon name="plus" /><span>Adicionar</span></button>
        {quickOpen ? <div className={styles.quickMenu}>{quick.map(([id, label, icon]) => <button key={id} onClick={() => { setQuickOpen(false); props.onQuickAdd(id) }}><MaiIcon name={icon} /><span>{label}</span></button>)}</div> : null}
      </div>
      <button className={styles.sidebarSearch} onClick={props.onSearch}><MaiIcon name="search" /><span>Buscar</span><kbd>Ctrl K</kbd></button>

      <nav className={styles.primaryNav}>
        <button data-active={props.view === 'today'} onClick={() => props.navigate('today')}><MaiIcon name="today" /><span>Hoje</span><b>{props.todayCount + props.overdueCount || ''}</b></button>
        <button data-active={props.view === 'inbox'} onClick={() => props.navigate('inbox')}><MaiIcon name="inbox" /><span>Entrada</span><b>{openTasks.filter(task => String(task.projeto_id || 'entrada') === 'entrada').length || ''}</b></button>
        <button data-active={props.view === 'upcoming'} onClick={() => props.navigate('upcoming')}><MaiIcon name="upcoming" /><span>Em breve</span></button>
        <button data-active={props.view === 'agenda'} onClick={() => props.navigate('agenda')}><MaiIcon name="calendar" /><span>Agenda</span></button>
      </nav>

      <div className={styles.sidebarSectionHead}><span>Projetos</span><button onClick={props.onNewProject}><MaiIcon name="plus" size={15} /></button></div>
      <nav className={styles.projectTree}>
        {tree.map(({ project, depth }) => <button key={String(project.id)} data-active={props.view === `project:${project.id}`} onClick={() => props.navigate(`project:${project.id}`)} style={{ paddingLeft: `${10 + depth * 16}px` }}>
          {project.imagem_url ? <img src={project.imagem_url} alt="" /> : <i style={{ background: project.cor || '#60765a' }} />}
          <span>{project.nome}</span><b>{openTasks.filter(task => String(task.projeto_id) === String(project.id)).length || ''}</b>
        </button>)}
        {!projects.length ? <small>Nenhum projeto ainda.</small> : null}
      </nav>

      <div className={styles.sidebarSectionHead}><button onClick={() => setAreasOpen(value => !value)}><MaiIcon name="chevron" size={14} /><span>Áreas</span></button></div>
      {areasOpen ? <nav className={styles.areaNav}>{areas.map(area => <button key={area.id} data-active={props.view === area.id} onClick={() => props.navigate(area.id)}><MaiIcon name={area.icon} /><span>{area.label}</span></button>)}</nav> : null}

      <div className={styles.sidebarBottom}>
        <button onClick={props.undo} disabled={!props.undoCount}><span>↶</span><span>Desfazer</span><kbd>Ctrl Z</kbd></button>
        <button onClick={props.onGoogle}><span className={styles.googleMark}>G</span><span><strong>Google</strong><small>{props.googleConnected === null ? 'Verificando' : props.googleConnected ? 'Agenda e Drive conectados' : 'Conectar Agenda e Drive'}</small></span><MaiIcon name="settings" size={16} /></button>
        <button className={styles.syncButtonSide} data-phase={props.syncStatus.phase} onClick={props.onSyncClick}><i /><span>{props.syncStatus.message}</span></button>
      </div>
    </aside>
    {props.sidebarOpen ? <button className={styles.scrim} onClick={() => props.setSidebarOpen(false)} /> : null}
  </>
}
