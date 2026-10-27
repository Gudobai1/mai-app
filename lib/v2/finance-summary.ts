import type { MaiState } from './state'

/*
 * Resumo financeiro usado fora do módulo Finanças (ex.: tela Hoje).
 *
 * Segue exatamente as mesmas regras da visão geral de FinanceV4:
 * - saldo atual = saldo inicial das contas + pagamentos já feitos até hoje
 *   (lançamentos comuns e fixos, sem cartões e sem itens ignorados);
 * - resultado do mês = entradas do mês − (despesas fora do cartão + faturas
 *   dos cartões + despesas de cartões removidos), incluindo os fixos.
 * Se mudar uma regra lá, mude aqui também.
 */

type Row = Record<string, any>

const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : [])
const dateKey = (value: unknown) => String(value || '').slice(0, 10)
const clampMoney = (value: unknown) => Math.max(0, Number(value || 0) || 0)

function monthSequence(start: string, end: string) {
  if (!/^\d{4}-\d{2}$/.test(start) || !/^\d{4}-\d{2}$/.test(end) || start > end) return []
  const result: string[] = []
  let cursor = start
  for (let guard = 0; guard < 1200 && cursor <= end; guard += 1) {
    result.push(cursor)
    const date = new Date(`${cursor}-15T12:00:00`)
    date.setMonth(date.getMonth() + 1)
    cursor = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  }
  return result
}

function cleanPayments(value: unknown, fallbackDate = '') {
  return rows(value)
    .map(payment => ({ ...payment, data: dateKey(payment.data) || fallbackDate, valor: clampMoney(payment.valor) }))
    .filter(payment => payment.valor > 0)
}

export type FinanceSummary = {
  hasData: boolean
  balance: number
  monthIncome: number
  monthExpense: number
  monthResult: number
  /** Saldo previsto ao fim do mês corrente. */
  projected: number
  /** Despesas ainda não pagas com vencimento até o fim do mês. */
  toPay: number
  /** Receitas ainda não recebidas com data até o fim do mês. */
  toReceive: number
}

