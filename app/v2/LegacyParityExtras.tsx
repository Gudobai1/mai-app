'use client'

import { ChangeEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { SecondaryView } from './V2AreasBase'

type Row = Record<string, any>
type Commit = (change: (current: MaiState) => MaiState) => void

type Props = {
  view: SecondaryView
  state: MaiState
  today: string
  commit: Commit
  googleRpc: (method: string, args?: unknown[]) => Promise<any>
}

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const modalStyle = { position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(20,22,20,.48)', display: 'grid', placeItems: 'center', padding: 18 } as const
const sheetStyle = { width: 'min(900px, 96vw)', maxHeight: '88vh', overflow: 'auto', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--divider)', borderRadius: 18, boxShadow: '0 28px 80px rgba(0,0,0,.28)', padding: 20 } as const
const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 } as const
const cardStyle = { border: '1px solid var(--divider)', borderRadius: 12, padding: 12, background: 'var(--bg-primary)' } as const
const buttonStyle = { border: '1px solid var(--divider)', background: 'var(--bg-card)', color: 'var(--text-primary)', borderRadius: 9, padding: '8px 11px', cursor: 'pointer' } as const
const inputStyle = { border: '1px solid var(--divider)', background: 'var(--bg-primary)', color: 'var(--text-primary)', borderRadius: 9, padding: '8px 10px', minHeight: 36 } as const

function localKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function dateFrom(key: string) { return new Date(`${key.slice(0, 10)}T12:00:00`) }
function moveDate(key: string, days: number) { const d = dateFrom(key); d.setDate(d.getDate() + days); return localKey(d) }
function pct(value: number, total: number) { return total > 0 ? Math.round(value / total * 100) : 0 }
function readFile(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = reject; reader.readAsDataURL(file) }) }

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  return <div style={modalStyle} onMouseDown={onClose}><section style={sheetStyle} onMouseDown={event => event.stopPropagation()}>
    <header style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-start', marginBottom: 18 }}><div><h2 style={{ margin: 0, fontSize: 20 }}>{title}</h2>{subtitle && <p style={{ margin: '4px 0 0', opacity: .68, fontSize: 12 }}>{subtitle}</p>}</div><button style={buttonStyle} onClick={onClose}>Fechar</button></header>
    {children}
  </section></div>
}

