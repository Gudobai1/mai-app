'use client'

import { useEffect, useMemo, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import { CreateCalendarPicker, CreateNumberEditor, CreateOptionList, CreateTool, createNaturalDate } from './CreateDrawerTools'
import { FinanceEntityIcon, FinanceEntityPhotoPicker } from './FinanceEntityPhoto'
import { ItemAttachments } from './ItemAttachments'
import { useAutosaveDraft } from './useAutosaveDraft'

type Row = Record<string, any>
type Commit = (change: (current: MaiState) => MaiState) => void
type Tab = 'overview' | 'transactions' | 'accounts' | 'cards' | 'boxes' | 'investments' | 'reports'
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
const boxIcons = ['savings', 'directions_car', 'home', 'flight', 'school', 'celebration', 'favorite', 'emergency', 'devices', 'pets']
const investmentIcons = ['trending_up', 'monitoring', 'account_balance', 'real_estate_agent', 'currency_bitcoin', 'payments', 'shield', 'public']

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

export function FinanceV4({ state, today, commit, createRequest, inspect: _inspect }: { state: MaiState; today: string; commit: Commit; createRequest?: string; inspect: (item: InspectableItem) => void }) {
  const savedTabs = state.configs.areaTabs && typeof state.configs.areaTabs === 'object' ? state.configs.areaTabs as Record<string, string> : {}
  const savedTab = String(savedTabs.finance || 'overview')
  const allowedTabs: Tab[] = ['overview', 'transactions', 'accounts', 'cards', 'boxes', 'investments', 'reports']
  const tab: Tab = allowedTabs.includes(savedTab as Tab) ? savedTab as Tab : savedTab === 'fixed' || savedTab === 'categories' ? 'transactions' : 'overview'
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
  const order = String(financeControl.sort || 'date_desc')
  const [month, setMonth] = useState(today.slice(0, 7))
  const [draft, setDraft] = useState<Row | null>(null)
  const [kind, setKind] = useState<DraftKind>('transaction')
  const [createTool, setCreateTool] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [categoryDraftName, setCategoryDraftName] = useState('')

  const paidAmount = (item: Row) => {
    const payments = rows(item.pagamentos)
    if (payments.length) return Math.min(clampMoney(item.valor), payments.reduce((sum, payment) => sum + clampMoney(payment.valor), 0))
    return clampMoney(item.valor_pago) || (item.status === 'pago' ? clampMoney(item.valor) : 0)
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
    return { ...rule, ...occurrence, id: rule.id, _isFixed: true, occurrenceKey: `${rule.id}|${monthKey}`, data: occurrence?.data_override || `${monthKey}-${String(day).padStart(2, '0')}`, valor: occurrence?.valor_override === '' || occurrence?.valor_override == null ? clampMoney(rule.valor) : clampMoney(occurrence.valor_override), status, valor_pago: occurrence?.valor_pago ?? rule.valor_pago ?? (status === 'pago' ? clampMoney(rule.valor) : 0), recorrencia: 'fixo' } as Row
  }

  function fixedForMonthAt(monthKey: string): Row[] {
    return fixed.flatMap(rule => {
      const item = fixedRuleAtMonth(rule, monthKey)
      return item ? [item] : []
    })
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
  const looseCashBalance = transactions.filter(item => !item.ignorar_calculo && !String(item.conta_id || '').startsWith('card|') && !item.cartao_id).reduce((sum, item) => sum + signed(item, paidAmount(item)), 0) + monthFixed.filter(item => !item.ignorar_calculo && !String(item.conta_id || '').startsWith('card|') && !item.cartao_id).reduce((sum, item) => sum + signed(item, paidAmount(item)), 0)
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
  function accountBalance(account: Row) {
    const accountId = String(account.id)
    const regular = transactions.filter(item => String(item.conta_id || '') === accountId && !item.ignorar_calculo).reduce((sum, item) => sum + signed(item, paidAmount(item)), 0)
    const recurring = monthFixed.filter(item => String(item.conta_id || '') === accountId && !item.ignorar_calculo).reduce((sum, item) => sum + signed(item, paidAmount(item)), 0)
    return Number(account.saldo_inicial || 0) + regular + recurring
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
    if (type === 'transaction') return { id: uid('fin'), titulo: '', observacao: '', valor: 0, valor_pago: 0, tipo: 'despesa', data: today, status: 'pendente', categoria: '', conta_id: '', cartao_id: '', anexos: [], pagamentos: [], ignorar_calculo: false, recorrencia: 'unico', parcelas: 2, intervalo_parcelas: 'mensal', dividir_total: true, dia_mes: Number(today.slice(8)), mes_inicio: today.slice(0, 7), mes_fim: '', ativo: true, _persisted: false }
    if (type === 'account') return { id: uid('cta'), nome: '', saldo_inicial: 0, cor: '#718269', foto: '', _persisted: false }
    if (type === 'card') return { id: uid('crd'), nome: '', limite: 0, fechamento: 1, vencimento: 10, conta_id: '', cor: '#8a7d72', foto: '', _persisted: false }
    if (type === 'box') return { id: uid('box'), nome: '', icone: 'savings', cor: '#718269', foto: '', meta: 0, saldo: 0, prazo: '', observacao: '', movimentos: [], _persisted: false }
    return { id: uid('inv'), nome: '', icone: 'trending_up', cor: '#607d6b', foto: '', tipo: 'ETF', instituicao: '', aportado: 0, valor_atual: 0, observacao: '', movimentos: [], _persisted: false }
  }
  function openNew(type: DraftKind) {
    setKind(type)
    setDraft(newDraft(type))
    setCreateTool('')
    setDetailsOpen(type !== 'transaction')
    setCategoryDraftName('')
  }
  function openTransaction(item: Row) {
    setKind('transaction')
    setDraft({ ...item, recorrencia: item._isFixed ? 'fixo' : item.recorrencia || 'unico', dia_mes: item.dia_mes || Number(dateKey(item.data).slice(8)) || Number(today.slice(8)), mes_inicio: item.mes_inicio || dateKey(item.data).slice(0, 7) || month, mes_fim: item.mes_fim || '', anexos: rows(item.anexos), pagamentos: rows(item.pagamentos), _persisted: true, _isFixed: item._isFixed === true })
    setCreateTool('')
    setDetailsOpen(Boolean(item._isFixed || item.lote_id || item.recorrencia === 'parcelado'))
    setCategoryDraftName('')
  }
  function openExisting(type: Exclude<DraftKind, 'transaction'>, item: Row) {
    setKind(type)
    setDraft({ ...item, movimentos: rows(item.movimentos), _persisted: true })
    setCreateTool('')
    setDetailsOpen(true)
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
          const occurrenceStatus = String(clean.status || 'pendente')
          const occurrencePaid = occurrenceStatus === 'pago' ? clampMoney(clean.valor) : occurrenceStatus === 'parcial' ? clampMoney(clean.valor_pago) : 0
          delete fixedRule.status; delete fixedRule.valor_pago; delete fixedRule.pagamentos; delete fixedRule.parcelas; delete fixedRule.intervalo_parcelas; delete fixedRule.dividir_total; delete fixedRule.cartao_id
          fixedRule.recorrencia = 'fixo'
          nextFinance.transactions = rows(nextFinance.transactions).filter(item => String(item.id) !== String(clean.id))
          const fixedList = rows(nextFinance.fixed)
          nextFinance.fixed = fixedList.some(item => String(item.id) === String(fixedRule.id)) ? fixedList.map(item => String(item.id) === String(fixedRule.id) ? fixedRule : item) : [fixedRule, ...fixedList]
          const occurrenceKey = `${fixedRule.id}|${month}`
          const occurrence = { chave: occurrenceKey, fixo_id: fixedRule.id, competencia: month, status: occurrenceStatus, valor_pago: occurrencePaid, atualizado_em: new Date().toISOString() }
          const occurrenceList = rows(nextFinance.fixedOccurrences)
          nextFinance.fixedOccurrences = occurrenceList.some(item => String(item.chave) === occurrenceKey) ? occurrenceList.map(item => String(item.chave) === occurrenceKey ? { ...item, ...occurrence } : item) : [...occurrenceList, occurrence]
        } else {
          const payments = rows(clean.pagamentos)
          const value = clampMoney(clean.valor)
          let paid = payments.length ? Math.min(value, payments.reduce((sum, payment) => sum + clampMoney(payment.valor), 0)) : clampMoney(clean.valor_pago)
          if (clean.status === 'pago') paid = value
          if (clean.status === 'pendente' && !payments.length) paid = 0
          const status = paid >= value && value > 0 ? 'pago' : paid > 0 ? 'parcial' : clean.status === 'pago' ? 'pago' : 'pendente'
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

  useAutosaveDraft({ value: draft, identity: `${kind}:${String(draft?.id || '')}`, enabled: Boolean(draft), save: persistDraft, delay: 220 })

  function removeDraft() {
    if (!draft?._persisted || !confirm('Excluir este registro?')) return
    commit(current => {
      const nextFinance = { ...(current.finance || {}) } as Row
      if (kind === 'transaction') {
        if (draft._isFixed || draft.recorrencia === 'fixo') {
          nextFinance.fixed = rows(nextFinance.fixed).filter(item => String(item.id) !== String(draft.id))
          nextFinance.fixedOccurrences = rows(nextFinance.fixedOccurrences).filter(item => String(item.fixo_id) !== String(draft.id))
        } else {
          const deleteLot = draft.lote_id && confirm('Excluir todas as parcelas deste lançamento? Cancelar exclui apenas esta parcela.')
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
    if (item._isFixed) { updateOccurrence(item, { status: item.status === 'pago' ? 'pendente' : 'pago', valor_pago: item.status === 'pago' ? 0 : clampMoney(item.valor) }); return }
    commit(current => ({ ...current, finance: { ...current.finance, transactions: rows(current.finance.transactions).map(row => String(row.id) === String(item.id) ? { ...row, status: row.status === 'pago' ? 'pendente' : 'pago', valor_pago: row.status === 'pago' ? 0 : clampMoney(row.valor), pagamentos: row.status === 'pago' ? [] : rows(row.pagamentos) } : row) } }))
  }
  function editFixedOccurrence(item = draft) {
    if (!item) return
    const currentOccurrence = fixedForMonthAt(month).find(row => String(row.id) === String(item.id)) || item
    const value = prompt('Valor somente deste mês:', String(currentOccurrence.valor || item.valor || 0)); if (value === null) return
    const date = prompt('Data somente deste mês (AAAA-MM-DD):', String(currentOccurrence.data || `${month}-${String(item.dia_mes || 1).padStart(2, '0')}`)); if (date === null) return
    updateOccurrence({ ...item, occurrenceKey: `${item.id}|${month}` }, { valor_override: clampMoney(value), data_override: date, status: currentOccurrence.status || 'pendente' })
  }
  function ignoreFixed(item = draft) {
    if (!item || !confirm(`Ignorar este lançamento em ${monthLabel(month)}?`)) return
    updateOccurrence({ ...item, occurrenceKey: `${item.id}|${month}` }, { ignorado: true })
    if (draft && String(draft.id) === String(item.id)) setDraft(null)
  }
  function addPayment() {
    if (!draft || kind !== 'transaction' || draft.recorrencia === 'fixo') return
    const remaining = Math.max(0, clampMoney(draft.valor) - paidAmount(draft))
    const answer = prompt(`Valor do pagamento (restante ${money.format(remaining)}):`, String(remaining)); if (answer === null) return
    const amount = clampMoney(answer); if (!amount) return
    const payments = [...rows(draft.pagamentos), { id: uid('pay'), data: today, valor: amount }]
    const paid = Math.min(clampMoney(draft.valor), payments.reduce((sum, item) => sum + clampMoney(item.valor), 0))
    setDraft({ ...draft, pagamentos: payments, valor_pago: paid, status: paid >= clampMoney(draft.valor) ? 'pago' : 'parcial' })
  }
  function removePayment(index: number) {
    if (!draft || kind !== 'transaction') return
    const payments = rows(draft.pagamentos).filter((_, position) => position !== index)
    const paid = Math.min(clampMoney(draft.valor), payments.reduce((sum, item) => sum + clampMoney(item.valor), 0))
    setDraft({ ...draft, pagamentos: payments, valor_pago: paid, status: paid >= clampMoney(draft.valor) && clampMoney(draft.valor) > 0 ? 'pago' : paid > 0 ? 'parcial' : 'pendente' })
  }
  function generateInstallments() {
    if (!draft || kind !== 'transaction' || draft.recorrencia !== 'parcelado' || !String(draft.titulo || '').trim()) return
    const quantity = Math.max(2, Number(draft.parcelas || 2)); const lot = String(draft.lote_id || uid('lote')); const total = clampMoney(draft.valor); const installment = draft.dividir_total === false ? total : total / quantity; const baseTitle = String(draft.titulo || '').replace(/\s+\(\d+\/\d+\)$/, '').trim()
    const generated = Array.from({ length: quantity }, (_, index) => ({ ...draft, id: index === 0 ? String(draft.id || uid('fin')) : uid('fin'), lote_id: lot, parcela_numero: index + 1, parcelas_total: quantity, titulo: `${baseTitle} (${index + 1}/${quantity})`, valor: installment, data: moveDateForInstallment(dateKey(draft.data) || today, index, String(draft.intervalo_parcelas || 'mensal')), status: index === 0 ? String(draft.status || 'pendente') : 'pendente', valor_pago: index === 0 ? paidAmount(draft) : 0, pagamentos: index === 0 ? rows(draft.pagamentos) : [], recorrencia: 'unico', parcelas: undefined, intervalo_parcelas: undefined, dividir_total: undefined, dia_mes: undefined, mes_inicio: undefined, mes_fim: undefined, ativo: undefined, _persisted: undefined, _isFixed: undefined }))
    commit(current => ({ ...current, finance: { ...current.finance, fixed: rows(current.finance.fixed).filter(item => String(item.id) !== String(draft.id)), fixedOccurrences: rows(current.finance.fixedOccurrences).filter(item => String(item.fixo_id) !== String(draft.id)), transactions: [...rows(current.finance.transactions).filter(item => String(item.id) !== String(draft.id) && String(item.lote_id || '') !== lot), ...generated] } }))
    setDraft({ ...generated[0], _persisted: true })
  }
  function reconcile(account: Row) {
    const answer = prompt(`Saldo real de “${account.nome}”:`, String(accountBalance(account))); if (answer === null || !Number.isFinite(Number(answer))) return
    const diff = Number(answer) - accountBalance(account); if (Math.abs(diff) < 0.01) return
    commit(current => ({ ...current, finance: { ...current.finance, transactions: [{ id: uid('fin'), titulo: 'Ajuste de saldo', valor: Math.abs(diff), valor_pago: Math.abs(diff), tipo: diff >= 0 ? 'receita' : 'despesa', categoria: 'Ajuste', conta_id: account.id, cartao_id: '', data: today, status: 'pago', observacao: 'Conciliação bancária', pagamentos: [{ id: uid('pay'), data: today, valor: Math.abs(diff) }], anexos: [], ignorar_calculo: false, recorrencia: 'unico' }, ...rows(current.finance.transactions)] } }))
  }
  function adjustCardInvoice(card: Row) {
    const currentValue = cardInvoice(card, monthItems)
    const answer = prompt(`Valor da fatura de “${card.nome}” em ${monthLabel(month)}:`, currentValue.toFixed(2).replace('.', ','))
    if (answer === null) return
    const value = parseMoneyInput(answer)
    if (!Number.isFinite(value)) { alert('Digite um valor válido para a fatura.'); return }
    const cardId = String(card.id)
    const dueDate = monthDateForDay(month, Number(card.vencimento || 10))
    commit(current => {
      const list = rows(current.finance.transactions)
      const existing = list.find(item => item.ajuste_fatura === true && String(item.ajuste_fatura_card_id || item.cartao_id || '') === cardId && String(item.competencia_fatura || dateKey(item.data).slice(0, 7)) === month)
      const paid = existing ? Math.min(value, paidAmount(existing)) : 0
      const status = value > 0 && paid >= value ? 'pago' : paid > 0 ? 'parcial' : 'pendente'
      const next: Row = {
        ...(existing || {}),
        id: existing?.id || uid('invoice'),
        titulo: `Fatura ${String(card.nome || 'Cartão')}`,
        observacao: `Fatura ajustada manualmente em ${monthLabel(month)}.`,
        valor: value,
        valor_pago: paid,
        tipo: 'despesa',
        data: dueDate,
        status,
        categoria: 'Fatura do cartão',
        conta_id: `card|${cardId}`,
        cartao_id: cardId,
        conta_pagamento_id: String(card.conta_id || ''),
        anexos: rows(existing?.anexos),
        pagamentos: rows(existing?.pagamentos),
        ignorar_calculo: true,
        recorrencia: 'unico',
        ajuste_fatura: true,
        ajuste_fatura_card_id: cardId,
        competencia_fatura: month,
      }
      return { ...current, finance: { ...current.finance, transactions: existing ? list.map(item => String(item.id) === String(existing.id) ? next : item) : [next, ...list] } }
    })
  }
  function moveBoxValue(direction: 'in' | 'out') {
    if (!draft || kind !== 'box') return
    const answer = prompt(direction === 'in' ? 'Quanto deseja guardar?' : 'Quanto deseja retirar?', '0'); if (answer === null) return
    const value = clampMoney(answer); if (!value) return
    const nextBalance = direction === 'in' ? clampMoney(draft.saldo) + value : Math.max(0, clampMoney(draft.saldo) - value)
    setDraft({ ...draft, saldo: nextBalance, movimentos: [{ id: uid('mov'), data: new Date().toISOString(), tipo: direction === 'in' ? 'entrada' : 'retirada', valor: value }, ...rows(draft.movimentos)] })
  }
  function moveInvestmentValue(direction: 'in' | 'out') {
    if (!draft || kind !== 'investment') return
    const answer = prompt(direction === 'in' ? 'Valor do aporte:' : 'Valor do resgate:', '0'); if (answer === null) return
    const value = clampMoney(answer); if (!value) return
    const apportioned = direction === 'in' ? clampMoney(draft.aportado) + value : Math.max(0, clampMoney(draft.aportado) - value)
    const currentValue = direction === 'in' ? clampMoney(draft.valor_atual) + value : Math.max(0, clampMoney(draft.valor_atual) - value)
    setDraft({ ...draft, aportado: apportioned, valor_atual: currentValue, movimentos: [{ id: uid('mov'), data: new Date().toISOString(), tipo: direction === 'in' ? 'aporte' : 'resgate', valor: value }, ...rows(draft.movimentos)] })
  }

  function matchesFilters(item: Row) {
    const status = String(item.status || 'pendente')
    if (typeFilter === 'income' && item.tipo !== 'receita') return false
    if (typeFilter === 'expense' && item.tipo === 'receita') return false
    if (statusFilter === 'paid' && status !== 'pago') return false
    if (statusFilter === 'pending' && status !== 'pendente') return false
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
  const filtersActive = typeFilter !== 'all' || statusFilter !== 'all' || categoryFilter !== 'all' || originFilter !== 'all'
  const calculationItems = filtered.filter(item => !item.ignorar_calculo)
  const filteredIncome = calculationItems.filter(item => item.tipo === 'receita').reduce((sum, item) => sum + clampMoney(item.valor), 0)
  const filteredExpense = calculationItems.filter(item => item.tipo !== 'receita').reduce((sum, item) => sum + clampMoney(item.valor), 0)
  const filteredResult = filteredIncome - filteredExpense
  const filteredInvoice = filtersActive ? calculationItems.filter(item => item.tipo !== 'receita' && (String(item.conta_id || '').startsWith('card|') || item.cartao_id)).reduce((sum, item) => sum + clampMoney(item.valor), 0) : monthInvoice
  const recent = filtered.slice(0, 8)
  const catReport = (Object.entries(calculationItems.reduce((map: Record<string, number>, item) => { if (item.tipo !== 'receita') map[item.categoria || 'Sem categoria'] = (map[item.categoria || 'Sem categoria'] || 0) + clampMoney(item.valor); return map }, {})) as [string, number][]).sort((a, b) => b[1] - a[1])
  const visibleAccounts = originFilter !== 'all' ? accounts.filter(account => String(account.id) === originFilter) : filtersActive ? accounts.filter(account => filtered.some(item => String(item.conta_id || '') === String(account.id))) : accounts
  const visibleCards = cards
  const accountSummary = draft ? originName(draft.conta_id, accounts, cards) : 'Sem origem'

  const transactionRow = (item: Row) => {
    const incomeItem = item.tipo === 'receita'; const remaining = Math.max(0, clampMoney(item.valor) - paidAmount(item))
    return <article key={`${item._isFixed ? 'fix' : 'tx'}-${String(item.id)}`} className="mai-finance-v4-row mai-item-row-v2" data-status={String(item.status || 'pendente')}><button type="button" className="mai-finance-v4-status" data-paid={item.status === 'pago'} data-partial={item.status === 'parcial'} title={item.status === 'pago' ? 'Marcar como pendente' : 'Marcar como pago'} onClick={() => togglePaid(item)}>{item.status === 'pago' ? '✓' : item.status === 'parcial' ? '◐' : ''}</button><button type="button" className="mai-finance-v4-row-main" onClick={() => openTransaction(item)}><span className="mai-item-copy-v2"><span className="mai-item-titleline-v2"><strong>{String(item.titulo || 'Lançamento')}</strong></span><span className="mai-item-subline-v2"><span>{naturalDate(dateKey(item.data), today)}</span><span>·</span><span>{item.categoria || 'Sem categoria'}</span>{item.conta_id ? <><span>·</span><span>{originName(item.conta_id, accounts, cards)}</span></> : null}{item.ajuste_fatura ? <><span>·</span><span>Fatura ajustada</span></> : item._isFixed ? <><span>·</span><span>Fixo</span></> : item.lote_id ? <><span>·</span><span>Parcela {item.parcela_numero}/{item.parcelas_total}</span></> : null}</span></span><span className="mai-finance-v4-value" data-income={incomeItem}>{incomeItem ? '+' : '−'} {money.format(clampMoney(item.valor))}{item.status === 'parcial' ? <small>restam {money.format(remaining)}</small> : null}</span></button></article>
  }

  const tabs: { id: Tab; label: string; icon?: string }[] = [
    { id: 'overview', label: 'Visão geral' }, { id: 'transactions', label: 'Lançamentos' }, { id: 'accounts', label: 'Contas' }, { id: 'cards', label: 'Cartões' }, { id: 'boxes', label: 'Caixinha', icon: 'savings' }, { id: 'investments', label: 'Investimentos', icon: 'trending_up' }, { id: 'reports', label: 'Relatórios' },
  ]

  return <div className="mai-v3-area-page mai-v4-finance">
    <div className="mai-finance-v4-period"><div className="mai-finance-v4-month"><button type="button" onClick={() => moveMonth(-1)} aria-label="Mês anterior">‹</button><button type="button" aria-label="Voltar ao mês atual" title="Voltar ao mês atual" onClick={() => setMonth(today.slice(0, 7))}><strong>{monthLabel(month)}</strong></button><button type="button" onClick={() => moveMonth(1)} aria-label="Próximo mês">›</button></div></div>
    <div className="mai-v3-area-tabs mai-finance-v4-tabs">{tabs.map(item => <button key={item.id} data-active={tab === item.id} onClick={() => setTab(item.id)}>{item.icon ? <span className="material-symbols-rounded">{item.icon}</span> : null}<span>{item.label}</span></button>)}</div>

    {tab === 'overview' ? <><div className="mai-finance-v4-overview-metrics">
      <article className="mai-finance-v4-metric" data-negative={realBalance < 0}><div className="mai-finance-v4-metric-label"><span className="material-symbols-rounded">account_balance_wallet</span><span>Saldo atual</span></div><strong>{money.format(realBalance)}</strong><small>Disponível agora</small></article>
      <article className="mai-finance-v4-metric" data-negative={projectedBalance < 0}><div className="mai-finance-v4-metric-label"><span className="material-symbols-rounded">timeline</span><span>Previsto</span></div><strong>{money.format(projectedBalance)}</strong><small>Até {monthLabel(month)}</small></article>
      <article className="mai-finance-v4-metric" data-positive={monthIncome > 0}><div className="mai-finance-v4-metric-label"><span className="material-symbols-rounded">south_west</span><span>Receitas</span></div><strong>{money.format(monthIncome)}</strong><small>{monthLabel(month)}</small></article>
      <article className="mai-finance-v4-metric" data-negative={monthExpense > 0}><div className="mai-finance-v4-metric-label"><span className="material-symbols-rounded">north_east</span><span>Despesas</span></div><strong>{money.format(monthExpense)}</strong><small>Inclui faturas de cartão</small></article>
      <article className="mai-finance-v4-metric" data-positive={monthResult > 0} data-negative={monthResult < 0}><div className="mai-finance-v4-metric-label"><span className="material-symbols-rounded">balance</span><span>Balanço</span></div><strong>{money.format(monthResult)}</strong><small>{monthResult >= 0 ? 'Superávit' : 'Déficit'}</small></article>
      <button type="button" className="mai-finance-v4-metric mai-finance-v4-metric-asset" onClick={() => setTab('boxes')}><div className="mai-finance-v4-metric-label"><span className="material-symbols-rounded">savings</span><span>Caixinhas</span></div><strong>{money.format(totalBoxes)}</strong><small>{boxes.length} {boxes.length === 1 ? 'caixinha' : 'caixinhas'}{totalBoxTarget ? ` · ${Math.round(totalBoxProgress)}%` : ''}</small></button>
      <button type="button" className="mai-finance-v4-metric mai-finance-v4-metric-asset" data-positive={investmentResult > 0} data-negative={investmentResult < 0} onClick={() => setTab('investments')}><div className="mai-finance-v4-metric-label"><span className="material-symbols-rounded">trending_up</span><span>Investimentos</span></div><strong>{money.format(totalInvestmentValue)}</strong><small>{investmentResult >= 0 ? '+' : ''}{money.format(investmentResult)}{totalInvested ? ` · ${investmentResultPercent.toFixed(1)}%` : ''}</small></button>
    </div><section className="mai-v3-simple-section mai-finance-v4-overview-list"><div className="mai-finance-v4-section-head"><div><h2>{filtersActive ? 'Lançamentos filtrados' : 'Últimos lançamentos'}</h2><small>{filtered.length} em {monthLabel(month)}</small></div><button type="button" onClick={() => openNew('transaction')}><span className="material-symbols-rounded">add</span>Adicionar lançamento</button></div><div className="mai-v3-finance-rows mai-v3-simple-list">{recent.map(transactionRow)}{!recent.length ? <div className="mai-v3-empty-line">Nenhum lançamento encontrado.</div> : null}</div></section></> : null}

    {tab === 'transactions' ? <section className="mai-v3-simple-section"><div className="mai-finance-v4-section-head"><div><h2>Lançamentos</h2><small>{filtered.length} no período · únicos, parcelados e fixos</small></div><button type="button" onClick={() => openNew('transaction')}><span className="material-symbols-rounded">add</span>Adicionar lançamento</button></div><div className="mai-v3-finance-rows mai-v3-simple-list">{filtered.map(transactionRow)}{!filtered.length ? <div className="mai-v3-empty-line">Nenhum lançamento encontrado.</div> : null}</div></section> : null}
    {tab === 'accounts' ? <section className="mai-v3-simple-section"><div className="mai-finance-v4-section-head"><div><h2>Contas</h2><small>Saldos reais e conciliação.</small></div><button type="button" onClick={() => openNew('account')}><span className="material-symbols-rounded">add</span>Adicionar conta</button></div><div className="mai-v3-account-list mai-finance-v4-entity-list mai-finance-v4-account-list">{visibleAccounts.map(account => <article key={String(account.id)} className="mai-finance-v4-entity-row"><FinanceEntityIcon photo={String(account.foto || '')} icon="account_balance" color={String(account.cor || '#718269')} /><button type="button" className="mai-finance-v4-entity-identity" onClick={() => openExisting('account', account)}><strong>{account.nome}</strong><small>Saldo inicial {money.format(Number(account.saldo_inicial || 0))}</small></button><span className="mai-finance-v4-entity-summary"><b>{money.format(accountBalance(account))}</b><small>saldo atual</small></span><button type="button" className="mai-finance-v4-row-action" onClick={() => reconcile(account)}><span className="material-symbols-rounded">sync_alt</span><span>Conciliar</span></button></article>)}</div></section> : null}
    {tab === 'cards' ? <section className="mai-v3-simple-section"><div className="mai-finance-v4-section-head"><div><h2>Cartões</h2><small>Fatura, limite disponível e vencimento.</small></div><button type="button" onClick={() => openNew('card')}><span className="material-symbols-rounded">add</span>Adicionar cartão</button></div><div className="mai-v3-card-list mai-finance-v4-card-list mai-finance-v4-entity-list">{visibleCards.map(card => { const invoice = cardInvoice(card, monthItems); return <article key={String(card.id)} className="mai-finance-v4-entity-row mai-finance-v4-card-row"><FinanceEntityIcon photo={String(card.foto || '')} icon="credit_card" color={String(card.cor || '#8a7d72')} /><button type="button" className="mai-finance-v4-entity-identity" onClick={() => openExisting('card', card)}><strong>{card.nome}</strong><small>Fecha dia {card.fechamento || '—'} · vence dia {card.vencimento || '—'}</small></button><span className="mai-finance-v4-entity-summary"><b>{money.format(invoice)}</b><small>fatura · {money.format(Math.max(0, clampMoney(card.limite) - invoice))} disponível</small></span><button type="button" className="mai-finance-v4-row-action" onClick={() => adjustCardInvoice(card)}><span className="material-symbols-rounded">edit_note</span><span>Ajustar fatura</span></button></article> })}</div></section> : null}

    {tab === 'boxes' ? <section className="mai-v3-simple-section mai-finance-v4-goal-area"><div className="mai-finance-v4-section-head"><div><h2>Caixinha</h2><small>{money.format(totalBoxes)} guardados em {boxes.length} {boxes.length === 1 ? 'meta' : 'metas'}.</small></div><button type="button" onClick={() => openNew('box')}><span className="material-symbols-rounded">add</span>Nova caixinha</button></div><div className="mai-finance-v4-goal-grid">{boxes.map(box => { const target = clampMoney(box.meta); const current = clampMoney(box.saldo); const progress = target ? Math.min(100, current / target * 100) : 0; return <article key={String(box.id)} className="mai-finance-v4-goal-card" style={{ '--finance-item-color': box.cor || '#718269' } as React.CSSProperties}><button type="button" className="mai-finance-v4-goal-main" onClick={() => openExisting('box', box)}><FinanceEntityIcon photo={String(box.foto || '')} icon={String(box.icone || 'savings')} color={String(box.cor || '#718269')} className="mai-finance-v4-goal-icon" /><span className="mai-finance-v4-goal-copy"><strong>{box.nome}</strong><small>{box.prazo ? `Meta até ${naturalDate(dateKey(box.prazo), today)}` : 'Sem prazo definido'}</small></span><b>{money.format(current)}</b></button><div className="mai-finance-v4-progress"><i><b style={{ width: `${progress}%` }} /></i><small>{target ? `${Math.round(progress)}% de ${money.format(target)}` : 'Defina um valor-alvo'}</small></div><button type="button" className="mai-finance-v4-quick-action" onClick={() => { openExisting('box', box); setTimeout(() => { const el = document.querySelector('.mai-finance-v4-drawer-box .mai-finance-v4-positive-action') as HTMLButtonElement | null; el?.focus() }, 0) }}>Adicionar valor</button></article> })}{!boxes.length ? <div className="mai-finance-v4-empty-feature"><span className="material-symbols-rounded">savings</span><strong>Crie sua primeira caixinha</strong><small>Carro, casa, viagem, reserva ou qualquer objetivo que você queira construir aos poucos.</small><button type="button" onClick={() => openNew('box')}>Criar caixinha</button></div> : null}</div></section> : null}

    {tab === 'investments' ? <section className="mai-v3-simple-section mai-finance-v4-goal-area"><div className="mai-finance-v4-section-head"><div><h2>Investimentos</h2><small>{money.format(totalInvestmentValue)} atuais · {money.format(totalInvested)} aportados.</small></div><button type="button" onClick={() => openNew('investment')}><span className="material-symbols-rounded">add</span>Novo investimento</button></div><div className="mai-finance-v4-investment-summary"><span>Patrimônio investido<strong>{money.format(totalInvestmentValue)}</strong></span><span>Total aportado<strong>{money.format(totalInvested)}</strong></span><span>Resultado<strong data-positive={totalInvestmentValue - totalInvested >= 0}>{money.format(totalInvestmentValue - totalInvested)}</strong></span></div><div className="mai-finance-v4-goal-grid">{investments.map(item => { const gain = clampMoney(item.valor_atual) - clampMoney(item.aportado); const percent = clampMoney(item.aportado) ? gain / clampMoney(item.aportado) * 100 : 0; return <article key={String(item.id)} className="mai-finance-v4-goal-card" style={{ '--finance-item-color': item.cor || '#607d6b' } as React.CSSProperties}><button type="button" className="mai-finance-v4-goal-main" onClick={() => openExisting('investment', item)}><FinanceEntityIcon photo={String(item.foto || '')} icon={String(item.icone || 'trending_up')} color={String(item.cor || '#607d6b')} className="mai-finance-v4-goal-icon" /><span className="mai-finance-v4-goal-copy"><strong>{item.nome}</strong><small>{item.tipo || 'Investimento'}{item.instituicao ? ` · ${item.instituicao}` : ''}</small></span><b>{money.format(clampMoney(item.valor_atual))}</b></button><div className="mai-finance-v4-investment-result"><span>Aportado {money.format(clampMoney(item.aportado))}</span><strong data-positive={gain >= 0} data-negative={gain < 0}>{gain >= 0 ? '+' : ''}{money.format(gain)} · {percent.toFixed(1)}%</strong></div></article> })}{!investments.length ? <div className="mai-finance-v4-empty-feature"><span className="material-symbols-rounded">trending_up</span><strong>Comece sua carteira de longo prazo</strong><small>Acompanhe aportes, valor atual e evolução dos seus investimentos.</small><button type="button" onClick={() => openNew('investment')}>Adicionar investimento</button></div> : null}</div></section> : null}

    {tab === 'reports' ? <section className="mai-v3-simple-section"><div className="mai-finance-v4-section-head"><div><h2>Relatórios</h2><small>{monthLabel(month)}{filtersActive ? ' · filtro ativo' : ''}</small></div></div><div className="mai-finance-v4-reports"><article><header><strong>Despesas por categoria</strong><small>{money.format(filteredExpense)}</small></header>{catReport.map(([name, value]) => <div className="mai-finance-v4-report-row" key={name}><span>{name}</span><i><b style={{ width: `${filteredExpense ? value / filteredExpense * 100 : 0}%` }} /></i><strong>{money.format(value)}</strong></div>)}</article><article><header><strong>Resumo</strong><small>{filtered.length} itens</small></header><div className="mai-finance-v4-report-simple"><span>Receitas</span><strong>{money.format(filteredIncome)}</strong></div><div className="mai-finance-v4-report-simple"><span>Despesas</span><strong>{money.format(filteredExpense)}</strong></div><div className="mai-finance-v4-report-simple"><span>Cartões</span><strong>{money.format(filteredInvoice)}</strong></div><div className="mai-finance-v4-report-simple"><span>Balanço</span><strong>{money.format(filteredResult)}</strong></div></article></div></section> : null}

    {draft ? <div className="mai-v3-create-layer" onMouseDown={() => setDraft(null)}><form className={`mai-v3-create-drawer mai-finance-v4-drawer mai-finance-v4-drawer-${kind}`} onSubmit={event => event.preventDefault()} onMouseDown={event => event.stopPropagation()}><header className="mai-v3-drawer-header"><div><small>{draft._persisted ? 'Salvamento automático' : 'Novo'}</small><strong>{kind === 'transaction' ? draft._persisted ? 'Editar lançamento' : 'Novo lançamento' : kind === 'account' ? draft._persisted ? 'Editar conta' : 'Nova conta' : kind === 'card' ? draft._persisted ? 'Editar cartão' : 'Novo cartão' : kind === 'box' ? draft._persisted ? 'Editar caixinha' : 'Nova caixinha' : draft._persisted ? 'Editar investimento' : 'Novo investimento'}</strong></div><button type="button" className="mai-v3-close" onClick={() => setDraft(null)}>×</button></header><div className="mai-v3-drawer-body mai-create-unified-body" onMouseDown={() => createTool && setCreateTool('')}>
      {kind === 'transaction' ? <><input className="mai-v3-title-input" autoFocus value={draft.titulo || ''} placeholder="Nome do lançamento" onMouseDown={event => event.stopPropagation()} onChange={event => setDraft({ ...draft, titulo: event.target.value })} /><textarea className="mai-v3-description-input mai-create-unified-description" rows={2} value={draft.observacao || ''} placeholder="Descrição" onMouseDown={event => event.stopPropagation()} onChange={event => setDraft({ ...draft, observacao: event.target.value })} /><div className="mai-task-v4-toolbar mai-context-unified-tools mai-create-unified-tools" onMouseDown={event => event.stopPropagation()}><CreateTool id="finance-date" icon="calendar_today" label="Data" summary={createNaturalDate(dateKey(draft.data), today)} color="#4f7cac" open={createTool} setOpen={setCreateTool}><CreateCalendarPicker value={dateKey(draft.data)} today={today} onChange={value => setDraft({ ...draft, data: value, dia_mes: Number(value.slice(8)), mes_inicio: draft.mes_inicio || value.slice(0, 7) })} close={() => setCreateTool('')} /></CreateTool><CreateTool id="finance-value" icon="payments" label="Valor" summary={money.format(clampMoney(draft.valor))} color="#4b8b6c" open={createTool} setOpen={setCreateTool}><CreateNumberEditor value={clampMoney(draft.valor)} onChange={value => setDraft({ ...draft, valor: value })} /></CreateTool><CreateTool id="finance-type" icon={draft.tipo === 'receita' ? 'arrow_downward' : 'arrow_upward'} label="Tipo" summary={draft.tipo === 'receita' ? 'Receita' : 'Despesa'} color={draft.tipo === 'receita' ? '#4b8b6c' : '#c85b52'} open={createTool} setOpen={setCreateTool}><CreateOptionList value={String(draft.tipo || 'despesa')} onChange={value => setDraft({ ...draft, tipo: value })} close={() => setCreateTool('')} options={[{ value: 'despesa', label: 'Despesa', icon: 'arrow_upward' }, { value: 'receita', label: 'Receita', icon: 'arrow_downward' }]} /></CreateTool><CreateTool id="finance-status" icon="task_alt" label="Status" summary={statusLabel(draft.status)} color="#5779a6" open={createTool} setOpen={setCreateTool}><CreateOptionList value={String(draft.status || 'pendente')} onChange={value => setDraft({ ...draft, status: value, valor_pago: value === 'pago' ? clampMoney(draft.valor) : value === 'pendente' ? 0 : draft.valor_pago })} close={() => setCreateTool('')} options={[{ value: 'pendente', label: 'Pendente', icon: 'schedule' }, { value: 'parcial', label: 'Parcial', icon: 'pending' }, { value: 'pago', label: 'Pago', icon: 'check_circle' }]} /></CreateTool><CreateTool id="finance-category" icon="sell" label="Categoria" summary={String(draft.categoria || 'Não selecionado')} color="#b27a35" open={createTool} setOpen={setCreateTool}><div className="mai-finance-v4-category-picker"><CreateOptionList value={String(draft.categoria || '')} onChange={value => setDraft({ ...draft, categoria: value })} close={() => setCreateTool('')} options={[{ value: '', label: 'Sem categoria', icon: 'remove_circle' }, ...categories.map(category => ({ value: String(category.nome), label: String(category.nome), icon: 'sell' }))]} /><div className="mai-finance-v4-category-create"><input value={categoryDraftName} onChange={event => setCategoryDraftName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addCategoryFromLaunch() } }} placeholder="Nova categoria" /><button type="button" onClick={addCategoryFromLaunch}>Adicionar</button></div></div></CreateTool><CreateTool id="finance-account" icon="account_balance_wallet" label="Conta" summary={accountSummary} color="#75808b" open={createTool} setOpen={setCreateTool}><CreateOptionList value={String(draft.conta_id || '')} onChange={value => setDraft({ ...draft, conta_id: value })} close={() => setCreateTool('')} options={[{ value: '', label: 'Sem origem', icon: 'remove_circle' }, ...accounts.map(account => ({ value: String(account.id), label: String(account.nome || 'Conta'), icon: 'account_balance' })), ...cards.map(card => ({ value: `card|${String(card.id)}`, label: String(card.nome || 'Cartão'), icon: 'credit_card' }))]} /></CreateTool></div><button type="button" className="mai-finance-v4-details-toggle" data-open={detailsOpen} onClick={() => setDetailsOpen(value => !value)}><span>Parcelamento, fixo e mais detalhes</span><span className="material-symbols-rounded">expand_more</span></button>{detailsOpen ? <div className="mai-finance-v4-details">{!draft.lote_id ? <label><span>Forma do lançamento</span><select value={draft.recorrencia || 'unico'} onChange={event => setDraft({ ...draft, recorrencia: event.target.value, _isFixed: event.target.value === 'fixo' })}><option value="unico">Único</option><option value="parcelado">Parcelado</option><option value="fixo">Fixo mensal</option></select></label> : <label><span>Parcela</span><input disabled value={`${draft.parcela_numero || 1}/${draft.parcelas_total || 1}`} /></label>}{draft.recorrencia === 'parcelado' && !draft.lote_id ? <><label><span>Parcelas</span><input type="number" min="2" value={draft.parcelas || 2} onChange={event => setDraft({ ...draft, parcelas: Number(event.target.value) })} /></label><label><span>Intervalo</span><select value={draft.intervalo_parcelas || 'mensal'} onChange={event => setDraft({ ...draft, intervalo_parcelas: event.target.value })}><option value="semanal">Semanal</option><option value="quinzenal">Quinzenal</option><option value="mensal">Mensal</option><option value="anual">Anual</option></select></label><label className="mai-finance-v4-toggle"><input type="checkbox" checked={draft.dividir_total !== false} onChange={event => setDraft({ ...draft, dividir_total: event.target.checked })} /><span>Dividir o valor total entre as parcelas</span></label><button type="button" className="mai-finance-v4-action-card" onClick={generateInstallments}><span className="material-symbols-rounded">splitscreen</span><span><strong>Gerar parcelas</strong><small>Cria todas as parcelas.</small></span></button></> : null}{draft.recorrencia === 'fixo' ? <><label><span>Dia do mês</span><input type="number" min="1" max="31" value={draft.dia_mes || Number(today.slice(8))} onChange={event => setDraft({ ...draft, dia_mes: Number(event.target.value) })} /></label><label><span>Início</span><input type="month" value={String(draft.mes_inicio || month).slice(0, 7)} onChange={event => setDraft({ ...draft, mes_inicio: event.target.value })} /></label><label><span>Fim opcional</span><input type="month" value={String(draft.mes_fim || '').slice(0, 7)} onChange={event => setDraft({ ...draft, mes_fim: event.target.value })} /></label><label className="mai-finance-v4-toggle"><input type="checkbox" checked={draft.ativo !== false} onChange={event => setDraft({ ...draft, ativo: event.target.checked })} /><span>Lançamento fixo ativo</span></label>{draft._persisted ? <><button type="button" className="mai-finance-v4-action-card" onClick={() => editFixedOccurrence(draft)}><span className="material-symbols-rounded">edit_calendar</span><span><strong>Alterar somente {monthLabel(month)}</strong><small>Muda valor ou data apenas desta ocorrência.</small></span></button><button type="button" className="mai-finance-v4-action-card" onClick={() => ignoreFixed(draft)}><span className="material-symbols-rounded">event_busy</span><span><strong>Ignorar neste mês</strong><small>Pula esta ocorrência.</small></span></button></> : null}</> : null}{draft.recorrencia !== 'fixo' ? <div className="mai-finance-v4-payments"><header><div><strong>Pagamentos</strong><small>{money.format(paidAmount(draft))} de {money.format(clampMoney(draft.valor))}</small></div><button type="button" onClick={addPayment}>+ Pagamento</button></header>{rows(draft.pagamentos).map((payment, index) => <article key={String(payment.id || index)}><span>{naturalDate(dateKey(payment.data), today)}</span><strong>{money.format(clampMoney(payment.valor))}</strong><button type="button" onClick={() => removePayment(index)}>×</button></article>)}</div> : null}</div> : null}<ItemAttachments attachments={rows(draft.anexos)} onChange={anexos => setDraft({ ...draft, anexos })} /></>
      : kind === 'account' ? <div className="mai-finance-v4-form-grid"><label className="wide"><span>Nome</span><input autoFocus value={draft.nome || ''} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></label><FinanceEntityPhotoPicker value={String(draft.foto || '')} fallbackIcon="account_balance" color={String(draft.cor || '#718269')} onChange={foto => setDraft({ ...draft, foto })} /><label><span>Saldo inicial</span><input type="number" step="0.01" value={draft.saldo_inicial || 0} onChange={event => setDraft({ ...draft, saldo_inicial: Number(event.target.value) })} /></label><label><span>Cor</span><input type="color" value={draft.cor || '#718269'} onChange={event => setDraft({ ...draft, cor: event.target.value })} /></label>{draft._persisted ? <div className="mai-finance-v4-account-preview wide"><span>Saldo atual</span><strong>{money.format(accountBalance(draft))}</strong><button type="button" onClick={() => reconcile(draft)}>Conciliar saldo</button></div> : null}</div>
      : kind === 'card' ? <div className="mai-finance-v4-form-grid"><label className="wide"><span>Nome</span><input autoFocus value={draft.nome || ''} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></label><FinanceEntityPhotoPicker value={String(draft.foto || '')} fallbackIcon="credit_card" color={String(draft.cor || '#8a7d72')} onChange={foto => setDraft({ ...draft, foto })} /><label><span>Limite</span><input type="number" step="0.01" value={draft.limite || 0} onChange={event => setDraft({ ...draft, limite: Number(event.target.value) })} /></label><label><span>Conta de pagamento</span><select value={draft.conta_id || ''} onChange={event => setDraft({ ...draft, conta_id: event.target.value })}><option value="">Nenhuma</option>{accounts.map(account => <option key={String(account.id)} value={account.id}>{account.nome}</option>)}</select></label><label><span>Fecha dia</span><input type="number" min="1" max="31" value={draft.fechamento || 1} onChange={event => setDraft({ ...draft, fechamento: Number(event.target.value) })} /></label><label><span>Vence dia</span><input type="number" min="1" max="31" value={draft.vencimento || 10} onChange={event => setDraft({ ...draft, vencimento: Number(event.target.value) })} /></label><label><span>Cor</span><input type="color" value={draft.cor || '#8a7d72'} onChange={event => setDraft({ ...draft, cor: event.target.value })} /></label></div>
      : kind === 'box' ? <div className="mai-finance-v4-feature-form"><input className="mai-v3-title-input" autoFocus value={draft.nome || ''} placeholder="Ex.: Meu carro" onChange={event => setDraft({ ...draft, nome: event.target.value })} /><textarea className="mai-v3-description-input" rows={2} value={draft.observacao || ''} placeholder="O que você quer conquistar?" onChange={event => setDraft({ ...draft, observacao: event.target.value })} /><FinanceEntityPhotoPicker value={String(draft.foto || '')} fallbackIcon={String(draft.icone || 'savings')} color={String(draft.cor || '#718269')} onChange={foto => setDraft({ ...draft, foto })} /><div className="mai-finance-v4-icon-picker">{boxIcons.map(icon => <button key={icon} type="button" data-active={!draft.foto && draft.icone === icon} onClick={() => setDraft({ ...draft, icone: icon, foto: '' })}><span className="material-symbols-rounded">{icon}</span></button>)}</div><div className="mai-finance-v4-form-grid"><label><span>Meta</span><input type="number" step="0.01" value={draft.meta || 0} onChange={event => setDraft({ ...draft, meta: Number(event.target.value) })} /></label><label><span>Guardado</span><input type="number" step="0.01" value={draft.saldo || 0} onChange={event => setDraft({ ...draft, saldo: Number(event.target.value) })} /></label><label><span>Prazo opcional</span><input type="date" value={dateKey(draft.prazo)} onChange={event => setDraft({ ...draft, prazo: event.target.value })} /></label><label><span>Cor</span><input type="color" value={draft.cor || '#718269'} onChange={event => setDraft({ ...draft, cor: event.target.value })} /></label></div><div className="mai-finance-v4-feature-actions"><button type="button" className="mai-finance-v4-positive-action" onClick={() => moveBoxValue('in')}>+ Guardar dinheiro</button><button type="button" onClick={() => moveBoxValue('out')}>Retirar</button></div><div className="mai-finance-v4-movement-list">{rows(draft.movimentos).slice(0, 8).map(mov => <div key={String(mov.id)}><span>{mov.tipo === 'entrada' ? 'Entrada' : 'Retirada'} · {new Date(mov.data).toLocaleDateString('pt-BR')}</span><strong>{mov.tipo === 'entrada' ? '+' : '−'} {money.format(clampMoney(mov.valor))}</strong></div>)}</div></div>
      : <div className="mai-finance-v4-feature-form"><input className="mai-v3-title-input" autoFocus value={draft.nome || ''} placeholder="Ex.: ETFs globais" onChange={event => setDraft({ ...draft, nome: event.target.value })} /><textarea className="mai-v3-description-input" rows={2} value={draft.observacao || ''} placeholder="Estratégia ou observações" onChange={event => setDraft({ ...draft, observacao: event.target.value })} /><FinanceEntityPhotoPicker value={String(draft.foto || '')} fallbackIcon={String(draft.icone || 'trending_up')} color={String(draft.cor || '#607d6b')} onChange={foto => setDraft({ ...draft, foto })} /><div className="mai-finance-v4-icon-picker">{investmentIcons.map(icon => <button key={icon} type="button" data-active={!draft.foto && draft.icone === icon} onClick={() => setDraft({ ...draft, icone: icon, foto: '' })}><span className="material-symbols-rounded">{icon}</span></button>)}</div><div className="mai-finance-v4-form-grid"><label><span>Tipo</span><select value={draft.tipo || 'ETF'} onChange={event => setDraft({ ...draft, tipo: event.target.value })}><option>ETF</option><option>Ações</option><option>FIIs</option><option>Renda fixa</option><option>Cripto</option><option>Previdência</option><option>Outro</option></select></label><label><span>Instituição</span><input value={draft.instituicao || ''} onChange={event => setDraft({ ...draft, instituicao: event.target.value })} /></label><label><span>Total aportado</span><input type="number" step="0.01" value={draft.aportado || 0} onChange={event => setDraft({ ...draft, aportado: Number(event.target.value) })} /></label><label><span>Valor atual</span><input type="number" step="0.01" value={draft.valor_atual || 0} onChange={event => setDraft({ ...draft, valor_atual: Number(event.target.value) })} /></label><label><span>Cor</span><input type="color" value={draft.cor || '#607d6b'} onChange={event => setDraft({ ...draft, cor: event.target.value })} /></label></div><div className="mai-finance-v4-feature-actions"><button type="button" className="mai-finance-v4-positive-action" onClick={() => moveInvestmentValue('in')}>+ Aportar</button><button type="button" onClick={() => moveInvestmentValue('out')}>Resgatar</button></div><div className="mai-finance-v4-movement-list">{rows(draft.movimentos).slice(0, 8).map(mov => <div key={String(mov.id)}><span>{mov.tipo === 'aporte' ? 'Aporte' : 'Resgate'} · {new Date(mov.data).toLocaleDateString('pt-BR')}</span><strong>{mov.tipo === 'aporte' ? '+' : '−'} {money.format(clampMoney(mov.valor))}</strong></div>)}</div></div>}
    </div><footer className="mai-v3-drawer-footer"><div>{draft._persisted ? <button type="button" className="mai-finance-v4-delete" onClick={removeDraft}><span className="material-symbols-rounded">delete</span>Excluir</button> : null}</div><span className="mai-autosave-status">Alterações salvas automaticamente</span></footer></form></div> : null}
  </div>
}
