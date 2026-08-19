'use client'

import { useMemo, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { AppView, Row } from './app-types'
import { MaiIcon } from './MaiIcons'

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []

type Props = {
  state: MaiState
  view: AppView
  navigate: (view: AppView) => void
  commit: (change: (current: MaiState) => MaiState) => void
  onNewProject: () => void
  onEditProject: (id: string) => void
  onNewSubproject: (parentId: string) => void
  onManageSections: (id: string) => void
}

function flattenProjects(projects: Row[]) {
  const activeIds = new Set(projects.map(item => String(item.id)))
  const children = new Map<string, Row[]>()
  projects.forEach(project => {
    const rawParent = String(project.parent_id || '')
    const parent = rawParent && activeIds.has(rawParent) ? rawParent : ''
    if (!children.has(parent)) children.set(parent, [])
    children.get(parent)!.push(project)
  })
  children.forEach(list => list.sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0) || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')))
  const result: { project: Row; depth: number }[] = []
  const seen = new Set<string>()
  const walk = (parent: string, depth: number) => (children.get(parent) || []).forEach(project => {
    const id = String(project.id)
    if (seen.has(id)) return
    seen.add(id)
    result.push({ project, depth })
    walk(id, Math.min(depth + 1, 4))
  })
  walk('', 0)
  projects.filter(project => !seen.has(String(project.id))).forEach(project => result.push({ project, depth: 0 }))
  return result
}

export function ProjectsPanel({ state, view, navigate, commit, onNewProject, onEditProject, onNewSubproject, onManageSections }: Props) {
  const [menuId, setMenuId] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const allProjects = rows(state.projects)
  const projects = useMemo(() => allProjects.filter(item => item.ativo !== false), [state.projects])
  const archived = useMemo(() => allProjects.filter(item => item.ativo === false), [state.projects])
  const tree = useMemo(() => flattenProjects(projects), [projects])
  const open = state.tasks.filter(task => !task.concluida)

  function duplicate(project: Row) {
    const id = `p-${crypto.randomUUID()}`
    const copy = {
      ...project,
      id,
      nome: `${project.nome} — cópia`,
      imagem_url: project.imagem_url || '',
      secoes: [...rows(project.secoes).map(String)],
      ordem: projects.length,
      ativo: true,
    }
    commit(current => ({ ...current, projects: [...rows(current.projects), copy] }))
    setMenuId('')
    navigate(`project:${id}`)
  }

  function move(project: Row, delta: number) {
    const ordered = [...projects].sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
    const index = ordered.findIndex(item => String(item.id) === String(project.id))
    const target = Math.max(0, Math.min(ordered.length - 1, index + delta))
    if (index < 0 || index === target) return
    const next = [...ordered]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    const order = new Map(next.map((item, position) => [String(item.id), position]))
    commit(current => ({ ...current, projects: rows(current.projects).map(item => order.has(String(item.id)) ? { ...item, ordem: order.get(String(item.id)) } : item) }))
    setMenuId('')
  }

  function archiveProject(project: Row) {
    if (!confirm(`Arquivar “${project.nome}”?`)) return
    commit(current => ({ ...current, projects: rows(current.projects).map(item => String(item.id) === String(project.id) ? { ...item, ativo: false } : item) }))
    setMenuId('')
    if (view === `project:${project.id}`) navigate('inbox')
  }

  function restoreProject(project: Row) {
    commit(current => ({ ...current, projects: rows(current.projects).map(item => String(item.id) === String(project.id) ? { ...item, ativo: true, ordem: projects.length } : item) }))
  }

  function deleteProject(project: Row) {
    if (!confirm(`Excluir “${project.nome}”? As tarefas serão movidas para Entrada.`)) return
    const id = String(project.id)
    const fallbackParent = String(project.parent_id || '')
    commit(current => ({
      ...current,
      projects: rows(current.projects).filter(item => String(item.id) !== id).map(item => String(item.parent_id || '') === id ? { ...item, parent_id: fallbackParent } : item),
      tasks: current.tasks.map(task => String(task.projeto_id || '') === id ? { ...task, projeto_id: 'entrada', secao: '' } : task),
    }))
    setMenuId('')
    if (view === `project:${id}`) navigate('inbox')
  }

  return <aside className="mai-projects-panel">
    <header><div><span>Entrada</span><strong>Projetos</strong></div><button onClick={onNewProject}><MaiIcon name="plus" size={15} /><span>Novo</span></button></header>

    <button className="mai-project-card mai-project-inbox-card" data-active={view === 'inbox'} onClick={() => navigate('inbox')}>
      <i className="mai-project-dot" />
      <span><strong>Entrada</strong><small>Tarefas ainda não organizadas</small></span>
      <b>{open.filter(task => String(task.projeto_id || 'entrada') === 'entrada').length}</b>
    </button>

    <div className="mai-project-cards">{tree.map(({ project, depth }, index) => {
      const id = String(project.id)
      const count = open.filter(task => String(task.projeto_id) === id).length
      const sectionCount = rows(project.secoes).length
      return <article className="mai-project-card-wrap" key={id} style={{ marginLeft: `${Math.min(depth, 3) * 11}px` }}>
        <button className="mai-project-card" data-active={view === `project:${id}`} onClick={() => navigate(`project:${id}`)}>
          {project.imagem_url ? <img src={project.imagem_url} alt="" /> : <i className="mai-project-dot" style={{ background: project.cor || '#60765a' }}><MaiIcon name={String(project.icone || 'folder')} size={12} /></i>}
          <span><strong>{project.nome}</strong><small>{depth ? 'Subprojeto' : count ? `${count} tarefa${count === 1 ? '' : 's'} ativa${count === 1 ? '' : 's'}` : sectionCount ? `${sectionCount} seções` : 'Sem tarefas ativas'}</small></span>
          <b>{count || ''}</b>
        </button>
        <button className="mai-project-more" aria-label={`Opções de ${project.nome}`} data-open={menuId === id} onClick={() => setMenuId(current => current === id ? '' : id)}>•••</button>
        {menuId === id ? <div className="mai-project-menu">
          <button onClick={() => { setMenuId(''); onEditProject(id) }}><MaiIcon name="edit" size={15} /><span>Editar projeto</span></button>
          <button onClick={() => { setMenuId(''); onManageSections(id) }}><MaiIcon name="view_column" size={15} /><span>Gerenciar seções</span></button>
          <button onClick={() => { setMenuId(''); onNewSubproject(id) }}><MaiIcon name="account_tree" size={15} /><span>Criar subprojeto</span></button>
          <button onClick={() => duplicate(project)}><MaiIcon name="content_copy" size={15} /><span>Duplicar</span></button>
          <div className="mai-project-menu-pair"><button disabled={index === 0} onClick={() => move(project, -1)}>↑ Subir</button><button disabled={index === tree.length - 1} onClick={() => move(project, 1)}>↓ Descer</button></div>
          <hr />
          <button onClick={() => archiveProject(project)}><MaiIcon name="archive" size={15} /><span>Arquivar</span></button>
          <button className="mai-project-menu-danger" onClick={() => deleteProject(project)}><MaiIcon name="delete" size={15} /><span>Excluir</span></button>
        </div> : null}
      </article>
    })}</div>

    {!projects.length ? <div className="mai-project-empty"><strong>Sem projetos</strong><span>Crie projetos para organizar as tarefas da Entrada.</span></div> : null}

    {archived.length ? <section className="mai-archived-projects"><button onClick={() => setShowArchived(value => !value)}><span>Arquivados</span><b>{archived.length}</b><MaiIcon name="chevron" size={14} /></button>{showArchived ? <div>{archived.map(project => <div key={String(project.id)}><span><strong>{project.nome}</strong><small>Projeto arquivado</small></span><button onClick={() => restoreProject(project)}>Restaurar</button></div>)}</div> : null}</section> : null}
  </aside>
}
