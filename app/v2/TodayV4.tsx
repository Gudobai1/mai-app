'use client'

import { useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { AppView, Row } from './app-types'
import type { InspectableItem } from './ContextDrawer'
import { TodayCompact } from './TodayCompact'

const rows=(value:unknown):Row[]=>Array.isArray(value)?value as Row[]:[]
const values=(value:unknown):unknown[]=>Array.isArray(value)?value:[]
const dateKey=(value:unknown)=>String(value||'').slice(0,10)
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})
const priorityColor=(value:unknown)=>Number(value||4)===1?'#c85b52':Number(value||4)===2?'#c28a3d':Number(value||4)===3?'#7c9274':'var(--v3-line-strong)'
const goalDate=(goal:Row)=>dateKey(goal.prazo||goal.data||goal.data_limite||goal.deadline)
const txTitle=(item:Row)=>String(item.descricao||item.titulo||item.nome||item.categoria||'Lançamento')
const txOrigin=(item:Row)=>String(item.conta_nome||item.conta||item.categoria||item.tipo||'Finanças')
const DEFAULT_ORDER=['appointments','tasks','habits','goals','finance','notes'] as const
type SectionId=typeof DEFAULT_ORDER[number]
const labels:Record<SectionId,string>={appointments:'Compromissos',tasks:'Tarefas',habits:'Hábitos',goals:'Metas',finance:'Finanças',notes:'Notas'}

