'use client'

import { useEffect, useMemo, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { AppView, TaskModuleScope } from './app-types'

type Row = Record<string, any>
type Commit = (change: (current: MaiState) => MaiState) => void

type Props = {
  state: MaiState
  today: string
  view: AppView
  taskScope: TaskModuleScope
  commit: Commit
  onTaskScopeChange: (scope: TaskModuleScope) => void
  onSettings: () => void
}

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const dateKey = (value: unknown) => String(value || '').slice(0, 10)
const paid = (value: unknown) => ['pago','paga','quitado','quitada','concluido','concluida','concluído','concluída'].includes(String(value || '').toLocaleLowerCase('pt-BR'))

export function AppTopBar({ state, today, view, taskScope, commit, onTaskScopeChange, onSettings }: Props) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  useEffect(() => setFiltersOpen(false), [view, taskScope])

  const configs = state.configs as Record<string, any>
  const projects = useMemo(() => rows(state.projects).filter(item => item.ativo !== false), [state.projects])
  const goals = rows(state.goals)
  const notes = rows(state.notes).filter(item => item.ativo !== false && item.arquivado !== true)
  const habits = rows(state.habits).filter(item => item.ativo !== false)
  const finance = (state.finance || {}) as Record<string, any>
  const transactions = rows(finance.transactions)
  const activeTasks = state.tasks.filter(task => !task.concluida)
  const overdue = activeTasks.filter(task => dateKey(task.data_vencimento) && dateKey(task.data_vencimento) < today).length
    + goals.filter(goal => { const day = dateKey(goal.prazo || goal.data_fim || goal.data_limite || goal.deadline); return day && day < today && goal.concluida !== true && !String(goal.status || '').toLocaleLowerCase('pt-BR').includes('conclu') }).length
    + transactions.filter(item => { const day = dateKey(item.data); return day && day < today && !item.ignorar_calculo && !paid(item.status) }).length

  const todayFilters = configs.todayFilters && typeof configs.todayFilters === 'object' ? configs.todayFilters as Record<string, any> : {}
  const upcomingFilters = configs.upcomingFilters && typeof configs.upcomingFilters === 'object' ? configs.upcomingFilters as Record<string, any> : {}
  const areaTabs = configs.areaTabs && typeof configs.areaTabs === 'object' ? configs.areaTabs as Record<string, string> : {}
  const advanced = configs.advancedAreas && typeof configs.advancedAreas === 'object' ? configs.advancedAreas as Record<string, boolean> : {}
  const moduleFilters = configs.moduleFilters && typeof configs.moduleFilters === 'object' ? configs.moduleFilters as Record<string, Record<string, any>> : {}
  const currentFilter = moduleFilters[String(view)] || {}

  const activeProject = taskScope.startsWith('project:') ? projects.find(project => String(project.id) === taskScope.slice(8)) : null
  const titleMap: Partial<Record<AppView, string>> = { today:'Hoje', upcoming:'Em breve', completed:'Concluídos', tasks:'Tarefas', habits:'Hábitos', goals:'Metas', notes:'Notas', finance:'Finanças', health:'Bem-estar', files:'Arquivos' }
  const title = titleMap[view] || 'MAI'
  const dayLabel = new Date(`${today}T12:00:00`).toLocaleDateString('pt-BR', { weekday:'short', day:'numeric', month:'short' }).replace('.', '')

  let info = dayLabel
  if (view === 'today') info = overdue ? `${overdue} atrasado${overdue === 1 ? '' : 's'}` : dayLabel
  if (view === 'upcoming') info = `${activeTasks.filter(task => dateKey(task.data_vencimento) >= today).length} tarefas futuras`
  if (view === 'tasks') info = taskScope === 'entrada' ? 'Entrada' : taskScope === 'today' ? 'Hoje' : taskScope === 'upcoming' ? 'Em breve' : String(activeProject?.nome || 'Projeto')
  if (view === 'habits') info = `${habits.length} hábito${habits.length === 1 ? '' : 's'}`
  if (view === 'goals') info = `${goals.filter(goal => goal.concluida !== true && !String(goal.status || '').toLocaleLowerCase('pt-BR').includes('conclu')).length} em andamento`
  if (view === 'notes') info = `${notes.length} nota${notes.length === 1 ? '' : 's'}`
  if (view === 'finance') info = `${transactions.length} lançamento${transactions.length === 1 ? '' : 's'}`
  if (view === 'health') info = areaTabs.health === 'history' ? 'Histórico' : 'Hoje'
  if (view === 'files') info = areaTabs.files === 'grid' ? 'Grade' : 'Lista'
  if (view === 'completed') info = 'Histórico geral'

  const patchConfig = (key: string, value: unknown) => commit(current => ({ ...current, configs: { ...current.configs, [key]: value } }))
  const patchToday = (patch: Record<string, unknown>) => patchConfig('todayFilters', { ...todayFilters, ...patch })
  const patchUpcoming = (patch: Record<string, unknown>) => patchConfig('upcomingFilters', { tasks: upcomingFilters.tasks !== false, events: upcomingFilters.events !== false, project: String(upcomingFilters.project || 'all'), priority: String(upcomingFilters.priority || 'all'), ...patch })
  const patchModule = (patch: Record<string, unknown>) => patchConfig('moduleFilters', { ...moduleFilters, [String(view)]: { ...currentFilter, ...patch } })
  const setAreaTab = (area: string, tab: string) => patchConfig('areaTabs', { ...areaTabs, [area]: tab })
  const toggleAdvanced = () => patchConfig('advancedAreas', { ...advanced, [String(view)]: !advanced[String(view)] })

  const filterActive = view === 'today'
    ? String(todayFilters.project || 'all') !== 'all' || String(todayFilters.priority || 'all') !== 'all'
    : view === 'upcoming'
      ? String(upcomingFilters.project || 'all') !== 'all' || String(upcomingFilters.priority || 'all') !== 'all' || upcomingFilters.tasks === false || upcomingFilters.events === false
      : view === 'tasks'
        ? String(currentFilter.priority || 'all') !== 'all' || String(currentFilter.due || 'all') !== 'all'
        : view === 'habits'
          ? String(currentFilter.status || 'all') !== 'all'
          : view === 'goals'
            ? String(currentFilter.status || 'all') !== 'all' || String(currentFilter.priority || 'all') !== 'all'
            : view === 'notes'
              ? String(currentFilter.pinned || 'all') !== 'all'
              : view === 'finance'
                ? String(currentFilter.type || 'all') !== 'all' || String(currentFilter.status || 'all') !== 'all'
                : view === 'health'
                  ? String(currentFilter.period || '30') !== '30'
                  : view === 'files'
                    ? String(currentFilter.kind || 'all') !== 'all'
                    : view === 'completed'
                      ? String(currentFilter.kind || 'all') !== 'all'
                      : false

  const resetFilters = () => {
    if (view === 'today') { patchToday({ project:'all', priority:'all' }); return }
    if (view === 'upcoming') { patchUpcoming({ tasks:true, events:true, project:'all', priority:'all' }); return }
    const defaults: Record<string, Record<string, unknown>> = {
      tasks:{ priority:'all', due:'all' },
      habits:{ status:'all' },
      goals:{ status:'all', priority:'all' },
      notes:{ pinned:'all' },
      finance:{ type:'all', status:'all' },
      health:{ period:'30' },
      files:{ kind:'all' },
      completed:{ kind:'all' },
    }
    patchConfig('moduleFilters', { ...moduleFilters, [String(view)]: defaults[String(view)] || {} })
  }

  const commonProject = <label><span>Projeto</span><select value={String((view === 'today' ? todayFilters.project : upcomingFilters.project) || 'all')} onChange={event => view === 'today' ? patchToday({ project:event.target.value }) : patchUpcoming({ project:event.target.value })}><option value="all">Todos</option><option value="entrada">Entrada</option>{projects.map(project => <option key={String(project.id)} value={String(project.id)}>{String(project.nome || 'Projeto')}</option>)}</select></label>
  const commonPriority = <label><span>Prioridade</span><select value={String((view === 'today' ? todayFilters.priority : upcomingFilters.priority) || 'all')} onChange={event => view === 'today' ? patchToday({ priority:event.target.value }) : patchUpcoming({ priority:event.target.value })}><option value="all">Todas</option><option value="1">Alta</option><option value="2">Média</option><option value="3">Baixa</option><option value="4">Sem prioridade</option></select></label>

  return <div className="mai-app-topbar">
    <div className="mai-app-topbar-context"><strong>{title}</strong><span>{info}</span></div>

    <div className="mai-app-topbar-nav">
      {view === 'upcoming' ? <div className="mai-app-topbar-segment">
        <button data-active={(configs.upcomingView || 'list') !== 'month'} onClick={() => patchConfig('upcomingView', 'list')}>Lista</button>
        <button data-active={configs.upcomingView === 'month'} onClick={() => patchConfig('upcomingView', 'month')}>Mês</button>
      </div> : null}
      {view === 'tasks' ? <div className="mai-app-topbar-segment">
        <button data-active={taskScope === 'today'} onClick={() => onTaskScopeChange('today')}>Hoje</button>
        <button data-active={taskScope === 'upcoming'} onClick={() => onTaskScopeChange('upcoming')}>Em breve</button>
      </div> : null}
      {view === 'habits' && !advanced.habits ? <div className="mai-app-topbar-segment">
        {[['today','Hoje'],['week','Semana'],['report','Relatório']].map(([id,label]) => <button key={id} data-active={(areaTabs.habits || 'today') === id} onClick={() => setAreaTab('habits', id)}>{label}</button>)}
      </div> : null}
      {view === 'finance' && !advanced.finance ? <div className="mai-app-topbar-segment">
        {[['overview','Resumo'],['transactions','Lançamentos'],['accounts','Contas'],['cards','Cartões']].map(([id,label]) => <button key={id} data-active={(areaTabs.finance || 'overview') === id} onClick={() => setAreaTab('finance', id)}>{label}</button>)}
      </div> : null}
      {view === 'health' && !advanced.health ? <div className="mai-app-topbar-segment">
        <button data-active={(areaTabs.health || 'today') !== 'history'} onClick={() => setAreaTab('health', 'today')}>Hoje</button>
        <button data-active={areaTabs.health === 'history'} onClick={() => setAreaTab('health', 'history')}>Histórico</button>
      </div> : null}
      {view === 'files' && !advanced.files ? <div className="mai-app-topbar-segment">
        <button data-active={(areaTabs.files || 'list') !== 'grid'} onClick={() => setAreaTab('files', 'list')}>Lista</button>
        <button data-active={areaTabs.files === 'grid'} onClick={() => setAreaTab('files', 'grid')}>Grade</button>
      </div> : null}
    </div>

    <div className="mai-app-topbar-actions">
      <button className="mai-app-topbar-icon" data-active={filterActive || filtersOpen} title={`Filtros de ${title}`} aria-label={`Filtros de ${title}`} onClick={() => setFiltersOpen(value => !value)}><span className="material-symbols-rounded">filter_list</span></button>
      {['habits','goals','notes','finance','health','files'].includes(String(view)) ? <button className="mai-app-topbar-icon" data-active={Boolean(advanced[String(view)])} title={advanced[String(view)] ? 'Visual simples' : 'Ferramentas avançadas'} aria-label={advanced[String(view)] ? 'Visual simples' : 'Ferramentas avançadas'} onClick={toggleAdvanced}><span className="material-symbols-rounded">tune</span></button> : null}
      <button className="mai-app-topbar-icon" title="Ajustes" aria-label="Ajustes" onClick={onSettings}><span className="material-symbols-rounded">settings</span></button>
    </div>

    {filtersOpen ? <div className="mai-app-topbar-filter-popover" data-view={String(view)}>
      {view === 'today' ? <>{commonProject}{commonPriority}</> : null}
      {view === 'upcoming' ? <><div className="mai-app-topbar-filter-toggles"><button data-active={upcomingFilters.tasks !== false} onClick={() => patchUpcoming({ tasks: upcomingFilters.tasks === false })}>Tarefas</button><button data-active={upcomingFilters.events !== false} onClick={() => patchUpcoming({ events: upcomingFilters.events === false })}>Compromissos</button></div>{commonProject}{commonPriority}</> : null}
      {view === 'tasks' ? <>
        <label><span>Prioridade</span><select value={String(currentFilter.priority || 'all')} onChange={event => patchModule({ priority:event.target.value })}><option value="all">Todas</option><option value="1">Alta</option><option value="2">Média</option><option value="3">Baixa</option><option value="4">Sem prioridade</option></select></label>
        <label><span>Data</span><select value={String(currentFilter.due || 'all')} onChange={event => patchModule({ due:event.target.value })}><option value="all">Todas</option><option value="overdue">Atrasadas</option><option value="today">Hoje</option><option value="future">Futuras</option><option value="none">Sem data</option></select></label>
      </> : null}
      {view === 'habits' ? <label><span>Situação</span><select value={String(currentFilter.status || 'all')} onChange={event => patchModule({ status:event.target.value })}><option value="all">Todos</option><option value="pending">Pendentes hoje</option><option value="done">Concluídos hoje</option></select></label> : null}
      {view === 'goals' ? <>
        <label><span>Status</span><select value={String(currentFilter.status || 'all')} onChange={event => patchModule({ status:event.target.value })}><option value="all">Todas ativas</option><option value="active">Em andamento</option><option value="paused">Pausadas</option></select></label>
        <label><span>Prioridade</span><select value={String(currentFilter.priority || 'all')} onChange={event => patchModule({ priority:event.target.value })}><option value="all">Todas</option><option value="1">Alta</option><option value="2">Média</option><option value="3">Baixa</option><option value="4">Sem prioridade</option></select></label>
      </> : null}
      {view === 'notes' ? <label><span>Notas</span><select value={String(currentFilter.pinned || 'all')} onChange={event => patchModule({ pinned:event.target.value })}><option value="all">Todas</option><option value="pinned">Fixadas</option><option value="unpinned">Não fixadas</option></select></label> : null}
      {view === 'finance' ? <>
        <label><span>Tipo</span><select value={String(currentFilter.type || 'all')} onChange={event => patchModule({ type:event.target.value })}><option value="all">Todos</option><option value="expense">Despesas</option><option value="income">Receitas</option></select></label>
        <label><span>Status</span><select value={String(currentFilter.status || 'all')} onChange={event => patchModule({ status:event.target.value })}><option value="all">Todos</option><option value="pending">Pendentes</option><option value="paid">Pagos</option></select></label>
      </> : null}
      {view === 'health' ? <label><span>Período</span><select value={String(currentFilter.period || '30')} onChange={event => patchModule({ period:event.target.value })}><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="all">Todo histórico</option></select></label> : null}
      {view === 'files' ? <label><span>Tipo</span><select value={String(currentFilter.kind || 'all')} onChange={event => patchModule({ kind:event.target.value })}><option value="all">Todos</option><option value="folder">Pastas</option><option value="file">Arquivos</option></select></label> : null}
      {view === 'completed' ? <label><span>Tipo</span><select value={String(currentFilter.kind || 'all')} onChange={event => patchModule({ kind:event.target.value })}><option value="all">Todos</option><option value="task">Tarefas</option><option value="event">Compromissos</option><option value="habit">Hábitos</option><option value="goal">Metas</option><option value="finance">Finanças</option><option value="note">Notas</option></select></label> : null}
      <button className="mai-app-topbar-clear" disabled={!filterActive} onClick={resetFilters}>Limpar filtros</button>
    </div> : null}
  </div>
}