function HabitExtras({ state, today, commit }: Pick<Props, 'state' | 'today' | 'commit'>) {
  const habits = rows(state.habits).filter(item => item.ativo !== false)
  const entries = rows(state.habitEntries)
  const [habitId, setHabitId] = useState(String(habits[0]?.id || ''))
  const [month, setMonth] = useState(today.slice(0, 7))
  const habit = habits.find(item => String(item.id) === habitId) || habits[0]
  const recordMap = useMemo(() => {
    const map = new Map<string, Row>()
    if (habit) entries.filter(entry => String(entry.habito_id) === String(habit.id)).forEach(entry => map.set(String(entry.data || '').slice(0, 10), entry))
    return map
  }, [entries, habit])
  if (!habit) return <p>Nenhum hábito cadastrado.</p>
  const target = Math.max(1, Number(habit.meta || 1))
  const complete = (key: string) => Number(recordMap.get(key)?.valor || 0) >= target
  const eligible = (key: string) => {
    const weekdays = rows(habit.dias_semana).map(Number)
    return !weekdays.length || weekdays.includes(dateFrom(key).getDay())
  }
  const days90 = Array.from({ length: 90 }, (_, index) => moveDate(today, index - 89))
  const eligible90 = days90.filter(key => eligible(key))
  const completed90 = eligible90.filter(complete)
  const currentRun = (() => { let run = 0; let key = complete(today) ? today : moveDate(today, -1); while (eligible(key) ? complete(key) : true) { if (eligible(key)) run += 1; key = moveDate(key, -1); if (run > 4000) break } return run })()
  let best = 0, run = 0
  days90.forEach(key => { if (!eligible(key)) return; run = complete(key) ? run + 1 : 0; best = Math.max(best, run) })
  const weekday = Array.from({ length: 7 }, (_, day) => { const possible = days90.filter(key => dateFrom(key).getDay() === day && eligible(key)); return { day, possible: possible.length, done: possible.filter(complete).length } })
  const weeks = Array.from({ length: 8 }, (_, index) => { const end = moveDate(today, -(7 - index) * 7); const keys = Array.from({ length: 7 }, (_, day) => moveDate(end, day - 6)).filter(eligible); return { label: dateFrom(keys[0] || end).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), value: pct(keys.filter(complete).length, keys.length) } })
  const [year, monthNumber] = month.split('-').map(Number)
  const monthDays = new Date(year, monthNumber, 0).getDate()
  const firstDay = new Date(year, monthNumber - 1, 1).getDay()

  function mark(key: string) {
    if (key > today && !confirm('Registrar este hábito em uma data futura?')) return
    const current = recordMap.get(key)
    if (current) {
      if (!confirm('Remover o registro deste dia?')) return
      commit(s => ({ ...s, habitEntries: rows(s.habitEntries).filter(entry => String(entry.id) !== String(current.id)) }))
      return
    }
    const answer = target > 1 || habit.unidade ? prompt(`Valor para ${habit.nome}:`, String(target)) : String(target)
    if (answer === null) return
    const value = Number(answer)
    if (!Number.isFinite(value)) return
    commit(s => ({ ...s, habitEntries: [...rows(s.habitEntries), { id: uid('hr'), habito_id: habit.id, data: key, valor: value, criado_em: new Date().toISOString() }] }))
  }

  return <div style={{ display: 'grid', gap: 16 }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}><select style={inputStyle} value={String(habit.id)} onChange={e => setHabitId(e.target.value)}>{habits.map(item => <option key={String(item.id)} value={String(item.id)}>{item.nome}</option>)}</select><span style={{ opacity: .68, fontSize: 12 }}>Meta: {target} {habit.unidade || ''}</span></div>
    <div style={gridStyle}><Metric label="Sequência atual" value={`${currentRun} dias`} /><Metric label="Melhor sequência" value={`${best} dias`} /><Metric label="Últimos 90 dias" value={`${pct(completed90.length, eligible90.length)}%`} /><Metric label="Concluídos" value={`${completed90.length}/${eligible90.length}`} /></div>
    <section style={cardStyle}><strong>Últimas 8 semanas</strong><div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', alignItems: 'end', gap: 7, height: 130, marginTop: 12 }}>{weeks.map(week => <div key={week.label} title={`${week.value}%`} style={{ display: 'grid', gridTemplateRows: '1fr auto auto', height: '100%', gap: 4, textAlign: 'center', fontSize: 10 }}><div style={{ display: 'flex', alignItems: 'end', justifyContent: 'center' }}><i style={{ width: 22, height: `${Math.max(3, week.value)}%`, background: habit.cor_hex || 'var(--accent)', borderRadius: 5 }} /></div><b>{week.value}%</b><span style={{ opacity: .55 }}>{week.label}</span></div>)}</div></section>
    <section style={cardStyle}><strong>Heatmap — 90 dias</strong><div style={{ display: 'grid', gridTemplateColumns: 'repeat(18,1fr)', gap: 4, marginTop: 12 }}>{days90.map(key => { const value = Number(recordMap.get(key)?.valor || 0); return <button key={key} title={`${key}: ${value}`} onClick={() => mark(key)} style={{ border: 0, borderRadius: 4, aspectRatio: '1', background: complete(key) ? (habit.cor_hex || 'var(--accent)') : value > 0 ? `color-mix(in srgb, ${habit.cor_hex || 'var(--accent)'} 35%, var(--bg-card))` : 'var(--bg-hover)', opacity: key > today ? .28 : 1, cursor: 'pointer' }} /> })}</div></section>
    <section style={cardStyle}><strong>Desempenho por dia da semana</strong><div style={{ display: 'grid', gap: 8, marginTop: 12 }}>{weekday.map(item => <div key={item.day} style={{ display: 'grid', gridTemplateColumns: '38px 1fr 42px', gap: 8, alignItems: 'center', fontSize: 11 }}><span>{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][item.day]}</span><i style={{ height: 8, background: 'var(--bg-hover)', borderRadius: 8, overflow: 'hidden' }}><b style={{ display: 'block', width: `${pct(item.done, item.possible)}%`, height: '100%', background: habit.cor_hex || 'var(--accent)' }} /></i><strong>{pct(item.done, item.possible)}%</strong></div>)}</div></section>
    <section style={cardStyle}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><strong>Calendário de registros</strong><input style={inputStyle} type="month" value={month} onChange={e => setMonth(e.target.value)} /></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5, marginTop: 10 }}>{['D','S','T','Q','Q','S','S'].map((d,i) => <span key={`${d}${i}`} style={{ textAlign: 'center', opacity: .55, fontSize: 10 }}>{d}</span>)}{Array.from({ length: firstDay }, (_, i) => <span key={`e${i}`} />)}{Array.from({ length: monthDays }, (_, i) => { const key = `${year}-${String(monthNumber).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`; const value = Number(recordMap.get(key)?.valor || 0); return <button key={key} onClick={() => mark(key)} style={{ ...buttonStyle, padding: 6, background: complete(key) ? (habit.cor_hex || 'var(--accent)') : value > 0 ? 'var(--bg-hover)' : 'transparent', color: complete(key) ? '#fff' : 'var(--text-primary)', opacity: key > today ? .35 : 1 }}>{i+1}</button> })}</div></section>
    <section style={cardStyle}><strong>Histórico recente</strong><div style={{ marginTop: 8 }}>{[...recordMap.entries()].sort((a,b) => b[0].localeCompare(a[0])).slice(0,8).map(([key, record]) => <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--divider)', fontSize: 12 }}><span>{dateFrom(key).toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'short' })}</span><strong>{record.valor} {habit.unidade || ''}{complete(key) ? ' · concluído' : ' · parcial'}</strong></div>)}</div></section>
  </div>
}

