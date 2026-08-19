'use client'

import type { MaiState } from '../../lib/v2/state'
import type { AppView, Row } from './app-types'

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []

type Props = { state: MaiState; view: AppView; navigate: (view: AppView) => void; onNewProject: () => void }

export function ProjectsPanel({ state, view, navigate, onNewProject }: Props) {
  const projects = rows(state.projects).filter(item => item.ativo !== false).sort((a,b)=>Number(a.ordem||0)-Number(b.ordem||0))
  const open = state.tasks.filter(task => !task.concluida)
  return <aside className="mai-projects-panel">
    <header><div><span>Tarefas</span><strong>Projetos</strong></div><button onClick={onNewProject}>Novo projeto</button></header>
    <button className="mai-project-card" data-active={view==='inbox'} onClick={() => navigate('inbox')}><i className="mai-project-dot"/><span><strong>Entrada</strong><small>Tarefas ainda não organizadas</small></span><b>{open.filter(task => String(task.projeto_id || 'entrada') === 'entrada').length}</b></button>
    <div className="mai-project-cards">{projects.map(project => { const count = open.filter(task => String(task.projeto_id) === String(project.id)).length; return <button className="mai-project-card" data-active={view===`project:${project.id}`} key={String(project.id)} onClick={() => navigate(`project:${project.id}`)}>{project.imagem_url ? <img src={project.imagem_url} alt=""/> : <i className="mai-project-dot" style={{background:project.cor || '#60765a'}}/>}<span><strong>{project.nome}</strong><small>{project.parent_id ? 'Subprojeto' : count ? `${count} tarefa${count===1?'':'s'} ativa${count===1?'':'s'}` : 'Sem tarefas ativas'}</small></span><b>{count || ''}</b></button>})}</div>
    {!projects.length ? <div className="mai-project-empty"><strong>Sem projetos</strong><span>Use projetos quando precisar agrupar tarefas por contexto.</span></div> : null}
  </aside>
}
