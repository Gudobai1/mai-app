'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, type PlannerItem, plannerItems } from '../../lib/v2/planner'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import { MaiIcon } from './MaiIcons'

type Row = Record<string, any>
type Props = {
  state: MaiState
  today: string
  inspect: (item: InspectableItem) => void
  commit: (change: (current: MaiState) => MaiState) => void
}
type Mode = 'list' | 'month'
type OccurrenceMode = 'all' | 'next'

const rows=(value:unknown):Row[]=>Array.isArray(value)?value as Row[]:[]
const firstOfMonth=(day:string)=>`${day.slice(0,7)}-01`
const moveMonth=(day:string,amount:number)=>{const d=new Date(`${day}T12:00:00`);d.setDate(1);d.setMonth(d.getMonth()+amount);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`}
const formatDay=(key:string)=>new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})
const kindLabel:Record<PlannerItem['kind'],string>={task:'Tarefa',event:'Compromisso',habit:'Hábito',finance:'Finanças',goal:'Meta'}

function itemDate(key:string,today:string){
  if(key===today)return'Hoje'
  const base=new Date(`${today}T12:00:00`)
  const target=new Date(`${key}T12:00:00`)
  const diff=Math.round((target.getTime()-base.getTime())/86_400_000)
  if(diff===1)return'Amanhã'
  if(diff===-1)return'Ontem'
  if(diff>1&&diff<7)return target.toLocaleDateString('pt-BR',{weekday:'long'})
  return target.toLocaleDateString('pt-BR',{day:'numeric',month:'short'})
}

function groupLabel(key:string,today:string){
  if(key===today)return'Hoje'
  const base=new Date(`${today}T12:00:00`)
  const target=new Date(`${key}T12:00:00`)
  const diff=Math.round((target.getTime()-base.getTime())/86_400_000)
  if(diff===-1)return'Ontem'
  if(diff===1)return'Amanhã'
  return formatDay(key)
}

function iconFor(kind:PlannerItem['kind']){
  if(kind==='event')return'calendar'
  if(kind==='habit')return'habits'
  if(kind==='finance')return'finance'
  if(kind==='goal')return'goals'
  return'inbox'
}

function ItemRow({item,inspect,today,project,afterOpen}:{item:PlannerItem;inspect:Props['inspect'];today:string;project?:Row;afterOpen?:()=>void}){
  const isTask=item.kind==='task'
  const priority=isTask?Number(item.raw.prioridade||4):undefined
  const projectBadge=isTask?<span className="mai-item-inline-tag mai-item-project-tag">{project?.imagem_url?<img src={String(project.imagem_url)} alt=""/>:<i style={{background:String(project?.cor||'#8e968d')}}><MaiIcon name={String(project?.icone||(project?.id==='entrada'?'inbox':'folder'))} size={9}/></i>}<span>{String(project?.nome||'Entrada')}</span></span>:null
  const detail=item.kind==='event'?<span>{item.raw.dia_inteiro===true||!item.time?'Dia inteiro':item.time}</span>:isTask?projectBadge:<span>{item.subtitle||kindLabel[item.kind]}</span>
  return <article className="mai-upcoming-item mai-v3-upcoming-item mai-item-row-v2" data-kind={item.kind} data-mai-item-date={item.date} onClick={()=>{afterOpen?.();inspect({kind:item.kind,sourceId:item.sourceId,title:item.title,date:item.date,time:item.time,raw:item.raw})}}>
    {isTask?<i className="mai-task-priority-dot" data-priority={priority}/>:<span className="mai-event-item-icon" style={{color:item.color}}><MaiIcon name={iconFor(item.kind)} size={16}/></span>}
    <span className="mai-item-copy-v2"><span className="mai-item-titleline-v2"><strong>{item.title}</strong></span><span className="mai-item-subline-v2"><span>{itemDate(item.date,today)}</span><span>·</span>{detail}</span></span>
  </article>
}

export function UpcomingCompact({state,today,inspect,commit}:Props){
  const persistedMode:Mode=state.configs.upcomingView==='month'?'month':'list'
  const [mode,setMode]=useState<Mode>(persistedMode)
  const [anchor,setAnchor]=useState(String(state.configs.upcomingAnchor||today))
  const [selectedDay,setSelectedDay]=useState(today)
  const [mobileDay,setMobileDay]=useState<string|null>(null)
  const [rangeDays,setRangeDays]=useState(180)
  const listRef=useRef<HTMLDivElement>(null)
  const sentinelRef=useRef<HTMLDivElement>(null)
  const monthAgendaRef=useRef<HTMLElement>(null)
  const focusedList=useRef(false)
  const projects=useMemo(()=>rows(state.projects).filter(item=>item.ativo!==false),[state.projects])
  const projectMap=useMemo(()=>new Map(projects.map(project=>[String(project.id),project])),[projects])
  const projectFor=(item:PlannerItem)=>projectMap.get(String((item.raw as Row)?.projeto_id||'entrada'))||{id:'entrada',nome:'Entrada',cor:'#8e968d',icone:'inbox'}

  const configs=state.configs as Row
  const savedFilters=configs.upcomingFilters&&typeof configs.upcomingFilters==='object'?configs.upcomingFilters as Row:{}
  const filters={
    tasks:savedFilters.tasks!==false,
    events:savedFilters.events!==false,
    habits:savedFilters.habits!==false,
    finance:savedFilters.finance!==false,
    goals:savedFilters.goals!==false,
    project:String(savedFilters.project||'all'),
    priority:String(savedFilters.priority||'all'),
    pastDays:Math.max(30,Math.min(365,Number(savedFilters.pastDays||90)||90)),
  }
  const savedOccurrence=savedFilters.occurrenceMode&&typeof savedFilters.occurrenceMode==='object'?savedFilters.occurrenceMode as Row:{}
  const occurrenceMode:Record<PlannerItem['kind'],OccurrenceMode>={
    task:savedOccurrence.task==='next'?'next':'all',
    event:savedOccurrence.event==='next'?'next':'all',
    habit:savedOccurrence.habit==='next'?'next':'all',
    finance:savedOccurrence.finance==='next'?'next':'all',
    goal:savedOccurrence.goal==='next'?'next':'all',
  }
  const moduleControls=configs.moduleControls&&typeof configs.moduleControls==='object'?configs.moduleControls as Record<string,Row>:{}
  const sortMode=String(moduleControls.upcoming?.sort||'time')

  useEffect(()=>{setMode(state.configs.upcomingView==='month'?'month':'list')},[state.configs.upcomingView])

  useEffect(()=>{
    if(mode!=='list'||!sentinelRef.current)return
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))setRangeDays(value=>Math.min(value+180,1440))},{rootMargin:'500px'})
    observer.observe(sentinelRef.current)
    return()=>observer.disconnect()
  },[mode])

  useEffect(()=>{
    if(!mobileDay)return
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setMobileDay(null)}
    window.addEventListener('keydown',close)
    return()=>window.removeEventListener('keydown',close)
  },[mobileDay])

  function filterAndOccurrences(source:PlannerItem[]){
    const enabled:Record<PlannerItem['kind'],boolean>={task:filters.tasks,event:filters.events,habit:filters.habits,finance:filters.finance,goal:filters.goals}
    const base=source.filter(item=>{
      if(item.completed||!enabled[item.kind])return false
      if(item.kind==='task'){
        if(filters.project!=='all'&&String(item.raw.projeto_id||'entrada')!==filters.project)return false
        if(filters.priority!=='all'&&String(Number(item.raw.prioridade||4))!==filters.priority)return false
      }
      return true
    }).sort((a,b)=>`${a.date} ${a.time||'99:99'} ${a.title}`.localeCompare(`${b.date} ${b.time||'99:99'} ${b.title}`,'pt-BR'))

    const result:PlannerItem[]=[]
    const grouped=new Map<string,PlannerItem[]>()
    base.forEach(item=>{
      if(!item.recurring||occurrenceMode[item.kind]==='all'){result.push(item);return}
      const sourceKey=item.kind==='finance'&&item.raw.fixo_id?String(item.raw.fixo_id):item.sourceId
      const key=`${item.kind}:${sourceKey}`
      if(!grouped.has(key))grouped.set(key,[])
      grouped.get(key)!.push(item)
    })
    grouped.forEach(items=>{const next=items.find(item=>item.date>=today)||items[items.length-1];if(next)result.push(next)})
    return result
  }

  function compareItems(a:PlannerItem,b:PlannerItem){
    if(sortMode==='priority')return Number(a.raw.prioridade||9)-Number(b.raw.prioridade||9)||(a.time||'99:99').localeCompare(b.time||'99:99')||a.title.localeCompare(b.title,'pt-BR')
    if(sortMode==='project')return String(a.subtitle||'').localeCompare(String(b.subtitle||''),'pt-BR')||(a.time||'99:99').localeCompare(b.time||'99:99')||a.title.localeCompare(b.title,'pt-BR')
    if(sortMode==='name'||sortMode==='title')return a.title.localeCompare(b.title,'pt-BR',{sensitivity:'base'})
    return (a.time||'99:99').localeCompare(b.time||'99:99')||a.title.localeCompare(b.title,'pt-BR')
  }

  const listItems=useMemo(()=>{
    const start=addDays(today,-filters.pastDays)
    const end=addDays(today,rangeDays)
    return filterAndOccurrences(plannerItems(state,start,end))
  },[state,today,rangeDays,filters.tasks,filters.events,filters.habits,filters.finance,filters.goals,filters.project,filters.priority,filters.pastDays,savedFilters.occurrenceMode,sortMode])

  const listGroups=useMemo(()=>{
    const map=new Map<string,PlannerItem[]>()
    listItems.forEach(item=>{if(!map.has(item.date))map.set(item.date,[]);map.get(item.date)!.push(item)})
    if(!map.has(today))map.set(today,[])
    map.forEach(items=>items.sort(compareItems))
    return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]))
  },[listItems,today,sortMode])

  useEffect(()=>{
    if(mode!=='list'||focusedList.current)return
    const id=window.requestAnimationFrame(()=>{listRef.current?.querySelector(`[data-day="${today}"]`)?.scrollIntoView({block:'start'});focusedList.current=true})
    return()=>window.cancelAnimationFrame(id)
  },[mode,today,listGroups.length])

  const monthStart=firstOfMonth(anchor||today)
  const nextMonthStart=moveMonth(monthStart,1)
  const monthEnd=addDays(nextMonthStart,-1)
  const firstWeekday=new Date(`${monthStart}T12:00:00`).getDay()
  const daysInMonth=Number(monthEnd.slice(8))
  const monthKey=monthStart.slice(0,7)
  const gridCells=Array.from({length:42},(_,index)=>{
    const dayNumber=index-firstWeekday+1
    return dayNumber>=1&&dayNumber<=daysInMonth?`${monthKey}-${String(dayNumber).padStart(2,'0')}`:null
  })
  const monthDays=gridCells.filter((day):day is string=>Boolean(day))
  const calendarItems=useMemo(()=>filterAndOccurrences(plannerItems(state,monthStart,monthEnd)),[state,monthStart,monthEnd,today,filters.tasks,filters.events,filters.habits,filters.finance,filters.goals,filters.project,filters.priority,savedFilters.occurrenceMode,sortMode])
  const calendarMap=useMemo(()=>{
    const map=new Map<string,PlannerItem[]>()
    calendarItems.forEach(item=>{if(!map.has(item.date))map.set(item.date,[]);map.get(item.date)!.push(item)})
    map.forEach(items=>items.sort(compareItems))
    return map
  },[calendarItems,sortMode])

  const agendaFocusDay=selectedDay.slice(0,7)===monthKey?selectedDay:today.slice(0,7)===monthKey?today:monthStart
  const agendaDays=monthDays.filter(day=>(calendarMap.get(day)||[]).length>0||day===agendaFocusDay)
  const monthItemCount=monthDays.reduce((total,day)=>total+(calendarMap.get(day)||[]).length,0)

  useEffect(()=>{
    if(mode!=='month')return
    const visibleMonth=monthStart.slice(0,7)
    if(selectedDay.slice(0,7)!==visibleMonth)setSelectedDay(today.slice(0,7)===visibleMonth?today:monthStart)
  },[mode,monthStart,today,selectedDay])

  useEffect(()=>{
    if(mode!=='month')return
    const focusDay=selectedDay.slice(0,7)===monthKey?selectedDay:agendaFocusDay
    const id=window.requestAnimationFrame(()=>monthAgendaRef.current?.querySelector(`[data-day="${focusDay}"]`)?.scrollIntoView({block:'start'}))
    return()=>window.cancelAnimationFrame(id)
  },[mode,monthStart,monthKey,selectedDay,agendaFocusDay,agendaDays.length])

  function changeAnchor(next:string){
    const nextStart=firstOfMonth(next)
    const nextSelected=today.slice(0,7)===nextStart.slice(0,7)?today:nextStart
    setAnchor(nextStart)
    setSelectedDay(nextSelected)
    setMobileDay(null)
    commit(current=>({...current,configs:{...current.configs,upcomingAnchor:nextStart}}))
  }

  function goToday(){
    setAnchor(today)
    setSelectedDay(today)
    setMobileDay(null)
    commit(current=>({...current,configs:{...current.configs,upcomingAnchor:today}}))
    window.requestAnimationFrame(()=>monthAgendaRef.current?.querySelector(`[data-day="${today}"]`)?.scrollIntoView({block:'start'}))
  }

  function selectDay(day:string){
    if(day.slice(0,7)!==monthKey)return
    setSelectedDay(day)
    if(typeof window!=='undefined'&&window.matchMedia('(max-width:900px)').matches)setMobileDay(day)
  }

  const monthLabel=new Date(`${monthStart}T12:00:00`).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})
  const monthName=new Date(`${monthStart}T12:00:00`).toLocaleDateString('pt-BR',{month:'long'})
  const mobileItems=mobileDay?calendarMap.get(mobileDay)||[]:[]
  const mobileWeekday=mobileDay?new Date(`${mobileDay}T12:00:00`).toLocaleDateString('pt-BR',{weekday:'long'}):''

  return <div className="mai-upcoming-page mai-v3-upcoming-page">
    {mode==='list'?<div ref={listRef} className="mai-upcoming-scroll mai-v3-upcoming-scroll mai-upcoming-history-list">
      {listGroups.map(([day,items])=><section key={day} data-day={day} data-past={day<today||undefined}><header><strong>{groupLabel(day,today)}</strong></header>{items.map(item=><ItemRow key={item.id} item={item} inspect={inspect} today={today} project={item.kind==='task'?projectFor(item):undefined}/>)}{!items.length?<small className="mai-empty-day">Nenhum item.</small>:null}</section>)}
      <div ref={sentinelRef} className="mai-v3-infinite-sentinel"/>
    </div>:<div className="mai-upcoming-calendar-v2">
      <main className="mai-upcoming-calendar-main">
        <header className="mai-upcoming-calendar-toolbar" aria-label={`Navegação do calendário, ${monthLabel}`}>
          <button className="mai-upcoming-calendar-arrow mai-upcoming-calendar-prev" aria-label="Mês anterior" onClick={()=>changeAnchor(moveMonth(monthStart,-1))}>‹</button>
          <button className="mai-upcoming-calendar-month" aria-label="Voltar para hoje" title="Voltar para hoje" onClick={goToday}>{monthName}</button>
          <button className="mai-upcoming-calendar-arrow mai-upcoming-calendar-next" aria-label="Próximo mês" onClick={()=>changeAnchor(moveMonth(monthStart,1))}>›</button>
        </header>
        <div className="mai-upcoming-calendar-week">{[['Dom','D'],['Seg','S'],['Ter','T'],['Qua','Q'],['Qui','Q'],['Sex','S'],['Sáb','S']].map(([full,short])=><span key={full}><b>{full}</b><i>{short}</i></span>)}</div>
        <div className="mai-upcoming-calendar-grid">{gridCells.map((day,index)=>{
          if(!day)return <div className="mai-upcoming-calendar-day mai-upcoming-calendar-empty" key={`empty-${index}`} aria-hidden="true"/>
          const items=calendarMap.get(day)||[]
          return <button className="mai-upcoming-calendar-day" key={day} data-day={day} data-today={day===today||undefined} data-selected={day===selectedDay||undefined} aria-label={formatDay(day)} onClick={()=>selectDay(day)}>
            <span className="mai-upcoming-calendar-day-number">{Number(day.slice(8))}</span>
            <div className="mai-upcoming-calendar-events">{items.slice(0,2).map(item=><span className="mai-upcoming-calendar-chip" key={item.id}><i style={{background:item.color}}/><b>{item.time?`${item.time} `:''}{item.title}</b></span>)}</div>
            {items.length>2?<span className="mai-upcoming-calendar-more">+ {items.length-2} {items.length-2===1?'item':'itens'}</span>:null}
          </button>
        })}</div>
      </main>
      <aside className="mai-upcoming-month-agenda" ref={monthAgendaRef}>
        <header className="mai-upcoming-month-agenda-head"><div><small>Agenda do mês</small><strong>{monthLabel}</strong></div><span>{monthItemCount}</span></header>
        <div className="mai-upcoming-month-agenda-list">{agendaDays.map(day=>{const items=calendarMap.get(day)||[];return <section key={day} data-day={day} data-today={day===today||undefined} data-selected={day===selectedDay||undefined}><header><strong>{groupLabel(day,today)}</strong><span>{items.length}</span></header>{items.map(item=><ItemRow key={item.id} item={item} inspect={inspect} today={today} project={item.kind==='task'?projectFor(item):undefined}/>)}{!items.length?<div className="mai-upcoming-day-panel-empty">Nenhum item neste dia.</div>:null}</section>})}</div>
      </aside>
      {mobileDay?<div className="mai-upcoming-mobile-day-layer" role="presentation" onClick={()=>setMobileDay(null)}><section className="mai-upcoming-mobile-day-sheet" role="dialog" aria-modal="true" aria-label={`Itens de ${formatDay(mobileDay)}`} onClick={event=>event.stopPropagation()}>
        <header><div><small>{mobileWeekday}</small><strong>{mobileDay===today?'Hoje':formatDay(mobileDay)}</strong></div><button aria-label="Fechar" onClick={()=>setMobileDay(null)}>×</button></header>
        <div className="mai-upcoming-mobile-day-items">{mobileItems.map(item=><ItemRow key={item.id} item={item} inspect={inspect} today={today} project={item.kind==='task'?projectFor(item):undefined} afterOpen={()=>setMobileDay(null)}/>)}{!mobileItems.length?<div className="mai-upcoming-day-panel-empty">Nenhum item neste dia.</div>:null}</div>
      </section></div>:null}
    </div>}
  </div>
}
