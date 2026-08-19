'use client'

import { FormEvent, useMemo, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { Row } from './app-types'
import styles from './unified.module.css'

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const daySeed = () => ({ sono:{deitar:'',acordar:'',min:0,rem:0,prof:0,blocos:0,isDano:false,perigo:'',score:0},treinos:[],nutricao:[],suplementos:[],rastreadores:{},alertas:[] })
type Kind = 'sono' | 'nutricao' | 'treinos' | 'suplementos'
type Props = { state:MaiState; today:string; commit:(change:(current:MaiState)=>MaiState)=>void; onClose:()=>void }

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
  const library = rows(state.health.library)
  const options = useMemo(() => library.filter(item => kind === 'nutricao' ? item.modulo === 'nutricao' : kind === 'treinos' ? item.modulo === 'treino' : kind === 'suplementos' ? item.modulo === 'suplemento' : false),[library,kind])

  function save(event:FormEvent){
    event.preventDefault()
    commit(current => {
      const health = { ...(current.health || {}) } as Row
      const diary = { ...((health.diary && typeof health.diary === 'object') ? health.diary : {}) } as Record<string,Row>
      const day = { ...daySeed(), ...(diary[date] || {}) } as Row
      if(kind === 'sono'){
        const start = new Date(`1970-01-01T${sleepStart}:00`); let end = new Date(`1970-01-01T${sleepEnd}:00`); if(end <= start) end = new Date(`1970-01-02T${sleepEnd}:00`)
        const minutes = Math.max(0,Math.round((end.getTime()-start.getTime())/60000))
        const ideal = Math.max(1,Number((health.goals as Row)?.horasIdeais || 8))*60
        const score = Math.min(100,Math.round(minutes/ideal*100))
        day.sono = { ...(day.sono || {}), deitar:sleepStart, acordar:sleepEnd, min:minutes, blocos:Math.floor(minutes/90), score, isDano:score<70, perigo:score<70?`Sono abaixo da meta (${score}%).`:'' }
      } else {
        const selected = library.find(item => String(item.id) === choice)
        const itemObj = selected ? { ...selected } : { id:`quick-${crypto.randomUUID()}`, nome:name.trim() || (kind === 'treinos' ? 'Treino' : kind === 'nutricao' ? 'Refeição' : 'Suplemento'), modulo:kind === 'treinos' ? 'treino' : kind === 'nutricao' ? 'nutricao' : 'suplemento', base:1 }
        const mult = kind === 'nutricao' ? (Number(itemObj.base || 1) === 1 ? quantity : quantity/Math.max(1,Number(itemObj.base || 100))) : quantity
        const entry = { itemObj, qtd:quantity, mult, series, duracao:duration }
        const session = { idLog:Date.now(), hora:time, isDano:false, perigo:'', itens:[entry] }
        day[kind] = [...rows(day[kind]),session]
        if(kind === 'suplementos' && selected?.id) health.library = library.map(item => String(item.id) === String(selected.id) ? { ...item, estoque:Math.max(0,Number(item.estoque || 0)-quantity) } : item)
      }
      diary[date] = day
      return { ...current, health:{ ...health, diary } }
    })
    onClose()
  }

  return <div className={styles.modalLayer} onMouseDown={onClose}><form className={styles.modalCard} onSubmit={save} onMouseDown={event=>event.stopPropagation()}><header className={styles.modalHeader}><div><h2>Novo registro</h2><p>Bem-estar</p></div><button type="button" onClick={onClose}>×</button></header><div className={styles.areaForm}><div className={`${styles.segmented} ${styles.span2}`}>{([['sono','Sono'],['nutricao','Nutrição'],['treinos','Treino'],['suplementos','Suplemento']] as const).map(([id,label]) => <button type="button" key={id} data-active={kind===id} onClick={()=>{setKind(id);setChoice('')}}>{label}</button>)}</div><label><span>Data</span><input type="date" value={date} onChange={event=>setDate(event.target.value)}/></label>{kind !== 'sono' ? <label><span>Horário</span><input type="time" value={time} onChange={event=>setTime(event.target.value)}/></label> : <span/>}{kind === 'sono' ? <><label><span>Deitar</span><input type="time" value={sleepStart} onChange={event=>setSleepStart(event.target.value)}/></label><label><span>Acordar</span><input type="time" value={sleepEnd} onChange={event=>setSleepEnd(event.target.value)}/></label></> : <><label className={styles.span2}><span>Item da biblioteca</span><select value={choice} onChange={event=>setChoice(event.target.value)}><option value="">Registro rápido sem biblioteca</option>{options.map(item=><option key={String(item.id)} value={item.id}>{item.nome}</option>)}</select></label>{!choice ? <label className={styles.span2}><span>Nome</span><input value={name} onChange={event=>setName(event.target.value)} placeholder={kind==='treinos'?'Treino':kind==='nutricao'?'Refeição':'Suplemento'}/></label> : null}<label><span>{kind==='treinos'?'Quantidade':'Quantidade / dose'}</span><input type="number" min="0" step="0.1" value={quantity} onChange={event=>setQuantity(Number(event.target.value)||0)}/></label>{kind==='treinos' ? <><label><span>Duração (min)</span><input type="number" min="0" value={duration} onChange={event=>setDuration(Number(event.target.value)||0)}/></label><label><span>Séries</span><input type="number" min="0" value={series} onChange={event=>setSeries(Number(event.target.value)||0)}/></label></> : null}</>}<footer className={styles.span2}><span/><div><button type="button" className={styles.secondaryButton} onClick={onClose}>Cancelar</button><button className={styles.primaryButton}>Salvar registro</button></div></footer></div></form></div>
}
