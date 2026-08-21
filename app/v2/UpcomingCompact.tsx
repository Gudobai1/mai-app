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

const rows=(value:unknown):Row[]=>Array.isArray(value)?value as Row[]:[]
const firstOfMonth = (day: string) => `${day.slice(0,7)}-01`
const endOfMonth = (day: string) => { const d = new Date(`${firstOfMonth(day)}T12:00:00`); d.setMonth(d.getMonth()+1); d.setDate(0); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const moveMonth = (day:string, amount:number) => { const d = new Date(`${day}T12:00:00`); d.setDate(1); d.setMonth(d.getMonth()+amount); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }
const formatDay = (key:string) => new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})
const itemDate = (key:string, today:string) => {
  if (key === today) return 'Hoje'
  const base = new Date(`${today}T12:00:00`)
  const target = new Date(`${key}T12:00:00`)
  const diff = Math.round((target.getTime() - base.getTime()) / 86_400_000)
  if (diff === 1) return 'Amanhã'
  if (diff > 1 && diff < 7) return target.toLocaleDateString('pt-BR',{weekday:'long'})
  return target.toLocaleDateString('pt-BR',{day:'numeric',month:'short'})
}
function eventOrigin(raw:Row){
  const isGoogle=['google','gcalendar'].includes(String(raw.tipo||'').toLowerCase())||Boolean(raw.calendario_id||raw.calendarId)
  const name=String(raw.calendario_nome||raw.calendar_name||raw.calendarName||raw.nome_calendario||'').trim()
  if(isGoogle)return name?`Google Agenda · ${name}`:'Google Agenda'
  return String(raw.categoria_nome||raw.categoria||raw.origem||'Compromisso')
}

function ItemRow({ item, inspect, today, project }: { item: PlannerItem; inspect: Props['inspect']; today:string; project?:Row }) {
  const isEvent = item.kind === 'event'
  const detail = isEvent ? (item.time || 'Dia inteiro') : [item.time, item.subtitle && item.subtitle !== project?.nome ? item.subtitle : ''].filter(Boolean).join(' · ')
  return <article className="mai-upcoming-item mai-v3-upcoming-item mai-item-row-v2" data-kind={item.kind} onClick={() => inspect({kind:item.kind,sourceId:item.sourceId,title:item.title,date:item.date,time:item.time,raw:item.raw})}>
    {isEvent ? <span className="mai-event-item-icon" style={{color:item.color}}><MaiIcon name="calendar" size={16}/></span> : <i style={{background:item.color}}/>}
    <span className="mai-item-copy-v2">
      <span className="mai-item-titleline-v2"><strong>{item.title}</strong>{isEvent?<span className="mai-item-inline-tag">{eventOrigin(item.raw as Row)}</span>:<span className="mai-item-inline-tag mai-item-project-tag">{project?.imagem_url?<img src={String(project.imagem_url)} alt=""/>:<i style={{background:String(project?.cor||'#8e968d')}}><MaiIcon name={String(project?.icone||(project?.id==='entrada'?'inbox':'folder'))} size={9}/></i>}<span>{String(project?.nome||'Entrada')}</span></span>}</span>
      <span className="mai-item-subline-v2"><span>{itemDate(item.date,today)}</span>{detail?<><span>·</span><span>{detail}</span></>:null}</span>
    </span>
  </article>
}

