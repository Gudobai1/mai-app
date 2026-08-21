'use client'

import { useEffect, useMemo, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import { MaiIcon } from './MaiIcons'

type Row=Record<string,any>
type Commit=(change:(current:MaiState)=>MaiState)=>void
const rows=(value:unknown):Row[]=>Array.isArray(value)?value as Row[]:[]
const uid=(prefix:string)=>`${prefix}-${crypto.randomUUID()}`
const dateKey=(value:unknown)=>String(value||'').slice(0,10)
const clean=(value:unknown)=>String(value||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()
const naturalDate=(key:string,today:string)=>{if(!key)return'Sem data';if(key===today)return'Hoje';const base=new Date(`${today}T12:00:00`);const target=new Date(`${key}T12:00:00`);const diff=Math.round((target.getTime()-base.getTime())/86400000);if(diff===1)return'Amanhã';return target.toLocaleDateString('pt-BR',{day:'numeric',month:'long'})}

export function NotesV4({state,today,commit,createRequest,inspect}:{state:MaiState;today:string;commit:Commit;createRequest?:string;inspect:(item:InspectableItem)=>void}){
  const [query,setQuery]=useState('')
  const notes=useMemo(()=>rows(state.notes).filter(note=>note.ativo!==false&&note.arquivado!==true).sort((a,b)=>Number(Boolean(b.fixado))-Number(Boolean(a.fixado))||String(b.data||b.updated_at||'').localeCompare(String(a.data||a.updated_at||''))),[state.notes])
  useEffect(()=>{
    if(!createRequest?.startsWith('notes:'))return
    const next={id:uid('note'),titulo:'',conteudo:'',ativo:true,arquivado:false,fixado:false,anexos:[],data:new Date().toISOString(),ordem:Date.now()}
    commit(current=>({...current,notes:[next,...rows(current.notes)]}))
    inspect({kind:'note',sourceId:String(next.id),title:'Nova nota',date:dateKey(next.data),raw:next})
  },[createRequest])
  const visible=notes.filter(note=>!query.trim()||`${note.titulo} ${clean(note.conteudo)}`.toLowerCase().includes(query.trim().toLowerCase()))
  const open=(note:Row)=>inspect({kind:'note',sourceId:String(note.id),title:String(note.titulo||'Sem título'),date:dateKey(note.data||note.updated_at||note.criado_em),raw:note})

  return <div className="mai-v3-area-page mai-v4-notes-list-page">
    <header className="mai-v3-area-header"><div><h1>Notas</h1><p>Encontre e abra qualquer nota no mesmo cartão lateral.</p></div><div className="mai-v3-area-actions"><button title="Ferramentas avançadas" aria-label="Ferramentas avançadas" onClick={()=>commit(current=>({...current,configs:{...current.configs,advancedAreas:{...(current.configs.advancedAreas&&typeof current.configs.advancedAreas==='object'?current.configs.advancedAreas as Record<string,boolean>:{}),notes:true}}}))}><span className="material-symbols-rounded">more_horiz</span></button></div></header>
    <div className="mai-v4-notes-search"><MaiIcon name="search" size={15}/><input value={query} placeholder="Buscar notas" onChange={event=>setQuery(event.target.value)}/></div>
    <section className="mai-v3-simple-section"><div className="mai-v3-simple-list">{visible.map(note=>{const when=dateKey(note.data||note.updated_at||note.criado_em);const detail=clean(note.conteudo).slice(0,90)||'Nota vazia';return <button className="mai-today-unified-row mai-item-row-v2" key={String(note.id)} onClick={()=>open(note)}><i className="mai-today-unified-dot" style={{borderColor:'var(--v3-accent)'}}/><span className="mai-item-copy-v2"><span className="mai-item-titleline-v2"><strong>{String(note.titulo||'Sem título')}</strong><span className="mai-item-inline-tag">Notas</span></span><span className="mai-item-subline-v2"><span>{naturalDate(when,today)}</span><span>·</span><span>{detail}</span></span></span></button>})}{!visible.length?<div className="mai-v3-empty-line">Nenhuma nota encontrada.</div>:null}</div></section>
  </div>
}
