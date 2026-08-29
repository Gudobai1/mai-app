'use client'

import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { CreateTool } from './CreateDrawerTools'
import { MaiIcon } from './MaiIcons'

type Row = Record<string, any>
type PaymentState = { paid: number; remaining: number; status: string } | null

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dateKey = (value: unknown) => String(value || '').slice(0, 10)
const clampMoney = (value: unknown) => Math.max(0, Number(value || 0) || 0)

function naturalDate(key: string, today: string) {
  if (!key) return 'Sem data'
  if (key === today) return 'Hoje'
  return new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
}

const recurrenceLabel = (draft: Row) => draft.lote_id
  ? `Parcela ${draft.parcela_numero || 1}/${draft.parcelas_total || 1}`
  : draft.recorrencia === 'fixo' ? 'Fixo mensal' : draft.recorrencia === 'parcelado' ? 'Parcelado' : 'Único'

export function FinanceTransactionExtraTools({
  draft,
  setDraft,
  today,
  month,
  open,
  setOpen,
  draftPayment,
  addPayment: _legacyAddPayment,
  removePayment,
  generateInstallments,
  editFixedOccurrence,
  ignoreFixed,
}: {
  draft: Row
  setDraft: Dispatch<SetStateAction<Row | null>>
  today: string
  month: string
  open: string
  setOpen: (id: string) => void
  draftPayment: PaymentState
  addPayment: () => void
  removePayment: (index: number) => void
  generateInstallments: () => void
  editFixedOccurrence: () => void
  ignoreFixed: () => void
}) {
  const payments = rows(draft.pagamentos)
  const hiddenFromHome = draft.ocultar_inicio === true || draft.ocultar_home === true
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(today)
  const paymentSummary = draftPayment
    ? draftPayment.status === 'pago' ? 'Quitado' : draftPayment.paid > 0 ? `${money.format(draftPayment.remaining)} restante` : 'Sem pagamentos'
    : 'Sem pagamentos'

  const patch = (value: Row) => setDraft(current => current ? { ...current, ...value } : current)

  function appendPayment() {
    const remaining = Math.max(0, Number(draftPayment?.remaining || 0))
    const amount = paymentAmount.trim() ? Number(paymentAmount.replace(',', '.')) : remaining
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining + 0.005 || !paymentDate) return
    const nextPayments = [...payments, { id: `pay-${crypto.randomUUID()}`, data: paymentDate, valor: amount, criado_em: new Date().toISOString() }]
    const total = clampMoney(draft.valor)
    const paid = Math.min(total, nextPayments.reduce((sum, payment) => sum + clampMoney(payment.valor), 0))
    patch({ pagamentos: nextPayments, valor_pago: paid, status: total > 0 && paid >= total ? 'pago' : paid > 0 ? 'parcial' : 'pendente' })
    setPaymentAmount('')
  }

  void _legacyAddPayment

  return <>
    <CreateTool id="finance-recurrence" icon="repeat" label="Forma" summary={recurrenceLabel(draft)} color="#7b6f9d" open={open} setOpen={setOpen}>
      <div className="mai-task-v4-option-list">
        {!draft.lote_id ? <>
          <button type="button" data-selected={draft.recorrencia === 'unico' || undefined} onClick={() => patch({ recorrencia: 'unico', _isFixed: false })}><MaiIcon name="looks_one" size={18}/><span>Único</span>{draft.recorrencia === 'unico' ? <MaiIcon name="check" size={18}/> : <span/>}</button>
          <button type="button" data-selected={draft.recorrencia === 'parcelado' || undefined} onClick={() => patch({ recorrencia: 'parcelado', _isFixed: false })}><MaiIcon name="splitscreen" size={18}/><span>Parcelado</span>{draft.recorrencia === 'parcelado' ? <MaiIcon name="check" size={18}/> : <span/>}</button>
          <button type="button" data-selected={draft.recorrencia === 'fixo' || undefined} onClick={() => patch({ recorrencia: 'fixo', _isFixed: true })}><MaiIcon name="event_repeat" size={18}/><span>Fixo mensal</span>{draft.recorrencia === 'fixo' ? <MaiIcon name="check" size={18}/> : <span/>}</button>
        </> : <div className="mai-finance-tool-note"><MaiIcon name="splitscreen" size={18}/><span>Este lançamento já faz parte de um parcelamento.</span></div>}
      </div>
    </CreateTool>

    {draft.recorrencia === 'parcelado' && !draft.lote_id ? <CreateTool id="finance-installments" icon="splitscreen" label="Parcelamento" summary={`${Math.max(2, Number(draft.parcelas || 2))}x · ${String(draft.intervalo_parcelas || 'mensal')}`} color="#87725e" open={open} setOpen={setOpen}>
      <div className="mai-finance-tool-grid">
        <label><span>Parcelas</span><input type="number" min="2" value={draft.parcelas || 2} onChange={event => patch({ parcelas: Number(event.target.value) })}/></label>
        <label><span>Intervalo</span><select value={draft.intervalo_parcelas || 'mensal'} onChange={event => patch({ intervalo_parcelas: event.target.value })}><option value="semanal">Semanal</option><option value="quinzenal">Quinzenal</option><option value="mensal">Mensal</option><option value="anual">Anual</option></select></label>
        <button type="button" className="mai-finance-tool-switch" data-active={draft.dividir_total !== false} onClick={() => patch({ dividir_total: draft.dividir_total === false })}><MaiIcon name={draft.dividir_total !== false ? 'check_box' : 'check_box_outline_blank'} size={18}/><span>Dividir valor total</span></button>
        <button type="button" className="mai-finance-tool-primary" onClick={() => { generateInstallments(); setOpen('') }}><MaiIcon name="splitscreen" size={18}/><span>Gerar parcelas</span></button>
      </div>
    </CreateTool> : null}

    {draft.recorrencia === 'fixo' ? <CreateTool id="finance-fixed" icon="event_repeat" label="Recorrência" summary={`Dia ${draft.dia_mes || Number(today.slice(8))}`} color="#66806c" open={open} setOpen={setOpen}>
      <div className="mai-finance-tool-grid">
        <label><span>Dia do mês</span><input type="number" min="1" max="31" value={draft.dia_mes || Number(today.slice(8))} onChange={event => patch({ dia_mes: Number(event.target.value) })}/></label>
        <label><span>Início</span><input type="month" value={String(draft.mes_inicio || month).slice(0, 7)} onChange={event => patch({ mes_inicio: event.target.value })}/></label>
        <label><span>Fim opcional</span><input type="month" value={String(draft.mes_fim || '').slice(0, 7)} onChange={event => patch({ mes_fim: event.target.value })}/></label>
        <button type="button" className="mai-finance-tool-switch" data-active={draft.ativo !== false} onClick={() => patch({ ativo: draft.ativo === false })}><MaiIcon name={draft.ativo !== false ? 'toggle_on' : 'toggle_off'} size={20}/><span>{draft.ativo !== false ? 'Ativo' : 'Pausado'}</span></button>
        {draft._persisted ? <><button type="button" className="mai-finance-tool-action" onClick={editFixedOccurrence}><MaiIcon name="edit_calendar" size={18}/><span>Alterar somente este mês</span></button><button type="button" className="mai-finance-tool-action" onClick={ignoreFixed}><MaiIcon name="event_busy" size={18}/><span>Ignorar neste mês</span></button></> : null}
      </div>
    </CreateTool> : null}

    <CreateTool id="finance-payments" icon="account_balance_wallet" label="Pagamentos" summary={paymentSummary} color="#4f7f75" open={open} setOpen={setOpen}>
      <div className="mai-finance-tool-payments">
        <div className="mai-finance-tool-payment-summary"><span>Pago</span><strong>{money.format(draftPayment?.paid || 0)}</strong><span>Restante</span><strong>{money.format(draftPayment?.remaining || 0)}</strong></div>
        {draftPayment && draftPayment.remaining > 0 ? <div className="mai-finance-tool-payment-entry"><label><span>Valor</span><input inputMode="decimal" placeholder={draftPayment.remaining.toFixed(2).replace('.', ',')} value={paymentAmount} onChange={event => setPaymentAmount(event.target.value)}/></label><label><span>Data</span><input type="date" value={paymentDate} onChange={event => setPaymentDate(event.target.value)}/></label><button type="button" className="mai-finance-tool-primary" onClick={appendPayment}><MaiIcon name="add" size={18}/><span>Registrar</span></button></div> : <div className="mai-finance-tool-note"><MaiIcon name="check_circle" size={18}/><span>Lançamento quitado.</span></div>}
        <div className="mai-finance-tool-payment-list">{payments.map((payment, index) => <div key={String(payment.id || index)}><span>{naturalDate(dateKey(payment.data), today)}</span><strong>{money.format(clampMoney(payment.valor))}</strong><button type="button" title="Remover pagamento" onClick={() => removePayment(index)}><MaiIcon name="close" size={16}/></button></div>)}{!payments.length ? <small>Nenhum pagamento registrado.</small> : null}</div>
      </div>
    </CreateTool>

    <CreateTool id="finance-home-visibility" icon={hiddenFromHome ? 'visibility_off' : 'visibility'} label="Tela inicial" summary={hiddenFromHome ? 'Oculto' : 'Visível'} color="#75808b" open={open} setOpen={setOpen}>
      <div className="mai-task-v4-option-list">
        <button type="button" data-selected={!hiddenFromHome || undefined} onClick={() => { patch({ ocultar_inicio: false, ocultar_home: false }); setOpen('') }}><MaiIcon name="visibility" size={18}/><span>Mostrar na tela inicial</span>{!hiddenFromHome ? <MaiIcon name="check" size={18}/> : <span/>}</button>
        <button type="button" data-selected={hiddenFromHome || undefined} onClick={() => { patch({ ocultar_inicio: true, ocultar_home: false }); setOpen('') }}><MaiIcon name="visibility_off" size={18}/><span>Ocultar da tela inicial</span>{hiddenFromHome ? <MaiIcon name="check" size={18}/> : <span/>}</button>
      </div>
    </CreateTool>
  </>
}
