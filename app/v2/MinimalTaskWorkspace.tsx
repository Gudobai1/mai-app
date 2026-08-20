'use client'

import { useMemo, useState } from 'react'
import type { LegacyTask, MaiState } from '../../lib/v2/state'
import type { Row } from './app-types'
import type { InspectableItem } from './ContextDrawer'
import { MaiIcon } from './MaiIcons'
import { UnifiedTasks, type TaskWorkspaceView } from './UnifiedTasks'

type Props = {
  state: MaiState
  today: string
  view: TaskWorkspaceView
  commit: (change: (current: MaiState) => MaiState) => void
  googleRpc: (method: string, args?: unknown[]) => Promise<any>
  onOpenAgenda: () => void
  inspect: (item: InspectableItem) => void
  selectedId?: string
  onManageSections: (projectId: string) => void
}

type SortMode = 'manual' | 'date' | 'priority' | 'name'
const rows=(value:unknown):Row[]=>Array.isArray(value)?value as Row[]:[]
const dayOf=(task:LegacyTask)=>String(task.data_vencimento||'').slice(0,10)
const timeOf=(task:LegacyTask)=>String(task.data_vencimento||'').includes('T')?String(task.data_vencimento).slice(11,16):''
const priorityColor=(value:unknown)=>Number(value||4)===1?'#c85b52':Number(value||4)===2?'#c28a3d':Number(value||4)===3?'#7c9274':'#b8beb7'

function naturalDate(key:string,today:string){if(!key)return'Sem data';if(key===today)return'Hoje';const base=new Date(`${today}T12:00:00`),target=new Date(`${key}T12:00:00`),diff=Math.round((target.getTime()-base.getTime())/86400000);if(diff===1)return'Amanhã';if(diff>1&&diff<7)return target.toLocaleDateString('pt-BR',{weekday:'long'});return target.toLocaleDateString('pt-BR',{day:'numeric',month:'long'})}
function taskPrefs(state:MaiState):Record<string,any>{const value=state.configs.taskWorkspaces;return value&&typeof value==='object'?value as Record<string,any>: {}}

