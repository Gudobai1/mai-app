'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, type PlannerItem, plannerItems } from '../../lib/v2/planner'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'

type Props = { state: MaiState; today: string; inspect: (item: InspectableItem) => void }
type Mode = 'list' | 'month'

const firstOfMonth = (day: string) => `${day.slice(0,7)}-01`
const endOfMonth = (day: string) => { const d = new Date(`${firstOfMonth(day)}T12:00:00`); d.setMonth(d.getMonth()+1); d.setDate(0); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const moveMonth = (day:string, amount:number) => { const d = new Date(`${day}T12:00:00`); d.setDate(1); d.setMonth(d.getMonth()+amount); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }
const formatDay = (key:string) => new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})

function ItemRow({ item, inspect }: { item: PlannerItem; inspect: Props['inspect'] }) {
  return <article className="mai-upcoming-item"><i style={{background:item.color}}/><button onClick={() => inspect({kind:item.kind,sourceId:item.sourceId,title:item.title,date:item.date,time:item.time,raw:item.raw})}><strong>{item.title}</strong><small>{item.subtitle}{item.recurring ? ' · recorrente' : ''}</small></button><time>{item.time || 'Dia todo'}</time></article>
}

export function UpcomingCompact({ state, today, inspect }: Props) {
  const [mode,setMode] = useState<Mode>('list')
  const [anchor,setAnchor] = useState(today)
  const listItems = useMemo(() => plannerItems(state,today,addDays(today,120)).filter(item => !item.completed),[state,today])
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
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if(mode !== 'month') return
    const target = monthStart.slice(0,7) === today.slice(0,7) ? today : monthStart
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-day="${target}"]`)?.scrollIntoView({block:'start'}))
  },[mode,monthStart,today])

  function focusDay(day:string){ listRef.current?.querySelector(`[data-day="${day}"]`)?.scrollIntoView({behavior:'smooth',block:'start'}) }
  const monthLabel = new Date(`${monthStart}T12:00:00`).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})

  return <div className="mai-upcoming-page">
    <div className="mai-page-bar"><div><strong>Em breve</strong><span>{mode === 'list' ? 'Planejamento contínuo' : monthLabel}</span></div><div className="mai-view-switch"><button data-active={mode==='list'} onClick={() => setMode('list')}>Lista</button><button data-active={mode==='month'} onClick={() => { setAnchor(today); setMode('month') }}>Mês</button></div></div>

    {mode === 'list' ? <div className="mai-upcoming-scroll">{listGroups.map(([day,items]) => <section key={day}><header><strong>{day === today ? 'Hoje' : formatDay(day)}</strong><span>{items.length}</span></header>{items.map(item => <ItemRow key={item.id} item={item} inspect={inspect}/>)}</section>)}{!listGroups.length ? <div className="mai-section-empty">Nada programado nos próximos meses.</div> : null}</div> : <div className="mai-month-layout">
      <main className="mai-month-calendar"><header><button onClick={() => setAnchor(moveMonth(anchor,-1))}>‹</button><button onClick={() => setAnchor(today)}>Hoje</button><strong>{monthLabel}</strong><button onClick={() => setAnchor(moveMonth(anchor,1))}>›</button></header><div className="mai-week-head">{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(day => <span key={day}>{day}</span>)}</div><div className="mai-month-grid">{gridDays.map((day,index) => day ? <button key={day} data-today={day===today} onClick={() => focusDay(day)}><strong>{Number(day.slice(8))}</strong><span>{(monthMap.get(day)||[]).slice(0,3).map(item => <i key={item.id} style={{background:item.color}}/> )}</span><small>{monthMap.get(day)?.length || ''}</small></button> : <span key={`blank-${index}`}/>)}</div></main>
      <aside className="mai-month-list" ref={listRef}>{monthDays.filter(day => monthMap.has(day) || day === today || day === monthStart).map(day => <section key={day} data-day={day} data-today={day===today}><header><strong>{day === today ? 'Hoje' : formatDay(day)}</strong><span>{monthMap.get(day)?.length || 0}</span></header>{(monthMap.get(day)||[]).map(item => <ItemRow key={item.id} item={item} inspect={inspect}/>)}{!(monthMap.get(day)||[]).length ? <small className="mai-empty-day">Nenhum item.</small> : null}</section>)}</aside>
    </div>}
  </div>
}
