'use client'

import { useEffect, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import { CreateCalendarPicker, CreateNumberEditor, CreateOptionList, CreateTool, createNaturalDate } from './CreateDrawerTools'
import { FinanceTransactionExtraTools } from './FinanceTransactionExtraTools'
import { ItemAttachments } from './ItemAttachments'
import { MaiIcon } from './MaiIcons'
import { useAutosaveDraft } from './useAutosaveDraft'

type Row = Record<string, any>
type Commit = (change: (current: MaiState) => MaiState) => void

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dateKey = (value: unknown) => String(value || '').slice(0, 10)
const clampMoney = (value: unknown) => Math.max(0, Number(value || 0) || 0)
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`

function cleanPayments(value: unknown, fallbackDate = '') {
  return rows(value).map((payment, index) => ({
    ...payment,
    id: String(payment.id || `payment-${index}`),
    data: dateKey(payment.data) || fallbackDate,
    valor: clampMoney(payment.valor),
  })).filter(payment => payment.valor > 0)
}

function paymentState(item: Row) {
  const total = clampMoney(item.valor)
  const payments = cleanPayments(item.pagamentos, dateKey(item.data))
  if (payments.length) {
    const paid = Math.min(total, payments.reduce((sum, payment) => sum + clampMoney(payment.valor), 0))
    return { paid, remaining: Math.max(0, total - paid), status: total > 0 && paid >= total ? 'pago' : paid > 0 ? 'parcial' : 'pendente' }
  }
  const paid = Math.min(total, clampMoney(item.valor_pago) || (item.status === 'pago' ? total : 0))
  return { paid, remaining: Math.max(0, total - paid), status: total > 0 && paid >= total ? 'pago' : paid > 0 ? 'parcial' : 'pendente' }
}

function originName(value: unknown, accounts: Row[], cards: Row[]) {
  const id = String(value || '')
  if (!id) return 'Sem origem'
  if (id.startsWith('card|')) return String(cards.find(card => String(card.id) === id.slice(5))?.nome || 'Cartão')
  return String(accounts.find(account => String(account.id) === id)?.nome || 'Conta')
}

function moveDateForInstallment(key: string, index: number, interval: string) {
  const date = new Date(`${key}T12:00:00`)
  if (interval === 'semanal') date.setDate(date.getDate() + index * 7)
  else if (interval === 'quinzenal') date.setDate(date.getDate() + index * 15)
  else if (interval === 'anual') date.setFullYear(date.getFullYear() + index)
  else date.setMonth(date.getMonth() + index)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function FinanceContextDrawerV4({ item, state, today, commit, onClose }: {
  item: InspectableItem | null
  state: MaiState
  today: string
  commit: Commit
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Row | null>(null)
  const [openTool, setOpenTool] = useState('')
  const [categoryDraftName, setCategoryDraftName] = useState('')
  const month = today.slice(0, 7)
  const finance = state.finance || {}
  const accounts = rows(finance.accounts)
  const cards = rows(finance.cards)
  const categories = rows(finance.categories)

  useEffect(() => {
    if (!item || item.kind !== 'finance') { setDraft(null); return }
    const regular = rows(state.finance.transactions).find(row => String(row.id) === item.sourceId)
    const fixed = rows(state.finance.fixed).find(row => String(row.id) === item.sourceId || String(row.id) === String(item.raw.fixo_id || ''))
    const source = regular || fixed || item.raw
    setDraft({
      ...source,
      id: String(source.id || item.sourceId),
      titulo: String(source.titulo || item.title || ''),
      observacao: String(source.observacao || source.descricao || ''),
      data: dateKey(source.data) || item.date || today,
      recorrencia: fixed ? 'fixo' : String(source.recorrencia || 'unico'),
      dia_mes: Number(source.dia_mes || dateKey(source.data).slice(8) || today.slice(8)),
      mes_inicio: String(source.mes_inicio || dateKey(source.data).slice(0, 7) || month),
      mes_fim: String(source.mes_fim || ''),
      pagamentos: cleanPayments(source.pagamentos, dateKey(source.data) || today),
      anexos: rows(source.anexos),
      _persisted: true,
      _isFixed: Boolean(fixed),
    })
    setOpenTool('')
    setCategoryDraftName('')
  }, [item?.kind, item?.sourceId])

  function persistDraft(snapshot: Row) {
    const title = String(snapshot.titulo || '').trim()
    if (!title) return
    const { _persisted: _persisted, _isFixed: _isFixed, occurrenceKey: _occurrenceKey, ...clean } = snapshot
    void _persisted; void _isFixed; void _occurrenceKey
    commit(current => {
      const nextFinance = { ...(current.finance || {}) } as Row
      const recurring = String(clean.recorrencia || 'unico')
      if (recurring === 'fixo') {
        const value = clampMoney(clean.valor)
        const payments = cleanPayments(clean.pagamentos, dateKey(clean.data) || today)
        const paid = Math.min(value, payments.length ? payments.reduce((sum, payment) => sum + clampMoney(payment.valor), 0) : clampMoney(clean.valor_pago))
        const status = value > 0 && paid >= value ? 'pago' : paid > 0 ? 'parcial' : 'pendente'
        const fixedRule: Row = {
          ...clean,
          id: String(clean.id),
          titulo: title,
          valor: value,
          dia_mes: Math.min(31, Math.max(1, Number(clean.dia_mes || Number(dateKey(clean.data).slice(8)) || 1))),
          mes_inicio: String(clean.mes_inicio || dateKey(clean.data).slice(0, 7) || month),
          mes_fim: String(clean.mes_fim || ''),
          anexos: rows(clean.anexos),
          ativo: clean.ativo !== false,
          recorrencia: 'fixo',
        }
        delete fixedRule.status; delete fixedRule.valor_pago; delete fixedRule.pagamentos; delete fixedRule.parcelas; delete fixedRule.intervalo_parcelas; delete fixedRule.dividir_total; delete fixedRule.cartao_id
        nextFinance.transactions = rows(nextFinance.transactions).filter(row => String(row.id) !== String(clean.id))
        const fixedList = rows(nextFinance.fixed)
        nextFinance.fixed = fixedList.some(row => String(row.id) === String(clean.id)) ? fixedList.map(row => String(row.id) === String(clean.id) ? fixedRule : row) : [fixedRule, ...fixedList]
        const occurrenceKey = `${clean.id}|${month}`
        const occurrence = { chave: occurrenceKey, fixo_id: clean.id, competencia: month, status, valor_pago: paid, pagamentos: payments, atualizado_em: new Date().toISOString() }
        const occurrenceList = rows(nextFinance.fixedOccurrences)
        nextFinance.fixedOccurrences = occurrenceList.some(row => String(row.chave) === occurrenceKey) ? occurrenceList.map(row => String(row.chave) === occurrenceKey ? { ...row, ...occurrence } : row) : [...occurrenceList, occurrence]
      } else {
        const value = clampMoney(clean.valor)
        const payments = cleanPayments(clean.pagamentos, dateKey(clean.data) || today)
        let paid = payments.length ? Math.min(value, payments.reduce((sum, payment) => sum + clampMoney(payment.valor), 0)) : Math.min(value, clampMoney(clean.valor_pago))
        if (clean.status === 'pago' && !payments.length) paid = value
        if (clean.status === 'pendente' && !payments.length) paid = 0
        const status = value > 0 && paid >= value ? 'pago' : paid > 0 ? 'parcial' : 'pendente'
        const accountId = String(clean.conta_id || '')
        const next: Row = { ...clean, titulo: title, valor: value, valor_pago: paid, status, pagamentos: payments, anexos: rows(clean.anexos), cartao_id: accountId.startsWith('card|') ? accountId.slice(5) : '', recorrencia: recurring }
        delete next.dia_mes; delete next.mes_inicio; delete next.mes_fim; delete next.ativo
        nextFinance.fixed = rows(nextFinance.fixed).filter(row => String(row.id) !== String(clean.id))
        nextFinance.fixedOccurrences = rows(nextFinance.fixedOccurrences).filter(row => String(row.fixo_id) !== String(clean.id))
        const list = rows(nextFinance.transactions)
        nextFinance.transactions = list.some(row => String(row.id) === String(next.id)) ? list.map(row => String(row.id) === String(next.id) ? next : row) : [next, ...list]
      }
      return { ...current, finance: nextFinance }
    })
  }

  useAutosaveDraft({ value: draft, identity: `finance-context:${String(draft?.id || '')}`, enabled: Boolean(draft), save: persistDraft, delay: 220 })

  if (!item || item.kind !== 'finance' || !draft) return null

  const draftPayment = paymentState(draft)
  const accountSummary = originName(draft.conta_id, accounts, cards)

  function setPaymentStatus(value: string) {
    if (value === 'pendente') { setDraft({ ...draft, status: 'pendente', valor_pago: 0, pagamentos: [] }); return }
    const total = clampMoney(draft.valor)
    if (!total) return
    const current = paymentState(draft)
    const existing = cleanPayments(draft.pagamentos, dateKey(draft.data))
    const payments = current.remaining > 0 ? [...existing, { id: uid('pay'), data: today, valor: current.remaining }] : existing
    setDraft({ ...draft, status: 'pago', valor_pago: total, pagamentos: payments })
  }

  function removePayment(index: number) {
    const payments = cleanPayments(draft.pagamentos, dateKey(draft.data)).filter((_, position) => position !== index)
    const paid = Math.min(clampMoney(draft.valor), payments.reduce((sum, payment) => sum + clampMoney(payment.valor), 0))
    const total = clampMoney(draft.valor)
    setDraft({ ...draft, pagamentos: payments, valor_pago: paid, status: total > 0 && paid >= total ? 'pago' : paid > 0 ? 'parcial' : 'pendente' })
  }

  function addCategory() {
    const name = categoryDraftName.trim()
    if (!name) return
    const existing = categories.find(category => String(category.nome || '').trim().toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))
    if (!existing) commit(current => ({ ...current, finance: { ...current.finance, categories: [...rows(current.finance.categories), { id: uid('cat'), nome: name }] } }))
    setDraft({ ...draft, categoria: existing ? String(existing.nome) : name })
    setCategoryDraftName('')
    setOpenTool('')
  }

  function generateInstallments() {
    if (draft.recorrencia !== 'parcelado' || !String(draft.titulo || '').trim()) return
    const quantity = Math.max(2, Number(draft.parcelas || 2))
    const lot = String(draft.lote_id || uid('lote'))
    const total = clampMoney(draft.valor)
    const installment = draft.dividir_total === false ? total : total / quantity
    const baseTitle = String(draft.titulo || '').replace(/\s+\(\d+\/\d+\)$/, '').trim()
    const generated = Array.from({ length: quantity }, (_, index) => ({
      ...draft,
      id: index === 0 ? String(draft.id) : uid('fin'),
      lote_id: lot,
      parcela_numero: index + 1,
      parcelas_total: quantity,
      titulo: `${baseTitle} (${index + 1}/${quantity})`,
      valor: installment,
      data: moveDateForInstallment(dateKey(draft.data) || today, index, String(draft.intervalo_parcelas || 'mensal')),
      status: index === 0 ? paymentState({ ...draft, valor: installment }).status : 'pendente',
      valor_pago: index === 0 ? Math.min(installment, draftPayment.paid) : 0,
      pagamentos: index === 0 ? cleanPayments(draft.pagamentos, dateKey(draft.data)) : [],
      recorrencia: 'unico',
      parcelas: undefined,
      intervalo_parcelas: undefined,
      dividir_total: undefined,
      dia_mes: undefined,
      mes_inicio: undefined,
      mes_fim: undefined,
      ativo: undefined,
      _persisted: undefined,
      _isFixed: undefined,
    }))
    commit(current => ({ ...current, finance: { ...current.finance, fixed: rows(current.finance.fixed).filter(row => String(row.id) !== String(draft.id)), fixedOccurrences: rows(current.finance.fixedOccurrences).filter(row => String(row.fixo_id) !== String(draft.id)), transactions: [...rows(current.finance.transactions).filter(row => String(row.id) !== String(draft.id) && String(row.lote_id || '') !== lot), ...generated] } }))
    setDraft({ ...generated[0], _persisted: true })
  }

  function removeDraft() {
    if (!confirm('Excluir este lançamento?')) return
    commit(current => ({ ...current, finance: { ...current.finance, transactions: rows(current.finance.transactions).filter(row => String(row.id) !== String(draft.id)), fixed: rows(current.finance.fixed).filter(row => String(row.id) !== String(draft.id)), fixedOccurrences: rows(current.finance.fixedOccurrences).filter(row => String(row.fixo_id) !== String(draft.id)) } }))
    onClose()
  }

  return <div className="mai-v3-create-layer" onMouseDown={onClose}>
    <form className="mai-v3-create-drawer mai-finance-v4-drawer mai-finance-v4-drawer-transaction" onSubmit={event => event.preventDefault()} onMouseDown={event => event.stopPropagation()}>
      <header className="mai-v3-drawer-header"><div><small>Salvamento automático</small><strong>Editar lançamento</strong></div><button type="button" className="mai-v3-close" onClick={onClose}>×</button></header>
      <div className="mai-v3-drawer-body mai-create-unified-body" onMouseDown={() => openTool && setOpenTool('')}>
        <input className="mai-v3-title-input" autoFocus value={draft.titulo || ''} placeholder="Nome do lançamento" onMouseDown={event => event.stopPropagation()} onChange={event => setDraft({ ...draft, titulo: event.target.value })}/>
        <textarea className="mai-v3-description-input mai-create-unified-description" rows={2} value={draft.observacao || ''} placeholder="Descrição" onMouseDown={event => event.stopPropagation()} onChange={event => setDraft({ ...draft, observacao: event.target.value })}/>
        <div className="mai-task-v4-toolbar mai-context-unified-tools mai-create-unified-tools mai-finance-v4-unified-tools" onMouseDown={event => event.stopPropagation()}>
          <CreateTool id="finance-date" icon="calendar_today" label="Data" summary={createNaturalDate(dateKey(draft.data), today)} color="#4f7cac" open={openTool} setOpen={setOpenTool}><CreateCalendarPicker value={dateKey(draft.data)} today={today} onChange={value => setDraft({ ...draft, data: value, dia_mes: Number(value.slice(8)), mes_inicio: draft.mes_inicio || value.slice(0, 7) })} close={() => setOpenTool('')}/></CreateTool>
          <CreateTool id="finance-value" icon="payments" label="Valor" summary={money.format(clampMoney(draft.valor))} color="#4b8b6c" open={openTool} setOpen={setOpenTool}><CreateNumberEditor value={clampMoney(draft.valor)} onChange={value => { const payments = cleanPayments(draft.pagamentos, dateKey(draft.data)); const paid = Math.min(value, payments.reduce((sum, payment) => sum + clampMoney(payment.valor), 0)); setDraft({ ...draft, valor: value, valor_pago: paid, status: value > 0 && paid >= value ? 'pago' : paid > 0 ? 'parcial' : 'pendente' }) }}/></CreateTool>
          <CreateTool id="finance-type" icon={draft.tipo === 'receita' ? 'arrow_downward' : 'arrow_upward'} label="Tipo" summary={draft.tipo === 'receita' ? 'Receita' : 'Despesa'} color={draft.tipo === 'receita' ? '#4b8b6c' : '#c85b52'} open={openTool} setOpen={setOpenTool}><CreateOptionList value={String(draft.tipo || 'despesa')} onChange={value => setDraft({ ...draft, tipo: value })} close={() => setOpenTool('')} options={[{ value:'despesa', label:'Despesa', icon:'arrow_upward' }, { value:'receita', label:'Receita', icon:'arrow_downward' }]}/></CreateTool>
          <CreateTool id="finance-status" icon="task_alt" label="Status" summary={draftPayment.status === 'pago' ? 'Pago' : draftPayment.status === 'parcial' ? 'Parcial' : 'Pendente'} color="#5779a6" open={openTool} setOpen={setOpenTool}><CreateOptionList value={draftPayment.status === 'pago' ? 'pago' : 'pendente'} onChange={setPaymentStatus} close={() => setOpenTool('')} options={[{ value:'pendente', label:'Pendente / zerar pagamentos', icon:'schedule' }, { value:'pago', label:'Pago integralmente', icon:'check_circle' }]}/></CreateTool>
          <CreateTool id="finance-category" icon="sell" label="Categoria" summary={String(draft.categoria || 'Não selecionado')} color="#b27a35" open={openTool} setOpen={setOpenTool}><div className="mai-finance-v4-category-picker"><CreateOptionList value={String(draft.categoria || '')} onChange={value => setDraft({ ...draft, categoria: value })} close={() => setOpenTool('')} options={[{ value:'', label:'Sem categoria', icon:'remove_circle' }, ...categories.map(category => ({ value:String(category.nome), label:String(category.nome), icon:'sell' }))]}/><div className="mai-finance-v4-category-create"><input value={categoryDraftName} onChange={event => setCategoryDraftName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addCategory() } }} placeholder="Nova categoria"/><button type="button" onClick={addCategory}>Adicionar</button></div></div></CreateTool>
          <CreateTool id="finance-account" icon="account_balance_wallet" label="Conta" summary={accountSummary} color="#75808b" open={openTool} setOpen={setOpenTool}><CreateOptionList value={String(draft.conta_id || '')} onChange={value => setDraft({ ...draft, conta_id: value })} close={() => setOpenTool('')} options={[{ value:'', label:'Sem origem', icon:'remove_circle' }, ...accounts.map(account => ({ value:String(account.id), label:String(account.nome || 'Conta'), icon:'account_balance' })), ...cards.map(card => ({ value:`card|${String(card.id)}`, label:String(card.nome || 'Cartão'), icon:'credit_card' }))]}/></CreateTool>
          <FinanceTransactionExtraTools draft={draft} setDraft={setDraft} today={today} month={month} open={openTool} setOpen={setOpenTool} draftPayment={draftPayment} addPayment={() => {}} removePayment={removePayment} generateInstallments={generateInstallments}/>
        </div>
        <ItemAttachments attachments={rows(draft.anexos)} onChange={anexos => setDraft({ ...draft, anexos })}/>
      </div>
      <footer className="mai-v3-drawer-footer"><div><button type="button" className="mai-finance-v4-delete" onClick={removeDraft}><MaiIcon name="delete" size={18}/>Excluir</button></div><span className="mai-autosave-status">Alterações salvas automaticamente</span></footer>
    </form>
  </div>
}
