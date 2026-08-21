'use client'

import { FormEvent, useEffect, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'

type Row=Record<string,any>
type Commit=(change:(current:MaiState)=>MaiState)=>void
const rows=(value:unknown):Row[]=>Array.isArray(value)?value as Row[]:[]
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})
const dateKey=(value:unknown)=>String(value||'').slice(0,10)
const uid=(prefix:string)=>`${prefix}-${crypto.randomUUID()}`

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
  useEffect(()=>{if(createRequest?.startsWith('finance:'))setDraft({titulo:'',valor:0,tipo:'despesa',data:today,status:'pendente',categoria:'',conta_id:''})},[createRequest])
  const setTab=(next:string)=>commit(current=>({...current,configs:{...current.configs,areaTabs:{...(current.configs.areaTabs&&typeof current.configs.areaTabs==='object'?current.configs.areaTabs as Record<string,string>:{}),finance:next}}}))
  function save(e:FormEvent){e.preventDefault();if(!draft||!String(draft.titulo||'').trim())return;const next={...draft,id:draft.id||uid('fin'),titulo:String(draft.titulo).trim(),valor:Number(draft.valor||0),valor_pago:draft.status==='pago'?Number(draft.valor||0):Number(draft.valor_pago||0)};commit(current=>({...current,finance:{...current.finance,transactions:rows(current.finance.transactions).some(item=>String(item.id)===String(next.id))?rows(current.finance.transactions).map(item=>String(item.id)===String(next.id)?next:item):[next,...rows(current.finance.transactions)]}}));setDraft(null)}
  const recent=[...tx].sort((a,b)=>String(b.data||'').localeCompare(String(a.data||''))).slice(0,8)
  const open=(item:Row)=>inspect({kind:'finance',sourceId:String(item.id),title:String(item.titulo||'Lançamento'),date:dateKey(item.data),raw:item})

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
    </div><section className="mai-v3-simple-section"><h2>Últimos lançamentos</h2><div className="mai-v3-finance-rows">{recent.map(item=><button key={String(item.id)} onClick={()=>open(item)}><span><strong>{item.titulo}</strong><small>{item.categoria||'Sem categoria'} · {dateKey(item.data)?new Date(`${dateKey(item.data)}T12:00:00`).toLocaleDateString('pt-BR',{day:'numeric',month:'short'}):'Sem data'}</small></span><b data-income={item.tipo==='receita'}>{item.tipo==='receita'?'+':'−'} {money.format(Number(item.valor||0))}</b></button>)}</div></section></>:null}

    {tab==='transactions'?<section className="mai-v3-simple-section"><div className="mai-v3-finance-rows">{[...tx].sort((a,b)=>String(b.data||'').localeCompare(String(a.data||''))).map(item=><button key={String(item.id)} onClick={()=>open(item)}><span><strong>{item.titulo}</strong><small>{dateKey(item.data)||'Sem data'} · {item.categoria||'Sem categoria'}</small></span><b data-income={item.tipo==='receita'}>{item.tipo==='receita'?'+':'−'} {money.format(Number(item.valor||0))}</b></button>)}</div></section>:null}
    {tab==='accounts'?<section className="mai-v3-simple-section"><div className="mai-v3-account-list">{accounts.map(account=><article key={String(account.id)}><i style={{background:account.cor||'var(--v3-accent)'}}/><div><strong>{account.nome}</strong><small>Saldo inicial {money.format(Number(account.saldo_inicial||0))}</small></div></article>)}</div></section>:null}
    {tab==='cards'?<section className="mai-v3-simple-section"><div className="mai-v3-card-list">{cards.map(card=><article key={String(card.id)}><div><strong>{card.nome}</strong><small>Vence dia {card.vencimento||'—'}</small></div><b>Limite {money.format(Number(card.limite||0))}</b></article>)}</div></section>:null}

    {draft?<div className="mai-v3-create-layer" onMouseDown={()=>setDraft(null)}><form className="mai-v3-create-drawer" onSubmit={save} onMouseDown={e=>e.stopPropagation()}><header className="mai-v3-drawer-header"><strong>Novo lançamento</strong><button type="button" className="mai-v3-close" onClick={()=>setDraft(null)}>×</button></header><div className="mai-v3-drawer-body"><input className="mai-v3-title-input" autoFocus value={draft.titulo||''} placeholder="Descrição" onChange={e=>setDraft({...draft,titulo:e.target.value})}/><label className="mai-v3-field-line"><span>Valor</span><input type="number" step="0.01" value={draft.valor||0} onChange={e=>setDraft({...draft,valor:Number(e.target.value)})}/></label><label className="mai-v3-field-line"><span>Tipo</span><select value={draft.tipo||'despesa'} onChange={e=>setDraft({...draft,tipo:e.target.value})}><option value="despesa">Despesa</option><option value="receita">Receita</option></select></label><label className="mai-v3-field-line"><span>Data</span><input type="date" value={dateKey(draft.data)||today} onChange={e=>setDraft({...draft,data:e.target.value})}/></label><label className="mai-v3-field-line"><span>Status</span><select value={draft.status||'pendente'} onChange={e=>setDraft({...draft,status:e.target.value})}><option value="pendente">Pendente</option><option value="pago">Pago</option></select></label></div><footer className="mai-v3-drawer-footer"><button type="button" className="mai-v3-secondary" onClick={()=>setDraft(null)}>Cancelar</button><button className="mai-v3-primary">Salvar</button></footer></form></div>:null}
  </div>
}