function Metric({ label, value }: { label: string; value: string }) { return <div style={cardStyle}><small style={{ opacity: .6 }}>{label}</small><strong style={{ display: 'block', fontSize: 22, marginTop: 5 }}>{value}</strong></div> }

function GoalExtras({ state, today }: Pick<Props, 'state' | 'today'>) {
  const goals = rows(state.goals)
  const [context, setContext] = useState<'total'|'year'|'month'>('total')
  const [cursor, setCursor] = useState(today.slice(0,7))
  const [category, setCategory] = useState('')
  const [year, month] = cursor.split('-').map(Number)
  const filtered = goals.filter(goal => {
    if (category && String(goal.categoria || '') !== category) return false
    if (context === 'total') return true
    const deadline = String(goal.prazo || '').slice(0,10)
    if (!deadline) return false
    if (context === 'year') return deadline.startsWith(String(year))
    return deadline.startsWith(cursor)
  })
  const total = filtered.reduce((sum, goal) => sum + Number(goal.progresso_total || 0), 0)
  const current = filtered.reduce((sum, goal) => sum + Number(goal.progresso_atual || 0), 0)
  const done = filtered.filter(goal => goal.status === 'Concluída').length
  const move = (amount: number) => { const d = new Date(year, month - 1 + (context === 'year' ? amount * 12 : amount), 15); setCursor(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`) }
  const categories = [...new Set(goals.map(goal => String(goal.categoria || '')).filter(Boolean))]
  return <div style={{ display:'grid', gap:16 }}>
    <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}><select style={inputStyle} value={context} onChange={e => setContext(e.target.value as any)}><option value="total">Todo o período</option><option value="year">Ano</option><option value="month">Mês</option></select>{context !== 'total' && <><button style={buttonStyle} onClick={() => move(-1)}>‹</button><strong style={{ padding:8 }}>{context === 'year' ? year : new Date(year, month-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</strong><button style={buttonStyle} onClick={() => move(1)}>›</button></>}<select style={inputStyle} value={category} onChange={e => setCategory(e.target.value)}><option value="">Todas as categorias</option>{categories.map(item => <option key={item}>{item}</option>)}</select></div>
    <div style={gridStyle}><Metric label="Metas no período" value={String(filtered.length)} /><Metric label="Ativas" value={String(filtered.length-done)} /><Metric label="Concluídas" value={String(done)} /><Metric label="Progresso global" value={`${pct(current,total)}%`} /></div>
    <section style={cardStyle}><strong>Metas deste contexto</strong><div style={{ display:'grid', gap:7, marginTop:10 }}>{filtered.map(goal => { const p = pct(Number(goal.progresso_atual||0), Number(goal.progresso_total||100)); return <div key={String(goal.id)} style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 100px 48px', gap:10, alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--divider)' }}><span><b>{goal.titulo}</b><small style={{ display:'block', opacity:.58 }}>{goal.categoria || 'Sem categoria'}{goal.prazo ? ` · ${dateFrom(String(goal.prazo)).toLocaleDateString('pt-BR')}` : ''}</small></span><i style={{ height:7, borderRadius:7, background:'var(--bg-hover)', overflow:'hidden' }}><b style={{ display:'block', height:'100%', width:`${p}%`, background:'var(--accent)' }} /></i><strong>{p}%</strong></div> })}</div></section>
  </div>
}

function NotesExtras({ state, commit, googleRpc }: Pick<Props, 'state' | 'commit' | 'googleRpc'>) {
  const notes = rows(state.notes).filter(note => note.ativo !== false)
  const [noteId, setNoteId] = useState(String(notes[0]?.id || ''))
  const [uploading, setUploading] = useState(false)
  const note = notes.find(item => String(item.id) === noteId) || notes[0]
  async function upload(files: FileList | null) {
    if (!note || !files?.length) return
    setUploading(true)
    try {
      const added: Row[] = []
      for (const file of Array.from(files)) {
        const data = await readFile(file)
        const result = await googleRpc('salvarAnexoDrive', [data, file.name, file.type])
        const item = result?.item || result
        added.push({ idDrive:item.id, nome:item.name || item.nome || file.name, tipo:item.mimeType || item.tipo || file.type, url:item.webViewLink || item.url || '', directUrl:item.url || item.webViewLink || '' })
      }
      commit(current => ({ ...current, notes: rows(current.notes).map(item => String(item.id) === String(note.id) ? { ...item, anexos:[...rows(item.anexos), ...added] } : item) }))
    } finally { setUploading(false) }
  }
  function insert(file: Row) {
    if (!note) return
    const isImage = String(file.tipo || '').startsWith('image/')
    const html = isImage ? `<p><img src="${file.directUrl || file.url}" alt="${String(file.nome || 'imagem').replaceAll('"','&quot;')}" /></p>` : `<p><a href="${file.url}" target="_blank" rel="noreferrer">Anexo: ${file.nome || 'arquivo'}</a></p>`
    commit(current => ({ ...current, notes: rows(current.notes).map(item => String(item.id) === String(note.id) ? { ...item, conteudo:`${String(item.conteudo || '')}${html}`, data:new Date().toISOString() } : item) }))
  }
  if (!note) return <p>Nenhuma nota ativa.</p>
  return <div style={{ display:'grid', gap:14 }}><div style={{ display:'flex', gap:8, flexWrap:'wrap' }}><select style={inputStyle} value={String(note.id)} onChange={e => setNoteId(e.target.value)}>{notes.map(item => <option key={String(item.id)} value={String(item.id)}>{item.titulo || 'Sem título'}</option>)}</select><label style={{ ...buttonStyle, display:'inline-flex', alignItems:'center' }}>{uploading ? 'Enviando…' : 'Anexar vários arquivos'}<input hidden type="file" multiple disabled={uploading} onChange={e => void upload(e.target.files)} /></label></div><section style={cardStyle}><strong>Bandeja de anexos</strong><div style={{ display:'grid', gap:7, marginTop:10 }}>{rows(note.anexos).map((file,index) => <div key={`${file.idDrive}-${index}`} style={{ display:'flex', justifyContent:'space-between', gap:8, alignItems:'center', borderBottom:'1px solid var(--divider)', padding:'7px 0' }}><a href={file.url || '#'} target="_blank" rel="noreferrer" style={{ color:'inherit' }}>{file.nome || 'Arquivo'}</a><button style={buttonStyle} onClick={() => insert(file)}>Inserir no texto</button></div>)}</div></section></div>
}

function FinanceExtras({ state, today, commit }: Pick<Props, 'state' | 'today' | 'commit'>) {
  const finance = state.finance || {}
  const transactions = rows(finance.transactions)
  const accounts = rows(finance.accounts)
  const lots = [...new Set(transactions.map(item => String(item.lote_id || '')).filter(Boolean))]
  const [lotId, setLotId] = useState(lots[0] || '')
  const lot = transactions.filter(item => String(item.lote_id || '') === lotId).sort((a,b) => String(a.data||'').localeCompare(String(b.data||'')))
  function updateParcel(parcel: Row, field: 'data'|'valor', value: string) { commit(current => ({ ...current, finance:{ ...current.finance, transactions:rows(current.finance.transactions).map(item => String(item.id) === String(parcel.id) ? { ...item, [field]:field === 'valor' ? Number(value) : value, ...(field === 'valor' && item.status === 'pago' ? { valor_pago:Number(value) } : {}) } : item) } })) }
  function removeParcel(parcel: Row) { if (!confirm('Excluir apenas esta parcela?')) return; commit(current => ({ ...current, finance:{ ...current.finance, transactions:rows(current.finance.transactions).filter(item => String(item.id) !== String(parcel.id)) } })) }
  function removeLot() { if (!lotId || !confirm('Excluir o lote inteiro, com todas as parcelas?')) return; commit(current => ({ ...current, finance:{ ...current.finance, transactions:rows(current.finance.transactions).filter(item => String(item.lote_id||'') !== lotId) } })); setLotId('') }
  function addParcel() { if (!lot.length) return; const source = lot[lot.length-1]; const d = dateFrom(String(source.data||today)); d.setMonth(d.getMonth()+1); const base = String(source.titulo||'Parcela').replace(/\s\(\d+\/\d+\)$/,''); const next = { ...source, id:uid('fin'), titulo:`${base} (Extra)`, data:localKey(d), status:'pendente', valor_pago:0, pagamentos:[] }; commit(current => ({ ...current, finance:{ ...current.finance, transactions:[...rows(current.finance.transactions),next] } })) }
  function adjustAccount(account: Row) { const answer = prompt(`Novo saldo desejado para ${account.nome}:`); if (answer === null) return; const desired = Number(answer); if (!Number.isFinite(desired)) return; const relevant = transactions.filter(item => String(item.conta_id||'') === String(account.id) && !item.ignorar_calculo); const currentBalance = Number(account.saldo_inicial||0) + relevant.reduce((sum,item) => sum + (item.tipo === 'receita' ? Number(item.valor||0) : -Number(item.valor||0)),0); const delta = desired-currentBalance; if (!delta) return; const adjustment = { id:uid('fin-aj'), titulo:'Ajuste de saldo', valor:Math.abs(delta), tipo:delta>=0?'receita':'despesa', data:today, status:'pago', valor_pago:Math.abs(delta), pagamentos:[{id:uid('pag'),data:today,valor:Math.abs(delta)}], conta_id:account.id, categoria:'Ajuste de Saldo', ignorar_calculo:false }; commit(current => ({ ...current, finance:{ ...current.finance, transactions:[...rows(current.finance.transactions),adjustment] } })) }
  const totalLot = lot.reduce((sum,item)=>sum+Number(item.valor||0),0); const paidLot = lot.reduce((sum,item)=>sum+Number(item.valor_pago||0),0)
  return <div style={{ display:'grid', gap:16 }}><section style={cardStyle}><strong>Lotes e parcelas</strong>{lots.length ? <><div style={{ display:'flex', gap:8, marginTop:10 }}><select style={inputStyle} value={lotId} onChange={e=>setLotId(e.target.value)}>{lots.map(id=><option key={id} value={id}>{id}</option>)}</select><button style={buttonStyle} onClick={addParcel}>＋ Parcela extra</button><button style={{...buttonStyle,color:'var(--mai-danger)'}} onClick={removeLot}>Excluir lote</button></div><div style={{ display:'flex', justifyContent:'space-between', margin:'12px 0', fontSize:12 }}><span>Total: <b>{money.format(totalLot)}</b></span><span>Falta: <b>{money.format(Math.max(0,totalLot-paidLot))}</b></span></div><div style={{ display:'grid', gap:6 }}>{lot.map((parcel,index)=><div key={String(parcel.id)} style={{ display:'grid', gridTemplateColumns:'36px 1fr 120px 36px', gap:6, alignItems:'center' }}><b>{index+1}ª</b><input style={inputStyle} type="date" value={String(parcel.data||'').slice(0,10)} onChange={e=>updateParcel(parcel,'data',e.target.value)} /><input style={inputStyle} type="number" step="0.01" value={Number(parcel.valor||0)} onChange={e=>updateParcel(parcel,'valor',e.target.value)} /><button style={buttonStyle} onClick={()=>removeParcel(parcel)}>×</button></div>)}</div></> : <p style={{ opacity:.65 }}>Ainda não há lotes parcelados.</p>}</section><section style={cardStyle}><strong>Ajuste de saldo</strong><div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:10 }}>{accounts.map(account=><button style={buttonStyle} key={String(account.id)} onClick={()=>adjustAccount(account)}>{account.nome}</button>)}</div></section></div>
}

