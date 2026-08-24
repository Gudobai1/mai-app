'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import { CreateNumberEditor, CreateTextEditor, CreateTimePicker, CreateTool } from './CreateDrawerTools'

type Row = Record<string, any>
type Commit = (change: (current: MaiState) => MaiState) => void
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const values = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const dateKey = (value: unknown) => String(value || '').slice(0,10)
const moveDate = (key:string, amount:number) => { const d=new Date(`${key}T12:00:00`); d.setDate(d.getDate()+amount); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const pct = (value:number,total:number) => total > 0 ? Math.max(0,Math.min(100,Math.round(value/total*100))) : 0
const diffDays = (start:string,end:string) => Math.round((new Date(`${end}T12:00:00`).getTime()-new Date(`${start}T12:00:00`).getTime())/86_400_000)

function repeatInterval(habit:Row){
  const match=String(habit.repeticao||'').match(/^intervalo:(\d+)$/)
  return match?Math.max(1,Number(match[1])||1):0
}

function habitEligible(habit:Row,day:string){
  const start=dateKey(habit.data_inicio||habit.criado_em)
  if(start&&day<start)return false
  const interval=repeatInterval(habit)
  if(interval){
    if(!start)return true
    return diffDays(start,day)%interval===0
  }
  const days=values(habit.dias_semana).map(Number).filter(value=>Number.isInteger(value)&&value>=0&&value<=6)
  return !days.length||days.includes(new Date(`${day}T12:00:00`).getDay())
}

export function HabitsV4({ state, today, commit, createRequest, inspect }: { state:MaiState; today:string; commit:Commit; createRequest?:string; inspect:(item:InspectableItem)=>void }) {
  const savedTabs = state.configs.areaTabs && typeof state.configs.areaTabs === 'object' ? state.configs.areaTabs as Record<string,string> : {}
  const tab = ['today','week','report'].includes(savedTabs.habits) ? savedTabs.habits : 'today'
  const habits=rows(state.habits).filter(item=>item.ativo!==false)
  const entries=rows(state.habitEntries)
  const [draft,setDraft]=useState<Row|null>(null)
  const [createTool,setCreateTool]=useState('')
  const [weekAnchor,setWeekAnchor]=useState(today)
  useEffect(()=>{if(createRequest?.startsWith('habits:')){setDraft({nome:'',descricao:'',meta:1,unidade:'',hora:'',cor_hex:'var(--v3-accent)',icone:'star',dias_semana:[0,1,2,3,4,5,6],repeticao:'diariamente',data_inicio:today,ativo:true});setCreateTool('')}},[createRequest,today])
  const monday=useMemo(()=>{const d=new Date(`${weekAnchor}T12:00:00`);const day=d.getDay();d.setDate(d.getDate()-(day===0?6:day-1));return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`},[weekAnchor])
  const week=Array.from({length:7},(_,i)=>moveDate(monday,i))
  const eligible=(habit:Row,day:string)=>habitEligible(habit,day)
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
  function save(e:FormEvent){
    e.preventDefault()
    if(!draft||!String(draft.nome||'').trim())return
    let selected=values(draft.dias_semana).map(Number).filter(value=>Number.isInteger(value)&&value>=0&&value<=6)
    let repeat=String(draft.repeticao||'diariamente')
    if(repeat==='diariamente')selected=[0,1,2,3,4,5,6]
    if(repeat.startsWith('semanal:')){
      if(!selected.length)selected=[new Date(`${today}T12:00:00`).getDay()]
      repeat=`semanal:${selected.sort((a,b)=>a-b).join(',')}`
    }
    if(repeat.startsWith('intervalo:'))selected=[]
    const next={...draft,id:draft.id||uid('hab'),nome:String(draft.nome).trim(),meta:Math.max(1,Number(draft.meta||1)),dias_semana:selected,repeticao:repeat,data_inicio:dateKey(draft.data_inicio)||today,ativo:true}
    commit(currentState=>({...currentState,habits:rows(currentState.habits).some(item=>String(item.id)===String(next.id))?rows(currentState.habits).map(item=>String(item.id)===String(next.id)?next:item):[...rows(currentState.habits),next]}))
    setDraft(null);setCreateTool('')
  }
  const open=(habit:Row,day=today)=>inspect({kind:'habit',sourceId:String(habit.id),title:String(habit.nome||'Hábito'),date:day,raw:habit})
  const edit=(habit:Row)=>{setDraft({...habit,data_inicio:dateKey(habit.data_inicio||habit.criado_em)||today,repeticao:String(habit.repeticao||'')|| (values(habit.dias_semana).length===7?'diariamente':`semanal:${values(habit.dias_semana).map(Number).join(',')}`)});setCreateTool('')}
  const createDays=draft?values(draft.dias_semana).map(Number).filter(value=>Number.isInteger(value)&&value>=0&&value<=6):[]
  const createRepeat=String(draft?.repeticao||'diariamente')
  const createInterval=Math.max(1,Number(createRepeat.match(/^intervalo:(\d+)$/)?.[1]||2))
  const createMode=createRepeat.startsWith('intervalo:')?'interval':createRepeat.startsWith('semanal:')?'weekdays':'daily'
  const daysSummary=createMode==='daily'?'Todos os dias':createMode==='interval'?`A cada ${createInterval} ${createInterval===1?'dia':'dias'}`:createDays.join(',')==='1,2,3,4,5'?'Dias úteis':createDays.length?`${createDays.length} dias por semana`:'Escolha os dias'

  return <div className="mai-v3-area-page mai-v4-habits">
    <header className="mai-v3-area-header"><div><h1>Hábitos</h1><p>Registre o que você realmente fez, inclusive quantidades.</p></div><div className="mai-v3-area-actions"><button title="Ferramentas avançadas" aria-label="Ferramentas avançadas" onClick={()=>commit(currentState=>({...currentState,configs:{...currentState.configs,advancedAreas:{...(currentState.configs.advancedAreas&&typeof currentState.configs.advancedAreas==='object'?currentState.configs.advancedAreas as Record<string,boolean>:{}),habits:true}}}))}><span className="material-symbols-rounded">more_horiz</span></button></div></header>
    <div className="mai-v3-area-tabs">{[{id:'today',label:'Hoje'},{id:'week',label:'Semana'},{id:'report',label:'Relatório'}].map(item=><button key={item.id} data-active={tab===item.id} onClick={()=>setTab(item.id)}>{item.label}</button>)}</div>

    {tab==='today'?<section className="mai-v3-simple-section"><h2>Hoje</h2><div className="mai-v3-simple-list">{todayHabits.map(habit=>{const value=current(habit,today);const complete=done(habit,today);const detail=quantitative(habit)?`${value} de ${target(habit)} ${habit.unidade||''}`:habit.hora|| (complete?'Concluído':'Pendente');return <article className="mai-v3-habit-today mai-item-row-v2" key={String(habit.id)} onClick={()=>open(habit)}><button className="mai-v3-habit-check" data-done={complete} onClick={event=>{event.stopPropagation();mark(habit,today)}}>{complete?'✓':''}</button><span className="mai-item-copy-v2"><span className="mai-item-titleline-v2"><strong>{habit.nome}</strong></span><span className="mai-item-subline-v2"><span>Hoje</span>{detail?<><span>·</span><span>{detail}</span></>:null}</span></span>{quantitative(habit)?<button className="mai-v4-habit-value" onClick={event=>{event.stopPropagation();mark(habit,today)}}>{value||0}</button>:null}<button className="mai-v3-task-more" title="Configurar hábito" aria-label={`Configurar ${String(habit.nome||'hábito')}`} onClick={event=>{event.stopPropagation();edit(habit)}}>•••</button></article>})}{!todayHabits.length?<div className="mai-v3-empty-line">Nenhum hábito previsto para hoje.</div>:null}</div></section>:null}

    {tab==='week'?<section className="mai-v3-simple-section"><div className="mai-v3-week-nav"><button onClick={()=>setWeekAnchor(moveDate(weekAnchor,-7))}>‹</button><strong>Semana de {new Date(`${monday}T12:00:00`).toLocaleDateString('pt-BR',{day:'numeric',month:'short'})}</strong><button onClick={()=>setWeekAnchor(moveDate(weekAnchor,7))}>›</button></div><div className="mai-v3-week-grid"><header><span>Hábito</span>{week.map(day=><b key={day}>{new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR',{weekday:'short'}).slice(0,1).toUpperCase()}</b>)}</header>{habits.map(habit=><div key={String(habit.id)}><button onClick={()=>open(habit,weekAnchor)}>{habit.nome}</button>{week.map(day=><button className="mai-v3-week-dot" key={day} disabled={!eligible(habit,day)} data-done={done(habit,day)} title={quantitative(habit)?`${current(habit,day)} de ${target(habit)} ${habit.unidade||''}`:''} onClick={()=>mark(habit,day)}>{done(habit,day)?'✓':quantitative(habit)&&current(habit,day)>0?String(current(habit,day)):''}</button>)}</div>)}</div></section>:null}

    {tab==='report'?<section className="mai-v3-simple-section"><h2>Relatório</h2><div className="mai-v3-report-list">{habits.map(habit=><article key={String(habit.id)} onClick={()=>open(habit)} role="button" tabIndex={0}><span className="mai-v3-report-icon"><span className="material-symbols-rounded">{habit.icone||'star'}</span></span><div><strong>{habit.nome}</strong><small>{repeatInterval(habit)?`A cada ${repeatInterval(habit)} ${repeatInterval(habit)===1?'dia':'dias'}`:'Últimos 30 dias'}</small></div><b>{rate(habit)}%</b><span>{streak(habit)} dias seguidos</span><button className="mai-v3-task-more" title="Configurar hábito" aria-label={`Configurar ${String(habit.nome||'hábito')}`} onClick={event=>{event.stopPropagation();edit(habit)}}>•••</button></article>)}</div></section>:null}

    {draft?<div className="mai-v3-create-layer" onMouseDown={()=>setDraft(null)}><form className="mai-v3-create-drawer" onSubmit={save} onMouseDown={e=>e.stopPropagation()}><header className="mai-v3-drawer-header"><strong>{draft.id?'Editar hábito':'Novo hábito'}</strong><button type="button" className="mai-v3-close" onClick={()=>setDraft(null)}>×</button></header><div className="mai-v3-drawer-body mai-create-unified-body" onMouseDown={()=>createTool&&setCreateTool('')}><input className="mai-v3-title-input" autoFocus value={draft.nome||''} placeholder="Nome do hábito" onMouseDown={e=>e.stopPropagation()} onChange={e=>setDraft({...draft,nome:e.target.value})}/><textarea className="mai-v3-description-input mai-create-unified-description" rows={2} value={draft.descricao||''} placeholder="Descrição" onMouseDown={e=>e.stopPropagation()} onChange={e=>setDraft({...draft,descricao:e.target.value})}/><div className="mai-task-v4-toolbar mai-context-unified-tools mai-create-unified-tools" onMouseDown={e=>e.stopPropagation()}>
      <CreateTool id="habit-time" icon="schedule" label="Horário" summary={String(draft.hora||'Não selecionado')} color="#875fb2" open={createTool} setOpen={setCreateTool}><CreateTimePicker value={String(draft.hora||'')} onChange={value=>setDraft({...draft,hora:value})} close={()=>setCreateTool('')}/></CreateTool>
      <CreateTool id="habit-target" icon="target" label="Meta" summary={`${Number(draft.meta||1)}${draft.unidade?` ${draft.unidade}`:''}`} color="#6d8a55" open={createTool} setOpen={setCreateTool}><CreateNumberEditor value={Number(draft.meta||1)} onChange={value=>setDraft({...draft,meta:Math.max(1,value)})} suffix={String(draft.unidade||'')}/></CreateTool>
      <CreateTool id="habit-unit" icon="straighten" label="Unidade" summary={String(draft.unidade||'Não selecionado')} color="#75808b" open={createTool} setOpen={setCreateTool}><CreateTextEditor value={String(draft.unidade||'')} placeholder="copos, km, páginas" onChange={value=>setDraft({...draft,unidade:value})}/></CreateTool>
      <CreateTool id="habit-frequency" icon="repeat" label="Frequência" summary={daysSummary} color="#4f7cac" open={createTool} setOpen={setCreateTool}><div className="mai-context-v3-option-list">
        <button type="button" data-selected={createMode==='daily'||undefined} onClick={()=>setDraft({...draft,repeticao:'diariamente',dias_semana:[0,1,2,3,4,5,6]})}><span>Todos os dias</span>{createMode==='daily'?<span className="material-symbols-rounded">check</span>:null}</button>
        <button type="button" data-selected={createMode==='weekdays'||undefined} onClick={()=>{const selected=createDays.length&&createDays.length<7?createDays:[1,2,3,4,5];setDraft({...draft,repeticao:`semanal:${selected.join(',')}`,dias_semana:selected})}}><span>Dias específicos</span>{createMode==='weekdays'?<span className="material-symbols-rounded">check</span>:null}</button>
        <button type="button" data-selected={createMode==='interval'||undefined} onClick={()=>setDraft({...draft,repeticao:`intervalo:${createInterval||2}`,dias_semana:[],data_inicio:dateKey(draft.data_inicio)||today})}><span>A cada X dias</span>{createMode==='interval'?<span className="material-symbols-rounded">check</span>:null}</button>
      </div>{createMode==='weekdays'?<div className="mai-v3-day-picker">{['D','S','T','Q','Q','S','S'].map((label,day)=>{const selected=createDays.includes(day);return <button type="button" key={`${label}-${day}`} data-active={selected} onClick={()=>{const next=selected?createDays.filter(v=>v!==day):[...createDays,day].sort((a,b)=>a-b);setDraft({...draft,dias_semana:next,repeticao:`semanal:${next.join(',')}`})}}>{label}</button>})}</div>:null}{createMode==='interval'?<div className="mai-context-v3-inline-editor"><span>A cada</span><input type="number" min="1" max="365" step="1" value={createInterval} onChange={event=>{const value=Math.max(1,Math.min(365,Number(event.target.value)||1));setDraft({...draft,repeticao:`intervalo:${value}`})}}/><span>dias</span><input type="date" value={dateKey(draft.data_inicio)||today} onChange={event=>setDraft({...draft,data_inicio:event.target.value})}/></div>:null}</CreateTool>
    </div></div><footer className="mai-v3-drawer-footer"><button type="button" className="mai-v3-secondary" onClick={()=>setDraft(null)}>Cancelar</button><button className="mai-v3-primary">Salvar</button></footer></form></div>:null}
  </div>
}
