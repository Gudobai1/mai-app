'use client'

import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import type { Row } from './app-types'
import { UpcomingCompact } from './UpcomingCompact'

const rows=(value:unknown):Row[]=>Array.isArray(value)?value as Row[]:[]
type Filters={tasks:boolean;events:boolean;project:string;priority:string}

export function UpcomingV4({state,today,commit,inspect}:{state:MaiState;today:string;commit:(change:(current:MaiState)=>MaiState)=>void;inspect:(item:InspectableItem)=>void}){
  const saved=state.configs.upcomingFilters&&typeof state.configs.upcomingFilters==='object'?state.configs.upcomingFilters as Partial<Filters>:{}
  const filters:Filters={tasks:saved.tasks!==false,events:saved.events!==false,project:String(saved.project||'all'),priority:String(saved.priority||'all')}
  const projects=rows(state.projects).filter(item=>item.ativo!==false)
  const set=(patch:Partial<Filters>)=>commit(current=>({...current,configs:{...current.configs,upcomingFilters:{...filters,...patch}}}))
  const filteredState:MaiState={...state,tasks:filters.tasks?state.tasks.filter(task=>(filters.project==='all'||String(task.projeto_id||'entrada')===filters.project)&&(filters.priority==='all'||String(Number(task.prioridade||4))===filters.priority)):[],events:filters.events?state.events:[]}
  const activeCount=Number(!filters.tasks)+Number(!filters.events)+Number(filters.project!=='all')+Number(filters.priority!=='all')

  return <div className="mai-v4-upcoming-wrap">
    <div className="mai-v4-upcoming-filters" data-filtered={activeCount>0}>
      <div className="mai-v4-filter-toggles">
        <button data-active={filters.tasks} onClick={()=>set({tasks:!filters.tasks})}>Tarefas</button>
        <button data-active={filters.events} onClick={()=>set({events:!filters.events})}>Compromissos</button>
      </div>
      <label><span>Projeto</span><select value={filters.project} onChange={e=>set({project:e.target.value})}><option value="all">Todos</option><option value="entrada">Entrada</option>{projects.map(project=><option key={String(project.id)} value={String(project.id)}>{String(project.nome||'Projeto')}</option>)}</select></label>
      <label><span>Prioridade</span><select value={filters.priority} onChange={e=>set({priority:e.target.value})}><option value="all">Todas</option><option value="1">Alta</option><option value="2">Média</option><option value="3">Baixa</option><option value="4">Sem prioridade</option></select></label>
      {activeCount?<button className="mai-v4-clear-filter" onClick={()=>set({tasks:true,events:true,project:'all',priority:'all'})}>Limpar</button>:null}
    </div>
    <UpcomingCompact state={filteredState} today={today} inspect={inspect} commit={commit}/>
  </div>
}
