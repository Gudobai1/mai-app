'use client'

import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import type { AppView, Row, TaskModuleScope } from './app-types'
import { MaiIcon } from './MaiIcons'
import { MinimalTaskWorkspace } from './MinimalTaskWorkspace'
import { TaskDateView } from './TaskDateView'
import type { TaskWorkspaceView } from './UnifiedTasks'

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []

type Props = {
  state: MaiState
  today: string
  scope: TaskModuleScope
  commit: (change: (current: MaiState) => MaiState) => void
  googleRpc: (method: string, args?: unknown[]) => Promise<any>
  inspect: (item: InspectableItem) => void
  selectedId: string
  onScopeChange: (scope: TaskModuleScope) => void
  navigate: (view: AppView) => void
  onSearch: () => void
  onSettings: () => void
  onNewProject: () => void
  onEditProject: (id: string) => void
  onManageSections: (id: string) => void
}

export function TasksModule(props: Props) {
  const projects = rows(props.state.projects).filter(project => project.ativo !== false).sort((a,b) => Number(Boolean(b.favorito))-Number(Boolean(a.favorito)) || Number(a.ordem || 0)-Number(b.ordem || 0))
  const projectScope = props.scope === 'entrada' || props.scope.startsWith('project:')
  const workspaceView: TaskWorkspaceView = props.scope === 'entrada' ? 'inbox' : props.scope as TaskWorkspaceView
  const activeProject = props.scope === 'entrada' ? 'entrada' : props.scope.startsWith('project:') ? props.scope.slice(8) : ''

  return <div className="mai-v4-tasks-module">
    <header className="mai-v4-tasks-module-head">
      <div><h1>Tarefas</h1><p>Visualize por data ou abra diretamente um projeto.</p></div>
      <nav aria-label="Visualizações de tarefas">
        <button data-active={props.scope === 'today'} onClick={() => props.onScopeChange('today')}><MaiIcon name="today" size={15}/>Hoje</button>
        <button data-active={props.scope === 'upcoming'} onClick={() => props.onScopeChange('upcoming')}><MaiIcon name="upcoming" size={15}/>Em breve</button>
      </nav>
    </header>

    <div className="mai-v4-task-project-layout">
      <main className="mai-v4-task-main">
        {projectScope ? <MinimalTaskWorkspace
          state={props.state}
          today={props.today}
          view={workspaceView}
          commit={props.commit}
          googleRpc={props.googleRpc}
          onOpenAgenda={() => props.navigate('upcoming')}
          inspect={props.inspect}
          selectedId={props.selectedId}
          onManageSections={props.onManageSections}
          navigate={next => {
            if (next === 'inbox') props.onScopeChange('entrada')
            else if (String(next).startsWith('project:')) props.onScopeChange(next as TaskModuleScope)
            else props.navigate(next)
          }}
          onNewProject={props.onNewProject}
          onEditProject={props.onEditProject}
        /> : <TaskDateView state={props.state} today={props.today} mode={props.scope as 'today'|'upcoming'} commit={props.commit} inspect={props.inspect} selectedId={props.selectedId}/>} 
      </main>

      <aside className="mai-v4-project-rail">
        <header><div><strong>Projetos</strong><span>Entrada e projetos no mesmo módulo</span></div><button onClick={props.onNewProject} title="Novo projeto" aria-label="Novo projeto"><MaiIcon name="plus" size={16}/></button></header>
        <div className="mai-v4-project-list">
          <div className="mai-v4-project-item-wrap">
            <button className="mai-v4-project-item" data-active={activeProject === 'entrada'} onClick={() => props.onScopeChange('entrada')}><i className="mai-v4-project-icon mai-v4-project-inbox"><MaiIcon name="inbox" size={13}/></i><span><strong>Entrada</strong><small>{props.state.tasks.filter(task => !task.concluida && String(task.projeto_id || 'entrada') === 'entrada').length} abertas</small></span></button>
          </div>
          {projects.map(project => <div className="mai-v4-project-item-wrap" key={String(project.id)}>
            <button className="mai-v4-project-item" data-active={activeProject === String(project.id)} onClick={() => props.onScopeChange(`project:${String(project.id)}`)}>
              {project.imagem_url ? <img src={String(project.imagem_url)} alt=""/> : <i className="mai-v4-project-icon" style={{background:String(project.cor || 'var(--v3-accent)')}}><MaiIcon name={String(project.icone || 'folder')} size={13}/></i>}
              <span><strong>{String(project.nome || 'Projeto')}</strong><small>{props.state.tasks.filter(task => !task.concluida && String(task.projeto_id || 'entrada') === String(project.id)).length} abertas</small></span>
            </button>
            <button className="mai-v4-project-edit" title="Editar projeto" aria-label={`Editar ${String(project.nome || 'projeto')}`} onClick={() => props.onEditProject(String(project.id))}><span className="material-symbols-rounded">more_horiz</span></button>
          </div>)}
        </div>
      </aside>
    </div>
  </div>
}
