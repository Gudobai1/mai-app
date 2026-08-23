'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'
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
}

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const dateKey = (value: unknown) => String(value || '').slice(0, 10)
const paid = (value: unknown) => ['pago','paga','quitado','quitada','concluido','concluida','concluído','concluída'].includes(String(value || '').toLocaleLowerCase('pt-BR'))

function PanelSection({ title, children }: { title:string; children:ReactNode }) {
  return <section className="mai-app-topbar-panel-section"><strong>{title}</strong><div>{children}</div></section>
}

function SelectLine({ label, value, onChange, children }: { label:string; value:string; onChange:(value:string)=>void; children:ReactNode }) {
  return <label className="mai-app-topbar-select-line"><span>{label}</span><select value={value} onChange={event => onChange(event.target.value)}>{children}</select></label>
}

function Choices({ value, onChange, items }: { value:string; onChange:(value:string)=>void; items:{value:string;label:string}[] }) {
  return <div className="mai-app-topbar-choices">{items.map(item => <button key={item.value} data-active={value === item.value} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>
}

export function AppTopBar({ state, today, view, taskScope, commit, onTaskScopeChange }: Props) {
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [view, taskScope])

  const configs = state.configs as Record<string, any>
  const projects = useMemo(() => rows(state.projects).filter(item => item.ativo !== false), [state.projects])
  const goals = rows(state.goals)
  const notes = rows(state.notes).filter(item => item.ativo !== false && item.arquivado !== true)
  const habits = rows(state.habits).filter(item => item.ativo !== false)
  const transactions = rows((state.finance || {}).transactions)
  const activeTasks = state.tasks.filter(task => !task.concluida)
  const overdue = activeTasks.filter(task => dateKey(task.data_vencimento) && dateKey(task.data_vencimento) < today).length
    + goals.filter(goal => { const day = dateKey(goal.prazo || goal.data_fim || goal.data_limite || goal.deadline); return day && day < today && goal.concluida !== true && !String(goal.status || '').toLocaleLowerCase('pt-BR').includes('conclu') }).length
    + transactions.filter(item => { const day = dateKey(item.data); return day && day < today && !item.ignorar_calculo && !paid(item.status) }).length

  const todayFilters = configs.todayFilters && typeof configs.todayFilters === 'object' ? configs.todayFilters as Row : {}
  const upcomingFilters = configs.upcomingFilters && typeof configs.upcomingFilters === 'object' ? configs.upcomingFilters as Row : {}
  const areaTabs = configs.areaTabs && typeof configs.areaTabs === 'object' ? configs.areaTabs as Record<string,string> : {}
  const advanced = configs.advancedAreas && typeof configs.advancedAreas === 'object' ? configs.advancedAreas as Record<string,boolean> : {}
  const moduleControls = configs.moduleControls && typeof configs.moduleControls === 'object' ? configs.moduleControls as Record<string,Row> : {}
  const control = moduleControls[String(view)] || {}

  const activeProject = taskScope.startsWith('project:') ? projects.find(project => String(project.id) === taskScope.slice(8)) : null
  const titleMap: Partial<Record<AppView,string>> = { today:'Hoje', upcoming:'Em breve', completed:'Concluídos', tasks:'Tarefas', habits:'Hábitos', goals:'Metas', notes:'Notas', finance:'Finanças', health:'Bem-estar', files:'Arquivos' }
  const title = titleMap[view] || 'MAI'
  const dayLabel = new Date(`${today}T12:00:00`).toLocaleDateString('pt-BR',{weekday:'short',day:'numeric',month:'short'}).replace('.','')
  let info = dayLabel
  if (view === 'today') info = overdue ? `${overdue} atrasado${overdue === 1 ? '' : 's'}` : dayLabel
  if (view === 'upcoming') info = `${activeTasks.filter(task => dateKey(task.data_vencimento) >= today).length} futuras`
  if (view === 'tasks') info = taskScope === 'entrada' ? 'Entrada' : taskScope === 'today' ? 'Hoje' : taskScope === 'upcoming' ? 'Em breve' : String(activeProject?.nome || 'Projeto')
  if (view === 'habits') info = `${habits.length} hábito${habits.length === 1 ? '' : 's'}`
  if (view === 'goals') info = `${goals.filter(goal => goal.concluida !== true && !String(goal.status || '').toLocaleLowerCase('pt-BR').includes('conclu')).length} em andamento`
  if (view === 'notes') info = `${notes.length} nota${notes.length === 1 ? '' : 's'}`
  if (view === 'finance') info = `${transactions.length} lançamento${transactions.length === 1 ? '' : 's'}`
  if (view === 'completed') info = 'Histórico geral'

  const patchConfig = (key:string, value:unknown) => commit(current => ({ ...current, configs:{ ...current.configs, [key]:value } }))
  const patchToday = (patch:Row) => patchConfig('todayFilters',{ ...todayFilters, ...patch })
  const patchUpcoming = (patch:Row) => patchConfig('upcomingFilters',{ tasks:upcomingFilters.tasks !== false, events:upcomingFilters.events !== false, project:String(upcomingFilters.project || 'all'), priority:String(upcomingFilters.priority || 'all'), ...patch })
  const patchControl = (patch:Row) => patchConfig('moduleControls',{ ...moduleControls, [String(view)]:{ ...control, ...patch } })
  const setAreaTab = (area:string, tab:string) => patchConfig('areaTabs',{ ...areaTabs, [area]:tab })
  const setAdvanced = (area:string, value:boolean) => patchConfig('advancedAreas',{ ...advanced, [area]:value })

  useEffect(() => {
    const workspace = document.querySelector('.mai-v3-workspace') as HTMLElement | null
    if (!workspace) return
    workspace.dataset.maiDensity = String(control.density || 'comfortable')
  }, [view, control.density])

  const projectOptions = <><option value="all">Todos</option><option value="entrada">Entrada</option>{projects.map(project => <option key={String(project.id)} value={String(project.id)}>{String(project.nome || 'Projeto')}</option>)}</>
  const priorityOptions = <><option value="all">Todas</option><option value="1">Alta</option><option value="2">Média</option><option value="3">Baixa</option><option value="4">Sem prioridade</option></>
  const density = String(control.density || 'comfortable')

  const panel = <div className="mai-app-topbar-panel">
    {view === 'today' ? <>
      <PanelSection title="Filtros"><SelectLine label="Projeto" value={String(todayFilters.project || 'all')} onChange={value => patchToday({project:value})}>{projectOptions}</SelectLine><SelectLine label="Prioridade" value={String(todayFilters.priority || 'all')} onChange={value => patchToday({priority:value})}>{priorityOptions}</SelectLine></PanelSection>
      <PanelSection title="Classificação"><Choices value={String(control.sort || 'overdue')} onChange={value => patchControl({sort:value})} items={[{value:'overdue',label:'Atrasados'},{value:'date',label:'Data'},{value:'priority',label:'Prioridade'},{value:'title',label:'Título'}]}/></PanelSection>
      <PanelSection title="Visualização"><Choices value={density} onChange={value => patchControl({density:value})} items={[{value:'comfortable',label:'Padrão'},{value:'compact',label:'Compacta'}]}/></PanelSection>
    </> : null}

    {view === 'upcoming' ? <>
      <PanelSection title="Filtros"><div className="mai-app-topbar-switches"><button data-active={upcomingFilters.tasks !== false} onClick={() => patchUpcoming({tasks:upcomingFilters.tasks === false})}>Tarefas</button><button data-active={upcomingFilters.events !== false} onClick={() => patchUpcoming({events:upcomingFilters.events === false})}>Compromissos</button></div><SelectLine label="Projeto" value={String(upcomingFilters.project || 'all')} onChange={value => patchUpcoming({project:value})}>{projectOptions}</SelectLine><SelectLine label="Prioridade" value={String(upcomingFilters.priority || 'all')} onChange={value => patchUpcoming({priority:value})}>{priorityOptions}</SelectLine></PanelSection>
      <PanelSection title="Classificação"><Choices value={String(control.sort || 'date')} onChange={value => patchControl({sort:value})} items={[{value:'date',label:'Data'},{value:'priority',label:'Prioridade'},{value:'title',label:'Título'}]}/></PanelSection>
      <PanelSection title="Visualização"><Choices value={configs.upcomingView === 'month' ? 'month' : 'list'} onChange={value => patchConfig('upcomingView',value)} items={[{value:'list',label:'Lista'},{value:'month',label:'Calendário'}]}/></PanelSection>
    </> : null}

    {view === 'completed' ? <>
      <PanelSection title="Filtros"><SelectLine label="Tipo" value={String(control.kind || 'all')} onChange={value => patchControl({kind:value})}><option value="all">Todos</option><option value="task">Tarefas</option><option value="event">Compromissos</option><option value="habit">Hábitos</option><option value="goal">Metas</option><option value="finance">Finanças</option><option value="note">Notas</option></SelectLine></PanelSection>
      <PanelSection title="Classificação"><Choices value={String(control.sort || 'recent')} onChange={value => patchControl({sort:value})} items={[{value:'recent',label:'Recentes'},{value:'oldest',label:'Antigos'},{value:'title',label:'Título'}]}/></PanelSection>
      <PanelSection title="Visualização"><Choices value={density} onChange={value => patchControl({density:value})} items={[{value:'comfortable',label:'Padrão'},{value:'compact',label:'Compacta'}]}/></PanelSection>
    </> : null}

    {view === 'tasks' ? <>
      <PanelSection title="Filtros"><SelectLine label="Projeto" value={String(control.project || 'all')} onChange={value => patchControl({project:value})}>{projectOptions}</SelectLine><SelectLine label="Prioridade" value={String(control.priority || 'all')} onChange={value => patchControl({priority:value})}>{priorityOptions}</SelectLine></PanelSection>
      <PanelSection title="Classificação"><Choices value={String(control.sort || 'manual')} onChange={value => patchControl({sort:value})} items={[{value:'manual',label:'Manual'},{value:'date',label:'Data'},{value:'priority',label:'Prioridade'},{value:'name',label:'Nome'}]}/></PanelSection>
      <PanelSection title="Visualização"><Choices value={taskScope.startsWith('project:') ? 'project' : taskScope} onChange={value => { if(value === 'project'){ const first=projects[0]; if(first) onTaskScopeChange(`project:${String(first.id)}`); return } onTaskScopeChange(value as TaskModuleScope) }} items={[{value:'entrada',label:'Entrada'},{value:'today',label:'Hoje'},{value:'upcoming',label:'Em breve'},{value:'project',label:'Projeto'}]}/>{projects.length ? <SelectLine label="Projeto atual" value={taskScope.startsWith('project:') ? taskScope.slice(8) : ''} onChange={value => value && onTaskScopeChange(`project:${value}`)}><option value="">Selecionar</option>{projects.map(project => <option key={String(project.id)} value={String(project.id)}>{String(project.nome || 'Projeto')}</option>)}</SelectLine> : null}</PanelSection>
    </> : null}

    {view === 'habits' ? <>
      <PanelSection title="Filtros"><SelectLine label="Situação" value={String(control.status || 'all')} onChange={value => patchControl({status:value})}><option value="all">Todos</option><option value="pending">Pendentes</option><option value="done">Realizados</option></SelectLine></PanelSection>
      <PanelSection title="Classificação"><Choices value={String(control.sort || 'name')} onChange={value => patchControl({sort:value})} items={[{value:'name',label:'Nome'},{value:'time',label:'Horário'},{value:'progress',label:'Progresso'}]}/></PanelSection>
      <PanelSection title="Visualização"><Choices value={areaTabs.habits || 'today'} onChange={value => setAreaTab('habits',value)} items={[{value:'today',label:'Hoje'},{value:'week',label:'Semana'},{value:'report',label:'Relatório'}]}/><Choices value={advanced.habits ? 'advanced' : 'simple'} onChange={value => setAdvanced('habits',value === 'advanced')} items={[{value:'simple',label:'Simples'},{value:'advanced',label:'Avançada'}]}/></PanelSection>
    </> : null}

    {view === 'goals' ? <>
      <PanelSection title="Filtros"><SelectLine label="Situação" value={String(control.status || 'all')} onChange={value => patchControl({status:value})}><option value="all">Em andamento + pausadas</option><option value="active">Em andamento</option><option value="paused">Pausadas</option></SelectLine><SelectLine label="Prioridade" value={String(control.priority || 'all')} onChange={value => patchControl({priority:value})}>{priorityOptions}</SelectLine></PanelSection>
      <PanelSection title="Classificação"><Choices value={String(control.sort || 'date')} onChange={value => patchControl({sort:value})} items={[{value:'date',label:'Prazo'},{value:'priority',label:'Prioridade'},{value:'progress',label:'Progresso'},{value:'name',label:'Nome'}]}/></PanelSection>
      <PanelSection title="Visualização"><Choices value={advanced.goals ? 'advanced' : 'simple'} onChange={value => setAdvanced('goals',value === 'advanced')} items={[{value:'simple',label:'Simples'},{value:'advanced',label:'Avançada'}]}/><Choices value={density} onChange={value => patchControl({density:value})} items={[{value:'comfortable',label:'Padrão'},{value:'compact',label:'Compacta'}]}/></PanelSection>
    </> : null}

    {view === 'notes' ? <>
      <PanelSection title="Filtros"><SelectLine label="Notas" value={String(control.filter || 'all')} onChange={value => patchControl({filter:value})}><option value="all">Todas</option><option value="pinned">Fixadas</option><option value="regular">Não fixadas</option></SelectLine></PanelSection>
      <PanelSection title="Classificação"><Choices value={String(control.sort || 'recent')} onChange={value => patchControl({sort:value})} items={[{value:'recent',label:'Recentes'},{value:'oldest',label:'Antigas'},{value:'name',label:'Título'}]}/></PanelSection>
      <PanelSection title="Visualização"><Choices value={advanced.notes ? 'advanced' : 'simple'} onChange={value => setAdvanced('notes',value === 'advanced')} items={[{value:'simple',label:'Simples'},{value:'advanced',label:'Avançada'}]}/><Choices value={density} onChange={value => patchControl({density:value})} items={[{value:'comfortable',label:'Padrão'},{value:'compact',label:'Compacta'}]}/></PanelSection>
    </> : null}

    {view === 'finance' ? <>
      <PanelSection title="Filtros"><SelectLine label="Tipo" value={String(control.type || 'all')} onChange={value => patchControl({type:value})}><option value="all">Todos</option><option value="receita">Receitas</option><option value="despesa">Despesas</option></SelectLine><SelectLine label="Status" value={String(control.status || 'all')} onChange={value => patchControl({status:value})}><option value="all">Todos</option><option value="pending">Pendentes</option><option value="paid">Pagos</option></SelectLine></PanelSection>
      <PanelSection title="Classificação"><Choices value={String(control.sort || 'date')} onChange={value => patchControl({sort:value})} items={[{value:'date',label:'Data'},{value:'value',label:'Valor'},{value:'name',label:'Nome'}]}/></PanelSection>
      <PanelSection title="Visualização"><Choices value={areaTabs.finance || 'overview'} onChange={value => setAreaTab('finance',value)} items={[{value:'overview',label:'Resumo'},{value:'transactions',label:'Lançamentos'},{value:'accounts',label:'Contas'},{value:'cards',label:'Cartões'}]}/><Choices value={advanced.finance ? 'advanced' : 'simple'} onChange={value => setAdvanced('finance',value === 'advanced')} items={[{value:'simple',label:'Simples'},{value:'advanced',label:'Avançada'}]}/></PanelSection>
    </> : null}

    {(view === 'health' || view === 'files') ? <>
      <PanelSection title="Filtros"><SelectLine label="Itens" value={String(control.filter || 'all')} onChange={value => patchControl({filter:value})}><option value="all">Todos</option><option value="recent">Recentes</option></SelectLine></PanelSection>
      <PanelSection title="Classificação"><Choices value={String(control.sort || 'recent')} onChange={value => patchControl({sort:value})} items={[{value:'recent',label:'Recentes'},{value:'oldest',label:'Antigos'},{value:'name',label:'Nome'}]}/></PanelSection>
      <PanelSection title="Visualização"><Choices value={density} onChange={value => patchControl({density:value})} items={[{value:'comfortable',label:'Padrão'},{value:'compact',label:'Compacta'}]}/></PanelSection>
    </> : null}
  </div>

  return <div className="mai-app-topbar">
    <div className="mai-app-topbar-context"><strong>{title}</strong><span>{info}</span></div>
    <div className="mai-app-topbar-single-action"><button className="mai-app-topbar-menu-button" data-active={open} title="Opções do módulo" aria-label="Opções do módulo" onClick={() => setOpen(value => !value)}><span className="material-symbols-rounded">tune</span><span>Opções</span></button></div>
    {open ? panel : null}
  </div>
}
