'use client'

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

export function TodayV4({state,today,commit,navigate,inspect,onSearch,onMore}:{state:MaiState;today:string;commit:(change:(current:MaiState)=>MaiState)=>void;navigate:(view:AppView)=>void;inspect:(item:InspectableItem)=>void;onSearch:()=>void;onMore:()=>void}){
  const dayNumber=new Date(`${today}T12:00:00`).getDay()
  const habits=rows(state.habits).filter(habit=>habit.ativo!==false&&(()=>{const days=values(habit.dias_semana).map(Number);return !days.length||days.includes(dayNumber)})())
  const entries=rows(state.habitEntries).filter(entry=>dateKey(entry.data)===today)
  const goals=rows(state.goals).filter(goal=>goalDate(goal)===today&&!String(goal.status||'').toLocaleLowerCase('pt-BR').includes('conclu'))
  const finance=state.finance||{}
  const transactions=rows(finance.transactions).filter(item=>dateKey(item.data)===today&&!item.ignorar_calculo)
  const notes=[...rows(state.notes)].filter(note=>note.ativo!==false&&note.arquivado!==true&&dateKey(note.data||note.updated_at||note.criado_em)===today).sort((a,b)=>String(b.data||b.updated_at||'').localeCompare(String(a.data||a.updated_at||''))).slice(0,4)

  return <div className="mai-v4-today-layout">
    <main className="mai-v4-today-main"><TodayCompact state={state} today={today} commit={commit} navigate={navigate} inspect={inspect} onSearch={onSearch} onMore={onMore}/></main>
    <aside className="mai-v4-today-side">
      <section>
        <header><h3>Hábitos</h3><button onClick={()=>navigate('habits')}>Ver todos</button></header>
        <div className="mai-today-unified-list">{habits.slice(0,5).map(habit=>{const value=Number(entries.find(entry=>String(entry.habito_id)===String(habit.id))?.valor||0);const target=Math.max(1,Number(habit.meta||1));const done=value>=target;return <button className="mai-today-unified-row" key={String(habit.id)} onClick={()=>navigate('habits')}>
          <i className="mai-today-unified-dot" data-done={done} style={!done?{borderColor:String(habit.cor_hex||'var(--v3-accent)')}:undefined}>{done?'✓':''}</i>
          <span className="mai-today-unified-main"><strong>{String(habit.nome||'Hábito')}</strong><small className="mai-today-unified-origin">Hábitos</small></span>
          <span className="mai-today-unified-meta"><strong>Hoje</strong>{target>1||habit.unidade?<small>{value} de {target} {String(habit.unidade||'')}</small>:<small>{done?'Concluído':'Pendente'}</small>}</span>
        </button>})}{!habits.length?<div className="mai-v3-empty-line">Nenhum hábito previsto para hoje.</div>:null}</div>
      </section>

      <section>
        <header><h3>Metas</h3><button onClick={()=>navigate('goals')}>Ver todas</button></header>
        <div className="mai-today-unified-list">{goals.slice(0,4).map(goal=>{const total=Math.max(1,Number(goal.progresso_total||100));const pct=Math.max(0,Math.min(100,Math.round(Number(goal.progresso_atual||0)/total*100)));return <button className="mai-today-unified-row" key={String(goal.id)} onClick={()=>inspect({kind:'goal',sourceId:String(goal.id),title:String(goal.titulo||'Meta'),raw:goal})}>
          <i className="mai-today-unified-dot" style={{borderColor:priorityColor(goal.prioridade)}} />
          <span className="mai-today-unified-main"><strong>{String(goal.titulo||'Meta')}</strong><small className="mai-today-unified-origin">Metas</small></span>
          <span className="mai-today-unified-meta"><strong>Hoje</strong><small>{pct}%</small></span>
        </button>})}{!goals.length?<div className="mai-v3-empty-line">Nenhuma meta com prazo para hoje.</div>:null}</div>
      </section>

      <section>
        <header><h3>Finanças</h3><button onClick={()=>navigate('finance')}>Abrir</button></header>
        <div className="mai-today-unified-list">{transactions.slice(0,5).map(item=>{const income=String(item.tipo||'').toLowerCase()==='receita';return <button className="mai-today-unified-row" key={String(item.id)} onClick={()=>navigate('finance')}>
          <i className="mai-today-unified-dot" style={{borderColor:income?'var(--mai-success, #5d8a68)':'var(--mai-danger, #c85b52)'}} />
          <span className="mai-today-unified-main"><strong>{txTitle(item)}</strong><small className="mai-today-unified-origin">{txOrigin(item)}</small></span>
          <span className="mai-today-unified-meta"><strong>{money.format(Number(item.valor||0))}</strong><small>Hoje</small></span>
        </button>})}{!transactions.length?<div className="mai-v3-empty-line">Nenhum lançamento para hoje.</div>:null}</div>
      </section>

      <section>
        <header><h3>Notas</h3><button onClick={()=>navigate('notes')}>Abrir</button></header>
        <div className="mai-today-unified-list">{notes.map(note=><button className="mai-today-unified-row" key={String(note.id)} onClick={()=>navigate('notes')}>
          <i className="mai-today-unified-dot" style={{borderColor:'var(--v3-accent)'}} />
          <span className="mai-today-unified-main"><strong>{String(note.titulo||'Sem título')}</strong><small className="mai-today-unified-origin">Notas</small></span>
          <span className="mai-today-unified-meta"><strong>Hoje</strong></span>
        </button>)}{!notes.length?<div className="mai-v3-empty-line">Nenhuma nota de hoje.</div>:null}</div>
      </section>
    </aside>
  </div>
}
