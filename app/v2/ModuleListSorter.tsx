'use client'

import { useEffect } from 'react'

type Row = Record<string, any>
type SortMode = 'manual'|'overdue'|'date'|'priority'|'title'|'name'|'time'|'project'|'progress'|'value'|'recent'|'oldest'

const normalize=(value:unknown)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[.,]/g,' ').replace(/\s+/g,' ').trim()
const localToday=()=>{const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`}

function readState():Row|null{
  try{const raw=localStorage.getItem('mai-v2-state');return raw?JSON.parse(raw) as Row:null}catch{return null}
}

function dateFromText(value:string,today:string){
  const text=normalize(value)
  if(!text)return''
  if(text.includes('hoje'))return today
  const base=new Date(`${today}T12:00:00`)
  if(text.includes('ontem')){const d=new Date(base);d.setDate(d.getDate()-1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
  if(text.includes('amanha')){const d=new Date(base);d.setDate(d.getDate()+1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
  const iso=text.match(/\b(\d{4}-\d{2}-\d{2})\b/);if(iso)return iso[1]
  const numeric=text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if(numeric){const year=numeric[3]?Number(numeric[3].length===2?`20${numeric[3]}`:numeric[3]):base.getFullYear();return `${year}-${String(Number(numeric[2])).padStart(2,'0')}-${String(Number(numeric[1])).padStart(2,'0')}`}
  const months:Record<string,number>={jan:1,janeiro:1,fev:2,fevereiro:2,mar:3,marco:3,abr:4,abril:4,mai:5,maio:5,jun:6,junho:6,jul:7,julho:7,ago:8,agosto:8,set:9,setembro:9,out:10,outubro:10,nov:11,novembro:11,dez:12,dezembro:12}
  const long=text.match(/(?:^|\s)(\d{1,2})(?: de)?\s+([a-z]+)(?: de)?\s*(\d{4})?(?:\s|$)/)
  if(!long||!months[long[2]])return''
  const day=Number(long[1]),month=months[long[2]]
  if(long[3])return `${long[3]}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  const years=[base.getFullYear()-1,base.getFullYear(),base.getFullYear()+1]
  const year=years.map(y=>({y,d:Math.abs(new Date(y,month-1,day,12).getTime()-base.getTime())})).sort((a,b)=>a.d-b.d)[0].y
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

const titleOf=(el:HTMLElement)=>String(el.querySelector('.mai-item-titleline-v2 strong')?.textContent||el.querySelector('strong')?.textContent||'').trim()
const dateOf=(el:HTMLElement,today:string)=>String(el.dataset.maiItemDate||dateFromText(String(el.querySelector('.mai-item-subline-v2')?.firstElementChild?.textContent||el.querySelector('small')?.textContent||el.textContent||''),today)||'')
const priorityOf=(el:HTMLElement)=>{const node=el.querySelector<HTMLElement>('[data-priority]');const value=Number(node?.dataset.priority||9);return Number.isFinite(value)?value:9}
const progressOf=(el:HTMLElement)=>Number(String(el.textContent||'').match(/(\d{1,3})\s*%/)?.[1]||0)
const timeOf=(el:HTMLElement)=>String(el.textContent||'').match(/\b([01]?\d|2[0-3]):[0-5]\d\b/)?.[0]||'99:99'
const projectOf=(el:HTMLElement)=>String(el.querySelector('.mai-item-project-tag')?.textContent||el.querySelector('.mai-item-subline-v2>span:last-child')?.textContent||'').trim()
const valueOf=(el:HTMLElement)=>{const raw=String(el.textContent||'').match(/R\$\s*([\d.]+,\d{2})/)?.[1]||'';return Number(raw.replace(/\./g,'').replace(',','.'))||0}
const overdueOf=(el:HTMLElement)=>el.dataset.maiDateTone==='overdue'||Boolean(el.querySelector('[data-mai-date-tone="overdue"]'))

function compare(mode:SortMode,a:HTMLElement,b:HTMLElement,today:string){
  const overdueA=overdueOf(a),overdueB=overdueOf(b)
  if(overdueA!==overdueB)return overdueA?-1:1
  if(mode==='manual'||mode==='overdue')return 0
  if(mode==='priority')return priorityOf(a)-priorityOf(b)||titleOf(a).localeCompare(titleOf(b),'pt-BR',{sensitivity:'base'})
  if(mode==='project')return projectOf(a).localeCompare(projectOf(b),'pt-BR',{sensitivity:'base'})||timeOf(a).localeCompare(timeOf(b))||titleOf(a).localeCompare(titleOf(b),'pt-BR')
  if(mode==='title'||mode==='name')return titleOf(a).localeCompare(titleOf(b),'pt-BR',{sensitivity:'base'})
  if(mode==='time')return timeOf(a).localeCompare(timeOf(b))||titleOf(a).localeCompare(titleOf(b),'pt-BR')
  if(mode==='progress')return progressOf(b)-progressOf(a)||titleOf(a).localeCompare(titleOf(b),'pt-BR')
  if(mode==='value')return valueOf(b)-valueOf(a)||titleOf(a).localeCompare(titleOf(b),'pt-BR')
  const da=dateOf(a,today)||'9999-99-99',db=dateOf(b,today)||'9999-99-99'
  if(mode==='recent')return db.localeCompare(da)||titleOf(a).localeCompare(titleOf(b),'pt-BR')
  if(mode==='oldest')return da.localeCompare(db)||titleOf(a).localeCompare(titleOf(b),'pt-BR')
  return da.localeCompare(db)||timeOf(a).localeCompare(timeOf(b))||titleOf(a).localeCompare(titleOf(b),'pt-BR')
}

function sortChildren(parent:HTMLElement,mode:SortMode,today:string,selector:string){
  const children=Array.from(parent.children).filter((child):child is HTMLElement=>child instanceof HTMLElement&&child.matches(selector))
  if(children.length<2)return
  const indexed=children.map((el,index)=>({el,index}))
  const desired=[...indexed].sort((a,b)=>compare(mode,a.el,b.el,today)||a.index-b.index).map(item=>item.el)
  if(desired.every((el,index)=>el===children[index]))return
  desired.forEach(el=>parent.appendChild(el))
}

function sortCompletedDays(root:HTMLElement,mode:SortMode,today:string){
  if(mode!=='recent'&&mode!=='oldest')return
  const parent=root.querySelector<HTMLElement>('.mai-completed-groups');if(!parent)return
  const sections=Array.from(parent.children).filter((child):child is HTMLElement=>child instanceof HTMLElement&&child.classList.contains('mai-completed-day'))
  if(sections.length<2)return
  const desired=[...sections].sort((a,b)=>{
    const rowA=a.querySelector<HTMLElement>('.mai-item-row-v2'),rowB=b.querySelector<HTMLElement>('.mai-item-row-v2')
    const da=(rowA?dateOf(rowA,today):'')||dateFromText(String(a.querySelector('header')?.textContent||''),today)||''
    const db=(rowB?dateOf(rowB,today):'')||dateFromText(String(b.querySelector('header')?.textContent||''),today)||''
    return mode==='oldest'?da.localeCompare(db):db.localeCompare(da)
  })
  if(desired.every((el,index)=>el===sections[index]))return
  desired.forEach(el=>parent.appendChild(el))
}

export function ModuleListSorter(){
  useEffect(()=>{
    let observer:MutationObserver|null=null
    const apply=()=>{
      const root=document.querySelector<HTMLElement>('.mai-v3-workspace');if(!root)return
      const state=readState();if(!state)return
      const view=String(state.configs?.lastView||'today')
      const controls=state.configs?.moduleControls&&typeof state.configs.moduleControls==='object'?state.configs.moduleControls as Record<string,Row>:{}
      const mode=String(controls[view]?.sort||'manual') as SortMode
      const today=localToday()

      const parents=new Set<HTMLElement>()
      root.querySelectorAll<HTMLElement>('.mai-item-row-v2').forEach(row=>{if(row.parentElement)parents.add(row.parentElement)})
      parents.forEach(parent=>sortChildren(parent,mode,today,'.mai-item-row-v2'))
      root.querySelectorAll<HTMLElement>('.mai-v3-file-list,.mai-v3-file-grid,.mai-v3-health-history,.mai-v3-finance-rows,.mai-v3-report-list').forEach(parent=>sortChildren(parent,mode,today,'button,article'))
      sortCompletedDays(root,mode,today)
    }
    const root=document.querySelector('.mai-v3-shell')||document.body
    const observe=()=>observer?.observe(root,{childList:true,subtree:true,characterData:true})
    observer=new MutationObserver(()=>{observer?.disconnect();apply();observe()})
    apply();observe()
    const timer=window.setInterval(apply,1200)
    return()=>{observer?.disconnect();window.clearInterval(timer)}
  },[])
  return null
}
