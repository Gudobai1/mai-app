'use client'

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import { MaiIcon } from './MaiIcons'
import { UnifiedAreas as LegacyAreas } from './UnifiedAreas'

export type SecondaryView = 'habits' | 'goals' | 'notes' | 'finance' | 'health' | 'files'
type Row = Record<string, any>
type Commit = (change: (current: MaiState) => MaiState) => void

type Props = {
  view: SecondaryView
  state: MaiState
  today: string
  commit: Commit
  googleRpc: (method: string, args?: unknown[]) => Promise<any>
  createRequest?: string
  inspect: (item: InspectableItem) => void
}

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dateKey = (value: unknown) => String(value || '').slice(0, 10)
const cleanText = (value: unknown) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const percent = (value: number, total: number) => total > 0 ? Math.max(0, Math.min(100, Math.round(value / total * 100))) : 0
const moveDate = (key: string, amount: number) => { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() + amount); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

function areaTabs(state: MaiState): Record<string, string> {
  const value = state.configs.areaTabs
  return value && typeof value === 'object' ? value as Record<string,string> : {}
}

function setAreaTab(commit: Commit, state: MaiState, area: string, tab: string) {
  const tabs = areaTabs(state)
  commit(current => ({ ...current, configs: { ...current.configs, areaTabs: { ...tabs, [area]: tab } } }))
}

function advancedMap(state: MaiState): Record<string, boolean> {
  const value = state.configs.advancedAreas
  return value && typeof value === 'object' ? value as Record<string,boolean> : {}
}

function AreaHeader({ title, subtitle, onAdvanced, actions }: { title: string; subtitle?: string; onAdvanced: () => void; actions?: ReactNode }) {
  const [menu, setMenu] = useState(false)
  return <header className="mai-v3-area-header">
    <div><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</div>
    <div className="mai-v3-area-actions">{actions}<div className="mai-v3-area-more-wrap"><button aria-label="Mais opções" onClick={() => setMenu(value => !value)}><span className="material-symbols-rounded">more_horiz</span></button>{menu ? <div className="mai-v3-area-more"><button onClick={() => { setMenu(false); onAdvanced() }}>Ferramentas avançadas</button></div> : null}</div></div>
  </header>
}

function Tabs({ items, active, onChange }: { items: { id:string; label:string }[]; active:string; onChange:(id:string)=>void }) {
  return <div className="mai-v3-area-tabs">{items.map(item => <button key={item.id} data-active={active === item.id} onClick={() => onChange(item.id)}>{item.label}</button>)}</div>
}

function Drawer({ title, onClose, children, onSubmit }: { title:string; onClose:()=>void; children:ReactNode; onSubmit?:(event:FormEvent)=>void }) {
  const Wrapper = onSubmit ? 'form' : 'div'
  return <div className="mai-v3-create-layer" onMouseDown={onClose}><Wrapper className="mai-v3-create-drawer" onSubmit={onSubmit as any} onMouseDown={(event:any) => event.stopPropagation()}>
    <header className="mai-v3-drawer-header"><strong>{title}</strong><button type="button" className="mai-v3-close" onClick={onClose}>×</button></header>
    <div className="mai-v3-drawer-body">{children}</div>
    {onSubmit ? <footer className="mai-v3-drawer-footer"><button type="button" className="mai-v3-secondary" onClick={onClose}>Cancelar</button><button className="mai-v3-primary">Salvar</button></footer> : null}
  </Wrapper></div>
}

function Field({ label, children }: { label:string; children:ReactNode }) {
  return <label className="mai-v3-field-line"><span>{label}</span>{children}</label>
}

function Advanced({ props }: { props: Props }) {
  return <div className="mai-v3-advanced-area"><div className="mai-v3-advanced-banner"><span>Ferramentas avançadas</span><button onClick={() => props.commit(current => ({ ...current, configs: { ...current.configs, advancedAreas: { ...advancedMap(current), [props.view]: false } } }))}>Voltar ao visual simples</button></div><LegacyAreas view={props.view} state={props.state} today={props.today} commit={props.commit} googleRpc={props.googleRpc} createRequest={props.createRequest}/></div>
}

