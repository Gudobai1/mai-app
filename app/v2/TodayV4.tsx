'use client'

import { useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { AppView, Row } from './app-types'
import type { InspectableItem } from './ContextDrawer'
import { FinanceTransactionCard, financeCardPaymentState } from './FinanceTransactionCard'
import { TodayCompact } from './TodayCompact'

const rows=(value:unknown):Row[]=>Array.isArray(value)?value as Row[]:[]
const values=(value:unknown):unknown[]=>Array.isArray(value)?value:[]
const dateKey=(value:unknown)=>String(value||'').slice(0,10)
const priorityColor=(value:unknown)=>Number(value||4)===1?'#c85b52':Number(value||4)===2?'#c28a3d':Number(value||4)===3?'#7c9274':'var(--v3-line-strong)'
const goalDate=(goal:Row)=>dateKey(goal.prazo||goal.data||goal.data_limite||goal.deadline)
const txTitle=(item:Row)=>String(item.descricao||item.titulo||item.nome||item.categoria||'Lançamento')
const paid=(value:unknown)=>['pago','paga','quitado','quitada','concluido','concluida'].includes(String(value||'').toLocaleLowerCase('pt-BR'))
const concluded=(item:Row)=>item.concluida===true||String(item.status||'').toLocaleLowerCase('pt-BR').includes('conclu')
const hiddenFromAgenda=(habit:Row)=>habit.ocultar_agenda===true||String(habit.ocultar_agenda||'').toLowerCase()==='true'||habit.ocultarAgenda===true||habit.mostrar_agenda===false||habit.mostrar_hoje_agenda===false
const DEFAULT_ORDER=['appointments','tasks','habits','goals','finance','notes'] as const
type SectionId=typeof DEFAULT_ORDER[number]
const labels:Record<SectionId,string>={appointments:'Compromissos',tasks:'Tarefas',habits:'Hábitos',goals:'Metas',finance:'Finanças',notes:'Notas'}

function naturalDate(key:string,today:string){
  if(!key)return 'Sem data'
  if(key===today)return 'Hoje'
  const base=new Date(`${today}T12:00:00`)
  const target=new Date(`${key}T12:00:00`)
  const diff=Math.round((target.getTime()-base.getTime())/86_400_000)
  if(diff===-1)return 'Ontem'
  return target.toLocaleDateString('pt-BR',{day:'numeric',month:'short',year:target.getFullYear()!==base.getFullYear()?'numeric':undefined})
}

function habitEligible(habit:Row,day:string){
  const start=dateKey(habit.data_inicio||habit.criado_em)
  if(start&&day<start)return false
  const match=String(habit.repeticao||'').match(/^intervalo:(\d+)$/)
  if(match){
    if(!start)return true
    const interval=Math.max(1,Number(match[1])||1)
    const diff=Math.round((new Date(`${day}T12:00:00`).getTime()-new Date(`${start}T12:00:00`).getTime())/86_400_000)
    return diff%interval===0
  }
  const days=values(habit.dias_semana).map(Number).filter(value=>Number.isInteger(value)&&value>=0&&value<=6)
  return !days.length||days.includes(new Date(`${day}T12:00:00`).getDay())
}

export function TodayV4({state,today,commit,navigate,inspect,onSearch}:{state:MaiState;today:string;commit:(change:(current:MaiState)=>MaiState)=>void;navigate:(view:AppView)=>void;inspect:(item:InspectableItem)=>void;onSearch:()=>void;onMore:()=>void}){
  const [menuOpen,setMenuOpen]=useState(false)
  const savedOrder=Array.isArray(state.configs.todayListOrder)?state.configs.todayListOrder.map(String).filter((id):id is SectionId=>DEFAULT_ORDER.includes(id as SectionId)):[]
  const order=[...savedOrder,...DEFAULT_ORDER.filter(id=>!savedOrder.includes(id))]
  const hidden=new Set(Array.isArray(state.configs.todayListHidden)?state.configs.todayListHidden.map(String):[])
  const moduleControls=state.configs.moduleControls&&typeof state.configs.moduleControls==='object'?state.configs.moduleControls as Record<string,Row>:{}
  const kanban=moduleControls.today?.layout==='kanban'
  const entries=rows(state.habitEntries).filter(entry=>dateKey(entry.data)===today)
  const habits=rows(state.habits).filter(habit=>{
    if(habit.ativo===false||hiddenFromAgenda(habit)||!habitEligible(habit,today))return false
    const entry=entries.find(item=>String(item.habito_id)===String(habit.id))
    return !entry||(!(entry.falhou===true||String(entry.status||'').toLowerCase()==='falha')&&Number(entry.valor||0)<=0)
  })
  const goals=rows(state.goals).filter(goal=>{const day=goalDate(goal);return Boolean(day)&&day<=today&&!String(goal.status||'').toLocaleLowerCase('pt-BR').includes('conclu')&&goal.concluida!==true}).sort((a,b)=>goalDate(a).localeCompare(goalDate(b)))
  const finance=state.finance||{}
  const financeAccounts=rows(finance.accounts)
  const financeCards=rows(finance.cards)
  const financeCandidates=rows(finance.transactions).filter(item=>{const day=dateKey(item.data);return Boolean(day)&&day<=today&&!item.ignorar_calculo&&!paid(item.status)}).sort((a,b)=>dateKey(a.data).localeCompare(dateKey(b.data)))
  const transactions=financeCandidates.filter(item=>item.ocultar_inicio!==true&&item.ocultar_home!==true)
  const notes=[...rows(state.notes)].filter(note=>note.ativo!==false&&note.arquivado!==true&&!concluded(note)&&dateKey(note.data||note.updated_at||note.criado_em)===today).sort((a,b)=>String(b.data||b.updated_at||'').localeCompare(String(a.data||a.updated_at||''))).slice(0,8)

  function setHidden(id:SectionId){const next=new Set(hidden);next.has(id)?next.delete(id):next.add(id);commit(current=>({...current,configs:{...current.configs,todayListHidden:[...next]}}))}
  function move(id:SectionId,delta:number){const next=[...order];const index=next.indexOf(id);const target=index+delta;if(index<0||target<0||target>=next.length)return;[next[index],next[target]]=[next[target],next[index]];commit(current=>({...current,configs:{...current.configs,todayListOrder:next}}))}
  function setFinanceVisible(item:Row,visible:boolean){
    commit(current=>({...current,finance:{...current.finance,transactions:rows(current.finance.transactions).map(row=>String(row.id)===String(item.id)?{...row,ocultar_inicio:!visible,ocultar_home:false}:row)}}))
  }
  function toggleFinancePaid(item:Row){
    const payment=financeCardPaymentState(item)
    commit(current=>({...current,finance:{...current.finance,transactions:rows(current.finance.transactions).map(row=>{
      if(String(row.id)!==String(item.id))return row
      if(payment.status==='pago')return {...row,status:'pendente',valor_pago:0,pagamentos:[]}
      if(payment.total<=0)return row
      const existing=rows(row.pagamentos)
      const pagamentos=payment.remaining>0?[...existing,{id:`pay-${crypto.randomUUID()}`,data:today,valor:payment.remaining}]:existing
      return {...row,status:'pago',valor_pago:payment.total,pagamentos}
    })}}))
  }

  const sectionContent:Record<SectionId,React.ReactNode>={
    appointments:<TodayCompact part="appointments" state={state} today={today} commit={commit} navigate={navigate} inspect={inspect} onSearch={onSearch} onMore={()=>setMenuOpen(v=>!v)}/>,
    tasks:<TodayCompact part="tasks" state={state} today={today} commit={commit} navigate={navigate} inspect={inspect} onSearch={onSearch} onMore={()=>setMenuOpen(v=>!v)}/>,
    habits:<section className="mai-v4-today-list-section"><header><h2>Hábitos</h2></header><div className="mai-today-unified-list">{habits.map(habit=>{const value=Number(entries.find(entry=>String(entry.habito_id)===String(habit.id))?.valor||0);const target=Math.max(1,Number(habit.meta||1));const detail=target>1||habit.unidade?`${value} de ${target} ${String(habit.unidade||'')}`:'Pendente';return <button className="mai-today-unified-row mai-item-row-v2" key={String(habit.id)} onClick={()=>inspect({kind:'habit',sourceId:String(habit.id),title:String(habit.nome||'Hábito'),date:today,raw:habit})}><i className="mai-today-unified-dot" style={{borderColor:String(habit.cor_hex||'var(--v3-accent)')}}/><span className="mai-item-copy-v2"><span className="mai-item-titleline-v2"><strong>{String(habit.nome||'Hábito')}</strong></span><span className="mai-item-subline-v2"><span>Hoje</span><span>·</span><span>{detail}</span></span></span></button>})}{!habits.length?<div className="mai-v3-empty-line">Nenhum hábito previsto para hoje.</div>:null}</div></section>,
    goals:<section className="mai-v4-today-list-section"><header><h2>Metas</h2></header><div className="mai-today-unified-list">{goals.map(goal=>{const total=Math.max(1,Number(goal.progresso_total||100));const pct=Math.max(0,Math.min(100,Math.round(Number(goal.progresso_atual||0)/total*100)));const day=goalDate(goal);return <button className="mai-today-unified-row mai-item-row-v2" key={String(goal.id)} onClick={()=>inspect({kind:'goal',sourceId:String(goal.id),title:String(goal.titulo||'Meta'),date:day,raw:goal})}><i className="mai-today-unified-dot" style={{borderColor:priorityColor(goal.prioridade)}}/><span className="mai-item-copy-v2"><span className="mai-item-titleline-v2"><strong>{String(goal.titulo||'Meta')}</strong></span><span className="mai-item-subline-v2"><span>{naturalDate(day,today)}</span><span>·</span><span>{pct}%</span></span></span></button>})}{!goals.length?<div className="mai-v3-empty-line">Nenhuma meta pendente para hoje.</div>:null}</div></section>,
    finance:<section className="mai-v4-today-list-section"><header><h2>Finanças</h2></header><div className="mai-today-unified-list mai-v3-finance-rows mai-v3-simple-list">{transactions.map(item=>{const day=dateKey(item.data);return <FinanceTransactionCard key={String(item.id)} item={item} accounts={financeAccounts} cards={financeCards} today={today} onOpen={()=>inspect({kind:'finance',sourceId:String(item.id),title:txTitle(item),date:day,raw:item})} onTogglePaid={()=>toggleFinancePaid(item)} onSetHomeVisible={visible=>setFinanceVisible(item,visible)}/>})}{!transactions.length?<div className="mai-v3-empty-line">{financeCandidates.length?'Nenhum lançamento visível na tela inicial.':'Nenhum lançamento pendente para hoje.'}</div>:null}</div></section>,
    notes:<section className="mai-v4-today-list-section"><header><h2>Notas</h2></header><div className="mai-today-unified-list">{notes.map(note=><button className="mai-today-unified-row mai-item-row-v2" key={String(note.id)} onClick={()=>inspect({kind:'note',sourceId:String(note.id),title:String(note.titulo||'Sem título'),date:dateKey(note.data||note.updated_at||note.criado_em),raw:note})}><i className="mai-today-unified-dot" style={{borderColor:'var(--v3-accent)'}}/><span className="mai-item-copy-v2"><span className="mai-item-titleline-v2"><strong>{String(note.titulo||'Sem título')}</strong></span><span className="mai-item-subline-v2"><span>Hoje</span></span></span></button>)}{!notes.length?<div className="mai-v3-empty-line">Nenhuma nota de hoje.</div>:null}</div></section>,
  }

  return <div className={`mai-v4-today-single${kanban?' mai-v4-today-kanban':''}`}><div className="mai-v4-today-header-wrap"><TodayCompact part="header" state={state} today={today} commit={commit} navigate={navigate} inspect={inspect} onSearch={onSearch} onMore={()=>setMenuOpen(v=>!v)}/>{menuOpen?<div className="mai-v4-today-customize"><strong>Personalizar Hoje</strong>{order.map((id,index)=><div key={id}><button className="mai-v4-section-toggle" data-visible={!hidden.has(id)} onClick={()=>setHidden(id)}><span className="material-symbols-rounded">{hidden.has(id)?'check_box_outline_blank':'check_box'}</span>{labels[id]}</button><span><button disabled={index===0} onClick={()=>move(id,-1)} title="Mover para cima">↑</button><button disabled={index===order.length-1} onClick={()=>move(id,1)} title="Mover para baixo">↓</button></span></div>)}</div>:null}</div><div className={`mai-v4-today-list${kanban?' mai-native-kanban-board':''}`}>{order.filter(id=>!hidden.has(id)).map(id=><div key={id}>{sectionContent[id]}</div>)}</div></div>
}
