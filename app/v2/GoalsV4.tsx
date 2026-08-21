'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'

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
  const categories=rows(state.goalCategories)
  const categoryMap=useMemo(()=>new Map(categories.map(item=>[String(item.id),item])),[categories])
  const [draft,setDraft]=useState<Row|null>(null)
  useEffect(()=>{if(createRequest?.startsWith('goals:'))setDraft({titulo:'',status:'Em Andamento',prazo:'',progresso_atual:0,progresso_total:100,descricao:'',prioridade:4})},[createRequest])
  const buckets=[
    {id:'active',title:'Em andamento',test:(g:Row)=>!String(g.status||'').toLowerCase().includes('conclu')&&!String(g.status||'').toLowerCase().includes('paus')},
    {id:'paused',title:'Pausadas',test:(g:Row)=>String(g.status||'').toLowerCase().includes('paus')},
    {id:'done',title:'Concluídas',test:(g:Row)=>String(g.status||'').toLowerCase().includes('conclu')},
  ]
  const categoryLabel=(goal:Row)=>String(goal.categoria_nome||categoryMap.get(String(goal.categoria_id||goal.categoria||''))?.nome||'Metas')
  function save(e:FormEvent){e.preventDefault();if(!draft||!String(draft.titulo||'').trim())return;const next={...draft,id:draft.id||uid('meta'),titulo:String(draft.titulo).trim(),progresso_total:Math.max(1,Number(draft.progresso_total||100)),progresso_atual:Number(draft.progresso_atual||0)};commit(current=>({...current,goals:rows(current.goals).some(g=>String(g.id)===String(next.id))?rows(current.goals).map(g=>String(g.id)===String(next.id)?next:g):[next,...rows(current.goals)]}));setDraft(null)}
  const open=(goal:Row)=>inspect({kind:'goal',sourceId:String(goal.id),title:String(goal.titulo||'Meta'),date:dateKey(goal.prazo),raw:goal})

  return <div className="mai-v3-area-page mai-v4-goals">
    <header className="mai-v3-area-header"><div><h1>Metas</h1><p>Acompanhe progresso e prazos sem sair do mesmo padrão.</p></div><div className="mai-v3-area-actions"><button title="Ferramentas avançadas" aria-label="Ferramentas avançadas" onClick={()=>commit(current=>({...current,configs:{...current.configs,advancedAreas:{...(current.configs.advancedAreas&&typeof current.configs.advancedAreas==='object'?current.configs.advancedAreas as Record<string,boolean>:{}),goals:true}}}))}><span className="material-symbols-rounded">more_horiz</span></button></div></header>
    <div className="mai-v3-goal-groups">{buckets.map(bucket=>{const list=goals.filter(bucket.test);return <section key={bucket.id}><h2>{bucket.title}</h2><div className="mai-v3-simple-list">{list.map(goal=>{const progress=pct(Number(goal.progresso_atual||0),Number(goal.progresso_total||100));return <button className="mai-today-unified-row mai-item-row-v2 mai-v4-goal-item" key={String(goal.id)} onClick={()=>open(goal)}><i className="mai-today-unified-dot" style={{borderColor:priorityColor(goal.prioridade)}}/><span className="mai-item-copy-v2"><span className="mai-item-titleline-v2"><strong>{String(goal.titulo||'Meta')}</strong><span className="mai-item-inline-tag">{categoryLabel(goal)}</span></span><span className="mai-item-subline-v2"><span>{naturalDate(dateKey(goal.prazo),today)}</span><span>·</span><span>{progress}% concluído</span></span></span></button>})}{!list.length?<div className="mai-v3-empty-line">Nenhuma meta.</div>:null}</div></section>})}</div>
    {draft?<div className="mai-v3-create-layer" onMouseDown={()=>setDraft(null)}><form className="mai-v3-create-drawer" onSubmit={save} onMouseDown={e=>e.stopPropagation()}><header className="mai-v3-drawer-header"><strong>Nova meta</strong><button type="button" className="mai-v3-close" onClick={()=>setDraft(null)}>×</button></header><div className="mai-v3-drawer-body"><input className="mai-v3-title-input" autoFocus value={draft.titulo||''} placeholder="Nome da meta" onChange={e=>setDraft({...draft,titulo:e.target.value})}/><label className="mai-v3-field-line"><span>Status</span><select value={draft.status||'Em Andamento'} onChange={e=>setDraft({...draft,status:e.target.value})}><option>Em Andamento</option><option>Pausada</option><option>Concluída</option></select></label><label className="mai-v3-field-line"><span>Prazo</span><input type="date" value={dateKey(draft.prazo)} onChange={e=>setDraft({...draft,prazo:e.target.value})}/></label><label className="mai-v3-field-line"><span>Atual</span><input type="number" value={draft.progresso_atual||0} onChange={e=>setDraft({...draft,progresso_atual:Number(e.target.value)})}/></label><label className="mai-v3-field-line"><span>Alvo</span><input type="number" min="1" value={draft.progresso_total||100} onChange={e=>setDraft({...draft,progresso_total:Number(e.target.value)})}/></label></div><footer className="mai-v3-drawer-footer"><button type="button" className="mai-v3-secondary" onClick={()=>setDraft(null)}>Cancelar</button><button className="mai-v3-primary">Salvar</button></footer></form></div>:null}
  </div>
}
