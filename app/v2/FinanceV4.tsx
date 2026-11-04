'use client'

import { ColorField } from './detail/ColorField'
import { MoneyInput } from './MoneyInput'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import { CreateCalendarPicker, CreateNumberEditor, CreateOptionList, createNaturalDate } from './CreateDrawerTools'
import { FinanceTransactionCard } from './FinanceTransactionCard'
import { FinanceTransactionExtraTools } from './FinanceTransactionExtraTools'
import { Chips, FinanceItemShell, type Crumb, MonthStepper, SideField, SideRow, SideStepper } from './FinanceItemCard'
import ic from './FinanceItemCard.module.css'
import footerStyles from './shell/DraftFooter.module.css'
import { parseNatural } from '../../lib/v2/nlp'
import { AutoEditor, RentEditor, TaxEditor, applyInvestmentAutomation, autoSummary, firstApplication, redeemPreview, rentSummary, taxSummary } from './FinanceInvestmentTools'
import { DraftButtons } from './shell/DraftFooter'
import { ItemAttachments } from './ItemAttachments'
import { CommentsSection, type Comment } from './detail/Comments'
import { QuickAdd } from './shell/QuickAdd'
import { useQuickMenu, type QuickMenuConfig } from './shell/QuickMenu'
import { addDays } from '../../lib/v2/planner'
import { MAI_ENTITY_ICONS, MaiIcon } from './MaiIcons'
import { useManualDraft } from './useManualDraft'
import { askConfirm, askText, notify } from './shell/ConfirmDialog'
import { PALETTE, colorName } from '../../lib/v2/palette'
import { categoryColorOf } from '../../lib/v2/financeColors'
import { invoiceValue } from '../../lib/v2/financeInvoice'
import { shiftInstallment } from '../../lib/v2/financeInstallments'
import { financeTagSuggestions, parseFinanceTags } from '../../lib/v2/financeTags'
import fm from './FinanceModern.module.css'
import { OpenFinancePanel, bindOpenFinance, suggestedName, useOpenFinance } from './OpenFinance'