export function financeSummary(state: MaiState, today: string): FinanceSummary {
  const finance = state.finance || {}
  const transactions = rows(finance.transactions)
  const accounts = rows(finance.accounts)
  const cards = rows(finance.cards)
  const fixed = rows(finance.fixed)
  const occurrences = rows(finance.fixedOccurrences)
  const month = today.slice(0, 7)

  const paidAmountThrough = (item: Row, cutoffDate: string) => {
    const payments = cleanPayments(item.pagamentos, dateKey(item.data))
    if (payments.length) {
      return Math.min(clampMoney(item.valor), payments.reduce((sum, payment) => {
        const paymentDate = dateKey(payment.data)
        return !paymentDate || paymentDate <= cutoffDate ? sum + clampMoney(payment.valor) : sum
      }, 0))
    }
    const itemDate = dateKey(item.data)
    if (itemDate && itemDate > cutoffDate) return 0
    return Math.min(clampMoney(item.valor), clampMoney(item.valor_pago) || (item.status === 'pago' ? clampMoney(item.valor) : 0))
  }
  const signed = (item: Row, value: number) => (item.tipo === 'receita' ? value : -value)

  function fixedRuleAtMonth(rule: Row, monthKey: string): Row | null {
    if (rule.ativo === false) return null
    const start = String(rule.mes_inicio || '').slice(0, 7)
    const end = String(rule.mes_fim || '').slice(0, 7)
    if ((start && monthKey < start) || (end && monthKey > end)) return null
    const occurrence = occurrences.find(item => String(item.fixo_id) === String(rule.id) && String(item.competencia) === monthKey)
    if (occurrence?.ignorado) return null
    const maxDay = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0).getDate()
    const day = Math.min(maxDay, Math.max(1, Number(rule.dia_mes || 1)))
    const status = String(occurrence?.status || rule.status || 'pendente')
    const value = occurrence?.valor_override === '' || occurrence?.valor_override == null ? clampMoney(rule.valor) : clampMoney(occurrence.valor_override)
    const data = occurrence?.data_override || `${monthKey}-${String(day).padStart(2, '0')}`
    return { ...rule, ...occurrence, id: rule.id, data, valor: value, status, valor_pago: occurrence?.valor_pago ?? rule.valor_pago ?? (status === 'pago' ? value : 0), pagamentos: cleanPayments(occurrence?.pagamentos, data) }
  }

  function fixedCashTotalThrough(cutoffDate: string, accountId?: string) {
    const cutoffMonth = cutoffDate.slice(0, 7)
    return fixed.reduce((total, rule) => {
      if (rule.ignorar_calculo) return total
      const ruleAccountId = String(rule.conta_id || '')
      const ruleCardId = String(rule.cartao_id || '')
      if (accountId !== undefined) {
        if (ruleAccountId !== accountId) return total
      } else if (ruleAccountId.startsWith('card|') || ruleCardId) return total
      const start = String(rule.mes_inicio || dateKey(rule.data).slice(0, 7) || cutoffMonth).slice(0, 7)
      const configuredEnd = String(rule.mes_fim || '').slice(0, 7)
      const end = configuredEnd && configuredEnd < cutoffMonth ? configuredEnd : cutoffMonth
      return total + monthSequence(start, end).reduce((sum, monthKey) => {
        const item = fixedRuleAtMonth(rule, monthKey)
        if (!item || item.ignorar_calculo) return sum
        const itemDate = dateKey(item.data)
        if (itemDate && itemDate > cutoffDate) return sum
        return sum + signed(item, paidAmountThrough(item, cutoffDate))
      }, 0)
    }, 0)
  }

  function accountBalance(account: Row) {
    const accountId = String(account.id)
    const regular = transactions.reduce((sum, item) => {
      const isDirectAccountMovement = String(item.conta_id || '') === accountId && !item.ignorar_calculo
      const isCardInvoicePayment = item.ajuste_fatura === true && String(item.conta_pagamento_id || '') === accountId
      if (!isDirectAccountMovement && !isCardInvoicePayment) return sum
      const paid = paidAmountThrough(item, today)
      if (!paid) return sum
      return sum + signed(item, paid)
    }, 0)
    return Number(account.saldo_inicial || 0) + regular + fixedCashTotalThrough(today, accountId)
  }

  const monthFixed = fixed.flatMap(rule => {
    const item = fixedRuleAtMonth(rule, month)
    return item ? [item] : []
  })
  const monthTx = transactions.filter(item => dateKey(item.data).slice(0, 7) === month)
  const monthItems: Row[] = [...monthTx, ...monthFixed]
  const calc = monthItems.filter(item => !item.ignorar_calculo)
  const monthIncome = calc.filter(item => item.tipo === 'receita').reduce((sum, item) => sum + clampMoney(item.valor), 0)
  const monthInvoice = cards.reduce((sum, card) => {
    const cardId = String(card.id)
    const manual = monthItems.find(item => item.ajuste_fatura === true && String(item.ajuste_fatura_card_id || item.cartao_id || '') === cardId && String(item.competencia_fatura || dateKey(item.data).slice(0, 7)) === month)
    if (manual) return sum + clampMoney(manual.valor)
    return sum + calc.filter(item => !item.ajuste_fatura && item.tipo !== 'receita' && (String(item.conta_id || '') === `card|${cardId}` || String(item.cartao_id || '') === cardId)).reduce((cardSum, item) => cardSum + clampMoney(item.valor), 0)
  }, 0)
  const knownCardIds = new Set(cards.map(card => String(card.id)))
  const monthNonCardExpense = calc.filter(item => item.tipo !== 'receita' && !String(item.conta_id || '').startsWith('card|') && !item.cartao_id).reduce((sum, item) => sum + clampMoney(item.valor), 0)
  const monthOrphanCardExpense = calc.filter(item => {
    if (item.tipo === 'receita') return false
    const accountId = String(item.conta_id || '')
    const cardId = String(item.cartao_id || (accountId.startsWith('card|') ? accountId.slice(5) : ''))
    return Boolean(cardId) && !knownCardIds.has(cardId)
  }).reduce((sum, item) => sum + clampMoney(item.valor), 0)
  const monthExpense = monthNonCardExpense + monthInvoice + monthOrphanCardExpense

  const looseCashBalance = transactions.filter(item => !item.ignorar_calculo && !String(item.conta_id || '').startsWith('card|') && !item.cartao_id).reduce((sum, item) => sum + signed(item, paidAmountThrough(item, today)), 0) + fixedCashTotalThrough(today)
  const balance = accounts.length ? accounts.reduce((sum, account) => sum + accountBalance(account), 0) : looseCashBalance

  // Saldo previsto até o fim do mês (mesma regra do card "Previsto" de Finanças).
  const initialBalance = accounts.reduce((sum, account) => sum + Number(account.saldo_inicial || 0), 0)
  const projectedTransactionsTotal = transactions.filter(item => {
    if (item.ignorar_calculo) return false
    const itemMonth = dateKey(item.data).slice(0, 7)
    return /^\d{4}-\d{2}$/.test(itemMonth) && itemMonth <= month
  }).reduce((sum, item) => sum + signed(item, clampMoney(item.valor)), 0)
  const projectedFixedTotal = fixed.reduce((total, rule) => {
    if (rule.ativo === false || rule.ignorar_calculo) return total
    const ruleStart = String(rule.mes_inicio || dateKey(rule.data).slice(0, 7) || month).slice(0, 7)
    const configuredEnd = String(rule.mes_fim || '').slice(0, 7)
    const ruleEnd = configuredEnd && configuredEnd < month ? configuredEnd : month
    return total + monthSequence(ruleStart, ruleEnd).reduce((sum, monthKey) => {
      const item = fixedRuleAtMonth(rule, monthKey)
      return item && !item.ignorar_calculo ? sum + signed(item, clampMoney(item.valor)) : sum
    }, 0)
  }, 0)
  const projected = initialBalance + projectedTransactionsTotal + projectedFixedTotal

  // A pagar / a receber até o fim do mês: o que falta quitar (compras no cartão
  // entram pela fatura, não uma a uma).
  const monthEnd = `${month}-31`
  const isCardPurchase = (item: Row) => !item.ajuste_fatura && (String(item.conta_id || '').startsWith('card|') || Boolean(item.cartao_id))
  const remaining = (item: Row) => Math.max(0, clampMoney(item.valor) - paidAmountThrough(item, '9999-12-31'))
  const openItems = [...transactions.filter(item => dateKey(item.data) && dateKey(item.data) <= monthEnd), ...monthFixed]
    .filter(item => !item.ignorar_calculo && !isCardPurchase(item))
  const toPay = openItems.filter(item => item.tipo !== 'receita').reduce((sum, item) => sum + remaining(item), 0)
  const toReceive = openItems.filter(item => item.tipo === 'receita').reduce((sum, item) => sum + remaining(item), 0)

  return {
    hasData: transactions.length > 0 || fixed.length > 0 || accounts.length > 0,
    balance,
    monthIncome,
    monthExpense,
    monthResult: monthIncome - monthExpense,
    projected,
    toPay,
    toReceive,
  }
}
