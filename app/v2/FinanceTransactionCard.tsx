'use client'

import cs from './FinanceCards.module.css'
import { MaiIcon } from './MaiIcons'

type Row = Record<string, any>

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dateKey = (value: unknown) => String(value || '').slice(0, 10)
const clampMoney = (value: unknown) => Math.max(0, Number(value || 0) || 0)

function naturalDate(key: string, today: string) {
  if (!key) return 'Sem data'
  if (key === today) return 'Hoje'
  const base = new Date(`${today}T12:00:00`)
  const target = new Date(`${key}T12:00:00`)
  const diff = Math.round((target.getTime() - base.getTime()) / 86400000)
  if (diff === 1) return 'Amanhã'
  if (diff === -1) return 'Ontem'
  return target.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: target.getFullYear() !== base.getFullYear() ? 'numeric' : undefined })
}

function originName(value: unknown, accounts: Row[], cards: Row[]) {
  const id = String(value || '')
  if (!id) return 'Sem origem'
  if (id.startsWith('card|')) return String(cards.find(card => String(card.id) === id.slice(5))?.nome || 'Cartão')
  return String(accounts.find(account => String(account.id) === id)?.nome || 'Conta')
}

export function financeCardPaymentState(item: Row) {
  const total = clampMoney(item.valor)
  const payments = rows(item.pagamentos)
  const historyPaid = payments.reduce((sum, payment) => sum + clampMoney(payment.valor), 0)
  const legacyPaid = clampMoney(item.valor_pago) || (String(item.status || '') === 'pago' ? total : 0)
  const paid = Math.min(total, payments.length ? historyPaid : legacyPaid)
  const remaining = Math.max(0, total - paid)
  const status = total > 0 && paid >= total ? 'pago' : paid > 0 ? 'parcial' : 'pendente'
  return { total, paid, remaining, status }
}

export function FinanceTransactionCard({
  item,
  accounts,
  cards,
  today,
  onOpen,
  onTogglePaid,
  compact = false,
  color,
}: {
  item: Row
  accounts: Row[]
  cards: Row[]
  today: string
  onOpen: () => void
  onTogglePaid: () => void
  compact?: boolean
  color?: string
  categoryColor?: string
}) {
  const incomeItem = item.tipo === 'receita'
  const payment = financeCardPaymentState(item)
  const visibleValue = payment.status === 'parcial' ? payment.remaining : payment.total
  const title = String(item.titulo || item.descricao || item.nome || item.categoria || 'Lançamento')

  if (compact) {
    const due = dateKey(item.data)
    const paid = payment.status === 'pago'
    const tone = paid ? undefined : due && due < today ? 'late' : due === today ? 'today' : 'future'
    const repeatLabel = item.ajuste_fatura ? 'Fatura' : item._isFixed ? 'Todo mês' : item.lote_id ? `${item.parcela_numero}/${item.parcelas_total}` : ''
    return <div className={cs.card} data-done={paid || undefined}>
      <button type="button" className={cs.check} style={{ '--check-color': incomeItem ? 'var(--ds-success)' : 'var(--ds-danger)' } as React.CSSProperties} data-done={paid || undefined} data-partial={payment.status === 'parcial' || undefined} data-late={tone === 'late' || undefined} title={paid ? 'Marcar como pendente' : 'Marcar como pago'} aria-label={paid ? 'Marcar como pendente' : 'Marcar como pago'} onClick={onTogglePaid}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </button>
      <button type="button" className={cs.main} onClick={onOpen}>
        <span className={cs.copy}>
          <span className={cs.title}>{title}</span>
          <span className={cs.meta}>
            <span data-tone={tone}><MaiIcon name="calendar_today" size={12} />{naturalDate(due, today)}</span>
            {repeatLabel ? <span><MaiIcon name="repeat" size={12} />{repeatLabel}</span> : null}
          </span>
        </span>
        <span className={cs.value} data-income={incomeItem}>{incomeItem ? '+' : '−'} {money.format(visibleValue)}{payment.status === 'parcial' ? <small>restante</small> : null}</span>
      </button>
    </div>
  }

  return <article className="mai-finance-v4-row mai-item-row-v2" data-status={payment.status}>
    <button
      type="button"
      className="mai-finance-v4-status"
      data-paid={payment.status === 'pago'}
      data-partial={payment.status === 'parcial'}
      title={payment.status === 'pago' ? 'Marcar como pendente' : payment.status === 'parcial' ? 'Completar pagamento' : 'Marcar como pago'}
      onClick={onTogglePaid}
    >{payment.status === 'pago' ? '✓' : payment.status === 'parcial' ? '◐' : ''}</button>

    <button type="button" className="mai-finance-v4-row-main" onClick={onOpen}>
      <span className="mai-item-copy-v2">
        <span className="mai-item-titleline-v2"><strong>{title}</strong></span>
        <span className="mai-item-subline-v2">
          <span>{naturalDate(dateKey(item.data), today)}</span>
          {compact ? null : <><span>·</span>
          <span>{item.categoria || 'Sem categoria'}</span>
          {item.conta_id ? <><span>·</span><span>{originName(item.conta_id, accounts, cards)}</span></> : null}
          {item.ajuste_fatura ? <><span>·</span><span>Fatura ajustada</span></> : item._isFixed ? <><span>·</span><span>Fixo</span></> : item.lote_id ? <><span>·</span><span>Parcela {item.parcela_numero}/{item.parcelas_total}</span></> : null}</>}
        </span>
      </span>
      <span className="mai-finance-v4-value" data-income={incomeItem}>
        {incomeItem ? '+' : '−'} {money.format(visibleValue)}
        {payment.status === 'parcial' ? <small>restante · total {money.format(payment.total)} · pago {money.format(payment.paid)}</small> : null}
      </span>
    </button>
  </article>
}