function HealthExtras({ state, today, commit }: Pick<Props, 'state' | 'today' | 'commit'>) {
  const health = state.health || {}
  const diary = (health.diary || {}) as Record<string,Row>
  const [period, setPeriod] = useState<'day'|'week'|'month'|'year'|'all'>('day')
  const [planName, setPlanName] = useState('')
  const plans = rows((health as any).plans)
  const guidelines = rows((health as any).guidelines)
  const keys = Object.keys(diary).sort()
  const visibleKeys = keys.filter(key => { if (period==='all') return true; if (period==='day') return key===today; if (period==='week') return dateFrom(key)>=dateFrom(moveDate(today,-6))&&key<=today; if (period==='month') return key.startsWith(today.slice(0,7)); return key.startsWith(today.slice(0,4)) })
  const totals = visibleKeys.reduce((acc,key)=>{ const day=diary[key]||{}; acc.training+=rows(day.treinos||day.training).length; acc.nutrition+=rows(day.nutricao||day.nutrition).length; acc.supplements+=rows(day.suplementos||day.supplements).length; acc.alerts+=rows(day.alertas||day.alerts).length; const sleep=day.sono||day.sleep||{}; acc.sleep+=Number(sleep.min||sleep.minutes||0); return acc },{training:0,nutrition:0,supplements:0,alerts:0,sleep:0})
  function addPlan() { const name=planName.trim(); if(!name)return; const plan={id:uid('health-plan'),nome:name,exercicios:[],ativo:true,criado_em:new Date().toISOString()}; commit(current=>({ ...current, health:{...current.health,plans:[...rows((current.health as any).plans),plan]} as any })); setPlanName('') }
  function deletePlan(plan:Row){ if(!confirm(`Excluir o plano “${plan.nome}”?`))return; commit(current=>({ ...current, health:{...current.health,plans:rows((current.health as any).plans).filter(item=>String(item.id)!==String(plan.id))} as any })) }
  function addGuideline(){ const name=prompt('Nome da diretriz/regra:'); if(!name)return; const rule=prompt('Regra ou observação:')||''; commit(current=>({ ...current, health:{...current.health,guidelines:[...rows((current.health as any).guidelines),{id:uid('health-rule'),nome:name.trim(),regra:rule,ativo:true}]} as any })) }
  return <div style={{ display:'grid', gap:16 }}><div style={{ display:'flex',gap:8,flexWrap:'wrap' }}><select style={inputStyle} value={period} onChange={e=>setPeriod(e.target.value as any)}><option value="day">Dia selecionado</option><option value="week">Últimos 7 dias</option><option value="month">Mês atual</option><option value="year">Ano atual</option><option value="all">Histórico completo</option></select></div><div style={gridStyle}><Metric label="Treinos" value={String(totals.training)} /><Metric label="Registros nutricionais" value={String(totals.nutrition)} /><Metric label="Suplementos" value={String(totals.supplements)} /><Metric label="Sono registrado" value={`${Math.round(totals.sleep/60)} h`} /><Metric label="Alertas" value={String(totals.alerts)} /></div><section style={cardStyle}><strong>Planos de treino</strong><div style={{ display:'flex',gap:8,marginTop:10 }}><input style={{...inputStyle,flex:1}} value={planName} placeholder="Nome do plano" onChange={e=>setPlanName(e.target.value)} /><button style={buttonStyle} onClick={addPlan}>Criar plano</button></div><div style={{display:'grid',gap:6,marginTop:10}}>{plans.map(plan=><div key={String(plan.id)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid var(--divider)',padding:'7px 0'}}><span><b>{plan.nome}</b><small style={{display:'block',opacity:.55}}>{rows(plan.exercicios).length} exercícios</small></span><button style={buttonStyle} onClick={()=>deletePlan(plan)}>Excluir</button></div>)}</div></section><section style={cardStyle}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><strong>Diretrizes e regras</strong><button style={buttonStyle} onClick={addGuideline}>＋ Diretriz</button></div><div style={{display:'grid',gap:6,marginTop:10}}>{guidelines.map(rule=><div key={String(rule.id)} style={{padding:'7px 0',borderBottom:'1px solid var(--divider)'}}><b>{rule.nome}</b><small style={{display:'block',opacity:.6}}>{rule.regra}</small></div>)}</div></section></div>
}

type DriveView = 'meudrive'|'computadores'|'compartilhados'|'estrelas'|'lixeira'
function FilesExtras({ googleRpc }: Pick<Props,'googleRpc'>) {
  const [view,setView]=useState<DriveView>('meudrive'); const [folder,setFolder]=useState('root'); const [data,setData]=useState<Row>({files:[],folders:[],path:[]}); const [query,setQuery]=useState(''); const [loading,setLoading]=useState(false)
  async function load(nextView=view,nextFolder=folder){ setLoading(true); try{ const result=await googleRpc('getDriveContent',[nextFolder,nextView]); setData(result||{}); const storage=await googleRpc('getDriveStorage',[]).catch(()=>null); if(storage)setData(current=>({...current,storage})) } finally{setLoading(false)} }
  useEffect(()=>{void load(view,folder)},[view,folder])
  const all=[...rows(data.folders),...rows(data.files)].filter(item=>!query.trim()||String(item.name||item.nome||'').toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))
  const storage=data.storage||data.storageInfo
  return <div style={{display:'grid',gap:14}}><div style={{display:'flex',flexWrap:'wrap',gap:6}}>{([['meudrive','Meu Drive'],['computadores','Computadores'],['compartilhados','Compartilhados'],['estrelas','Estrelados'],['lixeira','Lixeira']] as [DriveView,string][]).map(([key,label])=><button key={key} style={{...buttonStyle,background:view===key?'var(--bg-hover)':'var(--bg-card)'}} onClick={()=>{setView(key);setFolder('root')}}>{label}</button>)}</div>{storage&&<div style={cardStyle}><small style={{opacity:.6}}>Armazenamento</small><strong style={{display:'block',marginTop:4}}>{(Number(storage.used||0)/1e9).toFixed(1)} GB de {(Number(storage.limit||0)/1e9).toFixed(0)} GB</strong><div style={{height:6,borderRadius:6,background:'var(--bg-hover)',overflow:'hidden',marginTop:8}}><i style={{display:'block',height:'100%',width:`${Math.min(100,pct(Number(storage.used||0),Number(storage.limit||1)))}%`,background:'var(--accent)'}} /></div></div>}<input style={inputStyle} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pesquisar nesta visualização" />{rows(data.path).length>0&&<div style={{display:'flex',gap:5,flexWrap:'wrap'}}><button style={buttonStyle} onClick={()=>setFolder('root')}>Drive</button>{rows(data.path).map(item=><button style={buttonStyle} key={String(item.id)} onClick={()=>setFolder(String(item.id))}>{item.name||item.nome}</button>)}</div>}<section style={cardStyle}>{loading?<p>Carregando…</p>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:8}}>{all.map(item=><button key={String(item.id)} style={{...buttonStyle,textAlign:'left',minHeight:64}} onClick={()=>item.tipo==='folder'?setFolder(String(item.id)):window.open(item.url,'_blank')}><b>{item.tipo==='folder'?'📁':'📄'} {item.name||item.nome}</b><small style={{display:'block',opacity:.55,marginTop:4}}>{item.tipo==='folder'?'Pasta':`${(Number(item.tamanho||0)/1024).toFixed(1)} KB`}</small></button>)}</div>}</section></div>
}

export function LegacyParityExtras(props: Props) {
  const [open,setOpen]=useState(false)
  const labels:Record<SecondaryView,string>={habits:'Relatório completo',goals:'Períodos e dashboard',notes:'Bandeja avançada',finance:'Lotes e ajustes',health:'Análise e planos',files:'Hub Drive completo'}
  return <><button onClick={()=>setOpen(true)} title="Funções restauradas do aplicativo original" style={{ position:'fixed', right:22, bottom:22, zIndex:8000, border:'1px solid var(--divider)', background:'var(--bg-card)', color:'var(--text-primary)', borderRadius:999, padding:'10px 14px', boxShadow:'0 8px 24px rgba(0,0,0,.14)', cursor:'pointer', fontWeight:650, fontSize:12 }}>Original · {labels[props.view]}</button>{open&&<Modal title={labels[props.view]} subtitle="Funções recuperadas do MAI original sem remover os recursos atuais." onClose={()=>setOpen(false)}>{props.view==='habits'&&<HabitExtras {...props} />}{props.view==='goals'&&<GoalExtras {...props} />}{props.view==='notes'&&<NotesExtras {...props} />}{props.view==='finance'&&<FinanceExtras {...props} />}{props.view==='health'&&<HealthExtras {...props} />}{props.view==='files'&&<FilesExtras {...props} />}</Modal>}</>
}
