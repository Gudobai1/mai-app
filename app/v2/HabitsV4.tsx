'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'

type Row = Record<string, any>
type Commit = (change: (current: MaiState) => MaiState) => void
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const values = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const dateKey = (value: unknown) => String(value || '').slice(0,10)
const moveDate = (key:string, amount:number) => { const d=new Date(`${key}T12:00:00`); d.setDate(d.getDate()+amount); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const pct = (value:number,total:number) => total > 0 ? Math.max(0,Math.min(100,Math.round(value/total*100))) : 0

export function HabitsV4({ state, today, commit, createRequest, inspect }: { state:MaiState; today:string; commit:Commit; createRequest?:string; inspect:(item:InspectableItem)=>void }) {
  const savedTabs = state.configs.areaTabs && typeof state.configs.areaTabs === 'object' ? state.configs.areaTabs as Record<string,string> : {}
  const tab = ['today','week','report'].includes(savedTabs.habits) ? savedTabs.habits : 'today'
  const habits=rows(state.habits).filter(item=>item.ativo!==false)
  const entries=rows(state.habitEntries)
  const [draft,setDraft]=useState<Row|null>(null)
  const [weekAnchor,setWeekAnchor]=useState(today)
  useEffect(()=>{if(createRequest?.startsWith('habits:')) setDraft({nome:'',meta:1,unidade:'',hora:'',cor_hex:'var(--v3-accent)',icone:'star',dias_semana:[0,1,2,3,4,5,6],ativo:true})},[createRequest])
  const monday=useMemo(()=>{const d=new Date(`${weekAnchor}T12:00:00`);const day=d.getDay();d.setDate(d.getDate()-(day===0?6:day-1));return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`},[weekAnchor])
  const week=Array.from({length:7},(_,i)=>moveDate(monday,i))
  const dayNumbers=(habit:Row)=>values(habit.dias_semana).map(Number)
  const eligible=(habit:Row,day:string)=>{const days=dayNumbers(habit);return !days.length||days.includes(new Date(`${day}T12:00:00`).getDay())}
  const findEntry=(habitId:unknown,day:string)=>entries.find(item=>String(item.habito_id)===String(habitId)&&dateKey(item.data)===day)
  const target=(habit:Row)=>Math.max(1,Number(habit.meta||1))
  const current=(habit:Row,day:string)=>Number(findEntry(habit.id,day)?.valor||0)
  const done=(habit:Row,day:string)=>current(habit,day)>=target(habit)
  const quantitative=(habit:Row)=>target(habit)>1||Boolean(String(habit.unidade||'').trim())
  const todayHabits=habits.filter(habit=>eligible(habit,today))

  function setTab(next:string){commit(currentState=>({...currentState,configs:{...currentState.configs,areaTabs:{...(currentState.configs.areaTabs&&typeof currentState.configs.areaTabs==='object'?currentState.configs.areaTabs as Record<string,string>:{}),habits:next}}}))}
  function setValue(habit:Row,day:string,value:number){const existing=findEntry(habit.id,day);commit(currentState=>{const clean=rows(currentState.habitEntries).filter(item=>!(String(item.habito_id)===String(habit.id)&&dateKey(item.data)===day));return {...currentState,habitEntries:value>0?[...clean,{id:existing?.id||uid('hr'),habito_id:habit.id,data:day,valor:value,criado_em:existing?.criado_em||new Date().toISOString()}]:clean}})}
  function mark(habit:Row,day:string){
    if(quantitative(habit)){
      const old=current(habit,day)
      const answer=prompt(`Quanto você fez de “${String(habit.nome||'este hábito')}”?${habit.unidade?` (${habit.unidade})`:''}`, old>0?String(old):'')
      if(answer===null)return
      const value=Number(String(answer).replace(',','.'))
      if(!Number.isFinite(value)||value<0){alert('Informe uma quantidade válida.');return}
      setValue(habit,day,value);return
    }
    setValue(habit,day,current(habit,day)>0?0:1)
  }
  function streak(habit:Row){let count=0,cursor=today,guard=0;while(guard++<3650){if(!eligible(habit,cursor)){cursor=moveDate(cursor,-1);continue}if(!done(habit,cursor))break;count++;cursor=moveDate(cursor,-1)}return count}
  const last30=Array.from({length:30},(_,i)=>moveDate(today,i-29))
  function rate(habit:Row){const days=last30.filter(day=>eligible(habit,day));return pct(days.filter(day=>done(habit,day)).length,days.length)}
  function save(e:FormEvent){e.preventDefault();if(!draft||!String(draft.nome||'').trim())return;const next={...draft,id:draft.id||uid('hab'),nome:String(draft.nome).trim(),meta:Math.max(1,Number(draft.meta||1)),dias_semana:values(draft.dias_semana).map(Number),ativo:true};commit(currentState=>({...currentState,habits:rows(currentState.habits).some(item=>String(item.id)===String(next.id))?rows(currentState.habits).map(item=>String(item.id)===String(next.id)?next:item):[...rows(currentState.habits),next]}));setDraft(null)}
  const open=(habit:Row,day=today)=>inspect({kind:'habit',sourceId:String(habit.id),title:String(habit.nome||'Hábito'),date:day,raw:habit})

  return <div className="mai-v3-area-page mai-v4-habits">
    <header className="mai-v3-area-header"><div><h1>Hábitos</h1><p>Registre o que você realmente fez, inclusive quantidades.</p></div><div className="mai-v3-area-actions"><button title="Ferramentas avançadas" aria-label="Ferramentas avançadas" onClick={()=>commit(currentState=>({...currentState,configs:{...currentState.configs,advancedAreas:{...(currentState.configs.advancedAreas&&typeof currentState.configs.advancedAreas==='object'?currentState.configs.advancedAreas as Record<string,boolean>:{}),habits:true}}}))}><span className="material-symbols-rounded">more_horiz</span></button></div></header>
    <div className="mai-v3-area-tabs">{[{id:'today',label:'Hoje'},{id:'week',label:'Semana'},{id:'report',label:'Relatório'}].map(item=><button key={item.id} data-active={tab===item.id} onClick={()=>setTab(item.id)}>{item.label}</button>)}</div>

    {tab==='today'?<section className="mai-v3-simple-section"><h2>Hoje</h2><div className="mai-v3-simple-list">{todayHabits.map(habit=>{const value=current(habit,today);const complete=done(habit,today);const detail=quantitative(habit)?`${value} de ${target(habit)} ${habit.unidade||''}`:habit.hora|| (complete?'Concluído':'Pendente');return <article className="mai-v3-habit-today mai-item-row-v2" key={String(habit.id)} onClick={()=>open(habit)}><button className="mai-v3-habit-check" data-done={complete} onClick={event=>{event.stopPropagation();mark(habit,today)}}>{complete?'✓':''}</button><span className="mai-item-copy-v2"><span className="mai-item-titleline-v2"><strong>{habit.nome}</strong><span className="mai-item-inline-tag">Hábitos</span></span><span className="mai-item-subline-v2"><span>Hoje</span>{detail?<><span>·</span><span>{detail}</span></>:null}</span></span>{quantitative(habit)?<button className="mai-v4-habit-value" onClick={event=>{event.stopPropagation();mark(habit,today)}}>{value||0}</button>:null}</article>})}{!todayHabits.length?<div className="mai-v3-empty-line">Nenhum hábito previsto para hoje.</div>:null}</div></section>:null}

    {tab==='week'?<section className="mai-v3-simple-section"><div className="mai-v3-week-nav"><button onClick={()=>setWeekAnchor(moveDate(weekAnchor,-7))}>‹</button><strong>Semana de {new Date(`${monday}T12:00:00`).toLocaleDateString('pt-BR',{day:'numeric',month:'short'})}</strong><button onClick={()=>setWeekAnchor(moveDate(weekAnchor,7))}>›</button></div><div className="mai-v3-week-grid"><header><span>Hábito</span>{week.map(day=><b key={day}>{new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR',{weekday:'short'}).slice(0,1).toUpperCase()}</b>)}</header>{habits.map(habit=><div key={String(habit.id)}><button onClick={()=>open(habit,weekAnchor)}>{habit.nome}</button>{week.map(day=><button className="mai-v3-week-dot" key={day} disabled={!eligible(habit,day)} data-done={done(habit,day)} title={quantitative(habit)?`${current(habit,day)} de ${target(habit)} ${habit.unidade||''}`:''} onClick={()=>mark(habit,day)}>{done(habit,day)?'✓':quantitative(habit)&&current(habit,day)>0?String(current(habit,day)):''}</button>)}</div>)}</div></section>:null}

    {tab==='report'?<section className="mai-v3-simple-section"><h2>Relatório</h2><div className="mai-v3-report-list">{habits.map(habit=><article key={String(habit.id)} onClick={()=>open(habit)} role="button" tabIndex={0}><span className="mai-v3-report-icon"><span className="material-symbols-rounded">{habit.icone||'star'}</span></span><div><strong>{habit.nome}</strong><small>Últimos 30 dias</small></div><b>{rate(habit)}%</b><span>{streak(habit)} dias seguidos</span></article>)}</div></section>:null}

    {draft?<div className="mai-v3-create-layer" onMouseDown={()=>setDraft(null)}><form className="mai-v3-create-drawer" onSubmit={save} onMouseDown={e=>e.stopPropagation()}><header className="mai-v3-drawer-header"><strong>Novo hábito</strong><button type="button" className="mai-v3-close" onClick={()=>setDraft(null)}>×</button></header><div className="mai-v3-drawer-body"><input className="mai-v3-title-input" autoFocus value={draft.nome||''} placeholder="Nome do hábito" onChange={e=>setDraft({...draft,nome:e.target.value})}/><label className="mai-v3-field-line"><span>Meta</span><input type="number" min="1" step="any" value={draft.meta||1} onChange={e=>setDraft({...draft,meta:Number(e.target.value)})}/></label><label className="mai-v3-field-line"><span>Unidade</span><input value={draft.unidade||''} placeholder="copos, km, páginas" onChange={e=>setDraft({...draft,unidade:e.target.value})}/></label><label className="mai-v3-field-line"><span>Horário</span><input type="time" value={draft.hora||''} onChange={e=>setDraft({...draft,hora:e.target.value})}/></label><div className="mai-v3-day-picker">{['D','S','T','Q','Q','S','S'].map((label,day)=>{const selected=values(draft.dias_semana).map(Number).includes(day);return <button type="button" key={`${label}-${day}`} data-active={selected} onClick={()=>setDraft({...draft,dias_semana:selected?values(draft.dias_semana).map(Number).filter(v=>v!==day):[...values(draft.dias_semana).map(Number),day]})}>{label}</button>})}</div></div><footer className="mai-v3-drawer-footer"><button type="button" className="mai-v3-secondary" onClick={()=>setDraft(null)}>Cancelar</button><button className="mai-v3-primary">Salvar</button></footer></form></div>:null}
  </div>
}
