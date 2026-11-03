'use client'

import { ColorField } from './detail/ColorField'
import { useEffect, useMemo, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import { CreateCalendarPicker, CreateNumberEditor, CreateOptionList, CreateTool, createNaturalDate } from './CreateDrawerTools'
import { FinanceEntityIcon, FinanceEntityPhotoPicker } from './FinanceEntityPhoto'
import { FinanceTransactionCard } from './FinanceTransactionCard'
import { FinanceTransactionExtraTools } from './FinanceTransactionExtraTools'
import { ItemAttachments } from './ItemAttachments'
import { MAI_ENTITY_ICONS, MaiIcon } from './MaiIcons'
import { useManualDraft } from './useManualDraft'
import { DraftButtons } from './shell/DraftFooter'
import { askConfirm } from './shell/ConfirmDialog'
import fm from './FinanceModern.module.css'

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

function moveDateForInstallment(key: string, index: number, interval: string) {
  const date = new Date(`${key}T12:00:00`)
  if (interval === 'semanal') date.setDate(date.getDate() + index * 7)
  else if (interval === 'quinzenal') date.setDate(date.getDate() + index * 15)
  else if (interval === 'anual') date.setFullYear(date.getFullYear() + index)
  else date.setMonth(date.getMonth() + index)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

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

export function FinanceV4({ state, today, commit, createRequest, inspect: _inspect }: { state: MaiState; today: string; commit: Commit; createRequest?: string; inspect: (item: InspectableItem) => void }) {
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
  const [categoryDraftName, setCategoryDraftName] = useState('')

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

  const monthFixed = fixedForMonthAt(month)
  const monthTx = transactions.filter(item => dateKey(item.data).slice(0, 7) === month)
  const monthItems: Row[] = [...monthTx, ...monthFixed]
  const monthCalculationItems = monthItems.filter(item => !item.ignorar_calculo)
  const monthIncome = monthCalculationItems.filter(item => item.tipo === 'receita').reduce((sum, item) => sum + clampMoney(item.valor), 0)
  const monthInvoice = cards.reduce((sum, card) => {
    const cardId = String(card.id)
    const manual = monthItems.find(item => item.ajuste_fatura === true && String(item.ajuste_fatura_card_id || item.cartao_id || '') === cardId && String(item.competencia_fatura || dateKey(item.data).slice(0, 7)) === month)
    if (manual) return sum + clampMoney(manual.valor)
    return sum + monthCalculationItems.filter(item => !item.ajuste_fatura && item.tipo !== 'receita' && (String(item.conta_id || '') === `card|${cardId}` || String(item.cartao_id || '') === cardId)).reduce((cardSum, item) => cardSum + clampMoney(item.valor), 0)
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
  const projectedTransactionsTotal = transactions.filter(item => {
    if (item.ignorar_calculo) return false
    const itemMonth = dateKey(item.data).slice(0, 7)
    return /^\d{4}-\d{2}$/.test(itemMonth) && itemMonth <= month
  }).reduce((sum, item) => sum + signed(item, clampMoney(item.valor)), 0)
  const projectedFixedTotal = fixed.reduce((total, rule) => {
    if (rule.ativo === false || rule.ignorar_calculo) return total
    const ruleStart = String(rule.mes_inicio || dateKey(rule.data).slice(0, 7) || today.slice(0, 7)).slice(0, 7)
    const configuredEnd = String(rule.mes_fim || '').slice(0, 7)
    const ruleEnd = configuredEnd && configuredEnd < month ? configuredEnd : month
    return total + monthSequence(ruleStart, ruleEnd).reduce((sum, monthKey) => {
      const item = fixedRuleAtMonth(rule, monthKey)
      return item && !item.ignorar_calculo ? sum + signed(item, clampMoney(item.valor)) : sum
    }, 0)
  }, 0)
  const projectedBalance = initialBalance + projectedTransactionsTotal + projectedFixedTotal
  const totalBoxes = boxes.reduce((sum, item) => sum + clampMoney(item.saldo), 0)
  const totalBoxTarget = boxes.reduce((sum, item) => sum + clampMoney(item.meta), 0)
  const totalBoxProgress = totalBoxTarget ? Math.min(100, totalBoxes / totalBoxTarget * 100) : 0
  const totalInvested = investments.reduce((sum, item) => sum + clampMoney(item.aportado), 0)
  const totalInvestmentValue = investments.reduce((sum, item) => sum + clampMoney(item.valor_atual), 0)
  const investmentResult = totalInvestmentValue - totalInvested
  const investmentResultPercent = totalInvested ? investmentResult / totalInvested * 100 : 0

  function cardInvoice(card: Row, source: Row[] = monthItems) {
    const cardId = String(card.id)
    const manual = source.find(item => item.ajuste_fatura === true && String(item.ajuste_fatura_card_id || item.cartao_id || '') === cardId && String(item.competencia_fatura || dateKey(item.data).slice(0, 7)) === month)
    if (manual) return clampMoney(manual.valor)
    return source.filter(item => !item.ajuste_fatura && (String(item.conta_id || '') === `card|${cardId}` || String(item.cartao_id || '') === cardId) && !item.ignorar_calculo && item.tipo !== 'receita').reduce((sum, item) => sum + clampMoney(item.valor), 0)
  }
  function moveMonth(amount: number) {
    const date = new Date(`${month}-15T12:00:00`)
    date.setMonth(date.getMonth() + amount)
    setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
  }
  function setTab(next: Tab) {
    commit(current => ({ ...current, configs: { ...current.configs, areaTabs: { ...(current.configs.areaTabs && typeof current.configs.areaTabs === 'object' ? current.configs.areaTabs as Record<string, string> : {}), finance: next } } }))
  }

  function newDraft(type: DraftKind): Row {
    if (type === 'transaction') return { id: uid('fin'), titulo: '', observacao: '', valor: 0, valor_pago: 0, tipo: 'despesa', data: today, status: 'pendente', categoria: '', conta_id: '', cartao_id: '', anexos: [], pagamentos: [], ignorar_calculo: false, recorrencia: 'unico', parcelas: 2, intervalo_parcelas: 'mensal', dividir_total: true, dia_mes: Number(today.slice(8)), mes_inicio: today.slice(0, 7), mes_fim: '', ativo: true, ocultar_inicio: false, _persisted: false }
    if (type === 'account') return { id: uid('cta'), nome: '', saldo_inicial: 0, cor: '#718269', foto: '', _persisted: false }
    if (type === 'card') return { id: uid('crd'), nome: '', limite: 0, fechamento: 1, vencimento: 10, conta_id: '', cor: '#8a7d72', foto: '', _persisted: false }
    if (type === 'box') return { id: uid('box'), nome: '', icone: 'savings', cor: '#718269', foto: '', meta: 0, saldo: 0, prazo: '', observacao: '', movimentos: [], _persisted: false }
    return { id: uid('inv'), nome: '', icone: 'trending_up', cor: '#607d6b', foto: '', tipo: 'ETF', instituicao: '', aportado: 0, valor_atual: 0, observacao: '', movimentos: [], _persisted: false }
  }
  function openNew(type: DraftKind) {
    setKind(type)
    setDraft(newDraft(type))
    setCreateTool('')
    setCategoryDraftName('')
  }
  function openTransaction(item: Row) {
    setKind('transaction')
    setDraft({ ...item, recorrencia: item._isFixed ? 'fixo' : item.recorrencia || 'unico', dia_mes: item.dia_mes || Number(dateKey(item.data).slice(8)) || Number(today.slice(8)), mes_inicio: item.mes_inicio || dateKey(item.data).slice(0, 7) || month, mes_fim: item.mes_fim || '', anexos: rows(item.anexos), pagamentos: cleanPayments(item.pagamentos, dateKey(item.data)), _persisted: true, _isFixed: item._isFixed === true })
    setCreateTool('')
    setCategoryDraftName('')
  }
  function openExisting(type: Exclude<DraftKind, 'transaction'>, item: Row) {
    setKind(type)
    setDraft({ ...item, movimentos: rows(item.movimentos), _persisted: true })
    setCreateTool('')
  }

  useEffect(() => { if (createRequest?.startsWith('finance:')) openNew('transaction') }, [createRequest, today])

  function addCategoryFromLaunch() {
    if (!draft || kind !== 'transaction') return
    const name = categoryDraftName.trim()
    if (!name) return
    const existing = categories.find(item => String(item.nome || '').trim().toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))
    if (!existing) commit(current => ({ ...current, finance: { ...current.finance, categories: [...rows(current.finance.categories), { id: uid('cat'), nome: name }] } }))
    setDraft({ ...draft, categoria: existing ? String(existing.nome) : name })
    setCategoryDraftName('')
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
        const next: Row = { ...clean, nome: label, saldo_inicial: Number(clean.saldo_inicial || 0), cor: clean.cor || '#718269' }
        nextFinance.accounts = rows(nextFinance.accounts).some(item => String(item.id) === String(next.id)) ? rows(nextFinance.accounts).map(item => String(item.id) === String(next.id) ? next : item) : [...rows(nextFinance.accounts), next]
      } else if (kind === 'card') {
        const next: Row = { ...clean, nome: label, limite: clampMoney(clean.limite), fechamento: Math.min(31, Math.max(1, Number(clean.fechamento || 1))), vencimento: Math.min(31, Math.max(1, Number(clean.vencimento || 10))), cor: clean.cor || '#8a7d72' }
        nextFinance.cards = rows(nextFinance.cards).some(item => String(item.id) === String(next.id)) ? rows(nextFinance.cards).map(item => String(item.id) === String(next.id) ? next : item) : [...rows(nextFinance.cards), next]
      } else if (kind === 'box') {
        const next: Row = { ...clean, nome: label, meta: clampMoney(clean.meta), saldo: clampMoney(clean.saldo), icone: clean.icone || 'savings', cor: clean.cor || '#718269', movimentos: rows(clean.movimentos) }
        const list = rows(nextFinance.boxes)
        nextFinance.boxes = list.some(item => String(item.id) === String(next.id)) ? list.map(item => String(item.id) === String(next.id) ? next : item) : [...list, next]
      } else {
        const next: Row = { ...clean, nome: label, aportado: clampMoney(clean.aportado), valor_atual: clampMoney(clean.valor_atual), icone: clean.icone || 'trending_up', cor: clean.cor || '#607d6b', movimentos: rows(clean.movimentos) }
        const list = rows(nextFinance.investments)
        nextFinance.investments = list.some(item => String(item.id) === String(next.id)) ? list.map(item => String(item.id) === String(next.id) ? next : item) : [...list, next]
      }
      return { ...current, finance: nextFinance }
    })
    if (snapshot._persisted === false) setDraft(current => current && String(current.id) === String(snapshot.id) ? { ...current, _persisted: true, _isFixed: kind === 'transaction' && String(snapshot.recorrencia || '') === 'fixo' } : current)
  }

  const { dirty, saveNow, requestClose } = useManualDraft({ value: draft, identity: `${kind}:${String(draft?.id || '')}`, enabled: Boolean(draft), save: persistDraft, what: kind === 'transaction' ? 'lançamento' : 'registro' })
  const closeDraft = () => void requestClose(() => setDraft(null))
  const saveDraft = async () => { await saveNow(); setDraft(null) }

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

  function togglePaid(item: Row) {
    const total = clampMoney(item.valor)
    const current = paymentState(item)
    if (item.status === 'pago') {
      if (item._isFixed) { updateOccurrence(item, { status: 'pendente', valor_pago: 0, pagamentos: [] }); return }
      commit(stateNow => ({ ...stateNow, finance: { ...stateNow.finance, transactions: rows(stateNow.finance.transactions).map(row => String(row.id) === String(item.id) ? { ...row, status: 'pendente', valor_pago: 0, pagamentos: [] } : row) } }))
      return
    }
    if (!total) return
    const payments = current.remaining > 0 ? [...current.payments, { id: uid('pay'), data: today, valor: current.remaining }] : current.payments
    if (item._isFixed) { updateOccurrence(item, { status: 'pago', valor_pago: total, pagamentos: payments }); return }
    commit(stateNow => ({ ...stateNow, finance: { ...stateNow.finance, transactions: rows(stateNow.finance.transactions).map(row => String(row.id) === String(item.id) ? { ...row, status: 'pago', valor_pago: total, pagamentos: payments } : row) } }))
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

  function editFixedOccurrence(item = draft) {
    if (!item) return
    const currentOccurrence = fixedForMonthAt(month).find(row => String(row.id) === String(item.id)) || item
    const value = prompt('Valor somente deste mês:', String(currentOccurrence.valor || item.valor || 0)); if (value === null) return
    const parsedValue = parseMoneyInput(value)
    if (!Number.isFinite(parsedValue)) { alert('Digite um valor válido.'); return }
    const date = prompt('Data somente deste mês (AAAA-MM-DD):', String(currentOccurrence.data || `${month}-${String(item.dia_mes || 1).padStart(2, '0')}`)); if (date === null) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T12:00:00`).getTime())) { alert('Digite uma data válida no formato AAAA-MM-DD.'); return }
    const currentPayments = cleanPayments(currentOccurrence.pagamentos, date)
    const paid = Math.min(parsedValue, currentPayments.reduce((sum, payment) => sum + clampMoney(payment.valor), 0))
    updateOccurrence({ ...item, occurrenceKey: `${item.id}|${month}` }, { valor_override: parsedValue, data_override: date, pagamentos: currentPayments, valor_pago: paid, status: parsedValue > 0 && paid >= parsedValue ? 'pago' : paid > 0 ? 'parcial' : 'pendente' })
  }
  async function ignoreFixed(item = draft) {
    if (!item || !(await askConfirm({ title: 'Ignorar lançamento?', message: `Ele será ignorado em ${monthLabel(month)}.`, confirmLabel: 'Ignorar', tone: 'default' }))) return
    updateOccurrence({ ...item, occurrenceKey: `${item.id}|${month}` }, { ignorado: true })
    if (draft && String(draft.id) === String(item.id)) setDraft(null)
  }
  function addPayment() {
    if (!draft || kind !== 'transaction') return
    const current = paymentState(draft)
    if (current.remaining <= 0) return
    const answer = prompt(`Valor do pagamento (restante ${money.format(current.remaining)}):`, current.remaining.toFixed(2).replace('.', ',')); if (answer === null) return
    const amount = parseMoneyInput(answer)
    if (!Number.isFinite(amount) || amount <= 0) { alert('Digite um valor de pagamento válido.'); return }
    if (amount - current.remaining > 0.005) { alert(`O pagamento não pode ser maior que o restante de ${money.format(current.remaining)}.`); return }
    const paymentDate = prompt('Data do pagamento (AAAA-MM-DD):', today); if (paymentDate === null) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) || Number.isNaN(new Date(`${paymentDate}T12:00:00`).getTime())) { alert('Digite uma data válida no formato AAAA-MM-DD.'); return }
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
  function reconcile(account: Row) {
    const currentBalance = accountBalance(account)
    const answer = prompt(`Saldo real de “${account.nome}”:`, currentBalance.toFixed(2).replace('.', ','))
    if (answer === null) return
    const targetBalance = parseSignedMoneyInput(answer)
    if (!Number.isFinite(targetBalance)) { alert('Digite um saldo válido.'); return }
    const diff = targetBalance - currentBalance
    if (Math.abs(diff) < 0.01) return
    commit(current => ({ ...current, finance: { ...current.finance, transactions: [{ id: uid('fin'), titulo: 'Ajuste de saldo', valor: Math.abs(diff), valor_pago: Math.abs(diff), tipo: diff >= 0 ? 'receita' : 'despesa', categoria: 'Ajuste', conta_id: account.id, cartao_id: '', data: today, status: 'pago', observacao: 'Conciliação bancária', pagamentos: [{ id: uid('pay'), data: today, valor: Math.abs(diff) }], anexos: [], ignorar_calculo: false, recorrencia: 'unico' }, ...rows(current.finance.transactions)] } }))
  }
  function moveBoxValue(direction: 'in' | 'out') {
    if (!draft || kind !== 'box') return
    const answer = prompt(direction === 'in' ? 'Quanto deseja guardar?' : 'Quanto deseja retirar?', '0'); if (answer === null) return
    const value = parseMoneyInput(answer); if (!Number.isFinite(value) || !value) return
    const nextBalance = direction === 'in' ? clampMoney(draft.saldo) + value : Math.max(0, clampMoney(draft.saldo) - value)
    setDraft({ ...draft, saldo: nextBalance, movimentos: [{ id: uid('mov'), data: new Date().toISOString(), tipo: direction === 'in' ? 'entrada' : 'retirada', valor: value }, ...rows(draft.movimentos)] })
  }
  function moveInvestmentValue(direction: 'in' | 'out') {
    if (!draft || kind !== 'investment') return
    const answer = prompt(direction === 'in' ? 'Valor do aporte:' : 'Valor do resgate:', '0'); if (answer === null) return
    const value = parseMoneyInput(answer); if (!Number.isFinite(value) || !value) return
    const apportioned = direction === 'in' ? clampMoney(draft.aportado) + value : Math.max(0, clampMoney(draft.aportado) - value)
    const currentValue = direction === 'in' ? clampMoney(draft.valor_atual) + value : Math.max(0, clampMoney(draft.valor_atual) - value)
    setDraft({ ...draft, aportado: apportioned, valor_atual: currentValue, movimentos: [{ id: uid('mov'), data: new Date().toISOString(), tipo: direction === 'in' ? 'aporte' : 'resgate', valor: value }, ...rows(draft.movimentos)] })
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

  const filtered = useMemo(() => monthItems.filter(matchesFilters).sort((a, b) => {
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
      if (manual) return sum + clampMoney(manual.valor)
      return sum + calc.filter(item => !item.ajuste_fatura && item.tipo !== 'receita' && (String(item.conta_id || '') === `card|${cardId}` || String(item.cartao_id || '') === cardId)).reduce((cardSum, item) => cardSum + clampMoney(item.valor), 0)
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
  const palette = ['#b8693d', '#e0a04a', '#6c8fa8', '#7a6fd0', '#c94f45', '#8a05be', '#e8a33d', '#4f7cac']
  const greens = ['#2e8b57', '#7cc49a', '#4b8b6c', '#a3d9b8']
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
    return String((account || card)?.cor || '#8a7d72')
  }
  const reportBlocks: { title: string; total: number; tone: 'out' | 'in'; slices: Slice[] }[] = [
    { title: 'Despesas por categoria', total: reportExpenses.reduce((sum, item) => sum + clampMoney(item.valor), 0), tone: 'out', slices: sumBy(reportExpenses, item => String(item.categoria || 'Sem categoria'), palette) },
    { title: 'Receitas por categoria', total: reportIncomes.reduce((sum, item) => sum + clampMoney(item.valor), 0), tone: 'in', slices: sumBy(reportIncomes, item => String(item.categoria || 'Sem categoria'), greens) },
    { title: 'Despesas por conta e cartão', total: reportExpenses.reduce((sum, item) => sum + clampMoney(item.valor), 0), tone: 'out', slices: sumBy(reportExpenses, item => originName(item.conta_id || (item.cartao_id ? `card|${item.cartao_id}` : ''), accounts, cards), originColor) },
    { title: 'Despesas fixas e variáveis', total: reportExpenses.reduce((sum, item) => sum + clampMoney(item.valor), 0), tone: 'out', slices: sumBy(reportExpenses, item => item._isFixed ? 'Fixas' : 'Variáveis', name => name === 'Fixas' ? '#6c8fa8' : '#e0a04a') },
  ]
  const periodLabel = period === 'month' ? 'Mensal' : period === '3' ? 'Últimos 3 meses' : period === '6' ? 'Últimos 6 meses' : period === 'year' ? 'Este ano' : 'Personalizado'
  const periodRange = reportMonths.length ? (reportMonths.length === 1 ? monthLabel(reportMonths[0]) : `${monthLabel(reportMonths[0])} – ${monthLabel(reportMonths[reportMonths.length - 1])}`) : 'Período inválido'
  const pendingCount = filtered.filter(item => paymentState(item).status !== 'pago').length
  const filtersActive = typeFilter !== 'all' || statusFilter !== 'all' || categoryFilter !== 'all' || originFilter !== 'all'
  const accountSummary = draft ? originName(draft.conta_id, accounts, cards) : 'Sem origem'

  const transactionRow = (item: Row) => <FinanceTransactionCard
    key={`${item._isFixed ? 'fix' : 'tx'}-${String(item.id)}`}
    item={item}
    accounts={accounts}
    cards={cards}
    today={today}
    compact
    onOpen={() => openTransaction(item)}
    onTogglePaid={() => togglePaid(item)}
  />

  const tabs: { id: Tab; label: string }[] = [
    { id: 'transactions', label: 'Lançamentos' }, { id: 'accounts', label: 'Contas' }, { id: 'cards', label: 'Cartões' }, { id: 'boxes', label: 'Caixinhas' }, { id: 'investments', label: 'Investimentos' }, { id: 'reports', label: 'Relatórios' },
  ]

  const draftPayment = draft && kind === 'transaction' ? paymentState(draft) : null

  const addTarget: Record<Tab, { kind: DraftKind; label: string }> = { transactions: { kind: 'transaction', label: 'Lançamento' }, accounts: { kind: 'account', label: 'Conta' }, cards: { kind: 'card', label: 'Cartão' }, boxes: { kind: 'box', label: 'Caixinha' }, investments: { kind: 'investment', label: 'Investimento' }, reports: { kind: 'transaction', label: 'Lançamento' } }
  const signedMoney = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${money.format(Math.abs(value))}`
  const addRow = (label: string, onClick: () => void) => <button type="button" className={fm.addRow} onClick={onClick}><MaiIcon name="add" size={18} />{label}</button>
  const calIcon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
  const dueTone = (key: string) => key < today ? 'late' : key === today ? 'today' : 'future'
  const periodOptions: { id: typeof period; label: string }[] = [{ id: 'month', label: 'Mensal' }, { id: '3', label: 'Últimos 3 meses' }, { id: '6', label: 'Últimos 6 meses' }, { id: 'year', label: 'Este ano' }, { id: 'custom', label: 'Personalizado' }]
  const barBlock = (block: typeof reportBlocks[number]) => <section className={fm.reportBlock} key={block.title}>
    <div className={fm.reportTitle}><strong>{block.title}</strong><span>{money.format(block.total)}</span></div>
    <div className={fm.barList}>{block.slices.map(slice => { const percent = block.total ? slice.value / block.total * 100 : 0; return <div className={fm.barRow} key={slice.name}><div className={fm.barTop}><span className={fm.barName}>{slice.name}</span><span className={fm.barPct}>{percent.toFixed(1).replace('.', ',')}%</span><span className={fm.barValue} data-tone={block.tone}>{money.format(slice.value)}</span></div><div className={fm.barTrack}><div style={{ width: `${percent}%`, background: slice.color }} /></div></div> })}{!block.slices.length ? <div className={fm.empty}>Sem dados no período.</div> : null}</div>
  </section>

  return <div className={`mai-v3-area-page mai-v4-finance ${fm.page}`}>
    <div className={fm.top}>
      <h1 className={fm.title}>Financeiro</h1>
      {rangeMode ? <div className={fm.month}><span className={fm.label}>{periodRange}</span></div> : <div className={fm.month}><button type="button" onClick={() => moveMonth(-1)} aria-label="Mês anterior">‹</button><button type="button" className={fm.label} aria-label="Voltar ao mês atual" title="Voltar ao mês atual" onClick={() => setMonth(today.slice(0, 7))}>{monthLabel(month)}</button><button type="button" onClick={() => moveMonth(1)} aria-label="Próximo mês">›</button></div>}
    </div>

    <div className={fm.balance}>
      <div><small>Saldo inicial</small><b>{money.format(initialBalance)}</b></div><i />
      <div className={fm.balanceMain}><small>Saldo atual</small><strong data-negative={realBalance < 0}>{money.format(realBalance)}</strong></div><i />
      <div className={fm.balanceEnd}><small>Saldo previsto</small><b>{money.format(projectedBalance)}</b></div>
    </div>

    <div className={fm.summary}>
      <div><span>Receitas</span><strong data-tone="in">{money.format(stripIncome)}</strong></div>
      <div><span>Despesas</span><strong data-tone="neg">{money.format(stripExpense)}</strong></div>
      <div><span>Cartões de crédito</span><strong data-tone="card">{money.format(stripInvoice)}</strong></div>
      <div><span>Economia mensal</span><strong data-tone={stripSaving < 0 ? 'neg' : 'in'}>{signedMoney(stripSaving)} <small>{stripPercent > 0 ? '+' : ''}{stripPercent}%</small></strong></div>
    </div>

    <div className={fm.tabs} role="tablist">{tabs.map(item => <button key={item.id} role="tab" aria-selected={tab === item.id} data-active={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>

    {tab === 'transactions' ? <>
      <div className={fm.listHead}><span>{filtered.length} {filtered.length === 1 ? 'lançamento' : 'lançamentos'} em {monthLabel(month).split(' de ')[0]}</span><span>{pendingCount} {pendingCount === 1 ? 'pendente' : 'pendentes'}</span></div>
      <div className={fm.list}>{filtered.map(transactionRow)}</div>
      {!filtered.length ? <div className={fm.empty}>Nenhum lançamento encontrado.</div> : null}
      {addRow('Adicionar lançamento', () => openNew('transaction'))}
    </> : null}

    {tab === 'accounts' ? <>
      <div className={fm.listHead}><span>{accounts.length} {accounts.length === 1 ? 'conta' : 'contas'}</span><span>{money.format(realBalance)} no total</span></div>
      <div className={fm.list}>{accounts.map(account => <div key={String(account.id)} className={fm.entityRow}><button type="button" className={fm.entity} onClick={() => openExisting('account', account)}><FinanceEntityIcon photo={String(account.foto || '')} icon="account_balance" color={String(account.cor || '#718269')} /><span className={fm.copy}><span className={fm.name}>{account.nome}</span><span className={fm.sub}>Saldo inicial {money.format(Number(account.saldo_inicial || 0))}</span></span><span className={fm.amount}><b>{money.format(accountBalance(account))}</b></span></button></div>)}</div>
      {addRow('Adicionar conta', () => openNew('account'))}
    </> : null}

    {tab === 'cards' ? <>
      <div className={fm.listHead}><span>{cards.length} {cards.length === 1 ? 'cartão' : 'cartões'}</span><span>Faturas de {monthLabel(month).split(' de ')[0]} · {money.format(monthInvoice)}</span></div>
      <div className={fm.list}>{cards.map(card => { const invoice = cardInvoice(card, monthItems); const limit = clampMoney(card.limite); const dueKey = monthDateForDay(month, Number(card.vencimento || 10)); return <div key={String(card.id)} className={fm.entityRow}><button type="button" className={fm.entity} onClick={() => openExisting('card', card)}><FinanceEntityIcon photo={String(card.foto || '')} icon="credit_card" color={String(card.cor || '#8a7d72')} /><span className={fm.copy}><span className={fm.name}>{card.nome}</span><span className={fm.subLine}><span className={fm.due} data-tone={dueTone(dueKey)}>{calIcon}Vence {naturalDate(dueKey, today)}</span>{limit ? <span>{money.format(Math.max(0, limit - invoice))} de limite disponível</span> : null}</span></span><span className={fm.amount}><b>{money.format(invoice)}</b></span></button></div> })}</div>
      {addRow('Adicionar cartão', () => openNew('card'))}
    </> : null}

    {tab === 'boxes' ? <>
      <div className={fm.listHead}><span>{boxes.length} {boxes.length === 1 ? 'caixinha' : 'caixinhas'}</span><span>{money.format(totalBoxes)} guardados</span></div>
      <div className={fm.list}>{boxes.map(box => { const target = clampMoney(box.meta); const current = clampMoney(box.saldo); const prazo = dateKey(box.prazo); return <div key={String(box.id)} className={fm.entityRow}><button type="button" className={fm.entity} onClick={() => openExisting('box', box)}><FinanceEntityIcon photo={String(box.foto || '')} icon={String(box.icone || 'savings')} color={String(box.cor || '#718269')} /><span className={fm.copy}><span className={fm.name}>{box.nome}</span><span className={fm.subLine}>{prazo ? <span className={fm.due} data-tone={dueTone(prazo)}>{calIcon}Até {naturalDate(prazo, today)}</span> : null}<span>{target ? `Meta ${money.format(target)}` : 'Sem meta definida'}</span></span></span><span className={fm.amount}><b>{money.format(current)}</b></span></button></div> })}</div>
      {addRow('Adicionar caixinha', () => openNew('box'))}
    </> : null}

    {tab === 'investments' ? <>
      <div className={fm.listHead}><span>{investments.length} {investments.length === 1 ? 'investimento' : 'investimentos'}</span><span>{money.format(totalInvestmentValue)} · <span className={investmentResult >= 0 ? fm.pos : fm.neg}>{signedMoney(investmentResult)}</span></span></div>
      <div className={fm.list}>{investments.map(item => { const gain = clampMoney(item.valor_atual) - clampMoney(item.aportado); const percent = clampMoney(item.aportado) ? gain / clampMoney(item.aportado) * 100 : 0; return <div key={String(item.id)} className={fm.entityRow}><button type="button" className={fm.entity} onClick={() => openExisting('investment', item)}><FinanceEntityIcon photo={String(item.foto || '')} icon={String(item.icone || 'trending_up')} color={String(item.cor || '#607d6b')} /><span className={fm.copy}><span className={fm.name}>{item.nome}</span><span className={fm.subLine}><span className={gain >= 0 ? fm.pos : fm.neg}>{signedMoney(gain)} · {percent.toFixed(1).replace('.', ',')}%</span><span>Aplicado {money.format(clampMoney(item.aportado))}</span></span></span><span className={fm.amount}><b>{money.format(clampMoney(item.valor_atual))}</b></span></button></div> })}</div>
      {addRow('Adicionar investimento', () => openNew('investment'))}
    </> : null}

    {tab === 'reports' ? <>
      <div className={fm.periodBar}>
        {period === 'custom' ? <span className={fm.customRange}>De <input type="month" value={customFrom} onChange={event => setCustomFrom(event.target.value)} /> Até <input type="month" value={customTo} onChange={event => setCustomTo(event.target.value)} /></span> : null}
        <div className={fm.periodWrap}>
          <button type="button" className={fm.periodChip} onClick={() => setPeriodMenu(open => !open)}>Período <b>{periodLabel}</b><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg></button>
          {periodMenu ? <div className={fm.periodMenu}>{periodOptions.map(option => <button key={option.id} type="button" data-active={period === option.id} onClick={() => { setPeriod(option.id); setPeriodMenu(false) }}>{option.label}{period === option.id ? <span>✓</span> : null}</button>)}</div> : null}
        </div>
      </div>
      {reportBlocks.map(barBlock)}
    </> : null}

    {draft ? <div className="mai-v3-create-layer" onMouseDown={closeDraft}><form className={`mai-v3-create-drawer mai-finance-v4-drawer mai-finance-v4-drawer-${kind}`} onSubmit={event => event.preventDefault()} onMouseDown={event => event.stopPropagation()}><header className="mai-v3-drawer-header"><div><small>{draft._persisted ? 'Editar' : 'Novo'}</small><strong>{kind === 'transaction' ? draft._persisted ? 'Editar lançamento' : 'Novo lançamento' : kind === 'account' ? draft._persisted ? 'Editar conta' : 'Nova conta' : kind === 'card' ? draft._persisted ? 'Editar cartão' : 'Novo cartão' : kind === 'box' ? draft._persisted ? 'Editar caixinha' : 'Nova caixinha' : draft._persisted ? 'Editar investimento' : 'Novo investimento'}</strong></div><button type="button" className="mai-v3-close" onClick={closeDraft}>×</button></header><div className="mai-v3-drawer-body mai-create-unified-body" onMouseDown={() => createTool && setCreateTool('')}>
      {kind === 'transaction' ? <><input className="mai-v3-title-input" autoFocus value={draft.titulo || ''} placeholder="Nome do lançamento" onMouseDown={event => event.stopPropagation()} onChange={event => setDraft({ ...draft, titulo: event.target.value })} /><textarea className="mai-v3-description-input mai-create-unified-description" rows={2} value={draft.observacao || ''} placeholder="Descrição" onMouseDown={event => event.stopPropagation()} onChange={event => setDraft({ ...draft, observacao: event.target.value })} /><div className="mai-task-v4-toolbar mai-context-unified-tools mai-create-unified-tools mai-finance-v4-unified-tools" onMouseDown={event => event.stopPropagation()}><CreateTool id="finance-date" icon="calendar_today" label="Data" summary={createNaturalDate(dateKey(draft.data), today)} color="#4f7cac" open={createTool} setOpen={setCreateTool}><CreateCalendarPicker value={dateKey(draft.data)} today={today} onChange={value => setDraft({ ...draft, data: value, dia_mes: Number(value.slice(8)), mes_inicio: draft.mes_inicio || value.slice(0, 7) })} close={() => setCreateTool('')} /></CreateTool><CreateTool id="finance-value" icon="payments" label="Valor" summary={money.format(clampMoney(draft.valor))} color="#4b8b6c" open={createTool} setOpen={setCreateTool}><CreateNumberEditor value={clampMoney(draft.valor)} onChange={value => { const nextPayments = cleanPayments(draft.pagamentos, dateKey(draft.data)); const paid = Math.min(value, nextPayments.reduce((sum, payment) => sum + clampMoney(payment.valor), 0)); setDraft({ ...draft, valor: value, valor_pago: paid, status: value > 0 && paid >= value ? 'pago' : paid > 0 ? 'parcial' : 'pendente' }) }} /></CreateTool><CreateTool id="finance-type" icon={draft.tipo === 'receita' ? 'arrow_downward' : 'arrow_upward'} label="Tipo" summary={draft.tipo === 'receita' ? 'Receita' : 'Despesa'} color={draft.tipo === 'receita' ? '#4b8b6c' : '#c85b52'} open={createTool} setOpen={setCreateTool}><CreateOptionList value={String(draft.tipo || 'despesa')} onChange={value => setDraft({ ...draft, tipo: value })} close={() => setCreateTool('')} options={[{ value: 'despesa', label: 'Despesa', icon: 'arrow_upward' }, { value: 'receita', label: 'Receita', icon: 'arrow_downward' }]} /></CreateTool><CreateTool id="finance-status" icon="task_alt" label="Status" summary={statusLabel(draft.status)} color="#5779a6" open={createTool} setOpen={setCreateTool}><CreateOptionList value={draft.status === 'pago' ? 'pago' : 'pendente'} onChange={value => setDraftPaymentStatus(String(value))} close={() => setCreateTool('')} options={[{ value: 'pendente', label: 'Pendente / zerar pagamentos', icon: 'schedule' }, { value: 'pago', label: 'Pago integralmente', icon: 'check_circle' }]} /></CreateTool><CreateTool id="finance-category" icon="sell" label="Categoria" summary={String(draft.categoria || 'Não selecionado')} color="#b27a35" open={createTool} setOpen={setCreateTool}><div className="mai-finance-v4-category-picker"><CreateOptionList value={String(draft.categoria || '')} onChange={value => setDraft({ ...draft, categoria: value })} close={() => setCreateTool('')} options={[{ value: '', label: 'Sem categoria', icon: 'remove_circle' }, ...categories.map(category => ({ value: String(category.nome), label: String(category.nome), icon: 'sell' }))]} /><div className="mai-finance-v4-category-create"><input value={categoryDraftName} onChange={event => setCategoryDraftName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addCategoryFromLaunch() } }} placeholder="Nova categoria" /><button type="button" onClick={addCategoryFromLaunch}>Adicionar</button></div></div></CreateTool><CreateTool id="finance-account" icon="account_balance_wallet" label="Conta" summary={accountSummary} color="#75808b" open={createTool} setOpen={setCreateTool}><CreateOptionList value={String(draft.conta_id || '')} onChange={value => setDraft({ ...draft, conta_id: value })} close={() => setCreateTool('')} options={[{ value: '', label: 'Sem origem', icon: 'remove_circle' }, ...accounts.map(account => ({ value: String(account.id), label: String(account.nome || 'Conta'), icon: 'account_balance' })), ...cards.map(card => ({ value: `card|${String(card.id)}`, label: String(card.nome || 'Cartão'), icon: 'credit_card' }))]} /></CreateTool><FinanceTransactionExtraTools draft={draft} setDraft={setDraft} today={today} month={month} open={createTool} setOpen={setCreateTool} draftPayment={draftPayment} addPayment={addPayment} removePayment={removePayment} generateInstallments={generateInstallments} editFixedOccurrence={() => editFixedOccurrence(draft)} ignoreFixed={() => ignoreFixed(draft)} /></div><ItemAttachments attachments={rows(draft.anexos)} onChange={anexos => setDraft({ ...draft, anexos })} /></>
      : kind === 'account' ? <div className="mai-finance-v4-form-grid"><label className="wide"><span>Nome</span><input autoFocus value={draft.nome || ''} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></label><FinanceEntityPhotoPicker value={String(draft.foto || '')} fallbackIcon="account_balance" color={String(draft.cor || '#718269')} onChange={foto => setDraft({ ...draft, foto })} /><label><span>Saldo inicial</span><input type="number" step="0.01" value={draft.saldo_inicial || 0} onChange={event => setDraft({ ...draft, saldo_inicial: Number(event.target.value) })} /></label><label><span>Cor</span><ColorField value={draft.cor || '#4073FF'} onChange={color => setDraft({ ...draft, cor: color })} /></label>{draft._persisted ? <div className="mai-finance-v4-account-preview wide"><span>Saldo atual</span><strong>{money.format(accountBalance(draft))}</strong><button type="button" onClick={() => reconcile(draft)}>Conciliar saldo</button></div> : null}</div>
      : kind === 'card' ? <div className="mai-finance-v4-form-grid"><label className="wide"><span>Nome</span><input autoFocus value={draft.nome || ''} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></label><FinanceEntityPhotoPicker value={String(draft.foto || '')} fallbackIcon="credit_card" color={String(draft.cor || '#8a7d72')} onChange={foto => setDraft({ ...draft, foto })} /><label><span>Limite</span><input type="number" step="0.01" value={draft.limite || 0} onChange={event => setDraft({ ...draft, limite: Number(event.target.value) })} /></label><label><span>Conta de pagamento</span><select value={draft.conta_id || ''} onChange={event => setDraft({ ...draft, conta_id: event.target.value })}><option value="">Nenhuma</option>{accounts.map(account => <option key={String(account.id)} value={account.id}>{account.nome}</option>)}</select></label><label><span>Fecha dia</span><input type="number" min="1" max="31" value={draft.fechamento || 1} onChange={event => setDraft({ ...draft, fechamento: Number(event.target.value) })} /></label><label><span>Vence dia</span><input type="number" min="1" max="31" value={draft.vencimento || 10} onChange={event => setDraft({ ...draft, vencimento: Number(event.target.value) })} /></label><label><span>Cor</span><ColorField value={draft.cor || '#4073FF'} onChange={color => setDraft({ ...draft, cor: color })} /></label></div>
      : kind === 'box' ? <div className="mai-finance-v4-feature-form"><input className="mai-v3-title-input" autoFocus value={draft.nome || ''} placeholder="Ex.: Meu carro" onChange={event => setDraft({ ...draft, nome: event.target.value })} /><textarea className="mai-v3-description-input" rows={2} value={draft.observacao || ''} placeholder="O que você quer conquistar?" onChange={event => setDraft({ ...draft, observacao: event.target.value })} /><FinanceEntityPhotoPicker value={String(draft.foto || '')} fallbackIcon={String(draft.icone || 'savings')} color={String(draft.cor || '#718269')} onChange={foto => setDraft({ ...draft, foto })} /><div className="mai-finance-v4-icon-picker">{financeIcons.map(icon => <button key={icon} type="button" data-active={!draft.foto && draft.icone === icon} onClick={() => setDraft({ ...draft, icone: icon, foto: '' })}><MaiIcon name={icon} size={19} /></button>)}</div><div className="mai-finance-v4-form-grid"><label><span>Meta</span><input type="number" step="0.01" value={draft.meta || 0} onChange={event => setDraft({ ...draft, meta: Number(event.target.value) })} /></label><label><span>Guardado</span><input type="number" step="0.01" value={draft.saldo || 0} onChange={event => setDraft({ ...draft, saldo: Number(event.target.value) })} /></label><label><span>Prazo opcional</span><input type="date" value={dateKey(draft.prazo)} onChange={event => setDraft({ ...draft, prazo: event.target.value })} /></label><label><span>Cor</span><ColorField value={draft.cor || '#4073FF'} onChange={color => setDraft({ ...draft, cor: color })} /></label></div><div className="mai-finance-v4-feature-actions"><button type="button" className="mai-finance-v4-positive-action" onClick={() => moveBoxValue('in')}>+ Guardar dinheiro</button><button type="button" onClick={() => moveBoxValue('out')}>Retirar</button></div><div className="mai-finance-v4-movement-list">{rows(draft.movimentos).slice(0, 8).map(mov => <div key={String(mov.id)}><span>{mov.tipo === 'entrada' ? 'Entrada' : 'Retirada'} · {new Date(mov.data).toLocaleDateString('pt-BR')}</span><strong>{mov.tipo === 'entrada' ? '+' : '−'} {money.format(clampMoney(mov.valor))}</strong></div>)}</div></div>
      : <div className="mai-finance-v4-feature-form"><input className="mai-v3-title-input" autoFocus value={draft.nome || ''} placeholder="Ex.: ETFs globais" onChange={event => setDraft({ ...draft, nome: event.target.value })} /><textarea className="mai-v3-description-input" rows={2} value={draft.observacao || ''} placeholder="Estratégia ou observações" onChange={event => setDraft({ ...draft, observacao: event.target.value })} /><FinanceEntityPhotoPicker value={String(draft.foto || '')} fallbackIcon={String(draft.icone || 'trending_up')} color={String(draft.cor || '#607d6b')} onChange={foto => setDraft({ ...draft, foto })} /><div className="mai-finance-v4-icon-picker">{financeIcons.map(icon => <button key={icon} type="button" data-active={!draft.foto && draft.icone === icon} onClick={() => setDraft({ ...draft, icone: icon, foto: '' })}><MaiIcon name={icon} size={19} /></button>)}</div><div className="mai-finance-v4-form-grid"><label><span>Tipo</span><select value={draft.tipo || 'ETF'} onChange={event => setDraft({ ...draft, tipo: event.target.value })}><option>ETF</option><option>Ações</option><option>FIIs</option><option>Renda fixa</option><option>Cripto</option><option>Previdência</option><option>Outro</option></select></label><label><span>Instituição</span><input value={draft.instituicao || ''} onChange={event => setDraft({ ...draft, instituicao: event.target.value })} /></label><label><span>Total aportado</span><input type="number" step="0.01" value={draft.aportado || 0} onChange={event => setDraft({ ...draft, aportado: Number(event.target.value) })} /></label><label><span>Valor atual</span><input type="number" step="0.01" value={draft.valor_atual || 0} onChange={event => setDraft({ ...draft, valor_atual: Number(event.target.value) })} /></label><label><span>Cor</span><ColorField value={draft.cor || '#4073FF'} onChange={color => setDraft({ ...draft, cor: color })} /></label></div><div className="mai-finance-v4-feature-actions"><button type="button" className="mai-finance-v4-positive-action" onClick={() => moveInvestmentValue('in')}>+ Aportar</button><button type="button" onClick={() => moveInvestmentValue('out')}>Resgatar</button></div><div className="mai-finance-v4-movement-list">{rows(draft.movimentos).slice(0, 8).map(mov => <div key={String(mov.id)}><span>{mov.tipo === 'aporte' ? 'Aporte' : 'Resgate'} · {new Date(mov.data).toLocaleDateString('pt-BR')}</span><strong>{mov.tipo === 'aporte' ? '+' : '−'} {money.format(clampMoney(mov.valor))}</strong></div>)}</div></div>}
    </div><footer className="mai-v3-drawer-footer"><div>{draft._persisted ? <button type="button" className="mai-finance-v4-delete" onClick={removeDraft}><MaiIcon name="delete" size={18} />Excluir</button> : null}</div><DraftButtons dirty={dirty} canSave={Boolean(String(draft.titulo || draft.nome || draft.descricao || '').trim()) || true} onSave={() => void saveDraft()} onCancel={closeDraft} /></footer></form></div> : null}
  </div>
}