export function UpcomingCompact({ state, today, inspect, commit }: Props) {
  const persistedMode: Mode = state.configs.upcomingView === 'month' ? 'month' : 'list'
  const [mode,setMode] = useState<Mode>(persistedMode)
  const [anchor,setAnchor] = useState(String(state.configs.upcomingAnchor || today))
  const [rangeDays,setRangeDays] = useState(180)
  const listRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const projects=useMemo(()=>rows(state.projects).filter(item=>item.ativo!==false),[state.projects])
  const projectMap=useMemo(()=>new Map(projects.map(project=>[String(project.id),project])),[projects])
  const projectFor=(item:PlannerItem)=>projectMap.get(String((item.raw as Row)?.projeto_id||'entrada'))||{id:'entrada',nome:'Entrada',cor:'#8e968d',icone:'inbox'}

  useEffect(() => { setMode(state.configs.upcomingView === 'month' ? 'month' : 'list') }, [state.configs.upcomingView])
  useEffect(() => {
    if (mode !== 'list' || !sentinelRef.current) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setRangeDays(value => Math.min(value + 180, 1800))
    }, { rootMargin: '500px' })
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [mode])

  const listItems = useMemo(() => plannerItems(state,today,addDays(today,rangeDays)).filter(item => !item.completed),[state,today,rangeDays])
  const listGroups = useMemo(() => { const map = new Map<string,PlannerItem[]>(); listItems.forEach(item => { if(!map.has(item.date)) map.set(item.date,[]); map.get(item.date)!.push(item) }); map.forEach(items => items.sort((a,b)=>`${a.time || '99:99'} ${a.title}`.localeCompare(`${b.time || '99:99'} ${b.title}`))); return [...map.entries()] },[listItems])

  const monthStart = firstOfMonth(anchor || today)
  const monthEnd = endOfMonth(anchor || today)
  const monthItems = useMemo(() => plannerItems(state,monthStart,monthEnd).filter(item => !item.completed),[state,monthStart,monthEnd])
  const monthMap = useMemo(() => { const map = new Map<string,PlannerItem[]>(); monthItems.forEach(item => { if(!map.has(item.date)) map.set(item.date,[]); map.get(item.date)!.push(item) }); map.forEach(items => items.sort((a,b)=>`${a.time || '99:99'} ${a.title}`.localeCompare(`${b.time || '99:99'} ${b.title}`))); return map },[monthItems])
  const daysInMonth = Number(monthEnd.slice(8,10))
  const monthDays = Array.from({length:daysInMonth},(_,index)=>`${monthStart.slice(0,8)}${String(index+1).padStart(2,'0')}`)
  const firstWeekday = new Date(`${monthStart}T12:00:00`).getDay()
  const gridDays = [...Array(firstWeekday).fill(''), ...monthDays]
  while(gridDays.length % 7) gridDays.push('')

  useEffect(() => {
    if(mode !== 'month') return
    const target = monthStart.slice(0,7) === today.slice(0,7) ? today : monthStart
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-day="${target}"]`)?.scrollIntoView({block:'start'}))
  },[mode,monthStart,today])

  function setView(next: Mode) {
    setMode(next)
    commit(current => ({ ...current, configs: { ...current.configs, upcomingView: next } }))
  }
  function changeAnchor(next: string) {
    setAnchor(next)
    commit(current => ({ ...current, configs: { ...current.configs, upcomingAnchor: next } }))
  }
  function focusDay(day:string){ listRef.current?.querySelector(`[data-day="${day}"]`)?.scrollIntoView({behavior:'smooth',block:'start'}) }
  const monthLabel = new Date(`${monthStart}T12:00:00`).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})

  return <div className="mai-upcoming-page mai-v3-upcoming-page">
    <div className="mai-v3-page-header mai-v3-upcoming-header"><div><h1>Em breve</h1><p>{mode === 'list' ? 'Planejamento contínuo' : monthLabel}</p></div><div className="mai-view-switch mai-v3-view-switch"><button data-active={mode==='list'} onClick={() => setView('list')}>Lista</button><button data-active={mode==='month'} onClick={() => { changeAnchor(today); setView('month') }}>Calendário</button></div></div>

    {mode === 'list' ? <div className="mai-upcoming-scroll mai-v3-upcoming-scroll">{listGroups.map(([day,items]) => <section key={day}><header><strong>{day === today ? 'Hoje' : formatDay(day)}</strong></header>{items.map(item => <ItemRow key={item.id} item={item} inspect={inspect} today={today} project={item.kind==='task'?projectFor(item):undefined}/>)}</section>)}{!listGroups.length ? <div className="mai-v3-empty-line">Nada programado.</div> : null}<div ref={sentinelRef} className="mai-v3-infinite-sentinel" /></div> : <div className="mai-month-layout mai-v3-month-layout">
      <main className="mai-month-calendar mai-v3-month-calendar"><header><button onClick={() => changeAnchor(moveMonth(anchor,-1))}>‹</button><button onClick={() => changeAnchor(today)}>Hoje</button><strong>{monthLabel}</strong><button onClick={() => changeAnchor(moveMonth(anchor,1))}>›</button></header><div className="mai-week-head">{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(day => <span key={day}>{day}</span>)}</div><div className="mai-month-grid mai-v3-month-grid">{gridDays.map((day,index) => day ? <button key={day} data-today={day===today} onClick={() => focusDay(day)}><strong>{Number(day.slice(8))}</strong><div>{(monthMap.get(day)||[]).slice(0,3).map(item => <span key={item.id}><i style={{background:item.color}}/><b>{item.time ? `${item.time} ` : ''}{item.title}</b></span>)}</div>{(monthMap.get(day)||[]).length > 3 ? <small>+ {(monthMap.get(day)||[]).length - 3} itens</small> : null}</button> : <span key={`blank-${index}`}/>)}</div></main>
      <aside className="mai-month-list mai-v3-month-list" ref={listRef}>{monthDays.filter(day => monthMap.has(day) || day === today || day === monthStart).map(day => <section key={day} data-day={day} data-today={day===today}><header><strong>{day === today ? 'Hoje' : formatDay(day)}</strong></header>{(monthMap.get(day)||[]).map(item => <ItemRow key={item.id} item={item} inspect={inspect} today={today} project={item.kind==='task'?projectFor(item):undefined}/>)}{!(monthMap.get(day)||[]).length ? <small className="mai-empty-day">Nenhum item.</small> : null}</section>)}</aside>
    </div>}
  </div>
}