type Row = Record<string, any>
type Commit = (change: (current: MaiState) => MaiState) => void
type Tab = 'transactions' | 'accounts' | 'cards' | 'boxes' | 'investments' | 'reports'
type DraftKind = 'transaction' | 'account' | 'card' | 'box' | 'investment'

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dateKey = (value: unknown) => String(value || '').slice(0, 10)
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const clampMoney = (value: unknown) => Math.max(0, Number(value || 0) || 0)
const monthLabel = (month: string) => new Date(`${month}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
const naturalDate = (key: string, today: string) => {
  if (!key) return 'Sem data'
  if (key === today) return 'Hoje'
  const base = new Date(`${today}T12:00:00`)
  const target = new Date(`${key}T12:00:00`)
  const diff = Math.round((target.getTime() - base.getTime()) / 86400000)
  if (diff === 1) return 'Amanhã'
  if (diff === -1) return 'Ontem'
  return target.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: target.getFullYear() !== base.getFullYear() ? 'numeric' : undefined })
}
const statusLabel = (value: unknown) => value === 'pago' ? 'Pago' : value === 'parcial' ? 'Parcial' : 'Pendente'
const originName = (value: unknown, accounts: Row[], cards: Row[]) => {
  const id = String(value || '')
  if (!id) return 'Sem origem'
  if (id.startsWith('card|')) return String(cards.find(card => String(card.id) === id.slice(5))?.nome || 'Cartão')
  return String(accounts.find(account => String(account.id) === id)?.nome || 'Conta')
}
const financeIcons = MAI_ENTITY_ICONS

const moveDateForInstallment = shiftInstallment

function monthDateForDay(month: string, rawDay: number) {
  const year = Number(month.slice(0, 4))
  const monthNumber = Number(month.slice(5, 7))
  const maxDay = new Date(year, monthNumber, 0).getDate()
  const day = Math.min(maxDay, Math.max(1, Number(rawDay || 1)))
  return `${month}-${String(day).padStart(2, '0')}`
}

function parseMoneyInput(value: string) {
  const cleaned = value.trim().replace(/R\$|\s/g, '')
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : Number.NaN
}

function parseSignedMoneyInput(value: string) {
  const cleaned = value.trim().replace(/R\$|\s/g, '')
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function shiftMonth(key: string, amount: number) {
  const date = new Date(`${key}-15T12:00:00`)
  date.setMonth(date.getMonth() + amount)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

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
  return rows(value).map(payment => ({
    ...payment,
    id: String(payment.id || uid('pay')),
    data: dateKey(payment.data) || fallbackDate,
    valor: clampMoney(payment.valor),
  })).filter(payment => payment.valor > 0)
}

function paymentState(item: Row, value: unknown = item.pagamentos) {
  const total = clampMoney(item.valor)
  const payments = cleanPayments(value, dateKey(item.data))
  if (payments.length) {
    const paid = Math.min(total, payments.reduce((sum, payment) => sum + clampMoney(payment.valor), 0))
    return { payments, paid, remaining: Math.max(0, total - paid), status: total > 0 && paid >= total ? 'pago' : paid > 0 ? 'parcial' : 'pendente' }
  }
  const legacyPaid = Math.min(total, clampMoney(item.valor_pago) || (item.status === 'pago' ? total : 0))
  return { payments, paid: legacyPaid, remaining: Math.max(0, total - legacyPaid), status: total > 0 && legacyPaid >= total ? 'pago' : legacyPaid > 0 ? 'parcial' : 'pendente' }
}

export function FinanceV4({ state, today, commit, createRequest, inspect: _inspect, options }: { options?: ReactNode; state: MaiState; today: string; commit: Commit; createRequest?: string; inspect: (item: InspectableItem) => void }) {
  const savedTabs = state.configs.areaTabs && typeof state.configs.areaTabs === 'object' ? state.configs.areaTabs as Record<string, string> : {}
  const savedTab = String(savedTabs.finance || 'overview')
  const allowedTabs: Tab[] = ['transactions', 'accounts', 'cards', 'boxes', 'investments', 'reports']
  const tab: Tab = allowedTabs.includes(savedTab as Tab) ? savedTab as Tab : 'transactions'
  const finance = state.finance || {}
  const transactions = rows(finance.transactions)
  const accounts = rows(finance.accounts)
  const cards = rows(finance.cards)
  const categories = rows(finance.categories)
  const fixed = rows(finance.fixed)
  const occurrences = rows(finance.fixedOccurrences)
  const boxes = rows(finance.boxes)
  const investments = rows(finance.investments)
  const moduleFilters = state.configs.moduleFilters && typeof state.configs.moduleFilters === 'object' ? state.configs.moduleFilters as Record<string, Row> : {}
  const financeFilter = moduleFilters.finance || {}
  const moduleControls = state.configs.moduleControls && typeof state.configs.moduleControls === 'object' ? state.configs.moduleControls as Record<string, Row> : {}
  const financeControl = moduleControls.finance || {}
  const typeFilter = String(financeFilter.type || 'all')
  const statusFilter = String(financeFilter.status || 'all')
  const categoryFilter = String(financeFilter.category || 'all')
  const originFilter = String(financeFilter.origin || 'all')
  const order = String(financeControl.sort || 'date_asc')
  const [month, setMonth] = useState(today.slice(0, 7))
  const [period, setPeriod] = useState<'month' | '3' | '6' | 'year' | 'custom'>('month')
  const [periodMenu, setPeriodMenu] = useState(false)
  const [customFrom, setCustomFrom] = useState(`${today.slice(0, 4)}-01`)
  const [customTo, setCustomTo] = useState(today.slice(0, 7))
  const [draft, setDraft] = useState<Row | null>(null)
  const [kind, setKind] = useState<DraftKind>('transaction')
  const [createTool, setCreateTool] = useState('')
  const quick = useQuickMenu()
  const openFinance = useOpenFinance(state, commit)
  const [quickAdding, setQuickAdding] = useState(false)
  const [cardAdding, setCardAdding] = useState(false)
  const [popupMonth, setPopupMonth] = useState<string | null>(null)
  useEffect(() => { if (!draft) setPopupMonth(null) }, [draft === null]) // eslint-disable-line react-hooks/exhaustive-deps
  const [moveForm, setMoveForm] = useState<{ type: 'in' | 'out'; amount: string; date: string; cal: boolean; done: boolean; editId?: string; titulo?: string } | null>(null)
  const [showDone, setShowDone] = useState(false)
  useEffect(() => { setMoveForm(null); setShowDone(false) }, [draft?.id])
  const [trail, setTrail] = useState<{ kind: Exclude<DraftKind, 'transaction'>; id: string; label: string }[]>([])
  const [redeem, setRedeem] = useState<{ amount: number; date: string; conta: string; junto: boolean } | null>(null)
  const [categoryDraftName, setCategoryDraftName] = useState('')
  const [categoryDraftColor, setCategoryDraftColor] = useState('')

  const paidAmount = (item: Row) => paymentState(item).paid
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
  const signed = (item: Row, value: number) => item.tipo === 'receita' ? value : -value

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
    return { ...rule, ...occurrence, id: rule.id, _isFixed: true, occurrenceKey: `${rule.id}|${monthKey}`, data: occurrence?.data_override || `${monthKey}-${String(day).padStart(2, '0')}`, valor: value, status, valor_pago: occurrence?.valor_pago ?? rule.valor_pago ?? (status === 'pago' ? value : 0), pagamentos: cleanPayments(occurrence?.pagamentos, occurrence?.data_override || `${monthKey}-${String(day).padStart(2, '0')}`), recorrencia: 'fixo' } as Row
  }

  function fixedForMonthAt(monthKey: string): Row[] {
    return fixed.flatMap(rule => {
      const item = fixedRuleAtMonth(rule, monthKey)
      return item ? [item] : []
    })
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

  // Open Finance: saldo das contas e limite dos cartões seguem o banco
  useEffect(() => { openFinance.applyBalances(account => accountBalance(account) - Number(account.saldo_inicial || 0)) }) // eslint-disable-line react-hooks/exhaustive-deps

  const monthFixed = fixedForMonthAt(month)
  const monthTxRaw = transactions.filter(item => dateKey(item.data).slice(0, 7) === month)
  const monthTx = monthTxRaw.map(item => {
    if (item.ajuste_fatura !== true || item.ajuste_delta === undefined) return item
    const cardId = String(item.ajuste_fatura_card_id || item.cartao_id || '')
    const purchases = [...monthTxRaw, ...monthFixed].filter(row => !row.ajuste_fatura && !row.ignorar_calculo && row.tipo !== 'receita' && (String(row.conta_id || '') === `card|${cardId}` || String(row.cartao_id || '') === cardId)).reduce((sum, row) => sum + clampMoney(row.valor), 0)
    return { ...item, valor: invoiceValue(item, purchases) }
  })
  const monthItems: Row[] = [...monthTx, ...monthFixed]
  const monthCalculationItems = monthItems.filter(item => !item.ignorar_calculo)
  /** Mês e lançamentos do que está aberto no popup (independente do mês da página). */
  const viewMonth = popupMonth ?? month
  const viewItems: Row[] = (() => {
    if (viewMonth === month) return monthItems
    const fx = fixedForMonthAt(viewMonth)
    const raw = transactions.filter(item => dateKey(item.data).slice(0, 7) === viewMonth)
    const tx = raw.map(item => {
      if (item.ajuste_fatura !== true || item.ajuste_delta === undefined) return item
      const cardId = String(item.ajuste_fatura_card_id || item.cartao_id || '')
      const purchases = [...raw, ...fx].filter(row => !row.ajuste_fatura && !row.ignorar_calculo && row.tipo !== 'receita' && (String(row.conta_id || '') === `card|${cardId}` || String(row.cartao_id || '') === cardId)).reduce((sum, row) => sum + clampMoney(row.valor), 0)
      return { ...item, valor: invoiceValue(item, purchases) }
    })
    return [...tx, ...fx]
  })()
  const monthIncome = monthCalculationItems.filter(item => item.tipo === 'receita').reduce((sum, item) => sum + clampMoney(item.valor), 0)
  const monthInvoice = cards.reduce((sum, card) => {
    const cardId = String(card.id)
    const manual = monthItems.find(item => item.ajuste_fatura === true && String(item.ajuste_fatura_card_id || item.cartao_id || '') === cardId && String(item.competencia_fatura || dateKey(item.data).slice(0, 7)) === month)
    const purchases = monthCalculationItems.filter(item => !item.ajuste_fatura && item.tipo !== 'receita' && (String(item.conta_id || '') === `card|${cardId}` || String(item.cartao_id || '') === cardId)).reduce((cardSum, item) => cardSum + clampMoney(item.valor), 0)
    return sum + (manual ? invoiceValue(manual, purchases) : purchases)
  }, 0)
  const knownCardIds = new Set(cards.map(card => String(card.id)))
  const monthNonCardExpense = monthCalculationItems.filter(item => item.tipo !== 'receita' && !String(item.conta_id || '').startsWith('card|') && !item.cartao_id).reduce((sum, item) => sum + clampMoney(item.valor), 0)
  const monthOrphanCardExpense = monthCalculationItems.filter(item => {
    if (item.tipo === 'receita') return false
    const accountId = String(item.conta_id || '')
    const cardId = String(item.cartao_id || (accountId.startsWith('card|') ? accountId.slice(5) : ''))
    return Boolean(cardId) && !knownCardIds.has(cardId)
  }).reduce((sum, item) => sum + clampMoney(item.valor), 0)
  const monthExpense = monthNonCardExpense + monthInvoice + monthOrphanCardExpense
  const monthResult = monthIncome - monthExpense
  const initialBalance = accounts.reduce((sum, account) => sum + Number(account.saldo_inicial || 0), 0)
  const looseCashBalance = transactions.filter(item => !item.ignorar_calculo && !String(item.conta_id || '').startsWith('card|') && !item.cartao_id).reduce((sum, item) => sum + signed(item, paidAmountThrough(item, today)), 0) + fixedCashTotalThrough(today)
  const realBalance = accounts.length ? accounts.reduce((sum, account) => sum + accountBalance(account), 0) : looseCashBalance
  /** Saldo previsto ao fim de um mês: saldo inicial das contas + tudo o que está lançado até lá. */
  const projectedThrough = (limitMonth: string) => {
    const transactionsTotal = transactions.filter(item => {
      if (item.ignorar_calculo) return false
      const itemMonth = dateKey(item.data).slice(0, 7)
      return /^\d{4}-\d{2}$/.test(itemMonth) && itemMonth <= limitMonth
    }).reduce((sum, item) => sum + signed(item, clampMoney(item.valor)), 0)
    const fixedTotal = fixed.reduce((total, rule) => {
      if (rule.ativo === false || rule.ignorar_calculo) return total
      const ruleStart = String(rule.mes_inicio || dateKey(rule.data).slice(0, 7) || today.slice(0, 7)).slice(0, 7)
      const configuredEnd = String(rule.mes_fim || '').slice(0, 7)
      const ruleEnd = configuredEnd && configuredEnd < limitMonth ? configuredEnd : limitMonth
      if (ruleStart > ruleEnd) return total
      return total + monthSequence(ruleStart, ruleEnd).reduce((sum, monthKey) => {
        const item = fixedRuleAtMonth(rule, monthKey)
        return item && !item.ignorar_calculo ? sum + signed(item, clampMoney(item.valor)) : sum
      }, 0)
    }, 0)
    return initialBalance + transactionsTotal + fixedTotal
  }
  const projectedBalance = projectedThrough(month)
  const monthStartBalance = projectedThrough(shiftMonth(month, -1))
  const totalBoxes = boxes.reduce((sum, item) => sum + clampMoney(item.saldo), 0)
  const totalBoxTarget = boxes.reduce((sum, item) => sum + clampMoney(item.meta), 0)
  const totalBoxProgress = totalBoxTarget ? Math.min(100, totalBoxes / totalBoxTarget * 100) : 0
  const totalInvested = investments.reduce((sum, item) => sum + clampMoney(item.aportado), 0)
  const totalInvestmentValue = investments.reduce((sum, item) => sum + clampMoney(item.valor_atual), 0)
  const investmentResult = totalInvestmentValue - totalInvested
  const investmentResultPercent = totalInvested ? investmentResult / totalInvested * 100 : 0

  function cardInvoice(card: Row, source: Row[] = viewItems, m: string = viewMonth) {
    const cardId = String(card.id)
    const manual = source.find(item => item.ajuste_fatura === true && String(item.ajuste_fatura_card_id || item.cartao_id || '') === cardId && String(item.competencia_fatura || dateKey(item.data).slice(0, 7)) === m)
    const purchases = source.filter(item => !item.ajuste_fatura && (String(item.conta_id || '') === `card|${cardId}` || String(item.cartao_id || '') === cardId) && !item.ignorar_calculo && item.tipo !== 'receita').reduce((sum, item) => sum + clampMoney(item.valor), 0)
    return manual ? invoiceValue(manual, purchases) : purchases
  }
  function moveMonth(amount: number) {
    const date = new Date(`${month}-15T12:00:00`)
    date.setMonth(date.getMonth() + amount)
    setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
  }
  function setTab(next: Tab) {
    commit(current => ({ ...current, configs: { ...current.configs, areaTabs: { ...(current.configs.areaTabs && typeof current.configs.areaTabs === 'object' ? current.configs.areaTabs as Record<string, string> : {}), finance: next } } }))
  }

  function openSummary(target: Tab, type?: 'income' | 'expense') {
    commit(current => {
      const areaTabs = current.configs.areaTabs && typeof current.configs.areaTabs === 'object' ? current.configs.areaTabs as Record<string, string> : {}
      const filters = current.configs.moduleFilters && typeof current.configs.moduleFilters === 'object' ? current.configs.moduleFilters as Record<string, Row> : {}
      const currentType = String((filters.finance || {}).type || 'all')
      const moduleFilters = type ? { ...filters, finance: { ...(filters.finance || {}), type: currentType === type ? 'all' : type } } : filters
      return { ...current, configs: { ...current.configs, areaTabs: { ...areaTabs, finance: target }, moduleFilters } }
    })
  }

  function resetView() {
    setMonth(today.slice(0, 7))
    setPeriod('month')
    setPeriodMenu(false)
    commit(current => {
      const areaTabs = current.configs.areaTabs && typeof current.configs.areaTabs === 'object' ? current.configs.areaTabs as Record<string, string> : {}
      const filters = current.configs.moduleFilters && typeof current.configs.moduleFilters === 'object' ? current.configs.moduleFilters as Record<string, Row> : {}
      const controls = current.configs.moduleControls && typeof current.configs.moduleControls === 'object' ? current.configs.moduleControls as Record<string, Row> : {}
      const { sort: _sort, ...financeControl } = controls.finance || {}
      return { ...current, configs: { ...current.configs, areaTabs: { ...areaTabs, finance: 'transactions' }, moduleFilters: { ...filters, finance: {} }, moduleControls: { ...controls, finance: financeControl } } }
    })
  }

  function newDraft(type: DraftKind): Row {
    if (type === 'transaction') return { id: uid('fin'), titulo: '', observacao: '', valor: 0, valor_pago: 0, tipo: 'despesa', data: today, status: 'pendente', categoria: '', conta_id: '', cartao_id: '', anexos: [], pagamentos: [], ignorar_calculo: false, recorrencia: 'unico', parcelas: 2, intervalo_parcelas: 'mensal', dividir_total: true, dia_mes: Number(today.slice(8)), mes_inicio: today.slice(0, 7), mes_fim: '', ativo: true, ocultar_inicio: false, _persisted: false }
    if (type === 'account') return { id: uid('cta'), nome: '', saldo_inicial: 0, cor: '#4073FF', foto: '', _persisted: false }
    if (type === 'card') return { id: uid('crd'), nome: '', limite: 0, fechamento: 1, vencimento: 10, conta_id: '', cor: '#4073FF', foto: '', _persisted: false }
    if (type === 'box') return { id: uid('box'), nome: '', icone: 'savings', cor: '#4073FF', foto: '', meta: 0, saldo: 0, prazo: '', observacao: '', movimentos: [], _persisted: false }
    return { id: uid('inv'), nome: '', icone: 'trending_up', cor: '#4073FF', foto: '', tipo: 'ETF', instituicao: '', aportado: 0, valor_atual: 0, observacao: '', movimentos: [], _persisted: false }
  }
  function openNew(type: DraftKind) {
    setTrail([])
    setKind(type)
    setDraft(newDraft(type))
    setCreateTool('')
    setCategoryDraftName('')
  }
  function openTransaction(item: Row, keepTrail = false) {
    if (!keepTrail) setTrail([])
    setKind('transaction')
    setDraft({ ...item, recorrencia: item._isFixed ? 'fixo' : item.recorrencia || 'unico', dia_mes: item.dia_mes || Number(dateKey(item.data).slice(8)) || Number(today.slice(8)), mes_inicio: item.mes_inicio || dateKey(item.data).slice(0, 7) || month, mes_fim: item.mes_fim || '', anexos: rows(item.anexos), pagamentos: cleanPayments(item.pagamentos, dateKey(item.data)), _persisted: true, _isFixed: item._isFixed === true })
    setCreateTool('')
    setCategoryDraftName('')
  }
  function openExisting(type: Exclude<DraftKind, 'transaction'>, item: Row, keepTrail = false) {
    if (!keepTrail) setTrail([])
    setKind(type)
    setDraft({ ...item, movimentos: rows(item.movimentos), _persisted: true })
    setCreateTool('')
  }

  useEffect(() => { if (createRequest?.startsWith('finance:')) openNew('transaction') }, [createRequest, today])

  useEffect(() => {
    const updated = investments.map(item => applyInvestmentAutomation(item, today))
    if (!updated.some(Boolean)) return
    commit(current => ({ ...current, finance: { ...current.finance, investments: rows(current.finance.investments).map(item => { const index = investments.findIndex(entry => String(entry.id) === String(item.id)); return index >= 0 && updated[index] ? updated[index] as Row : item }) } }))
  }, [today, state.finance?.investments])

  function confirmRedeem() {
    if (!draft || kind !== 'investment' || !redeem) return
    const preview = redeemPreview(draft, redeem.amount, today)
    if (preview.value <= 0) return
    const name = String(draft.nome || 'Investimento')
    const nextInvestment: Row = { ...draft, aportado: Math.max(0, Math.round((clampMoney(draft.aportado) - preview.principal) * 100) / 100), valor_atual: Math.max(0, Math.round((clampMoney(draft.valor_atual) - preview.value) * 100) / 100), movimentos: [{ id: uid('mov'), data: `${redeem.date}T12:00:00.000Z`, tipo: 'resgate', valor: preview.value, imposto: redeem.junto ? preview.taxTotal : 0 }, ...rows(draft.movimentos)] }
    const entry = (title: string, value: number, type: 'receita' | 'despesa', category: string): Row => ({ id: uid('fin'), titulo: title, observacao: '', valor: value, valor_pago: value, tipo: type, data: redeem.date, status: 'pago', categoria: category, conta_id: redeem.conta, cartao_id: '', anexos: [], pagamentos: [{ id: uid('pay'), data: redeem.date, valor: value }], ignorar_calculo: false, recorrencia: 'unico' })
    const created = [entry(`Resgate — ${name}`, preview.value, 'receita', 'Resgate'), ...(redeem.junto && preview.taxTotal > 0 ? [entry(`Imposto — ${name}`, preview.taxTotal, 'despesa', 'Impostos')] : [])]
    const { _persisted: _flag, ...stored } = nextInvestment
    commit(current => ({ ...current, finance: { ...current.finance, investments: rows(current.finance.investments).map(item => String(item.id) === String(stored.id) ? stored : item), transactions: [...created, ...rows(current.finance.transactions)] } }))
    setDraft(nextInvestment)
    setRedeem(null)
  }

  function addCategoryFromLaunch() {
    if (!draft || kind !== 'transaction') return
    const name = categoryDraftName.trim()
    if (!name) return
    const existing = categories.find(item => String(item.nome || '').trim().toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))
    if (!existing) commit(current => ({ ...current, finance: { ...current.finance, categories: [...rows(current.finance.categories), { id: uid('cat'), nome: name, cor: categoryDraftColor || categoryPalette[rows(current.finance.categories).length % categoryPalette.length] }] } }))
    setDraft({ ...draft, categoria: existing ? String(existing.nome) : name })
    setCategoryDraftName('')
    setCategoryDraftColor('')
    setCreateTool('')
  }

  function persistDraft(snapshot: Row) {
    const label = kind === 'transaction' ? String(snapshot.titulo || '').trim() : String(snapshot.nome || '').trim()
    if (!label) return
    const { _persisted: _ignored, _isFixed: _wasFixed, occurrenceKey: _occurrenceKey, ...clean } = snapshot
    commit(current => {
      const nextFinance = { ...(current.finance || {}) } as Row
      if (kind === 'transaction') {
        const recurring = String(clean.recorrencia || 'unico')
        if (recurring === 'fixo') {
          const fixedRule: Row = { ...clean, id: String(clean.id), titulo: label, valor: clampMoney(clean.valor), dia_mes: Math.min(31, Math.max(1, Number(clean.dia_mes || Number(dateKey(clean.data).slice(8)) || 1))), mes_inicio: String(clean.mes_inicio || dateKey(clean.data).slice(0, 7) || month), mes_fim: String(clean.mes_fim || ''), anexos: rows(clean.anexos), ativo: clean.ativo !== false }
          const occurrencePayments = cleanPayments(clean.pagamentos, dateKey(clean.data) || today)
          const value = clampMoney(clean.valor)
          const paid = occurrencePayments.length ? Math.min(value, occurrencePayments.reduce((sum, payment) => sum + clampMoney(payment.valor), 0)) : Math.min(value, clampMoney(clean.valor_pago) || (clean.status === 'pago' ? value : 0))
          const occurrenceStatus = value > 0 && paid >= value ? 'pago' : paid > 0 ? 'parcial' : 'pendente'
          delete fixedRule.status; delete fixedRule.valor_pago; delete fixedRule.pagamentos; delete fixedRule.parcelas; delete fixedRule.intervalo_parcelas; delete fixedRule.dividir_total; delete fixedRule.cartao_id
          fixedRule.recorrencia = 'fixo'
          nextFinance.transactions = rows(nextFinance.transactions).filter(item => String(item.id) !== String(clean.id))
          const fixedList = rows(nextFinance.fixed)
          nextFinance.fixed = fixedList.some(item => String(item.id) === String(fixedRule.id)) ? fixedList.map(item => String(item.id) === String(fixedRule.id) ? fixedRule : item) : [fixedRule, ...fixedList]
          const occurrenceKey = `${fixedRule.id}|${month}`
          const occurrence = { chave: occurrenceKey, fixo_id: fixedRule.id, competencia: month, status: occurrenceStatus, valor_pago: paid, pagamentos: occurrencePayments, atualizado_em: new Date().toISOString() }
          const occurrenceList = rows(nextFinance.fixedOccurrences)
          nextFinance.fixedOccurrences = occurrenceList.some(item => String(item.chave) === occurrenceKey) ? occurrenceList.map(item => String(item.chave) === occurrenceKey ? { ...item, ...occurrence } : item) : [...occurrenceList, occurrence]
        } else {
          const payments = cleanPayments(clean.pagamentos, dateKey(clean.data) || today)
          const value = clampMoney(clean.valor)
          let paid = payments.length ? Math.min(value, payments.reduce((sum, payment) => sum + clampMoney(payment.valor), 0)) : Math.min(value, clampMoney(clean.valor_pago))
          if (clean.status === 'pago' && !payments.length) paid = value
          if (clean.status === 'pendente' && !payments.length) paid = 0
          const status = value > 0 && paid >= value ? 'pago' : paid > 0 ? 'parcial' : 'pendente'
          const accountId = String(clean.conta_id || '')
          const next: Row = { ...clean, titulo: label, valor: value, valor_pago: paid, status, pagamentos: payments, anexos: rows(clean.anexos), cartao_id: accountId.startsWith('card|') ? accountId.slice(5) : '', recorrencia: recurring }
          delete next.dia_mes; delete next.mes_inicio; delete next.mes_fim; delete next.ativo
          const fixedList = rows(nextFinance.fixed)
          if (fixedList.some(item => String(item.id) === String(next.id))) {
            nextFinance.fixed = fixedList.filter(item => String(item.id) !== String(next.id))
            nextFinance.fixedOccurrences = rows(nextFinance.fixedOccurrences).filter(item => String(item.fixo_id) !== String(next.id))
          }
          const list = rows(nextFinance.transactions)
          nextFinance.transactions = list.some(item => String(item.id) === String(next.id)) ? list.map(item => String(item.id) === String(next.id) ? next : item) : [next, ...list]
        }
      } else if (kind === 'account') {
        const next: Row = { ...clean, nome: label, saldo_inicial: Number(clean.saldo_inicial || 0), cor: clean.cor || '#4073FF' }
        if (!next.pluggy_id) delete next.pluggy_id
        nextFinance.accounts = rows(nextFinance.accounts).some(item => String(item.id) === String(next.id)) ? rows(nextFinance.accounts).map(item => String(item.id) === String(next.id) ? next : item) : [...rows(nextFinance.accounts), next]
        nextFinance.openFinance = bindOpenFinance(nextFinance, String(next.id), next.pluggy_id ? String(next.pluggy_id) : undefined)
      } else if (kind === 'card') {
        const next: Row = { ...clean, nome: label, limite: clampMoney(clean.limite), fechamento: Math.min(31, Math.max(1, Number(clean.fechamento || 1))), vencimento: Math.min(31, Math.max(1, Number(clean.vencimento || 10))), cor: clean.cor || '#4073FF' }
        if (!next.pluggy_id) delete next.pluggy_id
        nextFinance.cards = rows(nextFinance.cards).some(item => String(item.id) === String(next.id)) ? rows(nextFinance.cards).map(item => String(item.id) === String(next.id) ? next : item) : [...rows(nextFinance.cards), next]
        nextFinance.openFinance = bindOpenFinance(nextFinance, `card|${next.id}`, next.pluggy_id ? String(next.pluggy_id) : undefined)
      } else if (kind === 'box') {
        const next: Row = { ...clean, nome: label, meta: clampMoney(clean.meta), saldo: clampMoney(clean.saldo), icone: clean.icone || 'savings', cor: clean.cor || '#4073FF', movimentos: rows(clean.movimentos) }
        const list = rows(nextFinance.boxes)
        nextFinance.boxes = list.some(item => String(item.id) === String(next.id)) ? list.map(item => String(item.id) === String(next.id) ? next : item) : [...list, next]
      } else {
        const next: Row = { ...clean, nome: label, aportado: clampMoney(clean.aportado), valor_atual: clampMoney(clean.valor_atual), icone: clean.icone || 'trending_up', cor: clean.cor || '#4073FF', movimentos: rows(clean.movimentos) }
        const list = rows(nextFinance.investments)
        nextFinance.investments = list.some(item => String(item.id) === String(next.id)) ? list.map(item => String(item.id) === String(next.id) ? next : item) : [...list, next]
      }
      return { ...current, finance: nextFinance }
    })
    if (snapshot._persisted === false) setDraft(current => current && String(current.id) === String(snapshot.id) ? { ...current, _persisted: true, _isFixed: kind === 'transaction' && String(snapshot.recorrencia || '') === 'fixo' } : current)
  }

  const { dirty, saveNow, requestClose } = useManualDraft({ value: draft, identity: `${kind}:${String(draft?.id || '')}`, enabled: Boolean(draft), save: persistDraft, what: kind === 'transaction' ? 'lançamento' : 'registro' })
  const closeDraft = () => void requestClose(() => { setTrail([]); setDraft(null) })
  /** Abre um lançamento de dentro de uma conta/cartão, guardando o caminho para voltar. */
  async function openFromParent(item: Row) {
    if (!draft || kind === 'transaction') { openTransaction(item); return }
    if (dirty) await saveNow()
    const parentKind = kind as Exclude<DraftKind, 'transaction'>
    setTrail(current => [...current, { kind: parentKind, id: String(draft.id), label: String(draft.nome || 'Registro') }])
    openTransaction(item, true)
  }
  function goBack(index: number) {
    const target = trail[index]
    if (!target) return
    const source = target.kind === 'account' ? accounts : target.kind === 'card' ? cards : target.kind === 'box' ? boxes : investments
    const found = source.find(row => String(row.id) === target.id)
    setTrail(trail.slice(0, index))
    if (found) openExisting(target.kind, found, true)
    else setDraft(null)
  }
  const saveDraft = async () => { await saveNow(); setTrail([]); setDraft(null) }

  async function removeDraft() {
    if (!draft?._persisted) return
    const isFixed = draft._isFixed || draft.recorrencia === 'fixo'
    if (!(await askConfirm({ title: kind === 'transaction' ? 'Excluir lançamento?' : 'Excluir registro?', message: `“${String(draft.titulo || draft.nome || 'Registro')}” será excluído. Não dá para desfazer.` }))) return
    const deleteLot = kind === 'transaction' && !isFixed && draft.lote_id ? await askConfirm({ title: 'Excluir todas as parcelas?', message: 'Este lançamento é parcelado. Excluir todas as parcelas ou só esta?', confirmLabel: 'Todas as parcelas', cancelLabel: 'Só esta', icon: 'delete' }) : false
    commit(current => {
      const nextFinance = { ...(current.finance || {}) } as Row
      if (kind === 'transaction') {
        if (draft._isFixed || draft.recorrencia === 'fixo') {
          nextFinance.fixed = rows(nextFinance.fixed).filter(item => String(item.id) !== String(draft.id))
          nextFinance.fixedOccurrences = rows(nextFinance.fixedOccurrences).filter(item => String(item.fixo_id) !== String(draft.id))
        } else {
          nextFinance.transactions = rows(nextFinance.transactions).filter(item => deleteLot ? String(item.lote_id) !== String(draft.lote_id) : String(item.id) !== String(draft.id))
        }
      } else {
        const key = kind === 'account' ? 'accounts' : kind === 'card' ? 'cards' : kind === 'box' ? 'boxes' : 'investments'
        nextFinance[key] = rows(nextFinance[key]).filter(item => String(item.id) !== String(draft.id))
      }
      return { ...current, finance: nextFinance }
    })
    setDraft(null)
  }

  function updateOccurrence(item: Row, patch: Row) {
    commit(current => {
      const list = rows(current.finance.fixedOccurrences)
      const occurrenceKey = String(item.occurrenceKey || `${item.id}|${month}`)
      const next = { chave: occurrenceKey, fixo_id: item.id, competencia: month, atualizado_em: new Date().toISOString(), ...patch }
      return { ...current, finance: { ...current.finance, fixedOccurrences: list.some(entry => entry.chave === occurrenceKey) ? list.map(entry => entry.chave === occurrenceKey ? { ...entry, ...next } : entry) : [...list, next] } }
    })
  }

  async function togglePaid(item: Row) {
    const total = clampMoney(item.valor)
    const current = paymentState(item)
    const applyPayments = (payments: Row[], paid: number, status: string) => {
      if (item._isFixed) { updateOccurrence(item, { status, valor_pago: paid, pagamentos: payments }); return }
      commit(stateNow => ({ ...stateNow, finance: { ...stateNow.finance, transactions: rows(stateNow.finance.transactions).map(row => String(row.id) === String(item.id) ? { ...row, status, valor_pago: paid, pagamentos: payments } : row) } }))
    }
    if (item.status === 'pago') { applyPayments([], 0, 'pendente'); return }
    if (!total) return
    let amount = current.remaining
    if (item.tipo === 'receita' && current.remaining > 0) {
      const full = await askConfirm({ title: 'Recebeu o valor todo?', message: `Valor a receber: ${money.format(current.remaining)}.`, confirmLabel: 'Sim, o valor todo', cancelLabel: 'Outro valor', icon: 'payments' })
      if (!full) {
        const answer = await askText({ title: 'Quanto foi recebido?', icon: 'payments', tone: 'default', confirmLabel: 'Confirmar', input: { kind: 'money', value: current.remaining.toFixed(2).replace('.', ',') } })
        if (answer === null) return
        const parsed = parseMoneyInput(answer)
        if (!Number.isFinite(parsed) || parsed <= 0) { void notify('Digite um valor válido.'); return }
        amount = Math.min(parsed, current.remaining)
      }
    }
    const payments = amount > 0 ? [...current.payments, { id: uid('pay'), data: today, valor: amount }] : current.payments
    const paid = Math.min(total, payments.reduce((sum, payment) => sum + clampMoney(payment.valor), 0))
    applyPayments(payments, paid, paid >= total ? 'pago' : paid > 0 ? 'parcial' : 'pendente')
  }

  function setDraftPaymentStatus(value: string) {
    if (!draft || kind !== 'transaction') return
    if (value === 'pendente') {
      setDraft({ ...draft, status: 'pendente', valor_pago: 0, pagamentos: [] })
      return
    }
    const current = paymentState(draft)
    const total = clampMoney(draft.valor)
    if (!total) return
    const payments = current.remaining > 0 ? [...current.payments, { id: uid('pay'), data: today, valor: current.remaining }] : current.payments
    setDraft({ ...draft, status: 'pago', valor_pago: total, pagamentos: payments })
  }

  async function editFixedOccurrence(item = draft) {
    if (!item) return
    const currentOccurrence = fixedForMonthAt(month).find(row => String(row.id) === String(item.id)) || item
    const value = await askText({ title: 'Valor somente deste mês', icon: 'payments', tone: 'default', input: { kind: 'money', value: String(currentOccurrence.valor || item.valor || 0).replace('.', ',') } }); if (value === null) return
    const parsedValue = parseMoneyInput(value)
    if (!Number.isFinite(parsedValue)) { void notify('Digite um valor válido.'); return }
    const date = await askText({ title: 'Data somente deste mês', icon: 'calendar_today', tone: 'default', input: { kind: 'date', today, value: dateKey(currentOccurrence.data) || `${month}-${String(item.dia_mes || 1).padStart(2, '0')}` } }); if (date === null) return
    const currentPayments = cleanPayments(currentOccurrence.pagamentos, date)
    const paid = Math.min(parsedValue, currentPayments.reduce((sum, payment) => sum + clampMoney(payment.valor), 0))
    updateOccurrence({ ...item, occurrenceKey: `${item.id}|${month}` }, { valor_override: parsedValue, data_override: date, pagamentos: currentPayments, valor_pago: paid, status: parsedValue > 0 && paid >= parsedValue ? 'pago' : paid > 0 ? 'parcial' : 'pendente' })
  }
  async function ignoreFixed(item = draft) {
    if (!item || !(await askConfirm({ title: 'Ignorar lançamento?', message: `Ele será ignorado em ${monthLabel(month)}.`, confirmLabel: 'Ignorar', tone: 'default' }))) return
    updateOccurrence({ ...item, occurrenceKey: `${item.id}|${month}` }, { ignorado: true })
    if (draft && String(draft.id) === String(item.id)) setDraft(null)
  }
  async function addPayment() {
    if (!draft || kind !== 'transaction') return
    const current = paymentState(draft)
    if (current.remaining <= 0) return
    const answer = await askText({ title: 'Valor do pagamento', message: `Restante ${money.format(current.remaining)}`, icon: 'payments', tone: 'default', input: { kind: 'money', value: current.remaining.toFixed(2).replace('.', ',') } }); if (answer === null) return
    const amount = parseMoneyInput(answer)
    if (!Number.isFinite(amount) || amount <= 0) { void notify('Digite um valor de pagamento válido.'); return }
    if (amount - current.remaining > 0.005) { void notify(`O pagamento não pode ser maior que o restante de ${money.format(current.remaining)}.`); return }
    const paymentDate = await askText({ title: 'Data do pagamento', icon: 'calendar_today', tone: 'default', input: { kind: 'date', today, value: today } }); if (paymentDate === null) return
    const payments = [...current.payments, { id: uid('pay'), data: paymentDate, valor: amount, criado_em: new Date().toISOString() }]
    const next = paymentState({ ...draft, pagamentos: payments, valor_pago: 0, status: 'pendente' }, payments)
    setDraft({ ...draft, pagamentos: next.payments, valor_pago: next.paid, status: next.status })
  }
  function removePayment(index: number) {
    if (!draft || kind !== 'transaction') return
    const payments = cleanPayments(draft.pagamentos, dateKey(draft.data)).filter((_, position) => position !== index)
    const next = paymentState({ ...draft, pagamentos: payments, valor_pago: 0, status: 'pendente' }, payments)
    setDraft({ ...draft, pagamentos: next.payments, valor_pago: next.paid, status: next.status })
  }
  function generateInstallments() {
    if (!draft || kind !== 'transaction' || draft.recorrencia !== 'parcelado' || !String(draft.titulo || '').trim()) return
    const quantity = Math.max(2, Number(draft.parcelas || 2)); const lot = String(draft.lote_id || uid('lote')); const total = clampMoney(draft.valor); const installment = draft.dividir_total === false ? total : total / quantity; const baseTitle = String(draft.titulo || '').replace(/\s+\(\d+\/\d+\)$/, '').trim()
    const generated = Array.from({ length: quantity }, (_, index) => ({ ...draft, id: index === 0 ? String(draft.id || uid('fin')) : uid('fin'), lote_id: lot, parcela_numero: index + 1, parcelas_total: quantity, titulo: `${baseTitle} (${index + 1}/${quantity})`, valor: installment, data: moveDateForInstallment(dateKey(draft.data) || today, index, String(draft.intervalo_parcelas || 'mensal')), status: index === 0 ? paymentState({ ...draft, valor: installment }).status : 'pendente', valor_pago: index === 0 ? Math.min(installment, paidAmount(draft)) : 0, pagamentos: index === 0 ? cleanPayments(draft.pagamentos, dateKey(draft.data)) : [], recorrencia: 'unico', parcelas: undefined, intervalo_parcelas: undefined, dividir_total: undefined, dia_mes: undefined, mes_inicio: undefined, mes_fim: undefined, ativo: undefined, _persisted: undefined, _isFixed: undefined }))
    commit(current => ({ ...current, finance: { ...current.finance, fixed: rows(current.finance.fixed).filter(item => String(item.id) !== String(draft.id)), fixedOccurrences: rows(current.finance.fixedOccurrences).filter(item => String(item.fixo_id) !== String(draft.id)), transactions: [...rows(current.finance.transactions).filter(item => String(item.id) !== String(draft.id) && String(item.lote_id || '') !== lot), ...generated] } }))
    setDraft({ ...generated[0], _persisted: true })
  }
  async function reconcile(account: Row) {
    const currentBalance = accountBalance(account)
    const answer = await askText({ title: `Saldo real de ${String(account.nome || 'conta')}`, icon: 'account_balance', tone: 'default', input: { kind: 'money', value: currentBalance.toFixed(2).replace('.', ',') } })
    if (answer === null) return
    const targetBalance = parseSignedMoneyInput(answer)
    if (!Number.isFinite(targetBalance)) { void notify('Digite um saldo válido.'); return }
    const diff = targetBalance - currentBalance
    if (Math.abs(diff) < 0.01) return
    commit(current => ({ ...current, finance: { ...current.finance, transactions: [{ id: uid('fin'), titulo: 'Ajuste de saldo', valor: Math.abs(diff), valor_pago: Math.abs(diff), tipo: diff >= 0 ? 'receita' : 'despesa', categoria: 'Ajuste', conta_id: account.id, cartao_id: '', data: today, status: 'pago', observacao: 'Conciliação bancária', pagamentos: [{ id: uid('pay'), data: today, valor: Math.abs(diff) }], anexos: [], ignorar_calculo: false, recorrencia: 'unico' }, ...rows(current.finance.transactions)] } }))
  }
  const invoicePurchases = (cardId: string) => viewItems.filter(item => !item.ajuste_fatura && !item.ignorar_calculo && item.tipo !== 'receita' && (String(item.conta_id || '') === `card|${cardId}` || String(item.cartao_id || '') === cardId)).reduce((sum, item) => sum + clampMoney(item.valor), 0)
  const invoiceRow = (list: Row[], cardId: string) => list.find(item => item.ajuste_fatura === true && String(item.ajuste_fatura_card_id || item.cartao_id || '') === cardId && String(item.competencia_fatura || dateKey(item.data).slice(0, 7)) === viewMonth)
  const invoiceBase = (card: Row, existing?: Row): Row => ({ ...(existing || {}), id: existing?.id || uid('invoice'), titulo: `Fatura ${String(card.nome || 'Cartão')}`, tipo: 'despesa', data: existing?.data || monthDateForDay(viewMonth, Number(card.vencimento || 10)), categoria: 'Fatura do cartão', conta_id: `card|${String(card.id)}`, cartao_id: String(card.id), conta_pagamento_id: String(card.conta_id || ''), anexos: rows(existing?.anexos), ignorar_calculo: true, recorrencia: 'unico', ajuste_fatura: true, ajuste_fatura_card_id: String(card.id), competencia_fatura: viewMonth })
  const saveInvoice = (card: Row, change: (existing: Row | undefined) => Row) => commit(currentState => {
    const list = rows(currentState.finance.transactions)
    const existing = invoiceRow(list, String(card.id))
    const next = change(existing)
    return { ...currentState, finance: { ...currentState.finance, transactions: existing ? list.map(item => String(item.id) === String(existing.id) ? next : item) : [next, ...list] } }
  })
  const statusOf = (value: number, paid: number) => value > 0 && paid >= value - 0.005 ? 'pago' : paid > 0 ? 'parcial' : 'pendente'

  async function adjustInvoice(card: Row) {
    const current = cardInvoice(card, viewItems)
    const answer = await askText({ title: `Valor da fatura de ${monthLabel(viewMonth).split(' de ')[0]}`, message: 'Troque o valor calculado pelo que veio no banco. Novas compras continuam somando.', icon: 'credit_card', tone: 'default', input: { kind: 'money', value: current.toFixed(2).replace('.', ',') } })
    if (answer === null) return
    const value = parseMoneyInput(answer)
    if (!Number.isFinite(value) || value < 0) { void notify('Digite um valor válido.'); return }
    const delta = value - invoicePurchases(String(card.id))
    saveInvoice(card, existing => { const base = invoiceBase(card, existing); const paid = Math.min(value, clampMoney(existing?.valor_pago)); return { ...base, ajuste_delta: delta, valor: value, valor_pago: paid, pagamentos: rows(existing?.pagamentos), status: statusOf(value, paid) } })
  }
  async function payInvoice(card: Row) {
    const cardId = String(card.id)
    const total = cardInvoice(card, viewItems)
    const paidBefore = clampMoney(invoiceRow(viewItems, cardId)?.valor_pago)
    const remaining = Math.max(0, total - paidBefore)
    if (remaining <= 0) { void notify('Esta fatura já está paga.'); return }
    let amount = remaining
    const full = await askConfirm({ title: `Pagar fatura de ${String(card.nome || 'cartão')}`, message: `${paidBefore > 0 ? `Falta pagar ${money.format(remaining)} de ${money.format(total)}.` : `Valor da fatura: ${money.format(total)}.`} Pagar tudo?`, confirmLabel: 'Pagar tudo', cancelLabel: 'Pagar parte', icon: 'credit_card', tone: 'default' })
    if (!full) {
      const answer = await askText({ title: 'Quanto vai pagar?', message: `Falta ${money.format(remaining)}.`, icon: 'payments', tone: 'default', confirmLabel: 'Pagar', input: { kind: 'money', value: '' } })
      if (answer === null) return
      const parsed = parseMoneyInput(answer)
      if (!Number.isFinite(parsed) || parsed <= 0) { void notify('Digite um valor válido.'); return }
      if (parsed - remaining > 0.005) { void notify(`O valor não pode passar de ${money.format(remaining)}.`); return }
      amount = parsed
    }
    const delta = total - invoicePurchases(cardId)
    saveInvoice(card, existing => {
      const base = invoiceBase(card, existing)
      const payments = [...rows(existing?.pagamentos), { id: uid('pay'), data: today, valor: amount }]
      const paid = Math.min(total, payments.reduce((sum, payment) => sum + clampMoney(payment.valor), 0))
      return { ...base, ajuste_delta: existing?.ajuste_delta ?? delta, valor: total, valor_pago: paid, pagamentos: payments, status: statusOf(total, paid) }
    })
  }
  function showOrigin(origin: string) {
    commit(current => {
      const areaTabs = current.configs.areaTabs && typeof current.configs.areaTabs === 'object' ? current.configs.areaTabs as Record<string, string> : {}
      const filters = current.configs.moduleFilters && typeof current.configs.moduleFilters === 'object' ? current.configs.moduleFilters as Record<string, Row> : {}
      return { ...current, configs: { ...current.configs, areaTabs: { ...areaTabs, finance: 'transactions' }, moduleFilters: { ...filters, finance: { ...(filters.finance || {}), origin } } } }
    })
    setDraft(null)
  }
  async function setBoxBalance() {
    if (!draft || kind !== 'box') return
    const answer = await askText({ title: 'Saldo da caixinha', icon: 'savings', tone: 'default', input: { kind: 'money', value: clampMoney(draft.saldo).toFixed(2).replace('.', ',') } }); if (answer === null) return
    const value = parseMoneyInput(answer); if (!Number.isFinite(value) || value < 0) { void notify('Digite um valor válido.'); return }
    const diff = value - clampMoney(draft.saldo)
    setDraft({ ...draft, saldo: value, movimentos: Math.abs(diff) < 0.005 ? rows(draft.movimentos) : [{ id: uid('mov'), data: new Date().toISOString(), tipo: diff > 0 ? 'entrada' : 'retirada', valor: Math.abs(diff) }, ...rows(draft.movimentos)] })
  }
  async function setInvestmentCurrent() {
    if (!draft || kind !== 'investment') return
    const answer = await askText({ title: 'Valor atual do investimento', icon: 'trending_up', tone: 'default', input: { kind: 'money', value: clampMoney(draft.valor_atual).toFixed(2).replace('.', ',') } }); if (answer === null) return
    const value = parseMoneyInput(answer); if (!Number.isFinite(value) || value < 0) { void notify('Digite um valor válido.'); return }
    setDraft({ ...draft, valor_atual: value })
  }

  function matchesFilters(item: Row) {
    const status = String(item.status || 'pendente')
    if (typeFilter === 'income' && item.tipo !== 'receita') return false
    if (typeFilter === 'expense' && item.tipo === 'receita') return false
    if (statusFilter === 'paid' && status !== 'pago') return false
    if (statusFilter === 'pending' && status === 'pago') return false
    if (statusFilter === 'partial' && status !== 'parcial') return false
    if (statusFilter === 'overdue' && (status === 'pago' || dateKey(item.data) >= today)) return false
    if (categoryFilter !== 'all' && String(item.categoria || '') !== categoryFilter) return false
    if (originFilter !== 'all' && String(item.conta_id || '') !== originFilter && String(item.cartao_id || '') !== originFilter.replace(/^card\|/, '')) return false
    return true
  }

  const filtered = useMemo(() => monthItems.filter(item => item.ajuste_fatura === true || !(String(item.conta_id || '').startsWith('card|') || item.cartao_id)).filter(matchesFilters).sort((a, b) => {
    if (order === 'pending_first') {
      const rank = (item: Row) => String(item.status || 'pendente') === 'pendente' ? 0 : String(item.status || '') === 'parcial' ? 1 : 2
      const statusDiff = rank(a) - rank(b)
      return statusDiff || String(b.data).localeCompare(String(a.data))
    }
    if (order === 'date_asc') return String(a.data).localeCompare(String(b.data))
    if (order === 'value_desc') return clampMoney(b.valor) - clampMoney(a.valor)
    if (order === 'value_asc') return clampMoney(a.valor) - clampMoney(b.valor)
    if (order === 'name') return String(a.titulo).localeCompare(String(b.titulo), 'pt-BR')
    return String(b.data).localeCompare(String(a.data))
  }), [monthItems, typeFilter, statusFilter, categoryFilter, originFilter, order, today])

  function monthTotals(key: string) {
    const items: Row[] = [...transactions.filter(item => dateKey(item.data).slice(0, 7) === key), ...fixedForMonthAt(key)]
    const calc = items.filter(item => !item.ignorar_calculo)
    const income = calc.filter(item => item.tipo === 'receita').reduce((sum, item) => sum + clampMoney(item.valor), 0)
    const invoice = cards.reduce((sum, card) => {
      const cardId = String(card.id)
      const manual = items.find(item => item.ajuste_fatura === true && String(item.ajuste_fatura_card_id || item.cartao_id || '') === cardId && String(item.competencia_fatura || dateKey(item.data).slice(0, 7)) === key)
      const purchases = calc.filter(item => !item.ajuste_fatura && item.tipo !== 'receita' && (String(item.conta_id || '') === `card|${cardId}` || String(item.cartao_id || '') === cardId)).reduce((cardSum, item) => cardSum + clampMoney(item.valor), 0)
      return sum + (manual ? invoiceValue(manual, purchases) : purchases)
    }, 0)
    const orphan = calc.filter(item => {
      if (item.tipo === 'receita') return false
      const accountId = String(item.conta_id || '')
      const cardId = String(item.cartao_id || (accountId.startsWith('card|') ? accountId.slice(5) : ''))
      return Boolean(cardId) && !knownCardIds.has(cardId)
    }).reduce((sum, item) => sum + clampMoney(item.valor), 0)
    const cash = calc.filter(item => item.tipo !== 'receita' && !String(item.conta_id || '').startsWith('card|') && !item.cartao_id).reduce((sum, item) => sum + clampMoney(item.valor), 0)
    return { items: calc, income, invoice, expense: cash + invoice + orphan }
  }
  const reportMonths = period === 'month' ? [month] : period === '3' ? monthSequence(shiftMonth(today.slice(0, 7), -2), today.slice(0, 7)) : period === '6' ? monthSequence(shiftMonth(today.slice(0, 7), -5), today.slice(0, 7)) : period === 'year' ? monthSequence(`${today.slice(0, 4)}-01`, `${today.slice(0, 4)}-12`) : monthSequence(customFrom, customTo)
  const rangeMode = tab === 'reports' && period !== 'month'
  const reportTotals = reportMonths.map(monthTotals)
  const reportItems = reportTotals.flatMap(entry => entry.items)
  const reportIncome = reportTotals.reduce((sum, entry) => sum + entry.income, 0)
  const reportExpense = reportTotals.reduce((sum, entry) => sum + entry.expense, 0)
  const reportInvoice = reportTotals.reduce((sum, entry) => sum + entry.invoice, 0)
  const reportSaving = reportIncome - reportExpense
  const stripIncome = rangeMode ? reportIncome : monthIncome
  const stripExpense = rangeMode ? reportExpense : monthExpense
  const stripInvoice = rangeMode ? reportInvoice : monthInvoice
  const stripSaving = stripIncome - stripExpense
  const stripPercent = stripIncome ? Math.round(stripSaving / stripIncome * 100) : 0
  const palette = ['var(--ds-rose-fg)', 'var(--ds-peach-fg)', 'var(--ds-sky-fg)', 'var(--ds-lilac-fg)', 'var(--ds-mint-fg)', 'var(--ds-teal-fg)', 'var(--ds-accent)', 'var(--ds-success)']
  const greens = ['var(--ds-success)', 'var(--ds-success-bright)', 'var(--ds-mint-fg)', 'var(--ds-teal-fg)']
  type Slice = { name: string; value: number; color: string }
  const sumBy = (list: Row[], keyOf: (item: Row) => string, colors: string[] | ((name: string) => string)): Slice[] => {
    const map = new Map<string, number>()
    list.forEach(item => map.set(keyOf(item), (map.get(keyOf(item)) || 0) + clampMoney(item.valor)))
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, value], index) => ({ name, value, color: typeof colors === 'function' ? colors(name) : colors[index % colors.length] }))
  }
  const reportExpenses = reportItems.filter(item => item.tipo !== 'receita')
  const reportIncomes = reportItems.filter(item => item.tipo === 'receita')
  const originColor = (name: string) => {
    const account = accounts.find(item => String(item.nome) === name)
    const card = cards.find(item => String(item.nome) === name)
    return String((account || card)?.cor || '#4073FF')
  }
  const reportBlocks: { title: string; total: number; tone: 'out' | 'in'; slices: Slice[] }[] = [
    { title: 'Despesas por categoria', total: reportExpenses.reduce((sum, item) => sum + clampMoney(item.valor), 0), tone: 'out', slices: sumBy(reportExpenses, item => String(item.categoria || 'Sem categoria'), palette) },
    { title: 'Receitas por categoria', total: reportIncomes.reduce((sum, item) => sum + clampMoney(item.valor), 0), tone: 'in', slices: sumBy(reportIncomes, item => String(item.categoria || 'Sem categoria'), greens) },
    { title: 'Despesas por conta e cartão', total: reportExpenses.reduce((sum, item) => sum + clampMoney(item.valor), 0), tone: 'out', slices: sumBy(reportExpenses, item => originName(item.conta_id || (item.cartao_id ? `card|${item.cartao_id}` : ''), accounts, cards), originColor) },
    { title: 'Despesas fixas e variáveis', total: reportExpenses.reduce((sum, item) => sum + clampMoney(item.valor), 0), tone: 'out', slices: sumBy(reportExpenses, item => item._isFixed ? 'Fixas' : 'Variáveis', name => name === 'Fixas' ? 'var(--ds-sky-fg)' : 'var(--ds-peach-fg)') },
  ]
  const periodLabel = period === 'month' ? 'Mensal' : period === '3' ? 'Últimos 3 meses' : period === '6' ? 'Últimos 6 meses' : period === 'year' ? 'Este ano' : 'Personalizado'
  const periodRange = reportMonths.length ? (reportMonths.length === 1 ? monthLabel(reportMonths[0]) : `${monthLabel(reportMonths[0])} – ${monthLabel(reportMonths[reportMonths.length - 1])}`) : 'Período inválido'
  const pendingCount = filtered.filter(item => paymentState(item).status !== 'pago').length
  const filtersActive = typeFilter !== 'all' || statusFilter !== 'all' || categoryFilter !== 'all' || originFilter !== 'all'
  const accountSummary = draft ? originName(draft.conta_id, accounts, cards) : 'Sem origem'

  const categoryPalette = ['var(--ds-rose-fg)', 'var(--ds-peach-fg)', 'var(--ds-sky-fg)', 'var(--ds-lilac-fg)', 'var(--ds-mint-fg)', 'var(--ds-teal-fg)', 'var(--ds-accent)', 'var(--ds-success)']
  const dateChoices = [{ label: 'Hoje', icon: 'today', value: today }, { label: 'Amanhã', icon: 'wb_sunny', value: addDays(today, 1) }]
  function financeMenu(item: Row): QuickMenuConfig {
    const id = String(item.id)
    const due = dateKey(item.data)
    const income = item.tipo === 'receita'
    const payment = paymentState(item)
    const paid = payment.status === 'pago'
    const title = String(item.titulo || 'Lançamento')
    const moveTo = (value: string) => {
      if (item._isFixed) updateOccurrence({ ...item, occurrenceKey: `${id}|${month}` }, { data_override: value })
      else commit(current => ({ ...current, finance: { ...current.finance, transactions: rows(current.finance.transactions).map(row => String(row.id) === id ? { ...row, data: value, dia_mes: Number(value.slice(8)) } : row) } }))
    }
    const patchTx = (patch: Row) => commit(current => ({ ...current, finance: { ...current.finance, transactions: rows(current.finance.transactions).map(row => String(row.id) === id ? { ...row, ...patch } : row) } }))
    return {
      title,
      subtitle: `${income ? '+' : '−'}${money.format(payment.remaining || clampMoney(item.valor))} · ${naturalDate(due, today)}`,
      groups: [
        { label: 'Vencimento', inline: true, options: dateChoices.map(choice => ({ label: choice.label, icon: choice.icon, active: due === choice.value, onSelect: () => moveTo(choice.value) })), calendar: { value: due || today, today, onSelect: moveTo } },
        { label: 'Situação', inline: true, options: [
          { label: 'Em aberto', icon: 'schedule', color: 'var(--ds-warn)', active: !paid, onSelect: () => { if (paid) return togglePaid(item) } },
          { label: income ? 'Recebido' : 'Pago', icon: 'check_circle', color: 'var(--ds-success)', active: paid, onSelect: () => { if (!paid) return togglePaid(item) } },
        ] },
        ...(item._isFixed ? [] : [
          { label: 'Tipo', inline: true, options: [
            { label: 'Despesa', icon: 'trending_down', color: 'var(--ds-danger)', active: !income, onSelect: () => patchTx({ tipo: 'despesa' }) },
            { label: 'Receita', icon: 'trending_up', color: 'var(--ds-success)', active: income, onSelect: () => patchTx({ tipo: 'receita' }) },
          ] },
          ...(categories.length ? [{ label: 'Categoria', inline: true, options: [
            ...categories.slice(0, 12).map(category => { const name = String(category.nome || ''); return { label: name, swatch: categoryColorOf(name, categories), active: String(item.categoria || '') === name, onSelect: () => patchTx({ categoria: String(item.categoria || '') === name ? '' : name }) } }),
          ] }] : []),
          ...(accounts.length || cards.length ? [{ label: 'Conta ou cartão', inline: true, options: [
            ...accounts.map(account => ({ label: String(account.nome || 'Conta'), swatch: String(account.cor || '#4073FF'), active: String(item.conta_id || '') === String(account.id), onSelect: () => patchTx({ conta_id: String(account.id), cartao_id: '' }) })),
            ...cards.map(card => ({ label: String(card.nome || 'Cartão'), swatch: String(card.cor || '#4073FF'), active: String(item.conta_id || '') === `card|${card.id}`, onSelect: () => patchTx({ conta_id: `card|${card.id}`, cartao_id: String(card.id) }) })),
          ] }] : []),
        ]),
        { options: [
          ...(item._isFixed ? [] : [
            { label: 'Alterar valor', icon: 'payments', hint: money.format(clampMoney(item.valor)), onSelect: async () => {
              const answer = await askText({ title: 'Valor do lançamento', icon: 'payments', tone: 'default', input: { kind: 'money', value: clampMoney(item.valor).toFixed(2).replace('.', ',') } })
              if (answer === null) return
              const value = parseMoneyInput(answer)
              if (!Number.isFinite(value) || value <= 0) { void notify('Digite um valor válido.'); return }
              patchTx({ valor: value })
            } },
            { label: 'Renomear', icon: 'edit', onSelect: async () => {
              const answer = await askText({ title: 'Nome do lançamento', icon: 'edit', tone: 'default', input: { kind: 'text', value: title } })
              if (answer === null || !answer.trim()) return
              patchTx({ titulo: answer.trim() })
            } },
            { label: 'Duplicar', icon: 'content_copy', onSelect: () => commit(current => ({ ...current, finance: { ...current.finance, transactions: [{ ...item, id: uid('fin'), status: 'pendente', valor_pago: 0, pagamentos: [], lote_id: undefined }, ...rows(current.finance.transactions)] } })) },
          ]),
          { label: 'Abrir detalhes', icon: 'open_in_full', onSelect: () => openTransaction(item) },
          { label: item._isFixed ? 'Ignorar neste mês' : 'Excluir', icon: 'delete', tone: 'danger', onSelect: async () => {
            if (item._isFixed) { await ignoreFixed(item); return }
            if (!(await askConfirm({ title: 'Excluir lançamento?', message: `“${title}” será excluído. Não dá para desfazer.` }))) return
            commit(current => ({ ...current, finance: { ...current.finance, transactions: rows(current.finance.transactions).filter(row => String(row.id) !== id) } }))
          } },
        ] },
      ],
    }
  }
  function entityMenu(type: Exclude<DraftKind, 'transaction'>, item: Row): QuickMenuConfig {
    const key = type === 'account' ? 'accounts' : type === 'card' ? 'cards' : type === 'box' ? 'boxes' : 'investments'
    const name = String(item.nome || 'Registro')
    const itemId = String(item.id)
    const patchItem = (patch: Row) => commit(current => ({ ...current, finance: { ...current.finance, [key]: rows((current.finance as Row)[key]).map(row => String(row.id) === itemId ? { ...row, ...patch } : row) } }))
    const askValue = async (title: string, field: string, icon: string) => {
      const answer = await askText({ title, icon, tone: 'default', input: { kind: 'money', value: clampMoney(item[field]).toFixed(2).replace('.', ',') } })
      if (answer === null) return
      const value = parseMoneyInput(answer)
      if (!Number.isFinite(value) || value < 0) { void notify('Digite um valor válido.'); return }
      patchItem({ [field]: value })
    }
    const valueOption = type === 'account' ? { label: 'Saldo inicial', icon: 'payments', hint: money.format(clampMoney(item.saldo_inicial)), onSelect: () => askValue('Saldo inicial da conta', 'saldo_inicial', 'account_balance') }
      : type === 'card' ? { label: 'Limite total', icon: 'payments', hint: money.format(clampMoney(item.limite)), onSelect: () => askValue('Limite do cartão', 'limite', 'credit_card') }
      : type === 'box' ? { label: 'Meta', icon: 'flag', hint: clampMoney(item.meta) ? money.format(clampMoney(item.meta)) : 'Sem meta', onSelect: () => askValue('Meta da caixinha', 'meta', 'savings') }
      : { label: 'Valor atual', icon: 'payments', hint: money.format(clampMoney(item.valor_atual)), onSelect: () => askValue('Valor atual do investimento', 'valor_atual', 'trending_up') }
    return {
      title: name,
      subtitle: type === 'card' ? `Fatura ${money.format(cardInvoice(item, monthItems, month))}` : type === 'account' ? 'Conta' : type === 'box' ? 'Caixinha' : 'Investimento',
      groups: [
        { label: 'Cor', inline: true, options: PALETTE.slice(0, 20).map(color => ({ label: color.label, swatch: color.color, active: String(item.cor || '').toLowerCase() === color.color.toLowerCase(), onSelect: () => patchItem({ cor: color.color }) })).map(option => ({ ...option, compact: true })) },
        { options: [
          { label: 'Renomear', icon: 'edit', onSelect: async () => {
            const answer = await askText({ title: 'Nome', icon: 'edit', tone: 'default', input: { kind: 'text', value: name } })
            if (answer === null || !answer.trim()) return
            patchItem({ nome: answer.trim() })
          } },
          valueOption,
          ...(type === 'card' ? [
            { label: 'Alterar valor da fatura', icon: 'receipt_long', onSelect: () => adjustInvoice(item) },
            { label: 'Pagar fatura', icon: 'task_alt', onSelect: () => payInvoice(item) },
          ] : []),
          { label: 'Duplicar', icon: 'content_copy', onSelect: () => commit(current => ({ ...current, finance: { ...current.finance, [key]: [...rows((current.finance as Row)[key]), { ...item, id: uid(type === 'account' ? 'cta' : type === 'card' ? 'crd' : type === 'box' ? 'box' : 'inv'), nome: `${name} (cópia)` }] } })) },
          { label: 'Abrir detalhes', icon: 'open_in_full', onSelect: () => openExisting(type, item) },
          { label: 'Excluir', icon: 'delete', tone: 'danger', onSelect: async () => {
            if (!(await askConfirm({ title: 'Excluir registro?', message: `“${name}” será excluído. Não dá para desfazer.` }))) return
            commit(current => ({ ...current, finance: { ...current.finance, [key]: rows((current.finance as Row)[key]).filter(row => String(row.id) !== itemId) } }))
          } },
        ] },
      ],
    }
  }
  const transactionRow = (item: Row) => <div key={`${item._isFixed ? 'fix' : 'tx'}-${String(item.id)}`} {...quick.bind(() => financeMenu(item))}><FinanceTransactionCard
    item={item}
    accounts={accounts}
    cards={cards}
    today={today}
    compact
    onOpen={() => openTransaction(item)}
    onTogglePaid={() => togglePaid(item)}
  /></div>

  const tabs: { id: Tab; label: string }[] = [
    { id: 'transactions', label: 'Lançamentos' }, { id: 'accounts', label: 'Contas' }, { id: 'cards', label: 'Cartões' }, { id: 'boxes', label: 'Caixinhas' }, { id: 'investments', label: 'Investimentos' }, { id: 'reports', label: 'Relatórios' },
  ]

  const draftPayment = draft && kind === 'transaction' ? paymentState(draft) : null

  const addTarget: Record<Tab, { kind: DraftKind; label: string }> = { transactions: { kind: 'transaction', label: 'Lançamento' }, accounts: { kind: 'account', label: 'Conta' }, cards: { kind: 'card', label: 'Cartão' }, boxes: { kind: 'box', label: 'Caixinha' }, investments: { kind: 'investment', label: 'Investimento' }, reports: { kind: 'transaction', label: 'Lançamento' } }
  const ofSubtitle = (pluggyId: string, type: 'account' | 'card') => {
    const info = openFinance.info(pluggyId)
    const when = info?.atualizado ? new Date(info.atualizado).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
    return `Open Finance${info ? ` · ${info.banco}` : ''}${type === 'account' && info ? ` · no banco ${money.format(info.saldo)}` : ''}${when ? ` · ${when}` : ''}`
  }
  const signedMoney = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${money.format(Math.abs(value))}`
  const addRow = (label: string, onClick: () => void) => <button type="button" className={fm.addRow} onClick={onClick}><MaiIcon name="add" size={18} />{label}</button>
  const calIcon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
  const dueTone = (key: string) => key < today ? 'late' : key === today ? 'today' : 'future'
  const periodOptions: { id: typeof period; label: string }[] = [{ id: 'month', label: 'Mensal' }, { id: '3', label: 'Últimos 3 meses' }, { id: '6', label: 'Últimos 6 meses' }, { id: 'year', label: 'Este ano' }, { id: 'custom', label: 'Personalizado' }]
  const barBlock = (block: typeof reportBlocks[number]) => <section className={fm.reportBlock} key={block.title}>
    <div className={fm.reportTitle}><strong>{block.title}</strong><span>{money.format(block.total)}</span></div>
    <div className={fm.barList}>{block.slices.map(slice => { const percent = block.total ? slice.value / block.total * 100 : 0; return <div className={fm.barRow} key={slice.name}><div className={fm.barTop}><span className={fm.barName}>{slice.name}</span><span className={fm.barPct}>{percent.toFixed(1).replace('.', ',')}%</span><span className={fm.barValue} data-tone={block.tone}>{money.format(slice.value)}</span></div><div className={fm.barTrack}><div style={{ width: `${percent}%`, background: slice.color }} /></div></div> })}{!block.slices.length ? <div className={fm.empty}>Sem dados no período.</div> : null}</div>
  </section>

  return <div className={`mai-v3-area-page mai-v4-finance ${fm.page}`} onContextMenu={event => { const target = event.target as HTMLElement; if (!target.closest('input, textarea')) event.preventDefault() }}>
    <div className={fm.top}>
      <h1 className={fm.title}>Financeiro</h1>
      <div className={fm.topRight}>
      {rangeMode ? <div className={fm.month}><span className={fm.label}>{periodRange}</span></div> : <div className={fm.month}><button type="button" onClick={() => moveMonth(-1)} aria-label="Mês anterior">‹</button><button type="button" className={fm.label} aria-label="Voltar ao mês atual" title="Voltar ao mês atual" onClick={() => setMonth(today.slice(0, 7))}>{monthLabel(month)}</button><button type="button" onClick={() => moveMonth(1)} aria-label="Próximo mês">›</button></div>}
        {options ? <div className={fm.options}>{options}</div> : null}
      </div>
    </div>

    <div className={fm.balance}>
      <div><small>Saldo inicial</small><b>{money.format(monthStartBalance)}</b></div><i />
      <button type="button" className={fm.balanceMain} onClick={resetView} title="Voltar ao início (mês atual, sem filtros)"><small>Saldo atual</small><strong data-negative={realBalance < 0}>{money.format(realBalance)}</strong></button><i />
      <div className={fm.balanceEnd}><small>Saldo previsto</small><b>{money.format(projectedBalance)}</b></div>
    </div>

    <div className={fm.summary}>
      <button type="button" onClick={() => openSummary('transactions', 'income')} title="Ver só as receitas"><span>Receitas</span><strong data-tone="in">{money.format(stripIncome)}</strong></button>
      <button type="button" onClick={() => openSummary('transactions', 'expense')} title="Ver só as despesas"><span>Despesas</span><strong data-tone="neg">{money.format(stripExpense)}</strong></button>
      <button type="button" onClick={() => openSummary('cards')} title="Ver os cartões"><span>Cartões de crédito</span><strong data-tone="card">{money.format(stripInvoice)}</strong></button>
      <button type="button" onClick={() => openSummary('reports')} title="Ver os relatórios"><span>Economia mensal</span><strong data-tone={stripSaving < 0 ? 'neg' : 'in'}>{signedMoney(stripSaving)} <small>{stripPercent > 0 ? '+' : ''}{stripPercent}%</small></strong></button>
    </div>

    <div className={fm.tabs} role="tablist">{tabs.map(item => <button key={item.id} role="tab" aria-selected={tab === item.id} data-active={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>

    {tab === 'transactions' ? <>
      <div className={fm.listHead}><span>{filtered.length} {filtered.length === 1 ? 'lançamento' : 'lançamentos'} em {monthLabel(month).split(' de ')[0]}</span><span>{pendingCount} {pendingCount === 1 ? 'pendente' : 'pendentes'}</span></div>
      <div className={fm.list}>{filtered.map(transactionRow)}</div>
      {!filtered.length ? <div className={fm.empty}>Nenhum lançamento encontrado.</div> : null}
      {quickAdding ? <QuickAdd inline kinds={['finance']} initial="finance" state={state} today={today} defaultDate={today} commit={commit} onFinance={() => undefined} onClose={() => setQuickAdding(false)} /> : addRow('Adicionar lançamento', () => setQuickAdding(true))}
    </> : null}

    {tab === 'accounts' ? <>
      <div className={fm.listHead}><span>{accounts.length} {accounts.length === 1 ? 'conta' : 'contas'}</span><span>{money.format(realBalance)} no total</span></div>
      <div className={fm.list}>{accounts.map(account => <div key={String(account.id)} className={fm.entityRow} {...quick.bind(() => entityMenu('account', account))}><button type="button" className={fm.entity} onClick={() => openExisting('account', account)}><i className={fm.ring} style={{ '--ring': String(account.cor || 'var(--ds-accent)') } as React.CSSProperties} /><span className={fm.copy}><span className={fm.name}>{account.nome}</span><span className={fm.sub}>{account.pluggy_id ? ofSubtitle(String(account.pluggy_id), 'account') : `Saldo inicial ${money.format(Number(account.saldo_inicial || 0))}`}</span></span><span className={fm.amount}><b>{money.format(accountBalance(account))}</b></span></button></div>)}</div>
      {addRow('Adicionar conta', () => openNew('account'))}
      <OpenFinancePanel ctl={openFinance} />
    </> : null}

    {tab === 'cards' ? <>
      <div className={fm.listHead}><span>{cards.length} {cards.length === 1 ? 'cartão' : 'cartões'}</span><span>Faturas de {monthLabel(month).split(' de ')[0]} · {money.format(monthInvoice)}</span></div>
      <div className={fm.list}>{cards.map(card => { const invoice = cardInvoice(card, monthItems, month); const openInvoice = Math.max(0, invoice - clampMoney(invoiceRow(monthItems, String(card.id))?.valor_pago)); const limit = clampMoney(card.limite); const dueKey = monthDateForDay(month, Number(card.vencimento || 10)); return <div key={String(card.id)} className={fm.entityRow} {...quick.bind(() => entityMenu('card', card))}><button type="button" className={fm.entity} onClick={() => openExisting('card', card)}><i className={fm.ring} style={{ '--ring': String(card.cor || 'var(--ds-accent)') } as React.CSSProperties} /><span className={fm.copy}><span className={fm.name}>{card.nome}</span><span className={fm.subLine}>{card.pluggy_id ? <span>{ofSubtitle(String(card.pluggy_id), 'card')}</span> : null}<span className={fm.due} data-tone={dueTone(dueKey)}>{calIcon}Vence {naturalDate(dueKey, today)}</span>{limit ? <span>{money.format(Math.max(0, limit - openInvoice))} de limite disponível</span> : null}</span></span><span className={fm.amount}><b>{money.format(invoice)}</b></span></button></div> })}</div>
      {addRow('Adicionar cartão', () => openNew('card'))}
    </> : null}

    {tab === 'boxes' ? <>
      <div className={fm.listHead}><span>{boxes.length} {boxes.length === 1 ? 'caixinha' : 'caixinhas'}</span><span>{money.format(totalBoxes)} guardados</span></div>
      <div className={fm.list}>{boxes.map(box => { const target = clampMoney(box.meta); const current = clampMoney(box.saldo); const prazo = dateKey(box.prazo); return <div key={String(box.id)} className={fm.entityRow} {...quick.bind(() => entityMenu('box', box))}><button type="button" className={fm.entity} onClick={() => openExisting('box', box)}><i className={fm.ring} style={{ '--ring': String(box.cor || 'var(--ds-accent)') } as React.CSSProperties} /><span className={fm.copy}><span className={fm.name}>{box.nome}</span><span className={fm.subLine}>{prazo ? <span className={fm.due} data-tone={dueTone(prazo)}>{calIcon}Até {naturalDate(prazo, today)}</span> : null}<span>{target ? `Meta ${money.format(target)}` : 'Sem meta definida'}</span></span></span><span className={fm.amount}><b>{money.format(current)}</b></span></button></div> })}</div>
      {addRow('Adicionar caixinha', () => openNew('box'))}
    </> : null}

    {tab === 'investments' ? <>
      <div className={fm.listHead}><span>{investments.length} {investments.length === 1 ? 'investimento' : 'investimentos'}</span><span>{money.format(totalInvestmentValue)} · <span className={investmentResult >= 0 ? fm.pos : fm.neg}>{signedMoney(investmentResult)}</span></span></div>
      <div className={fm.list}>{investments.map(item => { const gain = clampMoney(item.valor_atual) - clampMoney(item.aportado); const percent = clampMoney(item.aportado) ? gain / clampMoney(item.aportado) * 100 : 0; return <div key={String(item.id)} className={fm.entityRow} {...quick.bind(() => entityMenu('investment', item))}><button type="button" className={fm.entity} onClick={() => openExisting('investment', item)}><i className={fm.ring} style={{ '--ring': String(item.cor || 'var(--ds-accent)') } as React.CSSProperties} /><span className={fm.copy}><span className={fm.name}>{item.nome}</span><span className={fm.subLine}><span className={gain >= 0 ? fm.pos : fm.neg}>{signedMoney(gain)} · {percent.toFixed(1).replace('.', ',')}%</span><span>Aplicado {money.format(clampMoney(item.aportado))}</span></span></span><span className={fm.amount}><b>{money.format(clampMoney(item.valor_atual))}</b></span></button></div> })}</div>
      {addRow('Adicionar investimento', () => openNew('investment'))}
    </> : null}

    {tab === 'reports' ? <>
      <div className={fm.periodBar}>
        {period === 'custom' ? <span className={fm.customRange}>De <MonthStepper value={customFrom} onChange={setCustomFrom} /> Até <MonthStepper value={customTo} onChange={setCustomTo} /></span> : null}
        <div className={fm.periodWrap}>
          <button type="button" className={fm.periodChip} onClick={() => setPeriodMenu(open => !open)}>Período <b>{periodLabel}</b><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg></button>
          {periodMenu ? <div className={fm.periodMenu}>{periodOptions.map(option => <button key={option.id} type="button" data-active={period === option.id} onClick={() => { setPeriod(option.id); setPeriodMenu(false) }}>{option.label}{period === option.id ? <span>✓</span> : null}</button>)}</div> : null}
        </div>
      </div>
      {reportBlocks.map(barBlock)}
    </> : null}

    {quick.element}
    {draft ? (() => {
      const crumbKind = kind === 'transaction' ? 'Lançamentos' : kind === 'account' ? 'Contas' : kind === 'card' ? 'Cartões' : kind === 'box' ? 'Caixinhas' : 'Investimentos'
      const lineTone = (item: Row) => item.tipo === 'receita' ? 'in' : 'out'
      const txLine = (item: Row) => { const paid = paymentState(item).status === 'pago'; return <button type="button" key={`${item._isFixed ? 'f' : 't'}-${String(item.id)}-${dateKey(item.data)}`} className={ic.line} {...quick.bind(() => financeMenu(item))} onClick={() => void openFromParent(item)}><span className={ic.lineCheck} data-paid={paid} style={paid ? undefined : { borderColor: item.tipo === 'receita' ? 'var(--ds-success)' : 'var(--ds-danger)' }}>{paid ? '✓' : ''}</span><span className={ic.lineText}><b>{String(item.titulo || 'Lançamento')}</b><small style={!paid && dateKey(item.data) < today ? { color: 'var(--ds-danger)' } : !paid && dateKey(item.data) === today ? { color: 'var(--ds-warn)' } : undefined}>{naturalDate(dateKey(item.data), today)}</small></span><span className={ic.lineValue} data-tone={lineTone(item)}>{item.tipo === 'receita' ? '+' : '−'} {money.format(clampMoney(item.valor))}</span></button> }
      const isDone = (mov: Row) => mov.efetivado !== false
      const editableMove = (mov: Row) => kind === 'box' || mov.tipo === 'aporte'
      const moveEffect = (base: Row, mov: Row, sign: 1 | -1): Row => {
        const signed = clampMoney(mov.valor) * sign
        if (kind === 'box') return { ...base, saldo: Math.max(0, clampMoney(base.saldo) + (mov.tipo === 'entrada' ? signed : -signed)) }
        if (mov.tipo === 'aporte') return { ...base, aportado: Math.max(0, clampMoney(base.aportado) + signed), valor_atual: Math.max(0, clampMoney(base.valor_atual) + signed) }
        return base
      }
      const toggleMove = (mov: Row) => { if (!editableMove(mov)) return; const next = moveEffect(draft, mov, isDone(mov) ? -1 : 1); setDraft({ ...next, movimentos: rows(draft.movimentos).map(item => String(item.id) === String(mov.id) ? { ...item, efetivado: !isDone(mov) } : item) }) }
      const deleteMove = async (mov: Row) => {
        if (!(await askConfirm({ title: 'Excluir lançamento?', message: 'Ele será removido e o valor volta como se não existisse.' }))) return
        const base = isDone(mov) && editableMove(mov) ? moveEffect(draft, mov, -1) : draft
        setDraft({ ...base, movimentos: rows(draft.movimentos).filter(item => String(item.id) !== String(mov.id)) })
        setMoveForm(null)
      }
      const editMove = (mov: Row) => { if (!editableMove(mov)) return; setMoveForm({ type: mov.tipo === 'entrada' || mov.tipo === 'aporte' ? 'in' : 'out', amount: String(clampMoney(mov.valor)).replace('.', ','), date: dateKey(mov.data) || today, cal: false, done: isDone(mov), editId: String(mov.id), titulo: String(mov.titulo || '') }) }
      const moveLine = (mov: Row, plus: boolean) => { const done = isDone(mov); const editable = editableMove(mov); return <div key={String(mov.id)} className={ic.line} {...quick.bind(() => ({ title: plus ? (kind === 'box' ? 'Guardado' : 'Aporte') : (kind === 'box' ? 'Retirada' : 'Resgate'), subtitle: `${plus ? '+' : '−'}${money.format(clampMoney(mov.valor))}`, groups: [{ options: editable ? [{ label: done ? 'Marcar como pendente' : 'Marcar como efetivado', icon: done ? 'undo' : 'check_circle', onSelect: () => toggleMove(mov) }, { label: 'Editar', icon: 'edit', onSelect: () => editMove(mov) }, { label: 'Excluir', icon: 'delete', tone: 'danger' as const, onSelect: () => deleteMove(mov) }] : [{ label: 'Excluir', icon: 'delete', tone: 'danger' as const, onSelect: () => deleteMove(mov) }] }] }))}><button type="button" className={ic.lineCheck} data-paid={done} disabled={!editable} title={done ? 'Marcar como pendente' : 'Marcar como efetivado'} style={done ? undefined : { borderColor: plus ? 'var(--ds-success)' : 'var(--ds-danger)' }} onClick={() => toggleMove(mov)}>{done ? '✓' : ''}</button><button type="button" className={ic.lineBody} disabled={!editable} onClick={() => editMove(mov)}><span className={ic.lineText}><b>{plus ? (kind === 'box' ? 'Guardado' : 'Aporte') : (kind === 'box' ? 'Retirada' : 'Resgate')}</b><small>{new Date(mov.data).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}{done ? '' : ' · pendente'}</small></span><span className={ic.lineValue} data-tone={plus ? 'in' : 'out'}>{plus ? '+' : '−'} {money.format(clampMoney(mov.valor))}</span></button></div> }
      const listSection = (title: string, count: number, children: ReactNode, _empty?: string) => !count ? null : <section className={ic.section}><h3>{title}<small>{count}</small></h3>{children}</section>
      const draftId = String(draft.id)
      const accountTx = kind === 'account' ? viewItems.filter(item => String(item.conta_id || '') === draftId || (item.ajuste_fatura === true && String(item.conta_pagamento_id || '') === draftId)).sort((x, y) => String(x.data).localeCompare(String(y.data))) : []
      const inMonth = (mov: Row) => dateKey(mov.data).slice(0, 7) === viewMonth
      const permanent = kind === 'box' || kind === 'investment'
      const monthMoves = rows(draft.movimentos).filter(mov => permanent || inMonth(mov))
      const cardTx = kind === 'card' ? viewItems.filter(item => !item.ajuste_fatura && item.tipo !== 'receita' && (String(item.conta_id || '') === `card|${draftId}` || String(item.cartao_id || '') === draftId)).sort((x, y) => String(x.data).localeCompare(String(y.data))) : []
      const history = kind === 'transaction' && draft._persisted ? [...transactions.filter(item => String(item.id) !== draftId && String(item.titulo || '').replace(/\s+\(\d+\/\d+\)$/, '') === String(draft.titulo || '').replace(/\s+\(\d+\/\d+\)$/, '')), ...(draft._isFixed ? [-1, -2, -3].flatMap(delta => { const rule = fixed.find(item => String(item.id) === draftId); const entry = rule ? fixedRuleAtMonth(rule, shiftMonth(viewMonth, delta)) : null; return entry ? [entry] : [] }) : [])].sort((x, y) => String(y.data).localeCompare(String(x.data))).slice(0, 6) : []
      const dueLabel = (key: string) => naturalDate(key, today)
      const tagCtx = { categories, accounts, cards }
      const tagResult = kind === 'transaction' ? parseFinanceTags(String(draft.titulo || ''), tagCtx) : null
      const nlResult = kind === 'transaction' ? parseNatural(String(draft.titulo || ''), { today, kinds: ['date', 'amount', 'repeat', 'installments'] }) : null
      const titleWords = String(draft.titulo || '').split(/\s+/)
      const lastWord = titleWords[titleWords.length - 1] || ''
      const tagHints = kind === 'transaction' && /^[#@!]/.test(lastWord) ? financeTagSuggestions(lastWord, tagCtx) : []
      const applyNl = () => {
        if (!nlResult || !tagResult || (!nlResult.tokens.length && !tagResult.tokens.length)) return
        const tags = parseFinanceTags(nlResult.title, tagCtx)
        const date = nlResult.date || dateKey(draft.data)
        const monthly = nlResult.repeat === 'mensalmente'
        const newCategory = tags.category && tags.categoryIsNew && !categories.some(item => String(item.nome).toLocaleLowerCase('pt-BR') === tags.category!.toLocaleLowerCase('pt-BR')) ? tags.category : ''
        if (newCategory) {
          const color = categoryPalette[categories.length % categoryPalette.length]
          commit(current => ({ ...current, finance: { ...current.finance, categories: [...rows(current.finance.categories), { id: uid('cat'), nome: newCategory, cor: color }] } }))
        }
        setDraft({ ...draft, titulo: tags.title, data: date, ...(tags.category ? { categoria: tags.category } : {}), ...(tags.origin ? { conta_id: tags.origin } : {}), ...(tags.type ? { tipo: tags.type } : {}), dia_mes: Number(date.slice(8)) || draft.dia_mes, mes_inicio: draft.mes_inicio || date.slice(0, 7), valor: nlResult.amount ?? draft.valor, ...(monthly ? { recorrencia: 'fixo', _isFixed: true } : {}), ...(nlResult.installments && !draft.lote_id ? { recorrencia: 'parcelado', _isFixed: false, parcelas: nlResult.installments.count, intervalo_parcelas: nlResult.installments.interval, dividir_total: false } : {}) })
      }
      const mirror = (() => { const text = String(draft.titulo || ''); const parts: ReactNode[] = []; let cursor = 0; [...(nlResult?.tokens || []), ...(tagResult?.tokens || [])].sort((a, b) => a.start - b.start).filter((token, index, list) => !index || token.start >= list[index - 1].end).forEach((token, index) => { parts.push(<span key={`p${index}`}>{text.slice(cursor, token.start)}</span>, <mark key={`m${index}`}>{text.slice(token.start, token.end)}</mark>); cursor = token.end }); parts.push(<span key="end">{text.slice(cursor)}</span>); return parts })()
      const title = kind === 'transaction' ? <><div className={ic.titleWrap}><div className={ic.mirror} aria-hidden="true">{mirror}</div><input className={ic.title} autoFocus={!draft._persisted} value={draft.titulo || ''} placeholder="Ex.: Aluguel dia 5 R$ 1800 todo mês" onChange={event => setDraft({ ...draft, titulo: event.target.value })} onBlur={applyNl} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (tagHints.length) setDraft({ ...draft, titulo: `${String(draft.titulo || '').slice(0, String(draft.titulo || '').length - lastWord.length)}${tagHints[0].insert} ` }); else applyNl() } }} /></div>{tagHints.length ? <div className={ic.hints}>{tagHints.map(hint => <button key={hint.label} type="button" onMouseDown={event => event.preventDefault()} onClick={() => setDraft({ ...draft, titulo: `${String(draft.titulo || '').slice(0, String(draft.titulo || '').length - lastWord.length)}${hint.insert} ` })}><i style={{ color: hint.color }}><MaiIcon name={hint.icon} size={14} /></i>{hint.label}</button>)}</div> : null}</> : <input className={ic.title} autoFocus={!draft._persisted} value={draft.nome || ''} placeholder={kind === 'account' ? 'Nome da conta' : kind === 'card' ? 'Nome do cartão' : kind === 'box' ? 'Ex.: Meu carro' : 'Ex.: ETFs globais'} onChange={event => setDraft({ ...draft, nome: event.target.value })} />
      const accountChoices = [{ value: '', label: 'Nenhuma', icon: 'remove_circle' }, ...accounts.map(account => ({ value: String(account.id), label: String(account.nome || 'Conta'), icon: 'account_balance' }))]
      const pickRow = (id: string, icon: string, color: string, label: string, value: string, options: { value: string; label: string; icon: string }[], onChange: (value: string) => void) => <SideRow id={id} icon={icon} color={color} label={label} summary={options.find(option => option.value === value)?.label || options[0]?.label || ''} open={createTool} setOpen={setCreateTool}><CreateOptionList value={value} onChange={next => onChange(String(next))} close={() => setCreateTool('')} options={options} /></SideRow>
      const dateRow = (id: string, label: string, value: string, onChange: (value: string) => void) => <SideRow id={id} icon="calendar_today" color="var(--ds-sky-fg)" label={label} summary={value ? createNaturalDate(value, today) : 'Sem data'} open={createTool} setOpen={setCreateTool}><CreateCalendarPicker allowEmpty={false} value={value} today={today} onChange={next => onChange(next)} close={() => setCreateTool('')} /></SideRow>
      const nameRow = (label: string, icon: string, placeholder: string) => <><SideField label={label} icon={icon} color={String(draft.cor || 'var(--ds-muted)')}><input autoFocus={!draft._persisted} value={draft.nome || ''} placeholder={placeholder} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></SideField>{colorRow}</>
      const colorRow = <SideRow id="item-color" icon="palette" color={String(draft.cor || 'var(--ds-muted)')} label="Cor" summary={draft.cor ? colorName(String(draft.cor)) : 'Sem cor'} open={createTool} setOpen={setCreateTool}><div className={ic.swatches}>{PALETTE.map(item => <button key={item.color} type="button" title={item.label} aria-label={item.label} data-active={String(draft.cor || '').toLowerCase() === item.color.toLowerCase() || undefined} style={{ background: item.color }} onClick={() => setDraft({ ...draft, cor: item.color })} />)}</div></SideRow>
      const fieldIcons: Record<string, [string, string]> = { 'Saldo inicial': ['account_balance', 'var(--ds-muted)'], 'Limite total': ['credit_card', 'var(--ds-sky-fg)'], 'Fechamento (dia)': ['event', 'var(--ds-peach-fg)'], 'Vencimento (dia)': ['event_available', 'var(--ds-danger)'], Meta: ['flag', 'var(--ds-success)'], Aplicado: ['savings', 'var(--ds-success)'], 'Valor atual': ['payments', 'var(--ds-success)'] }
      const numberField = (label: string, key: string, step = '0.01') => <SideField label={label} icon={fieldIcons[label]?.[0]} color={fieldIcons[label]?.[1]}>{step === '1' ? <input type="number" step={step} value={draft[key] || 0} onChange={event => setDraft({ ...draft, [key]: Number(event.target.value) })} /> : <MoneyInput value={Number(draft[key]) || 0} onChange={value => setDraft({ ...draft, [key]: value })} />}</SideField>

      /** Origem Open Finance: escolhida na criação (conta/cartão do banco ainda não no app ou conectar novo banco); nos itens do banco mostra os dados sincronizados. */
      const ofType = kind === 'card' ? 'cartao' : 'conta'
      const ofInfo = openFinance.info(String(draft.pluggy_id || ''))
      const ofAvailable = openFinance.available(ofType)
      const ofSource = (kind === 'account' || kind === 'card') && (!draft._persisted || draft.pluggy_id) ? <>
        {pickRow('of-source', 'sync', 'var(--ds-accent)', 'Origem', draft.pluggy_id ? `of:${draft.pluggy_id}` : 'manual', [
          { value: 'manual', label: draft._persisted ? 'Tornar manual' : 'Manual', icon: 'edit' },
          ...(draft.pluggy_id && !ofAvailable.some(bank => bank.id === draft.pluggy_id) ? [{ value: `of:${draft.pluggy_id}`, label: `Open Finance${ofInfo ? ` · ${ofInfo.banco}` : ''}`, icon: 'sync' }] : []),
          ...ofAvailable.map(bank => ({ value: `of:${bank.id}`, label: `Open Finance · ${suggestedName(bank, openFinance.data.contas)}`, icon: 'sync' })),
          ...(!draft._persisted ? [{ value: 'connect', label: 'Conectar banco (Open Finance)…', icon: 'add_link' }] : []),
        ], value => {
          if (value === 'manual') { setDraft({ ...draft, pluggy_id: '' }); return }
          if (value === 'connect') { setDraft(null); void openFinance.connect(); return }
          const bank = openFinance.data.contas.find(item => `of:${item.id}` === value)
          if (!bank) return
          setDraft({ ...draft, pluggy_id: bank.id, nome: String(draft.nome || '').trim() ? draft.nome : suggestedName(bank, openFinance.data.contas), ...(kind === 'account' ? { saldo_inicial: 0 } : { limite: bank.limite || bank.limite_disponivel || 0 }) })
        })}
        {draft.pluggy_id ? <SideField label={kind === 'card' ? 'Limite no banco' : 'Saldo no banco'} icon="account_balance" color="var(--ds-accent)"><input readOnly value={ofInfo ? money.format(kind === 'card' ? ofInfo.limite : ofInfo.saldo) : 'Aguardando sincronização'} /></SideField> : null}
        {draft.pluggy_id && ofInfo?.atualizado ? <SideField label="Atualizado" icon="schedule" color="var(--ds-muted)"><input readOnly value={new Date(ofInfo.atualizado).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} /></SideField> : null}
      </> : null

      const commentsField = kind === 'card' ? 'comentarios_faturas' : 'comentarios_meses'
      const monthLabelShort = new Date(`${viewMonth}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace(/^./, c => c.toUpperCase())
      const monthStepper = <div className={ic.inlineStepper}><button type="button" onClick={() => { setCardAdding(false); setPopupMonth(shiftMonth(viewMonth, -1)) }} aria-label="Mês anterior"><MaiIcon name="chevron_left" size={22} /></button><button type="button" className={ic.inlineStepperValue} onClick={() => { setCardAdding(false); setPopupMonth(today.slice(0, 7)) }} title="Voltar ao mês atual">{monthLabelShort}</button><button type="button" onClick={() => { setCardAdding(false); setPopupMonth(shiftMonth(viewMonth, 1)) }} aria-label="Próximo mês"><MaiIcon name="chevron_right" size={22} /></button></div>
      const submitMove = (input: { type: 'in' | 'out'; valor: number; data: string; done: boolean; titulo: string }) => {
        if (!moveForm || !permanent) return
        const value = input.valor
        if (!(value > 0)) return
        if (kind === 'investment' && input.type === 'out' && !moveForm.editId) {
          setRedeem({ amount: Math.min(value, clampMoney(draft.valor_atual)), date: input.data, conta: '', junto: true })
          setMoveForm(null)
          return
        }
        const into = input.type === 'in'
        const mov: Row = { id: moveForm.editId || uid('mov'), data: `${input.data}T12:00:00.000Z`, tipo: kind === 'box' ? (into ? 'entrada' : 'retirada') : 'aporte', valor: value, efetivado: input.done, ...(input.titulo ? { titulo: input.titulo } : {}) }
        let base: Row = draft
        const old = moveForm.editId ? rows(draft.movimentos).find(item => String(item.id) === moveForm.editId) : undefined
        if (old && isDone(old)) base = moveEffect(base, old, -1)
        if (input.done) base = moveEffect(base, mov, 1)
        setDraft({ ...base, movimentos: moveForm.editId ? rows(base.movimentos).map(item => String(item.id) === moveForm.editId ? { ...item, ...mov } : item) : [mov, ...rows(base.movimentos)] })
        setMoveForm(null)
      }
      const valueBlock = (label: ReactNode, tip: string, onClick: () => void, sub?: ReactNode, caption?: string) => <div className={ic.valueBlock}>{caption ? <span className={ic.valueCaption}>{caption}</span> : null}<button type="button" className={ic.valueButton} title={tip} onClick={onClick}>{label}<MaiIcon name="edit" size={16} /></button>{sub ? <span className={ic.valueSub}>{sub}</span> : null}</div>
      const extras = <>{rows(draft.anexos).length ? <ItemAttachments attachments={rows(draft.anexos)} onChange={anexos => setDraft({ ...draft, anexos })} /> : null}<div className={ic.commentsSlot}><CommentsSection key={kind === 'transaction' || permanent ? 'c' : viewMonth} comments={(kind === 'transaction' || permanent ? rows(draft.comentarios) : rows((draft[commentsField] || {})[viewMonth])) as Comment[]} onChange={comentarios => setDraft(kind === 'transaction' || permanent ? { ...draft, comentarios } : { ...draft, [commentsField]: { ...(draft[commentsField] || {}), [viewMonth]: comentarios } })} /></div></>
      const quickChip = (label: string, icon: string, color: string, active: boolean, onClick: () => void) => <button key={label} type="button" data-active={active || undefined} onClick={onClick}><i style={{ color }}><MaiIcon name={icon} size={14} /></i>{label}</button>
      const content = kind === 'transaction' ? <>
        {title}
        <textarea className={ic.desc} rows={2} value={draft.observacao || ''} placeholder="Descrição" onChange={event => setDraft({ ...draft, observacao: event.target.value })} />
        {history.length ? listSection('Histórico', history.length, history.map(txLine), '') : null}
        {extras}
      </> : <>
        {draft._persisted ? <div className={ic.cardHead}>
          <div className={ic.headTop}>
            {kind === 'account' ? valueBlock(money.format(accountBalance(draft)), 'Clique para alterar o saldo', () => void reconcile(draft), undefined, 'Saldo atual') : null}
            {kind === 'card' ? valueBlock(money.format(cardInvoice(draft)), 'Clique para alterar o valor da fatura', () => void adjustInvoice(draft), undefined, 'Valor da fatura') : null}
            {kind === 'box' ? valueBlock(money.format(clampMoney(draft.saldo)), 'Clique para alterar o saldo', () => void setBoxBalance(), clampMoney(draft.meta) ? `de ${money.format(clampMoney(draft.meta))} · ${Math.round(Math.min(100, clampMoney(draft.saldo) / clampMoney(draft.meta) * 100))}%` : 'sem meta definida', 'Saldo') : null}
            {kind === 'investment' ? valueBlock(money.format(clampMoney(draft.valor_atual)), 'Clique para alterar o valor atual', () => void setInvestmentCurrent(), <span className={clampMoney(draft.valor_atual) >= clampMoney(draft.aportado) ? fm.pos : fm.neg}>{signedMoney(clampMoney(draft.valor_atual) - clampMoney(draft.aportado))} · {clampMoney(draft.aportado) ? ((clampMoney(draft.valor_atual) - clampMoney(draft.aportado)) / clampMoney(draft.aportado) * 100).toFixed(1).replace('.', ',') : '0,0'}%</span>, 'Valor atual') : null}
            {permanent ? null : monthStepper}
          </div>
          {kind === 'card' ? <button type="button" className={ic.payButton} onClick={() => void payInvoice(draft)}>Pagar fatura</button> : null}
        </div> : null}
        {kind === 'investment' && clampMoney(draft.rent_taxa) > 0 ? <p className={ic.note}>Valor estimado pela taxa configurada; você pode corrigir quando quiser.</p> : null}
        {kind === 'account' ? <>{listSection('Lançamentos', accountTx.length, accountTx.map(txLine), '')}{draft._persisted ? (cardAdding ? <QuickAdd key={`${draftId}-${viewMonth}`} inline kinds={['finance']} initial="finance" state={state} today={today} defaultDate={viewMonth === today.slice(0, 7) ? today : `${viewMonth}-01`} defaultAccount={draftId} commit={commit} onFinance={() => undefined} onClose={() => setCardAdding(false)} /> : <button type="button" className={fm.addRow} onClick={() => setCardAdding(true)}><MaiIcon name="add" size={18} />Adicionar lançamento</button>) : null}</> : null}
        {kind === 'card' ? <>{listSection('Lançamentos', cardTx.length, cardTx.map(txLine), 'Nenhuma compra na fatura deste mês.')}{draft._persisted ? (cardAdding ? <QuickAdd key={`${draftId}-${viewMonth}`} inline kinds={['finance']} initial="finance" state={state} today={today} defaultDate={viewMonth === today.slice(0, 7) ? today : `${viewMonth}-01`} defaultAccount={`card|${draftId}`} commit={commit} onFinance={() => undefined} onClose={() => setCardAdding(false)} /> : <button type="button" className={fm.addRow} onClick={() => setCardAdding(true)}><MaiIcon name="add" size={18} />Adicionar lançamento</button>) : null}</> : null}
        {permanent ? (() => { const all = rows(draft.movimentos); const doneCount = all.filter(isDone).length; const visible = all.filter(mov => showDone || !isDone(mov)); return all.length ? <section className={ic.section}><h3>Lançamentos<small>{visible.length}</small>{doneCount ? <button type="button" className={ic.toggleDone} onClick={() => setShowDone(!showDone)}><MaiIcon name={showDone ? 'visibility_off' : 'visibility'} size={15} />{showDone ? 'Ocultar efetivados' : `Mostrar efetivados (${doneCount})`}</button> : null}</h3>{visible.map(mov => moveLine(mov, kind === 'box' ? mov.tipo === 'entrada' : mov.tipo === 'aporte'))}</section> : null })() : null}

        {permanent && draft._persisted ? (moveForm ? <QuickAdd key={moveForm.editId || 'novo-movimento'} inline kinds={['finance']} initial="finance" state={state} today={today} defaultDate={moveForm.date} commit={commit} onFinance={() => undefined} onClose={() => setMoveForm(null)} movement={{
          types: [{ value: 'in', label: kind === 'box' ? 'Guardar' : 'Aportar', icon: 'trending_up', color: 'var(--ds-success)' }, { value: 'out', label: kind === 'box' ? 'Retirar' : 'Resgatar', icon: 'trending_down', color: 'var(--ds-danger)' }],
          submitLabel: moveForm.editId ? 'Salvar' : kind === 'box' ? 'Adicionar lançamento' : 'Adicionar lançamento',
          initial: { type: moveForm.type, valor: parseMoneyInput(moveForm.amount) || 0, data: moveForm.date, done: moveForm.done, titulo: moveForm.titulo },
          onSubmit: submitMove,
          onDelete: moveForm.editId ? () => { const mov = rows(draft.movimentos).find(item => String(item.id) === moveForm.editId); if (mov) void deleteMove(mov) } : undefined,
        }} /> : <button type="button" className={fm.addRow} onClick={() => setMoveForm({ type: 'in', amount: '', date: today, cal: false, done: false })}><MaiIcon name="add" size={18} />Adicionar lançamento</button>) : null}
        {extras}
      </>

      const side = kind === 'transaction' ? <>
        <SideRow id="finance-date" icon="calendar_today" color="var(--ds-sky-fg)" label="Data" summary={createNaturalDate(dateKey(draft.data), today)} open={createTool} setOpen={setCreateTool}><CreateCalendarPicker allowEmpty={false} value={dateKey(draft.data)} today={today} onChange={value => setDraft({ ...draft, data: value, dia_mes: Number(value.slice(8)), mes_inicio: draft.mes_inicio || value.slice(0, 7) })} close={() => setCreateTool('')} /></SideRow>
        <SideRow id="finance-value" icon="payments" color="var(--ds-success)" label="Valor" summary={money.format(clampMoney(draft.valor))} open={createTool} setOpen={setCreateTool}><CreateNumberEditor money value={clampMoney(draft.valor)} onChange={value => { const nextPayments = cleanPayments(draft.pagamentos, dateKey(draft.data)); const paid = Math.min(value, nextPayments.reduce((sum, payment) => sum + clampMoney(payment.valor), 0)); setDraft({ ...draft, valor: value, valor_pago: paid, status: value > 0 && paid >= value ? 'pago' : paid > 0 ? 'parcial' : 'pendente' }) }} /></SideRow>
        <SideRow id="finance-category" icon="sell" color="var(--ds-peach-fg)" label="Categoria" summary={String(draft.categoria || 'Não selecionado')} open={createTool} setOpen={setCreateTool}><div className="mai-finance-v4-category-picker"><CreateOptionList value={String(draft.categoria || '')} onChange={value => setDraft({ ...draft, categoria: value })} close={() => setCreateTool('')} options={[{ value: '', label: 'Sem categoria', icon: 'remove_circle' }, ...categories.map(category => ({ value: String(category.nome), label: String(category.nome), icon: 'sell', color: categoryColorOf(String(category.nome), categories) }))]} /><div className="mai-finance-v4-category-create"><input value={categoryDraftName} onChange={event => setCategoryDraftName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addCategoryFromLaunch() } }} placeholder="Nova categoria" /><button type="button" onClick={addCategoryFromLaunch}>Adicionar</button></div><div className={ic.swatches}>{categoryPalette.map(color => <button key={color} type="button" aria-label="Cor da categoria" data-active={(categoryDraftColor || categoryPalette[categories.length % categoryPalette.length]) === color || undefined} style={{ background: color }} onClick={() => setCategoryDraftColor(color)} />)}</div></div></SideRow>
        <SideRow id="finance-account" icon="account_balance_wallet" color="var(--ds-muted)" label="Pagamento" summary={accountSummary} open={createTool} setOpen={setCreateTool}><CreateOptionList value={String(draft.conta_id || '')} onChange={value => setDraft({ ...draft, conta_id: value })} close={() => setCreateTool('')} options={[{ value: '', label: 'Sem origem', icon: 'remove_circle' }, ...accounts.map(account => ({ value: String(account.id), label: String(account.nome || 'Conta'), icon: 'account_balance' })), ...cards.map(card => ({ value: `card|${String(card.id)}`, label: String(card.nome || 'Cartão'), icon: 'credit_card' }))]} /></SideRow>
        <SideRow id="finance-type" icon={draft.tipo === 'receita' ? 'arrow_downward' : 'arrow_upward'} color={draft.tipo === 'receita' ? 'var(--ds-success)' : 'var(--ds-danger)'} label="Tipo" summary={draft.tipo === 'receita' ? 'Receita' : 'Despesa'} open={createTool} setOpen={setCreateTool}><CreateOptionList value={String(draft.tipo || 'despesa')} onChange={value => setDraft({ ...draft, tipo: value })} close={() => setCreateTool('')} options={[{ value: 'despesa', label: 'Despesa', icon: 'arrow_upward' }, { value: 'receita', label: 'Receita', icon: 'arrow_downward' }]} /></SideRow>
        <FinanceTransactionExtraTools asRows draft={draft} setDraft={setDraft} today={today} month={month} open={createTool} setOpen={setCreateTool} draftPayment={draftPayment} addPayment={addPayment} removePayment={removePayment} generateInstallments={generateInstallments} editFixedOccurrence={() => editFixedOccurrence(draft)} ignoreFixed={() => ignoreFixed(draft)} />
        <SideRow id="finance-status" icon="task_alt" color="var(--ds-sky-fg)" label="Status" summary={statusLabel(draft.status)} open={createTool} setOpen={setCreateTool}><CreateOptionList value={draft.status === 'pago' ? 'pago' : 'pendente'} onChange={value => setDraftPaymentStatus(String(value))} close={() => setCreateTool('')} options={[{ value: 'pendente', label: 'Pendente / zerar pagamentos', icon: 'schedule' }, { value: 'pago', label: 'Pago integralmente', icon: 'check_circle' }]} /></SideRow>
      </>
      : kind === 'account' ? <>{ofSource}{nameRow('Nome da conta', 'account_balance', 'Ex.: Conta corrente')}{draft.pluggy_id ? null : numberField('Saldo inicial', 'saldo_inicial')}</>
      : kind === 'card' ? <>{ofSource}{nameRow('Nome do cartão', 'credit_card', 'Ex.: Nubank')}{draft.pluggy_id ? null : numberField('Limite total', 'limite')}<SideField label="Disponível" icon="account_balance_wallet" color="var(--ds-success)"><input readOnly value={money.format(Math.max(0, clampMoney(draft.limite) - Math.max(0, cardInvoice(draft) - clampMoney(invoiceRow(monthItems, String(draft.id))?.valor_pago))))} /></SideField>{numberField('Fechamento (dia)', 'fechamento', '1')}{numberField('Vencimento (dia)', 'vencimento', '1')}{pickRow('card-pay', 'account_balance', 'var(--ds-muted)', 'Pagar com', String(draft.conta_id || ''), accountChoices, value => setDraft({ ...draft, conta_id: value }))}</>
      : kind === 'box' ? <>{nameRow('Nome da caixinha', 'savings', 'Ex.: Meu carro')}{numberField('Meta', 'meta')}{dateRow('box-deadline', 'Data limite', dateKey(draft.prazo), value => setDraft({ ...draft, prazo: value }))}{pickRow('box-from', 'account_balance', 'var(--ds-muted)', 'Guardar de', String(draft.conta_id || ''), accountChoices, value => setDraft({ ...draft, conta_id: value }))}</>
      : <>{nameRow('Nome do investimento', 'trending_up', 'Ex.: ETFs globais')}{pickRow('inv-type', 'category', 'var(--ds-lilac-fg)', 'Tipo', String(draft.tipo || 'ETF'), ['ETF', 'Ações', 'FIIs', 'Renda fixa', 'Cripto', 'Previdência', 'Outro'].map(label => ({ value: label, label, icon: 'category' })), value => setDraft({ ...draft, tipo: value }))}<SideField label="Instituição" icon="account_balance" color="var(--ds-muted)"><input value={draft.instituicao || ''} onChange={event => setDraft({ ...draft, instituicao: event.target.value })} /></SideField>{numberField('Aplicado', 'aportado')}{numberField('Valor atual', 'valor_atual')}{dateRow('inv-first', 'Primeira aplicação', firstApplication(draft), value => setDraft({ ...draft, data_inicio: value }))}<SideRow id="inv-rent" icon="trending_up" color="var(--ds-success)" label="Rentabilidade" summary={rentSummary(draft)} open={createTool} setOpen={setCreateTool}><RentEditor draft={draft} setDraft={setDraft} /></SideRow><SideRow id="inv-auto" icon="event_repeat" color="var(--ds-lilac-fg)" label="Aporte automático" summary={autoSummary(draft)} open={createTool} setOpen={setCreateTool}><AutoEditor draft={draft} setDraft={setDraft} /></SideRow><SideRow id="inv-tax" icon="receipt_long" color="var(--ds-peach-fg)" label="Impostos" summary={taxSummary(draft)} open={createTool} setOpen={setCreateTool}><TaxEditor draft={draft} setDraft={setDraft} /></SideRow></>

      if (redeem && kind === 'investment') {
        const preview = redeemPreview(draft, redeem.amount, today)
        const current = clampMoney(draft.valor_atual)
        const pct = current ? Math.round(redeem.amount / current * 100) : 0
        const setAmount = (value: number) => setRedeem({ ...redeem, amount: Math.min(current, Math.max(0, value)) })
        const redeemContent = <>
          <h2 className={ic.title} style={{ margin: 0 }}>Resgatar</h2>
          <div><MoneyInput className={ic.bigInput} max={current} value={redeem.amount} onChange={setAmount} /><span className={ic.note}>de {money.format(current)}</span></div>
          <div className={ic.pctRow}>{[25, 50].map(value => <button key={value} type="button" data-active={pct === value} onClick={() => setAmount(Math.round(current * value) / 100)}>{value}%</button>)}<button type="button" data-active={pct !== 25 && pct !== 50 && pct !== 100}>Parcial</button><button type="button" data-active={pct === 100} onClick={() => setAmount(current)}>Tudo</button></div>
          <section className={ic.section}><h3>Resumo do resgate</h3><div className={ic.summaryBox}>
            <div><span>Valor resgatado</span><b>{money.format(preview.value)}</b></div>
            <div><span>Rendimento neste resgate</span><b>+ {money.format(preview.gain)}</b></div>
            {preview.lines.map(line => <div key={line.id}><span>{line.nome} · {String(line.aliquota).replace('.', ',')}% sobre o rendimento</span><b>− {money.format(line.valor)}</b></div>)}
            {!preview.lines.length ? <div><span>Impostos</span><b>isento</b></div> : null}
            <div className={ic.total}><span>Entra na conta</span><b>{money.format(redeem.junto ? preview.net : preview.value)}</b></div>
          </div>{redeem.junto && preview.taxTotal > 0 ? <p className={ic.note} style={{ marginTop: 8 }}>Cria o lançamento “Imposto — {String(draft.nome || 'Investimento')}” de {money.format(preview.taxTotal)}, na categoria Impostos.</p> : null}</section>
        </>
        const redeemSide = <>
          <SideField label="Valor" icon="payments" color="var(--ds-success)"><MoneyInput max={current} keypad={false} value={redeem.amount} onChange={setAmount} /></SideField>
          {dateRow('redeem-date', 'Data', redeem.date, value => setRedeem({ ...redeem, date: value || today }))}
          {pickRow('redeem-to', 'account_balance', 'var(--ds-muted)', 'Receber em', redeem.conta, accountChoices, value => setRedeem({ ...redeem, conta: value }))}
          <div className={ic.row}><div className={ic.field}><small>Pagar impostos junto</small><button type="button" className={ic.switch} data-on={redeem.junto} onClick={() => setRedeem({ ...redeem, junto: !redeem.junto })}>{redeem.junto ? 'Ligado' : 'Desligado'}</button></div></div>
          <SideRow id="inv-tax" icon="receipt_long" color="var(--ds-peach-fg)" label="Impostos" summary={taxSummary(draft)} open={createTool} setOpen={setCreateTool}><TaxEditor draft={draft} setDraft={setDraft} /></SideRow>
        </>
        return <FinanceItemShell crumb={`Investimentos › ${String(draft.nome || 'Investimento')}`} onClose={() => setRedeem(null)} content={redeemContent} side={redeemSide} footer={<><span /><button type="button" className={footerStyles.cancel} onClick={() => setRedeem(null)}>Cancelar</button><button type="button" className={footerStyles.save} disabled={preview.value <= 0} onClick={confirmRedeem}>Resgatar {money.format(preview.value)}</button></>} />
      }
      return <FinanceItemShell crumb={trail.length ? ([{ label: 'Financeiro' }, ...trail.map((entry, index) => ({ label: entry.label, onClick: () => goBack(index) })), { label: crumbKind }] as Crumb[]) : `Financeiro › ${crumbKind}`} onClose={closeDraft} content={content} side={side} footer={<>{draft._persisted ? <button type="button" className="mai-finance-v4-delete" onClick={removeDraft}><MaiIcon name="delete" size={18} />Excluir</button> : <span />}<DraftButtons dirty={dirty} canSave onSave={() => void saveDraft()} onCancel={closeDraft} /></>} />
    })() : null}
  </div>
}
