'use client'

import { useEffect, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import { CreateCalendarPicker, CreateNumberEditor, CreateOptionList, CreateTextEditor, CreateTool, createNaturalDate } from './CreateDrawerTools'
import { useAutosaveDraft } from './useAutosaveDraft'

type Row=Record<string,any>
type Commit=(change:(current:MaiState)=>MaiState)=>void
const rows=(value:unknown):Row[]=>Array.isArray(value)?value as Row[]:[]
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})
const dateKey=(value:unknown)=>String(value||'').slice(0,10)
const uid=(prefix:string)=>`${prefix}-${crypto.randomUUID()}`
const naturalDate=(key:string,today:string)=>{if(!key)return'Sem data';if(key===today)return'Hoje';const base=new Date(`${today}T12:00:00`);const target=new Date(`${key}T12:00:00`);const diff=Math.round((target.getTime()-base.getTime())/86400000);if(diff===1)return'Amanhã';return target.toLocaleDateString('pt-BR',{day:'numeric',month:'long'})}

export function FinanceV4({state,today,commit,createRequest,inspect}:{state:MaiState;today:string;commit:Commit;createRequest?:string;inspect:(item:InspectableItem)=>void}){
  const savedTabs=state.configs.areaTabs&&typeof state.configs.areaTabs==='object'?state.configs.areaTabs as Record<string,string>:{}
  const tab=['overview','transactions','accounts','cards'].includes(savedTabs.finance)?savedTabs.finance:'overview'
  const finance=state.finance||{}
  const tx=rows(finance.transactions)
  const accounts=rows(finance.accounts)
  const cards=rows(finance.cards)
  const month=today.slice(0,7)
  const monthEnd=(()=>{const [y,m]=month.split('-').map(Number);return `${y}-${String(m).padStart(2,'0')}-${String(new Date(y,m,0).getDate()).padStart(2,'0')}`})()
  const monthTx=tx.filter(item=>dateKey(item.data).slice(0,7)===month)
  const signed=(item:Row,value:number)=>item.tipo==='receita'?value:-value
  const paid=(item:Row)=>Number(item.valor_pago||0)||(item.status==='pago'?Number(item.valor||0):0)
  const initial=accounts.reduce((sum,item)=>sum+Number(item.saldo_inicial||0),0)
  const balance=initial+tx.filter(item=>!item.ignorar_calculo).reduce((sum,item)=>sum+signed(item,paid(item)),0)
  const futureBalance=initial+tx.filter(item=>!item.ignorar_calculo&&(!dateKey(item.data)||dateKey(item.data)<=monthEnd)).reduce((sum,item)=>sum+signed(item,Number(item.valor||0)),0)
  const income=monthTx.filter(item=>item.tipo==='receita'&&!item.ignorar_calculo).reduce((sum,item)=>sum+Number(item.valor||0),0)
  const expense=monthTx.filter(item=>item.tipo!=='receita'&&!item.ignorar_calculo).reduce((sum,item)=>sum+Number(item.valor||0),0)
  const savings=income-expense
  const invoice=cards.reduce((sum,card)=>sum+monthTx.filter(item=>String(item.conta_id||'')===`card|${card.id}`||String(item.cartao_id||'')===String(card.id)).reduce((subtotal,item)=>subtotal+Number(item.valor||0),0),0)
  const [draft,setDraft]=useState<Row|null>(null)
  const [createTool,setCreateTool]=useState('')
  useEffect(()=>{if(createRequest?.startsWith('finance:')){setDraft({id:uid('fin'),titulo:'',observacao:'',valor:0,tipo:'despesa',data:today,status:'pendente',categoria:'',conta_id:'',_persisted:false});setCreateTool('')}},[createRequest,today])
  const setTab=(next:string)=>commit(current=>({...current,configs:{...current.configs,areaTabs:{...(current.configs.areaTabs&&typeof current.configs.areaTabs==='object'?current.configs.areaTabs as Record<string,string>:{}),finance:next}}}))

  function persistDraft(snapshot:Row){
    if(!String(snapshot.titulo||'').trim())return
    const {_persisted:_ignored,...clean}=snapshot
    const next={...clean,id:clean.id||uid('fin'),titulo:String(clean.titulo).trim(),valor:Number(clean.valor||0),valor_pago:clean.status==='pago'?Number(clean.valor||0):Number(clean.valor_pago||0)}
    commit(current=>({...current,finance:{...current.finance,transactions:rows(current.finance.transactions).some(item=>String(item.id)===String(next.id))?rows(current.finance.transactions).map(item=>String(item.id)===String(next.id)?next:item):[next,...rows(current.finance.transactions)]}}))
    if(snapshot._persisted===false)setDraft(current=>current&&String(current.id)===String(next.id)?{...current,_persisted:true}:current)
  }

  useAutosaveDraft({value:draft,identity:String(draft?.id||''),enabled:Boolean(draft),save:persistDraft})

  const recent=[...tx].sort((a,b)=>String(b.data||'').localeCompare(String(a.data||''))).slice(0,8)
  const open=(item:Row)=>inspect({kind:'finance',sourceId:String(item.id),title:String(item.titulo||item.descricao||'Lançamento'),date:dateKey(item.data),raw:item})
  const row=(item:Row)=>{const incomeItem=item.tipo==='receita';return <button key={String(item.id)} className="mai-today-unified-row mai-item-row-v2 mai-v4-finance-item" onClick={()=>open(item)}><i className="mai-today-unified-dot" style={{borderColor:incomeItem?'var(--mai-success, #5d8a68)':'var(--mai-danger, #c85b52)'}}/><span className="mai-item-copy-v2"><span className="mai-item-titleline-v2"><strong>{String(item.titulo||item.descricao||'Lançamento')}</strong></span><span className="mai-item-subline-v2"><span>{naturalDate(dateKey(item.data),today)}</span><span>·</span><span>{incomeItem?'+':'−'} {money.format(Number(item.valor||0))}</span></span></span></button>}
  const accountSummary=(()=>{if(!draft?.conta_id)return'Não selecionado';const id=String(draft.conta_id);if(id.startsWith('card|'))return String(cards.find(card=>String(card.id)===id.slice(5))?.nome||'Cartão');return String(accounts.find(account=>String(account.id)===id)?.nome||'Conta')})()

  return <div className="mai-v3-area-page mai-v4-finance">
    <header className="mai-v3-area-header"><div><h1>Finanças</h1><p>Saldo, projeção e resultado do período no mesmo resumo.</p></div><div className="mai-v3-area-actions"><button title="Ferramentas avançadas" aria-label="Ferramentas avançadas" onClick={()=>commit(current=>({...current,configs:{...current.configs,advancedAreas:{...(current.configs.advancedAreas&&typeof current.configs.advancedAreas==='object'?current.configs.advancedAreas as Record<string,boolean>:{}),finance:true}}}))}><span className="material-symbols-rounded">more_horiz</span></button></div></header>
    <div className="mai-v3-area-tabs">{[{id:'overview',label:'Visão geral'},{id:'transactions',label:'Lançamentos'},{id:'accounts',label:'Contas'},{id:'cards',label:'Cartões'}].map(item=><button key={item.id} data-active={tab===item.id} onClick={()=>setTab(item.id)}>{item.label}</button>)}</div>

    {tab==='overview'?<><div className="mai-v3-finance-summary mai-v4-finance-summary">
      <article><span>Saldo atual</span><strong>{money.format(balance)}</strong></article>
      <article><span>Saldo futuro</span><strong>{money.format(futureBalance)}</strong><small>até {new Date(`${monthEnd}T12:00:00`).toLocaleDateString('pt-BR',{day:'numeric',month:'short'})}</small></article>
      <article><span>Economia</span><strong data-positive={savings>=0}>{money.format(savings)}</strong><small>receitas − despesas</small></article>
      <article><span>Receitas do mês</span><strong>{money.format(income)}</strong></article>
      <article><span>Despesas do mês</span><strong>{money.format(expense)}</strong></article>
      <article><span>Fatura atual</span><strong>{money.format(invoice)}</strong></article>
    </div><section className="mai-v3-simple-section"><h2>Últimos lançamentos</h2><div className="mai-v3-finance-rows mai-v3-simple-list">{recent.map(row)}</div></section></>:null}

    {tab==='transactions'?<section className="mai-v3-simple-section"><div className="mai-v3-finance-rows mai-v3-simple-list">{[...tx].sort((a,b)=>String(b.data||'').localeCompare(String(a.data||''))).map(row)}</div></section>:null}
    {tab==='accounts'?<section className="mai-v3-simple-section"><div className="mai-v3-account-list">{accounts.map(account=><article key={String(account.id)}><i style={{background:account.cor||'var(--v3-accent)'}}/><div><strong>{account.nome}</strong><small>Saldo inicial {money.format(Number(account.saldo_inicial||0))}</small></div></article>)}</div></section>:null}
    {tab==='cards'?<section className="mai-v3-simple-section"><div className="mai-v3-card-list">{cards.map(card=><article key={String(card.id)}><div><strong>{card.nome}</strong><small>Vence dia {card.vencimento||'—'}</small></div><b>Limite {money.format(Number(card.limite||0))}</b></article>)}</div></section>:null}

    {draft?<div className="mai-v3-create-layer" onMouseDown={()=>setDraft(null)}><form className="mai-v3-create-drawer" onSubmit={e=>e.preventDefault()} onMouseDown={e=>e.stopPropagation()}><header className="mai-v3-drawer-header"><strong>Novo lançamento</strong><button type="button" className="mai-v3-close" onClick={()=>setDraft(null)}>×</button></header><div className="mai-v3-drawer-body mai-create-unified-body" onMouseDown={()=>createTool&&setCreateTool('')}><input className="mai-v3-title-input" autoFocus value={draft.titulo||''} placeholder="Nome do lançamento" onMouseDown={e=>e.stopPropagation()} onChange={e=>setDraft({...draft,titulo:e.target.value})}/><textarea className="mai-v3-description-input mai-create-unified-description" rows={2} value={draft.observacao||''} placeholder="Descrição" onMouseDown={e=>e.stopPropagation()} onChange={e=>setDraft({...draft,observacao:e.target.value})}/><div className="mai-task-v4-toolbar mai-context-unified-tools mai-create-unified-tools" onMouseDown={e=>e.stopPropagation()}>
      <CreateTool id="finance-date" icon="calendar_today" label="Data" summary={createNaturalDate(dateKey(draft.data),today)} color="#4f7cac" open={createTool} setOpen={setCreateTool}><CreateCalendarPicker value={dateKey(draft.data)} today={today} onChange={value=>setDraft({...draft,data:value})} close={()=>setCreateTool('')}/></CreateTool>
      <CreateTool id="finance-value" icon="payments" label="Valor" summary={money.format(Number(draft.valor||0))} color="#4b8b6c" open={createTool} setOpen={setCreateTool}><CreateNumberEditor value={Number(draft.valor||0)} onChange={value=>setDraft({...draft,valor:value})}/></CreateTool>
      <CreateTool id="finance-type" icon={draft.tipo==='receita'?'arrow_downward':'arrow_upward'} label="Tipo" summary={draft.tipo==='receita'?'Receita':'Despesa'} color={draft.tipo==='receita'?'#4b8b6c':'#c85b52'} open={createTool} setOpen={setCreateTool}><CreateOptionList value={String(draft.tipo||'despesa')} onChange={value=>setDraft({...draft,tipo:value})} close={()=>setCreateTool('')} options={[{value:'despesa',label:'Despesa',icon:'arrow_upward'},{value:'receita',label:'Receita',icon:'arrow_downward'}]}/></CreateTool>
      <CreateTool id="finance-status" icon="task_alt" label="Status" summary={String(draft.status||'pendente')==='pago'?'Pago':'Pendente'} color="#5779a6" open={createTool} setOpen={setCreateTool}><CreateOptionList value={String(draft.status||'pendente')} onChange={value=>setDraft({...draft,status:value})} close={()=>setCreateTool('')} options={[{value:'pendente',label:'Pendente',icon:'schedule'},{value:'pago',label:'Pago',icon:'check_circle'}]}/></CreateTool>
      <CreateTool id="finance-category" icon="sell" label="Categoria" summary={String(draft.categoria||'Não selecionado')} color="#b27a35" open={createTool} setOpen={setCreateTool}><CreateTextEditor value={String(draft.categoria||'')} placeholder="Adicionar categoria" onChange={value=>setDraft({...draft,categoria:value})}/></CreateTool>
      <CreateTool id="finance-account" icon="account_balance_wallet" label="Conta" summary={accountSummary} color="#75808b" open={createTool} setOpen={setCreateTool}><CreateOptionList value={String(draft.conta_id||'')} onChange={value=>setDraft({...draft,conta_id:value})} close={()=>setCreateTool('')} options={[{value:'',label:'Sem conta',icon:'remove_circle'},...accounts.map(account=>({value:String(account.id),label:String(account.nome||'Conta'),icon:'account_balance'})),...cards.map(card=>({value:`card|${String(card.id)}`,label:String(card.nome||'Cartão'),icon:'credit_card'}))]}/></CreateTool>
    </div></div><footer className="mai-v3-drawer-footer"><span/><span className="mai-autosave-status">Alterações salvas automaticamente</span></footer></form></div>:null}
  </div>
}