function Habits(props: Props) {
  const { state, today, commit, createRequest } = props
  const tabs = areaTabs(state)
  const tab = ['today','week','report'].includes(tabs.habits) ? tabs.habits : 'today'
  const habits = rows(state.habits).filter(item => item.ativo !== false)
  const entries = rows(state.habitEntries)
  const [draft, setDraft] = useState<Row | null>(null)
  const [weekAnchor, setWeekAnchor] = useState(today)
  useEffect(() => { if (createRequest?.startsWith('habits:')) setDraft({ nome:'', meta:1, unidade:'', hora:'', cor_hex:'#6f8168', icone:'star', dias_semana:[0,1,2,3,4,5,6], ativo:true }) }, [createRequest])
  const monday = useMemo(() => { const d = new Date(`${weekAnchor}T12:00:00`); const day=d.getDay(); d.setDate(d.getDate()-(day===0?6:day-1)); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }, [weekAnchor])
  const week = Array.from({length:7},(_,i)=>moveDate(monday,i))
  const eligible = (habit:Row, day:string) => { const days=rows(habit.dias_semana).map(Number); return !days.length || days.includes(new Date(`${day}T12:00:00`).getDay()) }
  const entry = (habitId:unknown, day:string) => entries.find(item => String(item.habito_id)===String(habitId) && dateKey(item.data)===day)
  const done = (habit:Row,day:string) => Number(entry(habit.id,day)?.valor||0) >= Math.max(1,Number(habit.meta||1))
  const todayHabits = habits.filter(habit => eligible(habit,today))
  function toggle(habit:Row,day:string){ const found=entry(habit.id,day); commit(current=>({...current,habitEntries:found?rows(current.habitEntries).filter(item=>String(item.id)!==String(found.id)):[...rows(current.habitEntries),{id:uid('hr'),habito_id:habit.id,data:day,valor:Math.max(1,Number(habit.meta||1)),criado_em:new Date().toISOString()}]})) }
  function streak(habit:Row){ let count=0,cursor=today,guard=0; while(guard++<3650){ if(!eligible(habit,cursor)){cursor=moveDate(cursor,-1);continue} if(!done(habit,cursor))break;count++;cursor=moveDate(cursor,-1)} return count }
  const last30 = Array.from({length:30},(_,i)=>moveDate(today,i-29))
  function rate(habit:Row){ const eligibleDays=last30.filter(day=>eligible(habit,day)); return percent(eligibleDays.filter(day=>done(habit,day)).length,eligibleDays.length) }
  function save(e:FormEvent){e.preventDefault();if(!draft||!String(draft.nome||'').trim())return;const next={...draft,id:draft.id||uid('hab'),nome:String(draft.nome).trim(),meta:Math.max(1,Number(draft.meta||1)),dias_semana:rows(draft.dias_semana).map(Number),ativo:true};commit(current=>({...current,habits:rows(current.habits).some(item=>String(item.id)===String(next.id))?rows(current.habits).map(item=>String(item.id)===String(next.id)?next:item):[...rows(current.habits),next]}));setDraft(null)}
  return <div className="mai-v3-area-page"><AreaHeader title="Rotinas" subtitle="Faça hoje. Acompanhe a semana. Analise quando precisar." onAdvanced={() => commit(current => ({...current,configs:{...current.configs,advancedAreas:{...advancedMap(current),habits:true}}}))}/><Tabs items={[{id:'today',label:'Hoje'},{id:'week',label:'Semana'},{id:'report',label:'Relatório'}]} active={tab} onChange={id=>setAreaTab(commit,state,'habits',id)}/>
    {tab==='today'?<section className="mai-v3-simple-section"><h2>Hoje</h2><div className="mai-v3-simple-list">{todayHabits.map(habit=><article className="mai-v3-habit-today" key={String(habit.id)}><button className="mai-v3-habit-check" data-done={done(habit,today)} style={done(habit,today)?{background:habit.cor_hex||'#6f8168',borderColor:habit.cor_hex||'#6f8168'}:{}} onClick={()=>toggle(habit,today)}>{done(habit,today)?'✓':''}</button><button className="mai-v3-habit-body" onClick={()=>setDraft({...habit,dias_semana:rows(habit.dias_semana)})}><strong>{habit.nome}</strong>{habit.meta>1||habit.unidade?<small>{habit.meta||1} {habit.unidade||''}</small>:null}</button></article>)}{!todayHabits.length?<div className="mai-v3-empty-line">Nenhuma rotina prevista para hoje.</div>:null}</div></section>:null}
    {tab==='week'?<section className="mai-v3-simple-section"><div className="mai-v3-week-nav"><button onClick={()=>setWeekAnchor(moveDate(weekAnchor,-7))}>‹</button><strong>{monday===moveDate(today,-((new Date(`${today}T12:00:00`).getDay()+6)%7))?'Esta semana':'Semana de '+new Date(`${monday}T12:00:00`).toLocaleDateString('pt-BR',{day:'numeric',month:'short'})}</strong><button onClick={()=>setWeekAnchor(moveDate(weekAnchor,7))}>›</button></div><div className="mai-v3-week-grid"><header><span>Rotina</span>{week.map(day=><b key={day}>{new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR',{weekday:'short'}).slice(0,1).toUpperCase()}</b>)}</header>{habits.map(habit=><div key={String(habit.id)}><button onClick={()=>setDraft({...habit,dias_semana:rows(habit.dias_semana)})}>{habit.nome}</button>{week.map(day=><button className="mai-v3-week-dot" key={day} disabled={!eligible(habit,day)} data-done={done(habit,day)} onClick={()=>toggle(habit,day)}>{done(habit,day)?'✓':''}</button>)}</div>)}</div></section>:null}
    {tab==='report'?<section className="mai-v3-simple-section"><h2>Relatório</h2><div className="mai-v3-report-list">{habits.map(habit=><article key={String(habit.id)}><span className="mai-v3-report-icon" style={{background:habit.cor_hex||'#6f8168'}}><span className="material-symbols-rounded">{habit.icone||'star'}</span></span><div><strong>{habit.nome}</strong><small>Últimos 30 dias</small></div><b>{rate(habit)}%</b><span>{streak(habit)} dias seguidos</span></article>)}</div></section>:null}
    {draft?<Drawer title={draft.id?'Editar rotina':'Nova rotina'} onClose={()=>setDraft(null)} onSubmit={save}><input className="mai-v3-title-input" autoFocus value={draft.nome||''} placeholder="Nome da rotina" onChange={e=>setDraft({...draft,nome:e.target.value})}/><Field label="Meta"><input type="number" min="1" value={draft.meta||1} onChange={e=>setDraft({...draft,meta:Number(e.target.value)})}/></Field><Field label="Unidade"><input value={draft.unidade||''} placeholder="copos, km, páginas" onChange={e=>setDraft({...draft,unidade:e.target.value})}/></Field><Field label="Horário"><input type="time" value={draft.hora||''} onChange={e=>setDraft({...draft,hora:e.target.value})}/></Field><Field label="Cor"><input type="color" value={draft.cor_hex||'#6f8168'} onChange={e=>setDraft({...draft,cor_hex:e.target.value})}/></Field><div className="mai-v3-day-picker">{['D','S','T','Q','Q','S','S'].map((label,day)=>{const active=rows(draft.dias_semana).map(Number).includes(day);return <button type="button" key={`${label}-${day}`} data-active={active} onClick={()=>setDraft({...draft,dias_semana:active?rows(draft.dias_semana).map(Number).filter(v=>v!==day):[...rows(draft.dias_semana).map(Number),day]})}>{label}</button>})}</div></Drawer>:null}
  </div>
}

function Goals(props: Props) {
  const { state, commit, createRequest, inspect } = props
  const goals=rows(state.goals)
  const [draft,setDraft]=useState<Row|null>(null)
  useEffect(()=>{if(createRequest?.startsWith('goals:'))setDraft({titulo:'',status:'Em Andamento',prazo:'',progresso_atual:0,progresso_total:100,descricao:''})},[createRequest])
  const buckets=[{id:'active',title:'Em andamento',test:(g:Row)=>!String(g.status||'').toLowerCase().includes('conclu')&&!String(g.status||'').toLowerCase().includes('paus')},{id:'paused',title:'Pausadas',test:(g:Row)=>String(g.status||'').toLowerCase().includes('paus')},{id:'done',title:'Concluídas',test:(g:Row)=>String(g.status||'').toLowerCase().includes('conclu')}]
  function save(e:FormEvent){e.preventDefault();if(!draft||!String(draft.titulo||'').trim())return;const next={...draft,id:draft.id||uid('meta'),titulo:String(draft.titulo).trim(),progresso_total:Math.max(1,Number(draft.progresso_total||100)),progresso_atual:Number(draft.progresso_atual||0)};commit(current=>({...current,goals:rows(current.goals).some(g=>String(g.id)===String(next.id))?rows(current.goals).map(g=>String(g.id)===String(next.id)?next:g):[next,...rows(current.goals)]}));setDraft(null)}
  return <div className="mai-v3-area-page"><AreaHeader title="Metas" subtitle="O que está em andamento, pausado e concluído." onAdvanced={()=>commit(current=>({...current,configs:{...current.configs,advancedAreas:{...advancedMap(current),goals:true}}}))}/><div className="mai-v3-goal-groups">{buckets.map(bucket=>{const list=goals.filter(bucket.test);return <section key={bucket.id}><h2>{bucket.title}</h2><div>{list.map(goal=>{const pct=percent(Number(goal.progresso_atual||0),Number(goal.progresso_total||100));return <button className="mai-v3-goal-row" key={String(goal.id)} onClick={()=>inspect({kind:'goal',sourceId:String(goal.id),title:String(goal.titulo||'Meta'),raw:goal})}><div><strong>{goal.titulo}</strong>{goal.prazo?<small>{new Date(`${dateKey(goal.prazo)}T12:00:00`).toLocaleDateString('pt-BR',{day:'numeric',month:'long'})}</small>:null}<i><b style={{width:`${pct}%`}}/></i></div><span>{pct}%</span></button>})}{!list.length?<div className="mai-v3-empty-line">Nenhuma meta.</div>:null}</div></section>})}</div>{draft?<Drawer title="Nova meta" onClose={()=>setDraft(null)} onSubmit={save}><input className="mai-v3-title-input" autoFocus value={draft.titulo||''} placeholder="Nome da meta" onChange={e=>setDraft({...draft,titulo:e.target.value})}/><Field label="Status"><select value={draft.status||'Em Andamento'} onChange={e=>setDraft({...draft,status:e.target.value})}><option>Em Andamento</option><option>Pausada</option><option>Concluída</option></select></Field><Field label="Prazo"><input type="date" value={dateKey(draft.prazo)} onChange={e=>setDraft({...draft,prazo:e.target.value})}/></Field><Field label="Atual"><input type="number" value={draft.progresso_atual||0} onChange={e=>setDraft({...draft,progresso_atual:Number(e.target.value)})}/></Field><Field label="Alvo"><input type="number" min="1" value={draft.progresso_total||100} onChange={e=>setDraft({...draft,progresso_total:Number(e.target.value)})}/></Field></Drawer>:null}</div>
}

function NotesEditor({ note, onChange }: { note:Row; onChange:(patch:Row)=>void }) {
  const ref=useRef<HTMLDivElement>(null)
  useEffect(()=>{if(ref.current&&document.activeElement!==ref.current&&ref.current.innerHTML!==String(note.conteudo||''))ref.current.innerHTML=String(note.conteudo||'')},[note.id,note.conteudo])
  const command=(name:string,arg?:string)=>{ref.current?.focus();document.execCommand(name,false,arg);onChange({conteudo:ref.current?.innerHTML||''})}
  return <div className="mai-v3-notes-editor"><div className="mai-v3-notes-toolbar"><button title="Negrito" onClick={()=>command('bold')}><b>B</b></button><button title="Itálico" onClick={()=>command('italic')}><i>I</i></button><button title="Sublinhado" onClick={()=>command('underline')}><u>U</u></button><button title="Título" onClick={()=>command('formatBlock','H2')}>H</button><button title="Lista" onClick={()=>command('insertUnorderedList')}>•</button><button title="Lista numerada" onClick={()=>command('insertOrderedList')}>1.</button><button title="Checklist" onClick={()=>command('insertUnorderedList')}>☑</button><button title="Link" onClick={()=>{const url=prompt('Endereço do link:');if(url)command('createLink',url)}}>↗</button><button title="Remover formatação" onClick={()=>command('removeFormat')}>Tx</button></div><input className="mai-v3-note-title" value={note.titulo||''} placeholder="Título" onChange={e=>onChange({titulo:e.target.value})}/><div ref={ref} className="mai-v3-note-surface" contentEditable suppressContentEditableWarning onInput={e=>onChange({conteudo:e.currentTarget.innerHTML})}/></div>
}

function Notes(props: Props) {
  const {state,commit,createRequest}=props
  const notes=rows(state.notes).filter(note=>note.ativo!==false&&note.arquivado!==true).sort((a,b)=>Number(Boolean(b.fixado))-Number(Boolean(a.fixado))||String(b.data||'').localeCompare(String(a.data||'')))
  const [query,setQuery]=useState('')
  const [selectedId,setSelectedId]=useState(String(state.configs.lastNoteId||notes[0]?.id||''))
  useEffect(()=>{if(createRequest?.startsWith('notes:')){const next={id:uid('note'),titulo:'',conteudo:'',ativo:true,arquivado:false,fixado:false,anexos:[],data:new Date().toISOString(),ordem:Date.now()};commit(current=>({...current,notes:[next,...rows(current.notes)],configs:{...current.configs,lastNoteId:next.id}}));setSelectedId(next.id)}},[createRequest])
  useEffect(()=>{if(!selectedId&&notes[0])setSelectedId(String(notes[0].id))},[notes.length])
  const visible=notes.filter(note=>!query.trim()||`${note.titulo} ${cleanText(note.conteudo)}`.toLowerCase().includes(query.trim().toLowerCase()))
  const selected=notes.find(note=>String(note.id)===selectedId)||visible[0]
  function update(patch:Row){if(!selected)return;commit(current=>({...current,notes:rows(current.notes).map(note=>String(note.id)===String(selected.id)?{...note,...patch,data:new Date().toISOString()}:note),configs:{...current.configs,lastNoteId:selected.id}}))}
  return <div className="mai-v3-area-page mai-v3-notes-page"><AreaHeader title="Notas" subtitle="Escreva e encontre sem sair do contexto." onAdvanced={()=>commit(current=>({...current,configs:{...current.configs,advancedAreas:{...advancedMap(current),notes:true}}}))}/><div className="mai-v3-notes-layout"><aside><div className="mai-v3-notes-search"><MaiIcon name="search" size={15}/><input value={query} placeholder="Buscar notas" onChange={e=>setQuery(e.target.value)}/></div><div>{visible.map(note=><button key={String(note.id)} data-active={String(note.id)===String(selected?.id)} onClick={()=>{setSelectedId(String(note.id));commit(current=>({...current,configs:{...current.configs,lastNoteId:String(note.id)}}))}}><strong>{note.titulo||'Sem título'}</strong><span>{cleanText(note.conteudo).slice(0,75)||'Nota vazia'}</span><small>{note.data?new Date(note.data).toLocaleDateString('pt-BR'):'—'}</small></button>)}</div></aside><main>{selected?<NotesEditor note={selected} onChange={update}/>:<div className="mai-v3-note-empty">Crie uma nota pelo botão +.</div>}</main></div></div>
}

function Finance(props: Props) {
  const {state,today,commit,createRequest,inspect}=props
  const tabs=areaTabs(state);const tab=['overview','transactions','accounts','cards'].includes(tabs.finance)?tabs.finance:'overview'
  const finance=state.finance||{};const tx=rows(finance.transactions);const accounts=rows(finance.accounts);const cards=rows(finance.cards)
  const month=today.slice(0,7);const monthTx=tx.filter(item=>dateKey(item.data).slice(0,7)===month)
  const paid=(item:Row)=>Number(item.valor_pago||0)||(item.status==='pago'?Number(item.valor||0):0)
  const balance=accounts.reduce((s,a)=>s+Number(a.saldo_inicial||0),0)+tx.filter(item=>!item.ignorar_calculo).reduce((s,item)=>s+(item.tipo==='receita'?paid(item):-paid(item)),0)
  const income=monthTx.filter(item=>item.tipo==='receita'&&!item.ignorar_calculo).reduce((s,item)=>s+Number(item.valor||0),0)
  const expense=monthTx.filter(item=>item.tipo!=='receita'&&!item.ignorar_calculo).reduce((s,item)=>s+Number(item.valor||0),0)
  const invoice=cards.reduce((sum,card)=>sum+monthTx.filter(item=>String(item.conta_id||'')===`card|${card.id}`||String(item.cartao_id||'')===String(card.id)).reduce((s,item)=>s+Number(item.valor||0),0),0)
  const [draft,setDraft]=useState<Row|null>(null)
  useEffect(()=>{if(createRequest?.startsWith('finance:'))setDraft({titulo:'',valor:0,tipo:'despesa',data:today,status:'pendente',categoria:'',conta_id:''})},[createRequest])
  function save(e:FormEvent){e.preventDefault();if(!draft||!String(draft.titulo||'').trim())return;const next={...draft,id:draft.id||uid('fin'),titulo:String(draft.titulo).trim(),valor:Number(draft.valor||0),valor_pago:draft.status==='pago'?Number(draft.valor||0):Number(draft.valor_pago||0)};commit(current=>({...current,finance:{...current.finance,transactions:rows(current.finance.transactions).some(item=>String(item.id)===String(next.id))?rows(current.finance.transactions).map(item=>String(item.id)===String(next.id)?next:item):[next,...rows(current.finance.transactions)]}}));setDraft(null)}
  const recent=[...tx].sort((a,b)=>String(b.data||'').localeCompare(String(a.data||''))).slice(0,8)
  return <div className="mai-v3-area-page"><AreaHeader title="Finanças" subtitle="O essencial primeiro. Detalhes quando você quiser." onAdvanced={()=>commit(current=>({...current,configs:{...current.configs,advancedAreas:{...advancedMap(current),finance:true}}}))}/><Tabs items={[{id:'overview',label:'Visão geral'},{id:'transactions',label:'Lançamentos'},{id:'accounts',label:'Contas'},{id:'cards',label:'Cartões'}]} active={tab} onChange={id=>setAreaTab(commit,state,'finance',id)}/>
    {tab==='overview'?<><div className="mai-v3-finance-summary"><article><span>Saldo atual</span><strong>{money.format(balance)}</strong></article><article><span>Receitas do mês</span><strong>{money.format(income)}</strong></article><article><span>Despesas do mês</span><strong>{money.format(expense)}</strong></article><article><span>Fatura atual</span><strong>{money.format(invoice)}</strong></article></div><section className="mai-v3-simple-section"><h2>Últimos lançamentos</h2><div className="mai-v3-finance-rows">{recent.map(item=><button key={String(item.id)} onClick={()=>inspect({kind:'finance',sourceId:String(item.id),title:String(item.titulo||'Lançamento'),date:dateKey(item.data),raw:item})}><span><strong>{item.titulo}</strong><small>{item.categoria||'Sem categoria'} · {dateKey(item.data)?new Date(`${dateKey(item.data)}T12:00:00`).toLocaleDateString('pt-BR',{day:'numeric',month:'short'}):'Sem data'}</small></span><b data-income={item.tipo==='receita'}>{item.tipo==='receita'?'+':'−'} {money.format(Number(item.valor||0))}</b></button>)}</div></section></>:null}
    {tab==='transactions'?<section className="mai-v3-simple-section"><div className="mai-v3-finance-rows">{[...tx].sort((a,b)=>String(b.data||'').localeCompare(String(a.data||''))).map(item=><button key={String(item.id)} onClick={()=>inspect({kind:'finance',sourceId:String(item.id),title:String(item.titulo||'Lançamento'),date:dateKey(item.data),raw:item})}><span><strong>{item.titulo}</strong><small>{dateKey(item.data)||'Sem data'} · {item.categoria||'Sem categoria'}</small></span><b data-income={item.tipo==='receita'}>{item.tipo==='receita'?'+':'−'} {money.format(Number(item.valor||0))}</b></button>)}</div></section>:null}
    {tab==='accounts'?<section className="mai-v3-simple-section"><div className="mai-v3-account-list">{accounts.map(account=><article key={String(account.id)}><i style={{background:account.cor||'#6f8168'}}/><div><strong>{account.nome}</strong><small>Saldo inicial {money.format(Number(account.saldo_inicial||0))}</small></div></article>)}</div></section>:null}
    {tab==='cards'?<section className="mai-v3-simple-section"><div className="mai-v3-card-list">{cards.map(card=><article key={String(card.id)}><div><strong>{card.nome}</strong><small>Vence dia {card.vencimento||'—'}</small></div><b>Limite {money.format(Number(card.limite||0))}</b></article>)}</div></section>:null}
    {draft?<Drawer title="Novo lançamento" onClose={()=>setDraft(null)} onSubmit={save}><input className="mai-v3-title-input" autoFocus value={draft.titulo||''} placeholder="Descrição" onChange={e=>setDraft({...draft,titulo:e.target.value})}/><Field label="Valor"><input type="number" step="0.01" value={draft.valor||0} onChange={e=>setDraft({...draft,valor:Number(e.target.value)})}/></Field><Field label="Tipo"><select value={draft.tipo||'despesa'} onChange={e=>setDraft({...draft,tipo:e.target.value})}><option value="despesa">Despesa</option><option value="receita">Receita</option></select></Field><Field label="Data"><input type="date" value={dateKey(draft.data)||today} onChange={e=>setDraft({...draft,data:e.target.value})}/></Field><Field label="Status"><select value={draft.status||'pendente'} onChange={e=>setDraft({...draft,status:e.target.value})}><option value="pendente">Pendente</option><option value="pago">Pago</option></select></Field></Drawer>:null}
  </div>
}

function Health(props: Props) {
  const {state,today,commit}=props;const tabs=areaTabs(state);const tab=tabs.health==='history'?'history':'today';const health=state.health||{};const diary=health.diary&&typeof health.diary==='object'?health.diary as Record<string,Row>:{};const day=diary[today]||{};const sleep=day.sono||{};const trackers=rows(health.trackers);const trackerValues=day.rastreadores&&typeof day.rastreadores==='object'?day.rastreadores as Record<string,any>:{};const workouts=rows(day.treinos);const sleepHours=Number(sleep.min||0)/60;const history=Object.keys(diary).sort().reverse().slice(0,30)
  const summary=[{label:'Sono',value:sleep.min?`${sleepHours.toFixed(1).replace('.',',')} h`:'—'},{label:'Exercício',value:workouts.length?`${workouts.reduce((s,w)=>s+Number(w.duracao||w.quantidade||0),0)} min`:'—'},...trackers.slice(0,4).map(tracker=>({label:String(tracker.nome||'Registro'),value:String(trackerValues[String(tracker.id)]??trackerValues[String(tracker.nome)]??'—')+(tracker.unidade?` ${tracker.unidade}`:'')}))]
  return <div className="mai-v3-area-page"><AreaHeader title="Bem-estar" subtitle="Como está o seu dia, sem transformar saúde em dashboard." onAdvanced={()=>commit(current=>({...current,configs:{...current.configs,advancedAreas:{...advancedMap(current),health:true}}}))}/><Tabs items={[{id:'today',label:'Hoje'},{id:'history',label:'Histórico'}]} active={tab} onChange={id=>setAreaTab(commit,state,'health',id)}/>{tab==='today'?<><div className="mai-v3-health-summary">{summary.map(item=><article key={item.label}><span>{item.label}</span><strong>{item.value}</strong></article>)}</div><section className="mai-v3-simple-section"><h2>Registros de hoje</h2><div className="mai-v3-health-rows">{trackers.map(tracker=><div key={String(tracker.id)}><span>{tracker.nome}</span><strong>{String(trackerValues[String(tracker.id)]??trackerValues[String(tracker.nome)]??'—')} {tracker.unidade||''}</strong></div>)}{!trackers.length?<div className="mai-v3-empty-line">Use o botão + para registrar seu dia.</div>:null}</div></section></>:<section className="mai-v3-simple-section"><h2>Histórico</h2><div className="mai-v3-health-history">{history.map(key=>{const d=diary[key]||{},sl=d.sono||{};return <article key={key}><strong>{new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR',{day:'numeric',month:'short'})}</strong><span>{sl.min?`Sono ${(Number(sl.min)/60).toFixed(1)} h`:'Sem sono registrado'}</span><span>{rows(d.treinos).length?`${rows(d.treinos).length} treino(s)`:'Sem treino'}</span></article>})}</div></section>}</div>
}

function Files(props: Props) {
  const {state,commit,googleRpc,createRequest}=props;const tabs=areaTabs(state);const mode=tabs.files==='grid'?'grid':'list';const [items,setItems]=useState<Row[]>([]);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const inputRef=useRef<HTMLInputElement>(null)
  async function load(){setLoading(true);setError('');try{const response=await googleRpc('getDriveContent',['root','meudrive']);setItems(rows(response?.items))}catch(error:any){setError(error?.message||'Não foi possível acessar os arquivos.')}finally{setLoading(false)}}
  useEffect(()=>{void load()},[])
  useEffect(()=>{if(createRequest?.startsWith('files:'))inputRef.current?.click()},[createRequest])
  async function upload(file?:File){if(!file)return;const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=reject;reader.readAsDataURL(file)});await googleRpc('salvarAnexoDrive',[data,file.name,file.type]);await load()}
  const open=(item:Row)=>{const url=String(item.url||item.webViewLink||item.webContentLink||'');if(url)window.open(url,'_blank','noopener,noreferrer')}
  return <div className="mai-v3-area-page"><AreaHeader title="Arquivos" subtitle="Seus arquivos em lista ou grade." onAdvanced={()=>commit(current=>({...current,configs:{...current.configs,advancedAreas:{...advancedMap(current),files:true}}}))}/><Tabs items={[{id:'list',label:'Lista'},{id:'grid',label:'Grade'}]} active={mode} onChange={id=>setAreaTab(commit,state,'files',id)}/><input ref={inputRef} hidden type="file" onChange={e=>void upload(e.target.files?.[0])}/>{loading?<div className="mai-v3-empty-line">Carregando arquivos…</div>:error?<div className="mai-v3-empty-line">{error}</div>:mode==='list'?<div className="mai-v3-file-list">{items.map(item=><button key={String(item.id)} onClick={()=>item.tipo==='folder'||item.mimeType==='application/vnd.google-apps.folder'?null:open(item)}><span className="mai-v3-file-icon"><MaiIcon name={item.tipo==='folder'||item.mimeType==='application/vnd.google-apps.folder'?'folder':'files'} size={16}/></span><span><strong>{item.name||item.nome||'Arquivo'}</strong><small>{item.modifiedTime?new Date(item.modifiedTime).toLocaleDateString('pt-BR'):item.tipo||''}</small></span></button>)}</div>:<div className="mai-v3-file-grid">{items.map(item=><button key={String(item.id)} onClick={()=>open(item)}><span><MaiIcon name={item.tipo==='folder'||item.mimeType==='application/vnd.google-apps.folder'?'folder':'files'} size={22}/></span><strong>{item.name||item.nome||'Arquivo'}</strong></button>)}</div>}</div>
}

export function MinimalAreas(props: Props) {
  if (advancedMap(props.state)[props.view]) return <Advanced props={props}/>
  if (props.view==='habits') return <Habits {...props}/>
  if (props.view==='goals') return <Goals {...props}/>
  if (props.view==='notes') return <Notes {...props}/>
  if (props.view==='finance') return <Finance {...props}/>
  if (props.view==='health') return <Health {...props}/>
  return <Files {...props}/>
}
