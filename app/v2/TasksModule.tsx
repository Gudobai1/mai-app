'use client'

import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import type { AppView, Row, TaskModuleScope } from './app-types'
import { MaiIcon } from './MaiIcons'
import { MinimalTaskWorkspace } from './MinimalTaskWorkspace'
import { TaskDateView } from './TaskDateView'
import { TaskKanban } from './TaskKanban'
import type { TaskWorkspaceView } from './UnifiedTasks'

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const dateKey = (value: unknown) => String(value || '').slice(0, 10)

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
  const projects = rows(props.state.projects).filter(project => project.ativo !== false).sort((a,b) => Number(Boolean(b.favorito))-Number(Boolean(a.favorito)) || Number(a.ordem || 0)-Number(b.ordem || 0) || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity:'base' }))
  const projectScope = props.scope === 'entrada' || props.scope.startsWith('project:')
  const workspaceView: TaskWorkspaceView = props.scope === 'entrada' ? 'inbox' : props.scope as TaskWorkspaceView
  const activeProject = props.scope.startsWith('project:') ? props.scope.slice(8) : ''
  const openTasks = props.state.tasks.filter(task => !task.concluida)
  const inboxCount = openTasks.filter(task => String(task.projeto_id || 'entrada') === 'entrada').length
  const todayCount = openTasks.filter(task => dateKey(task.data_vencimento) === props.today).length
  const upcomingCount = openTasks.filter(task => dateKey(task.data_vencimento) > props.today).length
  const moduleControls = props.state.configs.moduleControls && typeof props.state.configs.moduleControls === 'object' ? props.state.configs.moduleControls as Record<string, Row> : {}
  const taskControl = moduleControls.tasks || {}
  const taskLayout = taskControl.layout === 'kanban' ? 'kanban' : 'list'

  function setTaskLayout(layout: 'list' | 'kanban') {
    props.commit(current => {
      const controls = current.configs.moduleControls && typeof current.configs.moduleControls === 'object' ? current.configs.moduleControls as Record<string, Row> : {}
      return {
        ...current,
        configs: {
          ...current.configs,
          moduleControls: {
            ...controls,
            tasks: { ...(controls.tasks || {}), layout },
          },
        },
      }
    })
  }

  return <div className="mai-v4-tasks-module">
    <header className="mai-v4-tasks-module-head">
      <div><h1>Tarefas</h1><p>Entrada, datas e projetos no mesmo lugar.</p></div>
    </header>

    <div className="mai-v4-task-project-layout">
      <main className="mai-v4-task-main">
        <div className="mai-task-layout-switch" role="group" aria-label="Visualização das tarefas">
          <button type="button" data-active={taskLayout === 'list'} onClick={() => setTaskLayout('list')}><span className="material-symbols-rounded">view_list</span><span>Lista</span></button>
          <button type="button" data-active={taskLayout === 'kanban'} onClick={() => setTaskLayout('kanban')}><span className="material-symbols-rounded">view_kanban</span><span>Kanban</span></button>
        </div>

        {taskLayout === 'kanban' ? <TaskKanban
          state={props.state}
          today={props.today}
          scope={props.scope}
          commit={props.commit}
          inspect={props.inspect}
          selectedId={props.selectedId}
        /> : projectScope ? <MinimalTaskWorkspace
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
        <div className="mai-v4-project-list mai-v4-task-scope-list">
          <div className="mai-v4-project-item-wrap">
            <button className="mai-v4-project-item" data-active={props.scope === 'entrada'} onClick={() => props.onScopeChange('entrada')}>
              <i className="mai-v4-project-icon mai-v4-task-scope-icon"><MaiIcon name="inbox" size={13}/></i>
              <span><strong>Entrada</strong><small>{inboxCount} aberta{inboxCount === 1 ? '' : 's'}</small></span>
            </button>
          </div>
          <div className="mai-v4-project-item-wrap">
            <button className="mai-v4-project-item" data-active={props.scope === 'today'} onClick={() => props.onScopeChange('today')}>
              <i className="mai-v4-project-icon mai-v4-task-scope-icon"><MaiIcon name="today" size={13}/></i>
              <span><strong>Hoje</strong><small>{todayCount} tarefa{todayCount === 1 ? '' : 's'}</small></span>
            </button>
          </div>
          <div className="mai-v4-project-item-wrap">
            <button className="mai-v4-project-item" data-active={props.scope === 'upcoming'} onClick={() => props.onScopeChange('upcoming')}>
              <i className="mai-v4-project-icon mai-v4-task-scope-icon"><MaiIcon name="upcoming" size={13}/></i>
              <span><strong>Em breve</strong><small>{upcomingCount} futura{upcomingCount === 1 ? '' : 's'}</small></span>
            </button>
          </div>
        </div>

        <header><div><strong>Projetos</strong></div><button onClick={props.onNewProject} title="Novo projeto" aria-label="Novo projeto"><MaiIcon name="plus" size={16}/></button></header>
        <div className="mai-v4-project-list">
          {projects.map(project => <div className="mai-v4-project-item-wrap" key={String(project.id)}>
            <button className="mai-v4-project-item" data-active={activeProject === String(project.id)} onClick={() => props.onScopeChange(`project:${String(project.id)}`)}>
              {project.imagem_url ? <img src={String(project.imagem_url)} alt=""/> : <i className="mai-v4-project-icon" style={{background:String(project.cor || 'var(--v3-accent)')}}><MaiIcon name={String(project.icone || 'folder')} size={13}/></i>}
              <span><strong>{String(project.nome || 'Projeto')}</strong><small>{openTasks.filter(task => String(task.projeto_id || 'entrada') === String(project.id)).length} abertas</small></span>
            </button>
            <button className="mai-v4-project-edit" title="Editar projeto" aria-label={`Editar ${String(project.nome || 'projeto')}`} onClick={() => props.onEditProject(String(project.id))}><span className="material-symbols-rounded">more_horiz</span></button>
          </div>)}
          {!projects.length ? <div className="mai-v3-empty-line">Nenhum projeto criado.</div> : null}
        </div>
      </aside>
    </div>
  </div>
}
