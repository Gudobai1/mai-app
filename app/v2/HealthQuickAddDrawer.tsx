'use client'

import { useMemo, useRef, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { Row } from './app-types'
import { ItemAttachments } from './ItemAttachments'
import styles from './unified.module.css'
import { useAutosaveDraft } from './useAutosaveDraft'

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const daySeed = () => ({ sono:{deitar:'',acordar:'',min:0,rem:0,prof:0,blocos:0,isDano:false,perigo:'',score:0,anexos:[]},treinos:[],nutricao:[],suplementos:[],rastreadores:{},alertas:[] })
type Kind = 'sono' | 'nutricao' | 'treinos' | 'suplementos'
type Props = { state:MaiState; today:string; commit:(change:(current:MaiState)=>MaiState)=>void; onClose:()=>void }
type DraftSnapshot = { kind:Kind; date:string; time:string; sleepStart:string; sleepEnd:string; choice:string; name:string; quantity:number; duration:number; series:number; attachments:Row[] }

export function HealthQuickAddDrawer({ state, today, commit, onClose }: Props) {
  const [kind,setKind] = useState<Kind>('sono')
  const [date,setDate] = useState(today)
  const [time,setTime] = useState(new Date().toTimeString().slice(0,5))
  const [sleepStart,setSleepStart] = useState('22:30')
  const [sleepEnd,setSleepEnd] = useState('06:30')
  const [choice,setChoice] = useState('')
  const [name,setName] = useState('')
  const [quantity,setQuantity] = useState(1)
  const [duration,setDuration] = useState(30)
  const [series,setSeries] = useState(3)
  const [attachments,setAttachments] = useState<Row[]>([])
  const sessionId = useRef(Date.now())
  const stockRef = useRef<{id:string;quantity:number}|null>(null)
  const library = rows(state.health.library)
  const options = useMemo(() => library.filter(item => kind === 'nutricao' ? item.modulo === 'nutricao' : kind === 'treinos' ? item.modulo === 'treino' : kind === 'suplementos' ? item.modulo === 'suplemento' : false),[library,kind])
  const snapshot:DraftSnapshot={kind,date,time,sleepStart,sleepEnd,choice,name,quantity,duration,series,attachments}

  function persistDraft(next:DraftSnapshot){
    const previousStock=stockRef.current
    const selected=library.find(item=>String(item.id)===next.choice)
    const nextStock=next.kind==='suplementos'&&selected?.id?{id:String(selected.id),quantity:Math.max(0,Number(next.quantity)||0)}:null
    stockRef.current=nextStock

    commit(current => {
      const health = { ...(current.health || {}) } as Row
      const diary = { ...((health.diary && typeof health.diary === 'object') ? health.diary : {}) } as Record<string,Row>
      Object.keys(diary).forEach(key=>{
        const currentDay={...daySeed(),...(diary[key]||{})} as Row
        if(String(currentDay.sono?.idLog||'')===String(sessionId.current))currentDay.sono=daySeed().sono
        ;(['nutricao','treinos','suplementos'] as const).forEach(group=>{currentDay[group]=rows(currentDay[group]).filter(session=>String(session.idLog)!==String(sessionId.current))})
        diary[key]=currentDay
      })

      const day = { ...daySeed(), ...(diary[next.date] || {}) } as Row
      if(next.kind === 'sono'){
        const start = new Date(`1970-01-01T${next.sleepStart}:00`); let end = new Date(`1970-01-01T${next.sleepEnd}:00`); if(end <= start) end = new Date(`1970-01-02T${next.sleepEnd}:00`)
        const minutes = Math.max(0,Math.round((end.getTime()-start.getTime())/60000))
        const ideal = Math.max(1,Number((health.goals as Row)?.horasIdeais || 8))*60
        const score = Math.min(100,Math.round(minutes/ideal*100))
        day.sono = { ...(day.sono || {}), idLog:sessionId.current, deitar:next.sleepStart, acordar:next.sleepEnd, min:minutes, blocos:Math.floor(minutes/90), score, isDano:score<70, perigo:score<70?`Sono abaixo da meta (${score}%).`:'', anexos:next.attachments }
      } else {
        const selectedCurrent = rows(health.library).find(item => String(item.id) === next.choice)
        const itemObj = selectedCurrent ? { ...selectedCurrent } : { id:`quick-${sessionId.current}`, nome:next.name.trim() || (next.kind === 'treinos' ? 'Treino' : next.kind === 'nutricao' ? 'Refeição' : 'Suplemento'), modulo:next.kind === 'treinos' ? 'treino' : next.kind === 'nutricao' ? 'nutricao' : 'suplemento', base:1 }
        const mult = next.kind === 'nutricao' ? (Number(itemObj.base || 1) === 1 ? next.quantity : next.quantity/Math.max(1,Number(itemObj.base || 100))) : next.quantity
        const entry = { itemObj, qtd:next.quantity, mult, series:next.series, duracao:next.duration }
        const session = { idLog:sessionId.current, hora:next.time, isDano:false, perigo:'', itens:[entry], anexos:next.attachments }
        day[next.kind] = [...rows(day[next.kind]),session]
      }
      diary[next.date] = day

      let nextLibrary=rows(health.library)
      if(previousStock)nextLibrary=nextLibrary.map(item=>String(item.id)===previousStock.id?{...item,estoque:Number(item.estoque||0)+previousStock.quantity}:item)
      if(nextStock)nextLibrary=nextLibrary.map(item=>String(item.id)===nextStock.id?{...item,estoque:Math.max(0,Number(item.estoque||0)-nextStock.quantity)}:item)
      return { ...current, health:{ ...health, library:nextLibrary, diary } }
    })
  }

  useAutosaveDraft({value:snapshot,identity:String(sessionId.current),save:persistDraft,delay:240})

  return <div className={styles.modalLayer} onMouseDown={onClose}><form className={styles.modalCard} onSubmit={event=>event.preventDefault()} onMouseDown={event=>event.stopPropagation()}><header className={styles.modalHeader}><div><h2>Novo registro</h2><p>Bem-estar</p></div><button type="button" onClick={onClose}>×</button></header><div className={styles.areaForm}><div className={`${styles.segmented} ${styles.span2}`}>{([['sono','Sono'],['nutricao','Nutrição'],['treinos','Treino'],['suplementos','Suplemento']] as const).map(([id,label]) => <button type="button" key={id} data-active={kind===id} onClick={()=>{setKind(id);setChoice('')}}>{label}</button>)}</div><label><span>Data</span><input type="date" value={date} onChange={event=>setDate(event.target.value)}/></label>{kind !== 'sono' ? <label><span>Horário</span><input type="time" value={time} onChange={event=>setTime(event.target.value)}/></label> : <span/>}{kind === 'sono' ? <><label><span>Deitar</span><input type="time" value={sleepStart} onChange={event=>setSleepStart(event.target.value)}/></label><label><span>Acordar</span><input type="time" value={sleepEnd} onChange={event=>setSleepEnd(event.target.value)}/></label></> : <><label className={styles.span2}><span>Item da biblioteca</span><select value={choice} onChange={event=>setChoice(event.target.value)}><option value="">Registro rápido sem biblioteca</option>{options.map(item=><option key={String(item.id)} value={item.id}>{item.nome}</option>)}</select></label>{!choice ? <label className={styles.span2}><span>Nome</span><input value={name} onChange={event=>setName(event.target.value)} placeholder={kind==='treinos'?'Treino':kind==='nutricao'?'Refeição':'Suplemento'}/></label> : null}<label><span>{kind==='treinos'?'Quantidade':'Quantidade / dose'}</span><input type="number" min="0" step="0.1" value={quantity} onChange={event=>setQuantity(Number(event.target.value)||0)}/></label>{kind==='treinos' ? <><label><span>Duração (min)</span><input type="number" min="0" value={duration} onChange={event=>setDuration(Number(event.target.value)||0)}/></label><label><span>Séries</span><input type="number" min="0" value={series} onChange={event=>setSeries(Number(event.target.value)||0)}/></label></> : null}</>}<div className={styles.span2}><ItemAttachments attachments={attachments} onChange={setAttachments}/></div><footer className={styles.span2}><span/><span className="mai-autosave-status">Alterações salvas automaticamente</span></footer></div></form></div>
}