export function MinimalTaskWorkspace(props:Props){
  const {state,today,view,commit,inspect,selectedId}=props
  const projectId=view.startsWith('project:')?view.slice(8):''
  const project=rows(state.projects).find(item=>String(item.id)===projectId)
  const scopeKey=projectId?`project:${projectId}`:'inbox'
  const prefs=taskPrefs(state)[scopeKey]||{}
  const advanced=prefs.advanced===true
  const sortMode:SortMode=['manual','date','priority','name'].includes(prefs.sort)?prefs.sort:'manual'
  const [menu,setMenu]=useState(false)
  const [rowMenu,setRowMenu]=useState('')
  const [dragId,setDragId]=useState('')
  const [completedOpen,setCompletedOpen]=useState(false)
  const projects=rows(state.projects).filter(item=>item.ativo!==false)
  const projectMap=useMemo(()=>new Map(projects.map(item=>[String(item.id),item])),[state.projects])
  const tasks=state.tasks.filter(task=>projectId?String(task.projeto_id||'')===projectId:String(task.projeto_id||'entrada')==='entrada')
  const open=tasks.filter(task=>!task.concluida).sort((a,b)=>Number(a.ordem||0)-Number(b.ordem||0))
  const completed=tasks.filter(task=>task.concluida).sort((a,b)=>String(b.concluida_em||'').localeCompare(String(a.concluida_em||'')))
  const sections=projectId?rows(project?.secoes).map(String):[]
  const sectionGroups=projectId?[...sections.map(section=>({id:section,label:section,tasks:open.filter(task=>String(task.secao||'')===section)})),{id:'',label:sections.length?'Sem seção':'Tarefas',tasks:open.filter(task=>!task.secao||!sections.includes(String(task.secao)))}]:[{id:'',label:'Tarefas',tasks:open}]

  function savePrefs(patch:Row){commit(current=>({...current,configs:{...current.configs,taskWorkspaces:{...taskPrefs(current),[scopeKey]:{...(taskPrefs(current)[scopeKey]||{}),...patch}}}}))}
  function inspectTask(task:LegacyTask){inspect({kind:'task',sourceId:task.id,title:task.titulo,date:dayOf(task),time:timeOf(task),raw:task as Row})}
  function toggle(task:LegacyTask){commit(current=>({...current,tasks:current.tasks.map(item=>item.id===task.id?{...item,concluida:!item.concluida,concluida_em:!item.concluida?new Date().toISOString():''}:item)}))}
  function projectIdentity(id:unknown){const key=String(id||'entrada');return projectMap.get(key)||{id:'entrada',nome:'Entrada',cor:'#8e968d',icone:'inbox'}}

  function reorder(sourceId:string,targetId:string,targetSection?:string){if(!sourceId||!targetId||sourceId===targetId)return;commit(current=>{const next=[...current.tasks];const source=next.findIndex(task=>task.id===sourceId),target=next.findIndex(task=>task.id===targetId);if(source<0||target<0)return current;const[moved]=next.splice(source,1);const updated={...moved,secao:projectId?targetSection??moved.secao:''};next.splice(target,0,updated);return{...current,tasks:next.map((task,index)=>({...task,ordem:index}))}})}
  function moveToSection(taskId:string,section:string){commit(current=>({...current,tasks:current.tasks.map(task=>task.id===taskId?{...task,secao:section,ordem:Date.now()}:task)}));setRowMenu('')}
  function applySort(mode:SortMode){const ranked=[...open].sort((a,b)=>mode==='date'?(dayOf(a)||'9999-99-99').localeCompare(dayOf(b)||'9999-99-99')|| (timeOf(a)||'99:99').localeCompare(timeOf(b)||'99:99'):mode==='priority'?Number(a.prioridade||4)-Number(b.prioridade||4):mode==='name'?a.titulo.localeCompare(b.titulo,'pt-BR',{sensitivity:'base'}):Number(a.ordem||0)-Number(b.ordem||0));const order=new Map(ranked.map((task,index)=>[task.id,index]));commit(current=>({...current,tasks:current.tasks.map(task=>order.has(task.id)?{...task,ordem:order.get(task.id)}:task),configs:{...current.configs,taskWorkspaces:{...taskPrefs(current),[scopeKey]:{...(taskPrefs(current)[scopeKey]||{}),sort:mode}}}}));setMenu(false)}

  if(advanced)return <div className="mai-v3-task-advanced"><div className="mai-v3-advanced-banner"><span>Ferramentas avançadas</span><button onClick={()=>savePrefs({advanced:false})}>Voltar ao visual simples</button></div><UnifiedTasks state={state} today={today} view={view} commit={commit} googleRpc={props.googleRpc} onOpenAgenda={props.onOpenAgenda}/></div>

  return <div className="mai-v3-task-workspace">
    <header className="mai-v3-page-header mai-v3-task-header"><div className="mai-v3-task-title-wrap">{project?.imagem_url?<img src={String(project.imagem_url)} alt=""/>:project?<i style={{background:String(project.cor||'#6f8168')}}><MaiIcon name={String(project.icone||'folder')} size={18}/></i>:null}<div><h1>{project?String(project.nome):'Entrada'}</h1><p>{project?'Tarefas organizadas neste projeto.':'Tarefas ainda sem projeto.'}</p></div></div><div className="mai-v3-page-actions"><button title="Ordenar" onClick={()=>setMenu(value=>!value)}><span className="material-symbols-rounded">sort</span></button>{project?<button title="Seções" onClick={()=>props.onManageSections(projectId)}><span className="material-symbols-rounded">segment</span></button>:null}<button title="Mais opções" onClick={()=>setMenu(value=>!value)}><span className="material-symbols-rounded">more_horiz</span></button>{menu?<div className="mai-v3-task-menu"><span>Ordenar</span><button data-active={sortMode==='manual'} onClick={()=>applySort('manual')}>Ordem manual</button><button data-active={sortMode==='date'} onClick={()=>applySort('date')}>Data</button><button data-active={sortMode==='priority'} onClick={()=>applySort('priority')}>Prioridade</button><button data-active={sortMode==='name'} onClick={()=>applySort('name')}>Nome</button><hr/><button onClick={()=>savePrefs({advanced:true})}>Ferramentas avançadas</button></div>:null}</div></header>

    <div className="mai-v3-project-sections">{sectionGroups.map(group=><section key={group.id||'none'} onDragOver={event=>event.preventDefault()} onDrop={()=>{if(dragId&&group.tasks.length===0)moveToSection(dragId,group.id)}}><h2>{group.label}</h2><div className="mai-v3-task-list">{group.tasks.map(task=>{const identity=projectIdentity(task.projeto_id);const children=state.tasks.filter(child=>String(child.parent_id||'')===task.id);const doneChildren=children.filter(child=>child.concluida).length;return <article className="mai-v3-task-row" data-selected={selectedId===task.id} key={task.id} draggable onDragStart={()=>setDragId(task.id)} onDragEnd={()=>setDragId('')} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.stopPropagation();reorder(dragId,task.id,group.id);setDragId('')}}><button className="mai-v3-task-check" style={{borderColor:priorityColor(task.prioridade)}} onClick={()=>toggle(task)}/><button className="mai-v3-task-body" onClick={()=>inspectTask(task)}><strong>{task.titulo}</strong><small><span>{naturalDate(dayOf(task),today)}</span><span>-</span><span className="mai-v3-task-project">{identity.imagem_url?<img src={String(identity.imagem_url)} alt=""/>:<i style={{background:String(identity.cor||'#8e968d')}}><MaiIcon name={String(identity.icone||'folder')} size={10}/></i>} {String(identity.nome||'Entrada')}</span>{children.length?<><span>·</span><span>{doneChildren} de {children.length}</span></>:null}</small></button><button className="mai-v3-task-more" onClick={()=>setRowMenu(current=>current===task.id?'':task.id)}>•••</button>{rowMenu===task.id?<div className="mai-v3-task-row-menu"><button onClick={()=>{setRowMenu('');inspectTask(task)}}>Editar</button>{projectId&&sections.length?<><span>Mover para</span>{sections.map(section=><button key={section} onClick={()=>moveToSection(task.id,section)}>{section}</button>)}<button onClick={()=>moveToSection(task.id,'')}>Sem seção</button></>:null}</div>:null}</article>})}{!group.tasks.length?<div className="mai-v3-empty-line">Nenhuma tarefa nesta seção.</div>:null}</div></section>)}</div>

    <div className="mai-v3-completed-wrap"><button className="mai-v3-completed-toggle" onClick={()=>setCompletedOpen(value=>!value)}><MaiIcon name="chevron" size={14}/><span>Concluídas · {completed.length}</span></button>{completedOpen?<div className="mai-v3-task-list mai-v3-completed-list">{completed.map(task=>{const identity=projectIdentity(task.projeto_id);return <article className="mai-v3-task-row" key={task.id}><button className="mai-v3-task-check" data-completed="true" onClick={()=>toggle(task)}>✓</button><button className="mai-v3-task-body" onClick={()=>inspectTask(task)}><strong>{task.titulo}</strong><small><span>{naturalDate(dayOf(task),today)}</span><span>-</span><span className="mai-v3-task-project">{identity.imagem_url?<img src={String(identity.imagem_url)} alt=""/>:<i style={{background:String(identity.cor||'#8e968d')}}><MaiIcon name={String(identity.icone||'folder')} size={10}/></i>} {String(identity.nome||'Entrada')}</span></small></button></article>})}</div>:null}</div>
  </div>
}
