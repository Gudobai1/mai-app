'use client'

import type { MaiState } from '../../lib/v2/state'
import type { AppView, Row } from './app-types'
import type { InspectableItem } from './ContextDrawer'
import { TodayCompact } from './TodayCompact'

const rows=(value:unknown):Row[]=>Array.isArray(value)?value as Row[]:[]
const values=(value:unknown):unknown[]=>Array.isArray(value)?value:[]
const dateKey=(value:unknown)=>String(value||'').slice(0,10)
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})

export function TodayV4({state,today,commit,navigate,inspect,onSearch,onMore}:{state:MaiState;today:string;commit:(change:(current:MaiState)=>MaiState)=>void;navigate:(view:AppView)=>void;inspect:(item:InspectableItem)=>void;onSearch:()=>void;onMore:()=>void}){
  const dayNumber=new Date(`${today}T12:00:00`).getDay()
  const habits=rows(state.habits).filter(habit=>habit.ativo!==false&&(()=>{const days=values(habit.dias_semana).map(Number);return !days.length||days.includes(dayNumber)})())
  const entries=rows(state.habitEntries).filter(entry=>dateKey(entry.data)===today)
  const goals=rows(state.goals).filter(goal=>!String(goal.status||'').toLocaleLowerCase('pt-BR').includes('conclu')&&!String(goal.status||'').toLocaleLowerCase('pt-BR').includes('paus'))
  const finance=state.finance||{}
  const tx=rows(finance.transactions).filter(item=>dateKey(item.data).slice(0,7)===today.slice(0,7)&&!item.ignorar_calculo)
  const income=tx.filter(item=>item.tipo==='receita').reduce((sum,item)=>sum+Number(item.valor||0),0)
  const expense=tx.filter(item=>item.tipo!=='receita').reduce((sum,item)=>sum+Number(item.valor||0),0)
  const economy=income-expense
  const notes=[...rows(state.notes)].filter(note=>note.ativo!==false&&note.arquivado!==true).sort((a,b)=>String(b.data||'').localeCompare(String(a.data||''))).slice(0,2)

  return <div className="mai-v4-today-layout">
    <main className="mai-v4-today-main"><TodayCompact state={state} today={today} commit={commit} navigate={navigate} inspect={inspect} onSearch={onSearch} onMore={onMore}/></main>
    <aside className="mai-v4-today-side">
      <section>
        <header><h3>Hábitos</h3><button onClick={()=>navigate('habits')}>Ver todos</button></header>
        <div className="mai-v4-today-side-list">{habits.slice(0,5).map(habit=>{const value=Number(entries.find(entry=>String(entry.habito_id)===String(habit.id))?.valor||0);const target=Math.max(1,Number(habit.meta||1));return <button key={String(habit.id)} onClick={()=>navigate('habits')}><i data-done={value>=target}>{value>=target?'✓':''}</i><span><strong>{habit.nome}</strong>{target>1||habit.unidade?<small>{value} de {target} {habit.unidade||''}</small>:null}</span></button>})}{!habits.length?<div className="mai-v3-empty-line">Nenhum hábito para hoje.</div>:null}</div>
      </section>

      <section>
        <header><h3>Metas</h3><button onClick={()=>navigate('goals')}>Ver todas</button></header>
        <div className="mai-v4-today-goals">{goals.slice(0,4).map(goal=>{const total=Math.max(1,Number(goal.progresso_total||100));const pct=Math.max(0,Math.min(100,Math.round(Number(goal.progresso_atual||0)/total*100)));return <button key={String(goal.id)} onClick={()=>navigate('goals')}><div><strong>{goal.titulo||'Meta'}</strong><span>{pct}%</span></div><i><b style={{width:`${pct}%`}}/></i></button>})}{!goals.length?<div className="mai-v3-empty-line">Nenhuma meta em andamento.</div>:null}</div>
      </section>

      <section className="mai-v4-today-finance">
        <header><h3>Finanças</h3><button onClick={()=>navigate('finance')}>Abrir</button></header>
        <button onClick={()=>navigate('finance')}><span>Economia no mês</span><strong data-positive={economy>=0}>{money.format(economy)}</strong></button>
      </section>

      {notes.length?<section><header><h3>Notas recentes</h3><button onClick={()=>navigate('notes')}>Abrir</button></header><div className="mai-v4-today-notes">{notes.map(note=><button key={String(note.id)} onClick={()=>navigate('notes')}><strong>{note.titulo||'Sem título'}</strong></button>)}</div></section>:null}
    </aside>
  </div>
}