export function TodayV4({state,today,commit,navigate,inspect,onSearch}:{state:MaiState;today:string;commit:(change:(current:MaiState)=>MaiState)=>void;navigate:(view:AppView)=>void;inspect:(item:InspectableItem)=>void;onSearch:()=>void;onMore:()=>void}){
  const [menuOpen,setMenuOpen]=useState(false)
  const savedOrder=Array.isArray(state.configs.todayListOrder)?state.configs.todayListOrder.map(String).filter((id):id is SectionId=>DEFAULT_ORDER.includes(id as SectionId)):[]
  const order=[...savedOrder,...DEFAULT_ORDER.filter(id=>!savedOrder.includes(id))]
  const hidden=new Set(Array.isArray(state.configs.todayListHidden)?state.configs.todayListHidden.map(String):[])
  const dayNumber=new Date(`${today}T12:00:00`).getDay()
  const habits=rows(state.habits).filter(habit=>habit.ativo!==false&&(()=>{const days=values(habit.dias_semana).map(Number);return !days.length||days.includes(dayNumber)})())
  const entries=rows(state.habitEntries).filter(entry=>dateKey(entry.data)===today)
  const goals=rows(state.goals).filter(goal=>goalDate(goal)===today&&!String(goal.status||'').toLocaleLowerCase('pt-BR').includes('conclu'))
  const finance=state.finance||{}
  const transactions=rows(finance.transactions).filter(item=>dateKey(item.data)===today&&!item.ignorar_calculo)
  const notes=[...rows(state.notes)].filter(note=>note.ativo!==false&&note.arquivado!==true&&dateKey(note.data||note.updated_at||note.criado_em)===today).sort((a,b)=>String(b.data||b.updated_at||'').localeCompare(String(a.data||a.updated_at||''))).slice(0,8)

  function setHidden(id:SectionId){
    const next=new Set(hidden);next.has(id)?next.delete(id):next.add(id)
    commit(current=>({...current,configs:{...current.configs,todayListHidden:[...next]}}))
  }
  function move(id:SectionId,delta:number){
    const next=[...order];const index=next.indexOf(id);const target=index+delta
    if(index<0||target<0||target>=next.length)return
    ;[next[index],next[target]]=[next[target],next[index]]
    commit(current=>({...current,configs:{...current.configs,todayListOrder:next}}))
  }

  const sectionContent:Record<SectionId,React.ReactNode>={
    appointments:<TodayCompact part="appointments" state={state} today={today} commit={commit} navigate={navigate} inspect={inspect} onSearch={onSearch} onMore={()=>setMenuOpen(v=>!v)}/>,
    tasks:<TodayCompact part="tasks" state={state} today={today} commit={commit} navigate={navigate} inspect={inspect} onSearch={onSearch} onMore={()=>setMenuOpen(v=>!v)}/>,
    habits:<section className="mai-v4-today-list-section"><header><h2>Hábitos</h2></header><div className="mai-today-unified-list">{habits.map(habit=>{const value=Number(entries.find(entry=>String(entry.habito_id)===String(habit.id))?.valor||0);const target=Math.max(1,Number(habit.meta||1));const done=value>=target;const detail=target>1||habit.unidade?`${value} de ${target} ${String(habit.unidade||'')}`:done?'Concluído':'Pendente';return <button className="mai-today-unified-row mai-item-row-v2" key={String(habit.id)} onClick={()=>inspect({kind:'habit',sourceId:String(habit.id),title:String(habit.nome||'Hábito'),date:today,raw:habit})}>
      <i className="mai-today-unified-dot" data-done={done} style={!done?{borderColor:String(habit.cor_hex||'var(--v3-accent)')}:undefined}>{done?'✓':''}</i>
      <span className="mai-item-copy-v2"><span className="mai-item-titleline-v2"><strong>{String(habit.nome||'Hábito')}</strong><span className="mai-item-inline-tag">Hábitos</span></span><span className="mai-item-subline-v2"><span>Hoje</span><span>·</span><span>{detail}</span></span></span>
    </button>})}{!habits.length?<div className="mai-v3-empty-line">Nenhum hábito previsto para hoje.</div>:null}</div></section>,
    goals:<section className="mai-v4-today-list-section"><header><h2>Metas</h2></header><div className="mai-today-unified-list">{goals.map(goal=>{const total=Math.max(1,Number(goal.progresso_total||100));const pct=Math.max(0,Math.min(100,Math.round(Number(goal.progresso_atual||0)/total*100)));return <button className="mai-today-unified-row mai-item-row-v2" key={String(goal.id)} onClick={()=>inspect({kind:'goal',sourceId:String(goal.id),title:String(goal.titulo||'Meta'),date:goalDate(goal),raw:goal})}>
      <i className="mai-today-unified-dot" style={{borderColor:priorityColor(goal.prioridade)}}/>
      <span className="mai-item-copy-v2"><span className="mai-item-titleline-v2"><strong>{String(goal.titulo||'Meta')}</strong><span className="mai-item-inline-tag">Metas</span></span><span className="mai-item-subline-v2"><span>Hoje</span><span>·</span><span>{pct}% concluído</span></span></span>
    </button>})}{!goals.length?<div className="mai-v3-empty-line">Nenhuma meta com prazo para hoje.</div>:null}</div></section>,
    finance:<section className="mai-v4-today-list-section"><header><h2>Finanças</h2></header><div className="mai-today-unified-list">{transactions.map(item=>{const income=String(item.tipo||'').toLowerCase()==='receita';return <button className="mai-today-unified-row mai-item-row-v2" key={String(item.id)} onClick={()=>inspect({kind:'finance',sourceId:String(item.id),title:txTitle(item),date:dateKey(item.data),raw:item})}>
      <i className="mai-today-unified-dot" style={{borderColor:income?'var(--mai-success, #5d8a68)':'var(--mai-danger, #c85b52)'}}/>
      <span className="mai-item-copy-v2"><span className="mai-item-titleline-v2"><strong>{txTitle(item)}</strong><span className="mai-item-inline-tag">{txOrigin(item)}</span></span><span className="mai-item-subline-v2"><span>Hoje</span><span>·</span><span>{income?'+':'−'} {money.format(Number(item.valor||0))}</span></span></span>
    </button>})}{!transactions.length?<div className="mai-v3-empty-line">Nenhum lançamento para hoje.</div>:null}</div></section>,
    notes:<section className="mai-v4-today-list-section"><header><h2>Notas</h2></header><div className="mai-today-unified-list">{notes.map(note=><button className="mai-today-unified-row mai-item-row-v2" key={String(note.id)} onClick={()=>inspect({kind:'note',sourceId:String(note.id),title:String(note.titulo||'Sem título'),date:dateKey(note.data||note.updated_at||note.criado_em),raw:note})}>
      <i className="mai-today-unified-dot" style={{borderColor:'var(--v3-accent)'}}/>
      <span className="mai-item-copy-v2"><span className="mai-item-titleline-v2"><strong>{String(note.titulo||'Sem título')}</strong><span className="mai-item-inline-tag">Notas</span></span><span className="mai-item-subline-v2"><span>Hoje</span><span>·</span><span>{String(note.conteudo||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,70)||'Nota vazia'}</span></span></span>
    </button>)}{!notes.length?<div className="mai-v3-empty-line">Nenhuma nota de hoje.</div>:null}</div></section>,
  }

  return <div className="mai-v4-today-single">
    <div className="mai-v4-today-header-wrap"><TodayCompact part="header" state={state} today={today} commit={commit} navigate={navigate} inspect={inspect} onSearch={onSearch} onMore={()=>setMenuOpen(v=>!v)}/>{menuOpen?<div className="mai-v4-today-customize"><strong>Personalizar Hoje</strong>{order.map((id,index)=><div key={id}><button className="mai-v4-section-toggle" data-visible={!hidden.has(id)} onClick={()=>setHidden(id)}><span className="material-symbols-rounded">{hidden.has(id)?'check_box_outline_blank':'check_box'}</span>{labels[id]}</button><span><button disabled={index===0} onClick={()=>move(id,-1)} title="Mover para cima">↑</button><button disabled={index===order.length-1} onClick={()=>move(id,1)} title="Mover para baixo">↓</button></span></div>)}</div>:null}</div>
    <div className="mai-v4-today-list">{order.filter(id=>!hidden.has(id)).map(id=><div key={id}>{sectionContent[id]}</div>)}</div>
  </div>
}
