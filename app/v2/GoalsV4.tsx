'use client'

import { FormEvent, useEffect, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import { CreateCalendarPicker, CreateNumberEditor, CreateOptionList, CreateTool, createNaturalDate } from './CreateDrawerTools'

type Row=Record<string,any>
type Commit=(change:(current:MaiState)=>MaiState)=>void
const rows=(value:unknown):Row[]=>Array.isArray(value)?value as Row[]:[]
const uid=(prefix:string)=>`${prefix}-${crypto.randomUUID()}`
const dateKey=(value:unknown)=>String(value||'').slice(0,10)
const pct=(value:number,total:number)=>total>0?Math.max(0,Math.min(100,Math.round(value/total*100))):0
const priorityColor=(value:unknown)=>Number(value||4)===1?'#c85b52':Number(value||4)===2?'#c28a3d':Number(value||4)===3?'#7c9274':'var(--v3-line-strong)'
const naturalDate=(key:string,today:string)=>{if(!key)return'Sem prazo';if(key===today)return'Hoje';const base=new Date(`${today}T12:00:00`);const target=new Date(`${key}T12:00:00`);const diff=Math.round((target.getTime()-base.getTime())/86400000);if(diff===1)return'Amanhã';return target.toLocaleDateString('pt-BR',{day:'numeric',month:'long'})}

export function GoalsV4({state,today,commit,createRequest,inspect}:{state:MaiState;today:string;commit:Commit;createRequest?:string;inspect:(item:InspectableItem)=>void}){
  const goals=rows(state.goals)
  const [draft,setDraft]=useState<Row|null>(null)
  const [createTool,setCreateTool]=useState('')
  useEffect(()=>{if(createRequest?.startsWith('goals:')){setDraft({titulo:'',status:'Em Andamento',prazo:'',progresso_atual:0,progresso_total:100,descricao:'',prioridade:4});setCreateTool('')}},[createRequest])
  const buckets=[
    {id:'active',title:'Em andamento',test:(g:Row)=>!String(g.status||'').toLowerCase().includes('conclu')&&!String(g.status||'').toLowerCase().includes('paus')},
    {id:'paused',title:'Pausadas',test:(g:Row)=>String(g.status||'').toLowerCase().includes('paus')},
    {id:'done',title:'Concluídas',test:(g:Row)=>String(g.status||'').toLowerCase().includes('conclu')},
  ]
  function save(e:FormEvent){e.preventDefault();if(!draft||!String(draft.titulo||'').trim())return;const next={...draft,id:draft.id||uid('meta'),titulo:String(draft.titulo).trim(),progresso_total:Math.max(1,Number(draft.progresso_total||100)),progresso_atual:Number(draft.progresso_atual||0)};commit(current=>({...current,goals:rows(current.goals).some(g=>String(g.id)===String(next.id))?rows(current.goals).map(g=>String(g.id)===String(next.id)?next:g):[next,...rows(current.goals)]}));setDraft(null);setCreateTool('')}
  const open=(goal:Row)=>inspect({kind:'goal',sourceId:String(goal.id),title:String(goal.titulo||'Meta'),date:dateKey(goal.prazo),raw:goal})
  const priorityLabel=draft?({1:'Alta',2:'Média',3:'Baixa',4:'Não selecionado'} as Record<number,string>)[Number(draft.prioridade||4)]:'Não selecionado'
  const draftPriorityColor=draft?Number(draft.prioridade||4)===1?'#c85b52':Number(draft.prioridade||4)===2?'#c28a3d':Number(draft.prioridade||4)===3?'#7c9274':'#8d958b':'#8d958b'

  return <div className="mai-v3-area-page mai-v4-goals">
    <header className="mai-v3-area-header"><div><h1>Metas</h1><p>Acompanhe progresso e prazos sem sair do mesmo padrão.</p></div><div className="mai-v3-area-actions"><button title="Ferramentas avançadas" aria-label="Ferramentas avançadas" onClick={()=>commit(current=>({...current,configs:{...current.configs,advancedAreas:{...(current.configs.advancedAreas&&typeof current.configs.advancedAreas==='object'?current.configs.advancedAreas as Record<string,boolean>:{}),goals:true}}}))}><span className="material-symbols-rounded">more_horiz</span></button></div></header>
    <div className="mai-v3-goal-groups">{buckets.map(bucket=>{const list=goals.filter(bucket.test);return <section key={bucket.id}><h2>{bucket.title}</h2><div className="mai-v3-simple-list">{list.map(goal=>{const progress=pct(Number(goal.progresso_atual||0),Number(goal.progresso_total||100));return <button className="mai-today-unified-row mai-item-row-v2 mai-v4-goal-item" key={String(goal.id)} onClick={()=>open(goal)}><i className="mai-today-unified-dot" style={{borderColor:priorityColor(goal.prioridade)}}/><span className="mai-item-copy-v2"><span className="mai-item-titleline-v2"><strong>{String(goal.titulo||'Meta')}</strong></span><span className="mai-item-subline-v2"><span>{naturalDate(dateKey(goal.prazo),today)}</span><span>·</span><span>{progress}%</span></span></span></button>})}{!list.length?<div className="mai-v3-empty-line">Nenhuma meta.</div>:null}</div></section>})}</div>
    {draft?<div className="mai-v3-create-layer" onMouseDown={()=>setDraft(null)}><form className="mai-v3-create-drawer" onSubmit={save} onMouseDown={e=>e.stopPropagation()}><header className="mai-v3-drawer-header"><strong>Nova meta</strong><button type="button" className="mai-v3-close" onClick={()=>setDraft(null)}>×</button></header><div className="mai-v3-drawer-body mai-create-unified-body" onMouseDown={()=>createTool&&setCreateTool('')}><input className="mai-v3-title-input" autoFocus value={draft.titulo||''} placeholder="Nome da meta" onMouseDown={e=>e.stopPropagation()} onChange={e=>setDraft({...draft,titulo:e.target.value})}/><textarea className="mai-v3-description-input mai-create-unified-description" rows={2} value={draft.descricao||''} placeholder="Descrição" onMouseDown={e=>e.stopPropagation()} onChange={e=>setDraft({...draft,descricao:e.target.value})}/><div className="mai-task-v4-toolbar mai-context-unified-tools mai-create-unified-tools" onMouseDown={e=>e.stopPropagation()}>
      <CreateTool id="goal-date" icon="calendar_today" label="Prazo" summary={createNaturalDate(dateKey(draft.prazo),today)} color="#4f7cac" open={createTool} setOpen={setCreateTool}><CreateCalendarPicker value={dateKey(draft.prazo)} today={today} onChange={value=>setDraft({...draft,prazo:value})} close={()=>setCreateTool('')}/></CreateTool>
      <CreateTool id="goal-current" icon="trending_up" label="Atual" summary={String(Number(draft.progresso_atual||0))} color="#438a8a" open={createTool} setOpen={setCreateTool}><CreateNumberEditor value={Number(draft.progresso_atual||0)} onChange={value=>setDraft({...draft,progresso_atual:value})}/></CreateTool>
      <CreateTool id="goal-target" icon="target" label="Alvo" summary={String(Number(draft.progresso_total||100))} color="#7b63ad" open={createTool} setOpen={setCreateTool}><CreateNumberEditor value={Number(draft.progresso_total||100)} onChange={value=>setDraft({...draft,progresso_total:Math.max(1,value)})}/></CreateTool>
      <CreateTool id="goal-status" icon="task_alt" label="Status" summary={String(draft.status||'Em andamento')} color="#5779a6" open={createTool} setOpen={setCreateTool}><CreateOptionList value={String(draft.status||'Em Andamento')} onChange={value=>setDraft({...draft,status:value})} close={()=>setCreateTool('')} options={[{value:'Em Andamento',label:'Em andamento',icon:'play_circle'},{value:'Pausada',label:'Pausada',icon:'pause_circle'},{value:'Concluída',label:'Concluída',icon:'check_circle'}]}/></CreateTool>
      <CreateTool id="goal-priority" icon="flag" label="Prioridade" summary={priorityLabel} color={draftPriorityColor} open={createTool} setOpen={setCreateTool}><CreateOptionList value={Number(draft.prioridade||4)} onChange={value=>setDraft({...draft,prioridade:Number(value)})} close={()=>setCreateTool('')} options={[{value:4,label:'Sem prioridade',icon:'flag'},{value:3,label:'Baixa',icon:'flag'},{value:2,label:'Média',icon:'flag'},{value:1,label:'Alta',icon:'flag'}]}/></CreateTool>
    </div></div><footer className="mai-v3-drawer-footer"><button type="button" className="mai-v3-secondary" onClick={()=>setDraft(null)}>Cancelar</button><button className="mai-v3-primary">Salvar</button></footer></form></div>:null}
  </div>
}
