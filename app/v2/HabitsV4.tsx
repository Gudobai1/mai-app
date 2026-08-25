'use client'

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import { ItemAttachments } from './ItemAttachments'
import styles from './unified.module.css'
import { useAutosaveDraft } from './useAutosaveDraft'

type Row = Record<string, any>
type Commit = (change: (current: MaiState) => MaiState) => void
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const values = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const dateKey = (value: unknown) => {
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`
  return String(value || '').slice(0,10)
}
const moveDate = (key:string, amount:number) => { const d=new Date(`${key}T12:00:00`); d.setDate(d.getDate()+amount); return dateKey(d) }
const pct = (value:number,total:number) => total > 0 ? Math.max(0,Math.min(100,Math.round(value/total*100))) : 0
const diffDays = (start:string,end:string) => Math.round((new Date(`${end}T12:00:00`).getTime()-new Date(`${start}T12:00:00`).getTime())/86_400_000)
const dateLabel = (value:unknown) => { const key=dateKey(value); return key ? new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'}) : 'Sem data' }
const failedEntry = (entry?:Row) => entry?.falhou===true||String(entry?.status||'').toLowerCase()==='falha'

function Modal({title,subtitle,onClose,children,wide=false}:{title:string;subtitle?:string;onClose:()=>void;children:ReactNode;wide?:boolean}){
  return <div className={`${styles.modalLayer} mai-habits-pro-modal-layer`} onMouseDown={onClose}><section className={`${styles.modalCard}${wide?` ${styles.modalWide}`:''} mai-habits-pro-modal`} onMouseDown={event=>event.stopPropagation()}><header className={styles.modalHeader}><div><h2>{title}</h2>{subtitle?<p>{subtitle}</p>:null}</div><button type="button" onClick={onClose}>×</button></header>{children}</section></div>
}

function repeatInterval(habit:Row){
  const match=String(habit.repeticao||'').match(/^intervalo:(\d+)$/)
  return match?Math.max(1,Number(match[1])||1):0
}

function normalizedDays(habit:Row){
  const rule=String(habit.repeticao||'')
  if(rule.startsWith('semanal:')) return rule.slice(8).split(',').map(Number).filter(value=>Number.isInteger(value)&&value>=0&&value<=6)
  return values(habit.dias_semana).map(Number).filter(value=>Number.isInteger(value)&&value>=0&&value<=6)
}

function eligible(habit:Row,day:string){
  const start=dateKey(habit.data_inicio||habit.criado_em)
  if(start&&day<start)return false
  const interval=repeatInterval(habit)
  if(interval){
    if(!start)return true
    return diffDays(start,day)%interval===0
  }
  const rule=String(habit.repeticao||'')
  if(rule==='diariamente')return true
  const days=normalizedDays(habit)
  return !days.length||days.includes(new Date(`${day}T12:00:00`).getDay())
}

export function HabitsV4({ state, today, commit, createRequest }: { state:MaiState; today:string; commit:Commit; createRequest?:string; inspect:(item:InspectableItem)=>void }) {
  const habits=rows(state.habits).filter(item=>item.ativo!==false)
  const entries=rows(state.habitEntries)
  const [weekAnchor,setWeekAnchor]=useState(today)
  const [draft,setDraft]=useState<Row|null>(null)
  const [reportId,setReportId]=useState('')
  const [reportMonth,setReportMonth]=useState(today.slice(0,7))
  const [valueDraft,setValueDraft]=useState<{habit:Row;day:string}|null>(null)
  const [value,setValue]=useState('')
  const valueTimer=useRef<number|null>(null)
  const icons=['star','favorite','fitness_center','local_drink','menu_book','self_improvement','directions_run','bedtime','palette','code','attach_money','psychology','restaurant','cleaning_services','directions_bike','air','spa','bolt','school','monitor_heart']

  const monday=useMemo(()=>{const date=new Date(`${weekAnchor}T12:00:00`);const day=date.getDay();date.setDate(date.getDate()-(day===0?6:day-1));return dateKey(date)},[weekAnchor])
  const week=Array.from({length:7},(_,index)=>moveDate(monday,index))

  function newDraft():Row{return {id:uid('hab'),nome:'',descricao:'',meta:1,unidade:'',hora:'',cor_hex:'#718269',icone:'star',dias_semana:[0,1,2,3,4,5,6],repeticao:'diariamente',data_inicio:today,ocultar_agenda:false,ativo:true,criado_em:new Date().toISOString(),anexos:[],_persisted:false}}
  function editDraft(habit:Row):Row{
    const days=normalizedDays(habit)
    const repeat=String(habit.repeticao||'') || (!days.length||days.length===7?'diariamente':`semanal:${days.join(',')}`)
    return {...habit,anexos:rows(habit.anexos),dias_semana:days,repeticao:repeat,data_inicio:dateKey(habit.data_inicio||habit.criado_em)||today,_persisted:true}
  }

  useEffect(()=>{if(createRequest?.startsWith('habits:'))setDraft(newDraft())},[createRequest,today])

  function entry(habitId:unknown,day:string){return entries.find(item=>String(item.habito_id)===String(habitId)&&dateKey(item.data)===day)}
  function complete(habit:Row,day:string){const found=entry(habit.id,day);return !failedEntry(found)&&Number(found?.valor||0)>=Math.max(1,Number(habit.meta||1))}

  function toggle(habit:Row,day:string){
    if(!eligible(habit,day))return
    const found=entry(habit.id,day)
    if(found){commit(current=>({...current,habitEntries:rows(current.habitEntries).filter(item=>String(item.id)!==String(found.id))}));return}
    const target=Math.max(1,Number(habit.meta||1))
    if(target>1||habit.unidade){setValueDraft({habit,day});setValue(String(target));return}
    commit(current=>({...current,habitEntries:[...rows(current.habitEntries),{id:uid('hr'),habito_id:habit.id,data:day,valor:target,falhou:false,status:'',criado_em:new Date().toISOString()}]}))
  }

  function fail(habit:Row,day:string){
    if(!eligible(habit,day)||day>today)return
    const found=entry(habit.id,day)
    if(found)return
    commit(current=>({...current,habitEntries:[...rows(current.habitEntries),{id:uid('hr'),habito_id:habit.id,data:day,valor:0,falhou:true,status:'falha',criado_em:new Date().toISOString()}]}))
  }

  function persistValue(target:{habit:Row;day:string}|null,rawValue:string){
    if(!target)return
    const amount=Number(String(rawValue).replace(',','.'));if(!Number.isFinite(amount)||amount<0)return
    commit(current=>{
      const existing=rows(current.habitEntries).find(item=>String(item.habito_id)===String(target.habit.id)&&dateKey(item.data)===target.day)
      const filtered=rows(current.habitEntries).filter(item=>!(String(item.habito_id)===String(target.habit.id)&&dateKey(item.data)===target.day))
      return {...current,habitEntries:[...filtered,{id:existing?.id||uid('hr'),habito_id:target.habit.id,data:target.day,valor:amount,falhou:false,status:'',criado_em:existing?.criado_em||new Date().toISOString()}]}
    })
  }

  useEffect(()=>{
    if(!valueDraft)return
    if(valueTimer.current)window.clearTimeout(valueTimer.current)
    valueTimer.current=window.setTimeout(()=>persistValue(valueDraft,value),260)
    return()=>{if(valueTimer.current)window.clearTimeout(valueTimer.current)}
  },[valueDraft,value])

  useEffect(()=>()=>{if(valueTimer.current&&valueDraft)persistValue(valueDraft,value)},[])

  function stats(habit:Row){
    const target=Math.max(1,Number(habit.meta||1))
    const habitEntries=entries.filter(item=>String(item.habito_id)===String(habit.id))
    const map=new Map(habitEntries.map(item=>[dateKey(item.data),Number(item.valor||0)]))
    const failures=new Set(habitEntries.filter(item=>failedEntry(item)).map(item=>dateKey(item.data)))
    const isDone=(key:string)=>!failures.has(key)&&Number(map.get(key)||0)>=target
    let current=0,cursor=today,guard=0
    if(eligible(habit,cursor)&&!isDone(cursor))cursor=moveDate(cursor,-1)
    while(guard++<4000){if(!eligible(habit,cursor)){cursor=moveDate(cursor,-1);continue}if(!isDone(cursor))break;current++;cursor=moveDate(cursor,-1)}
    const days365=Array.from({length:365},(_,index)=>moveDate(today,index-364));let best=0,run=0
    days365.forEach(key=>{if(!eligible(habit,key))return;run=isDone(key)?run+1:0;best=Math.max(best,run)})
    const days30=Array.from({length:30},(_,index)=>moveDate(today,index-29)).filter(key=>eligible(habit,key))
    const rate=pct(days30.filter(isDone).length,days30.length)
    return {current,best,rate,isDone,map,failures}
  }

  function normalizeHabit(snapshot:Row){
    let repeat=String(snapshot.repeticao||'diariamente')
    let days=values(snapshot.dias_semana).map(Number).filter(value=>Number.isInteger(value)&&value>=0&&value<=6)
    if(repeat==='diariamente')days=[0,1,2,3,4,5,6]
    if(repeat.startsWith('semanal:')){
      if(!days.length)days=[new Date(`${today}T12:00:00`).getDay()]
      days=[...new Set(days)].sort((a,b)=>a-b)
      repeat=`semanal:${days.join(',')}`
    }
    if(repeat.startsWith('intervalo:')){
      const interval=Math.max(1,Number(repeat.split(':')[1])||1)
      repeat=`intervalo:${interval}`
      days=[]
    }
    const {_persisted:_ignored,...clean}=snapshot
    return {...clean,id:clean.id||uid('hab'),nome:String(clean.nome||'').trim(),meta:Math.max(1,Number(clean.meta||1)),dias_semana:days,repeticao:repeat,data_inicio:dateKey(clean.data_inicio)||today,cor_hex:clean.cor_hex||'#718269',icone:clean.icone||'star',anexos:rows(clean.anexos),ativo:true,criado_em:clean.criado_em||new Date().toISOString()}
  }

  function persistHabit(snapshot:Row){
    if(!String(snapshot.nome||'').trim())return
    const next=normalizeHabit(snapshot)
    commit(current=>({...current,habits:rows(current.habits).some(item=>String(item.id)===String(next.id))?rows(current.habits).map(item=>String(item.id)===String(next.id)?next:item):[...rows(current.habits),next]}))
    if(snapshot._persisted===false)setDraft(current=>current&&String(current.id)===String(next.id)?{...current,_persisted:true}:current)
  }

  useAutosaveDraft({value:draft,identity:String(draft?.id||''),enabled:Boolean(draft),save:persistHabit})

  function deleteHabit(){
    if(!draft?.id||draft._persisted===false||!confirm('Excluir este hábito e todos os registros?'))return
    commit(current=>({...current,habits:rows(current.habits).filter(item=>String(item.id)!==String(draft.id)),habitEntries:rows(current.habitEntries).filter(item=>String(item.habito_id)!==String(draft.id))}))
    setDraft(null)
  }

  const reportHabit=habits.find(item=>String(item.id)===reportId)
  const reportStats=reportHabit?stats(reportHabit):null
  const heatDays=reportHabit?Array.from({length:126},(_,index)=>moveDate(today,index-125)):[]
  const weekPerformance=reportHabit?Array.from({length:7},(_,day)=>{const keys=Array.from({length:180},(_,index)=>moveDate(today,index-179)).filter(key=>eligible(reportHabit,key)&&new Date(`${key}T12:00:00`).getDay()===day);return {day,total:keys.length,done:keys.filter(key=>reportStats?.isDone(key)).length}}):[]
  const [ry,rm]=reportMonth.split('-').map(Number)
  const reportDays=new Date(ry,rm,0).getDate()
  const reportFirst=new Date(ry,rm-1,1).getDay()
  const draftRepeat=String(draft?.repeticao||'diariamente')
  const draftMode=draftRepeat.startsWith('intervalo:')?'interval':draftRepeat.startsWith('semanal:')?'weekdays':'daily'
  const draftDays=draft?values(draft.dias_semana).map(Number).filter(value=>Number.isInteger(value)&&value>=0&&value<=6):[]
  const draftInterval=Math.max(1,Number(draftRepeat.match(/^intervalo:(\d+)$/)?.[1]||2))

  return <div className="mai-habits-pro">
    <div className="mai-habits-pro-head"><div><h1>Hábitos</h1><p>Acompanhe sua rotina na semana e abra os detalhes quando precisar.</p></div></div>

    <div className={`${styles.weekNavigator} mai-habits-pro-week-nav`}><button onClick={()=>setWeekAnchor(moveDate(weekAnchor,-7))}>‹</button><button onClick={()=>setWeekAnchor(today)}><strong>{monday===moveDate(today,-(new Date(`${today}T12:00:00`).getDay()===0?6:new Date(`${today}T12:00:00`).getDay()-1))?'Esta semana':`${dateLabel(monday)} — ${dateLabel(week[6])}`}</strong><small>Voltar para a semana atual</small></button><button onClick={()=>setWeekAnchor(moveDate(weekAnchor,7))}>›</button></div>

    <div className="mai-habits-pro-grid-scroll"><div className={`${styles.habitGrid} mai-habits-pro-grid`}><header><div><strong>Hábito</strong><small>Sequência</small></div>{week.map(day=><span key={day} data-today={day===today}><small>{new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR',{weekday:'short'})}</small><b>{Number(day.slice(8))}</b></span>)}</header>{habits.map(habit=>{const s=stats(habit);return <div className={`${styles.habitRow} mai-habits-pro-row`} key={String(habit.id)}><button className={styles.habitIdentity} onClick={()=>{setReportId(String(habit.id));setReportMonth(today.slice(0,7))}}><i style={{background:habit.cor_hex||'#718269'}}><span className="material-symbols-rounded">{habit.icone||'star'}</span></i><span><strong>{habit.nome}</strong><small>🔥 {s.current} · melhor {s.best}{repeatInterval(habit)?` · a cada ${repeatInterval(habit)} dias`:''}</small></span></button>{week.map(day=>{const found=entry(habit.id,day);const failed=failedEntry(found);const target=Math.max(1,Number(habit.meta||1));const progress=Math.min(100,Number(found?.valor||0)/target*100);return <span className="mai-habit-day-cell" key={day}><button className={styles.habitCheck} disabled={!eligible(habit,day)} data-done={complete(habit,day)} data-partial={Boolean(found)&&!failed&&!complete(habit,day)} data-failed={failed||undefined} style={found&&!failed&&!complete(habit,day)?{background:`conic-gradient(${habit.cor_hex||'#718269'} ${progress}%, transparent 0)`}:complete(habit,day)?{background:habit.cor_hex||'#718269'}:undefined} onClick={()=>toggle(habit,day)} title={!eligible(habit,day)?'Fora da frequência deste hábito':failed?'Falha — clique para desfazer':found?`${found.valor} ${habit.unidade||''}`:'Registrar'}>{failed?'×':complete(habit,day)?'✓':found?<small>{Math.round(progress)}%</small>:''}</button>{day===today&&eligible(habit,day)&&!found?<button type="button" className="mai-habit-fail-inline" onClick={()=>fail(habit,day)} title="Marcar falha hoje" aria-label={`Marcar falha em ${String(habit.nome||'hábito')} hoje`}>×</button>:null}</span>})}<button className={styles.rowMenuButton} title="Configurar hábito" onClick={()=>setDraft(editDraft(habit))}>•••</button></div>})}</div></div>

    {!habits.length?<div className={styles.emptyState}><strong>Nenhum hábito criado</strong><span>Crie um hábito e ele aparecerá aqui, em Hoje e na Agenda conforme a frequência escolhida.</span></div>:null}

    {draft?<Modal title={draft._persisted===false?'Novo hábito':'Configurar hábito'} subtitle="Meta, frequência, identidade e agenda" onClose={()=>setDraft(null)}><form className={`${styles.areaForm} mai-habits-pro-form`} onSubmit={event=>event.preventDefault()}><label className={styles.span2}><span>Nome</span><input autoFocus value={draft.nome||''} onChange={event=>setDraft({...draft,nome:event.target.value})}/></label><label><span>Meta</span><input type="number" min="1" step="0.1" value={draft.meta||1} onChange={event=>setDraft({...draft,meta:Number(event.target.value)})}/></label><label><span>Unidade</span><input value={draft.unidade||''} placeholder="copos, km, páginas…" onChange={event=>setDraft({...draft,unidade:event.target.value})}/></label><label><span>Horário</span><input type="time" value={draft.hora||''} onChange={event=>setDraft({...draft,hora:event.target.value})}/></label><label><span>Cor</span><input type="color" value={draft.cor_hex||'#718269'} onChange={event=>setDraft({...draft,cor_hex:event.target.value})}/></label>
      <section className={`${styles.editorSection} ${styles.span2}`}><div className={styles.editorSectionHead}><strong>Frequência</strong></div><div className="mai-habits-frequency-modes"><button type="button" data-active={draftMode==='daily'} onClick={()=>setDraft({...draft,repeticao:'diariamente',dias_semana:[0,1,2,3,4,5,6]})}>Todos os dias</button><button type="button" data-active={draftMode==='weekdays'} onClick={()=>{const selected=draftDays.length&&draftDays.length<7?draftDays:[1,2,3,4,5];setDraft({...draft,repeticao:`semanal:${selected.join(',')}`,dias_semana:selected})}}>Dias específicos</button><button type="button" data-active={draftMode==='interval'} onClick={()=>setDraft({...draft,repeticao:`intervalo:${draftInterval}`,dias_semana:[],data_inicio:dateKey(draft.data_inicio)||today})}>A cada X dias</button></div>{draftMode==='weekdays'?<div className={styles.weekdays}>{['D','S','T','Q','Q','S','S'].map((label,day)=>{const active=draftDays.includes(day);return <button type="button" key={`${label}-${day}`} data-active={active} onClick={()=>{const next=active?draftDays.filter(value=>value!==day):[...draftDays,day].sort((a,b)=>a-b);setDraft({...draft,dias_semana:next,repeticao:`semanal:${next.join(',')}`})}}>{label}</button>})}</div>:null}{draftMode==='interval'?<div className="mai-habits-interval-fields"><label><span>Repetir a cada</span><div><input type="number" min="1" max="365" value={draftInterval} onChange={event=>setDraft({...draft,repeticao:`intervalo:${Math.max(1,Number(event.target.value)||1)}`})}/><span>dias</span></div></label><label><span>Começando em</span><input type="date" value={dateKey(draft.data_inicio)||today} onChange={event=>setDraft({...draft,data_inicio:event.target.value})}/></label></div>:null}</section>
      <section className={`${styles.editorSection} ${styles.span2}`}><div className={styles.editorSectionHead}><strong>Ícone</strong></div><div className={styles.iconPicker}>{icons.map(icon=><button type="button" key={icon} data-active={draft.icone===icon} onClick={()=>setDraft({...draft,icone:icon})}><span className="material-symbols-rounded">{icon}</span></button>)}</div></section>
      <div className={styles.span2}><ItemAttachments attachments={rows(draft.anexos)} onChange={anexos=>setDraft({...draft,anexos})}/></div>
      <label className={`${styles.toggleRow} ${styles.span2}`}><input type="checkbox" checked={draft.ocultar_agenda===true} onChange={event=>setDraft({...draft,ocultar_agenda:event.target.checked})}/><span>Não mostrar em Hoje/Agenda</span></label>
      <footer className={styles.span2}>{draft._persisted!==false?<button type="button" className={styles.dangerButton} onClick={deleteHabit}>Excluir</button>:<span/>}<span className="mai-autosave-status">Alterações salvas automaticamente</span></footer></form></Modal>:null}

    {valueDraft?<Modal title={`Registrar ${valueDraft.habit.nome}`} subtitle={dateLabel(valueDraft.day)} onClose={()=>setValueDraft(null)}><form className={styles.valueModal} onSubmit={event=>event.preventDefault()}><label><span>Quantidade {valueDraft.habit.unidade?`(${valueDraft.habit.unidade})`:''}</span><input autoFocus type="number" step="0.1" min="0" value={value} onChange={event=>setValue(event.target.value)}/></label><p>Meta do dia: <strong>{valueDraft.habit.meta||1} {valueDraft.habit.unidade||''}</strong></p>{valueDraft.day<=today&&!entry(valueDraft.habit.id,valueDraft.day)?<button type="button" className="mai-habit-fail-modal" onClick={()=>{if(valueTimer.current)window.clearTimeout(valueTimer.current);fail(valueDraft.habit,valueDraft.day);setValueDraft(null)}}>Marcar como falha</button>:null}<span className="mai-autosave-status">Registro salvo automaticamente</span></form></Modal>:null}

    {reportHabit&&reportStats?<Modal title={reportHabit.nome} subtitle="Relatório completo do hábito" onClose={()=>setReportId('')} wide><div className={styles.reportBody}><div className={styles.metricGrid}><article><span>Sequência atual</span><strong>{reportStats.current} dias</strong></article><article><span>Melhor sequência</span><strong>{reportStats.best} dias</strong></article><article><span>Últimos 30 dias</span><strong>{reportStats.rate}%</strong></article><article><span>Meta</span><strong>{reportHabit.meta||1} {reportHabit.unidade||''}</strong></article></div><section className={styles.reportSection}><header><strong>Heatmap · 18 semanas</strong><small>Clique em um dia válido para registrar ou remover.</small></header><div className={styles.heatmap}>{heatDays.map(day=>{const found=reportStats.map.get(day);const done=reportStats.isDone(day);const failed=reportStats.failures.has(day);const allowed=eligible(reportHabit,day);return <button key={day} disabled={!allowed} title={`${dateLabel(day)} · ${failed?'falha':allowed?(found??0):'fora da frequência'} ${allowed&&!failed?reportHabit.unidade||'':''}`} data-done={done} data-failed={failed||undefined} data-partial={Boolean(found)&&!failed&&!done} style={done?{background:reportHabit.cor_hex||'#718269'}:undefined} onClick={()=>toggle(reportHabit,day)}>{failed?'×':''}</button>})}</div></section><section className={styles.reportSection}><header><strong>Desempenho por dia</strong></header><div className={styles.performanceBars}>{weekPerformance.map(item=><div key={item.day}><span>{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][item.day]}</span><i><b style={{width:`${pct(item.done,item.total)}%`,background:reportHabit.cor_hex||'#718269'}}/></i><strong>{pct(item.done,item.total)}%</strong></div>)}</div></section><section className={styles.reportSection}><header><strong>Calendário mensal</strong><input type="month" value={reportMonth} onChange={event=>setReportMonth(event.target.value)}/></header><div className={styles.monthHabitGrid}>{['D','S','T','Q','Q','S','S'].map((label,index)=><small key={`${label}-${index}`}>{label}</small>)}{Array.from({length:reportFirst},(_,index)=><span key={`gap-${index}`}/>)}{Array.from({length:reportDays},(_,index)=>{const day=`${ry}-${String(rm).padStart(2,'0')}-${String(index+1).padStart(2,'0')}`;const done=reportStats.isDone(day);const failed=reportStats.failures.has(day);const allowed=eligible(reportHabit,day);return <button key={day} disabled={!allowed} data-done={done} data-failed={failed||undefined} style={done?{background:reportHabit.cor_hex||'#718269'}:undefined} onClick={()=>toggle(reportHabit,day)}>{failed?'×':index+1}</button>})}</div></section><section className={styles.reportSection}><header><strong>Histórico recente</strong></header><div className={styles.historyList}>{[...reportStats.map.entries()].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,16).map(([day,amount])=><div key={day}><span>{dateLabel(day)}</span><strong>{reportStats.failures.has(day)?'Falha':`${amount} ${reportHabit.unidade||''}`}</strong></div>)}</div></section></div></Modal>:null}
  </div>
}
