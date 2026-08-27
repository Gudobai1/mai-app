'use client'

import { useEffect, useMemo, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import { CreateCalendarPicker, CreateNumberEditor, CreateOptionList, CreateTool, createNaturalDate } from './CreateDrawerTools'
import { ItemAttachments } from './ItemAttachments'
import { useAutosaveDraft } from './useAutosaveDraft'

type Row = Record<string, any>
type Commit = (change: (current: MaiState) => MaiState) => void
type Tab = 'overview' | 'transactions' | 'accounts' | 'cards' | 'reports' | 'categories'
type DraftKind = 'transaction' | 'account' | 'card' | 'category'

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dateKey = (value: unknown) => String(value || '').slice(0, 10)
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const cleanText = (value: unknown) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
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

function moveDateForInstallment(key: string, index: number, interval: string) {
  const date = new Date(`${key}T12:00:00`)
  if (interval === 'semanal') date.setDate(date.getDate() + index * 7)
  else if (interval === 'quinzenal') date.setDate(date.getDate() + index * 15)
  else if (interval === 'anual') date.setFullYear(date.getFullYear() + index)
  else date.setMonth(date.getMonth() + index)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function FinanceV4({ state, today, commit, createRequest, inspect: _inspect }: { state: MaiState; today: string; commit: Commit; createRequest?: string; inspect: (item: InspectableItem) => void }) {
  const savedTabs = state.configs.areaTabs && typeof state.configs.areaTabs === 'object' ? state.configs.areaTabs as Record<string, string> : {}
  const savedTab = String(savedTabs.finance || 'overview')
  const tab: Tab = savedTab === 'fixed' ? 'transactions' : (['overview', 'transactions', 'accounts', 'cards', 'reports', 'categories'] as string[]).includes(savedTab) ? savedTab as Tab : 'overview'
  const finance = state.finance || {}
  const transactions = rows(finance.transactions)
  const accounts = rows(finance.accounts)
  const cards = rows(finance.cards)
  const categories = rows(finance.categories)
  const fixed = rows(finance.fixed)
  const occurrences = rows(finance.fixedOccurrences)
  const [month, setMonth] = useState(today.slice(0, 7))
  const [draft, setDraft] = useState<Row | null>(null)
  const [kind, setKind] = useState<DraftKind>('transaction')
  const [createTool, setCreateTool] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [originFilter, setOriginFilter] = useState('')
  const [order, setOrder] = useState('date_desc')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [categoryDraftName, setCategoryDraftName] = useState('')

  const paidAmount = (item: Row) => {
    const payments = rows(item.pagamentos)
    if (payments.length) return Math.min(clampMoney(item.valor), payments.reduce((sum, payment) => sum + clampMoney(payment.valor), 0))
    return clampMoney(item.valor_pago) || (item.status === 'pago' ? clampMoney(item.valor) : 0)
  }
  const signed = (item: Row, value: number) => item.tipo === 'receita' ? value : -value

  function fixedForMonthAt(monthKey: string) {
    const maxDay = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0).getDate()
    return fixed.filter(rule => rule.ativo !== false && (!rule.mes_inicio || monthKey >= String(rule.mes_inicio).slice(0, 7)) && (!rule.mes_fim || monthKey <= String(rule.mes_fim).slice(0, 7))).flatMap(rule => {
      const occurrence = occurrences.find(item => String(item.fixo_id) === String(rule.id) && String(item.competencia) === monthKey)
      if (occurrence?.ignorado) return []
      const day = Math.min(maxDay, Math.max(1, Number(rule.dia_mes || 1)))
      return [{ ...rule, ...occurrence, id: rule.id, _isFixed: true, occurrenceKey: `${rule.id}|${monthKey}`, data: occurrence?.data_override || `${monthKey}-${String(day).padStart(2, '0')}`, valor: occurrence?.valor_override === '' || occurrence?.valor_override == null ? clampMoney(rule.valor) : clampMoney(occurrence.valor_override), status: occurrence?.status || 'pendente', valor_pago: occurrence?.valor_pago || 0, recorrencia: 'fixo' }]
    })
  }

  const monthFixed = fixedForMonthAt(month)
  const monthTx = transactions.filter(item => dateKey(item.data).slice(0, 7) === month)
  const monthItems = [...monthTx, ...monthFixed]
  const initialBalance = accounts.reduce((sum, account) => sum + Number(account.saldo_inicial || 0), 0)
  const realBalance = initialBalance + transactions.filter(item => !item.ignorar_calculo).reduce((sum, item) => sum + signed(item, paidAmount(item)), 0) + monthFixed.filter(item => !item.ignorar_calculo && item.status === 'pago').reduce((sum, item) => sum + signed(item, clampMoney(item.valor)), 0)
  const projectedBalance = initialBalance + transactions.filter(item => !item.ignorar_calculo).reduce((sum, item) => sum + signed(item, clampMoney(item.valor)), 0) + monthFixed.filter(item => !item.ignorar_calculo).reduce((sum, item) => sum + signed(item, clampMoney(item.valor)), 0)
  const income = monthItems.filter(item => item.tipo === 'receita' && !item.ignorar_calculo).reduce((sum, item) => sum + clampMoney(item.valor), 0)
  const expense = monthItems.filter(item => item.tipo !== 'receita' && !item.ignorar_calculo).reduce((sum, item) => sum + clampMoney(item.valor), 0)
  const result = income - expense

  function cardInvoice(card: Row) {
    return transactions.filter(item => (String(item.conta_id || '') === `card|${card.id}` || String(item.cartao_id || '') === String(card.id)) && dateKey(item.data).slice(0, 7) === month && !item.ignorar_calculo && item.tipo !== 'receita').reduce((sum, item) => sum + clampMoney(item.valor), 0) + monthFixed.filter(item => String(item.conta_id || '') === `card|${card.id}` && !item.ignorar_calculo && item.tipo !== 'receita').reduce((sum, item) => sum + clampMoney(item.valor), 0)
  }
  const invoice = cards.reduce((sum, card) => sum + cardInvoice(card), 0)

  function accountBalance(account: Row) {
    return Number(account.saldo_inicial || 0) + transactions.filter(item => String(item.conta_id || '') === String(account.id) && !item.ignorar_calculo).reduce((sum, item) => sum + signed(item, paidAmount(item)), 0)
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
    if (type === 'account') return { id: uid('cta'), nome: '', saldo_inicial: 0, cor: '#718269', _persisted: false }
    if (type === 'card') return { id: uid('crd'), nome: '', limite: 0, fechamento: 1, vencimento: 10, conta_id: '', cor: '#8a7d72', _persisted: false }
    return { id: uid('cat'), nome: '', _persisted: false }
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
    setDraft({ ...item, _persisted: true })
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
          const fixedRule = { ...clean, id: String(clean.id), titulo: label, valor: clampMoney(clean.valor), dia_mes: Math.min(31, Math.max(1, Number(clean.dia_mes || Number(dateKey(clean.data).slice(8)) || 1))), mes_inicio: String(clean.mes_inicio || dateKey(clean.data).slice(0, 7) || month), mes_fim: String(clean.mes_fim || ''), anexos: rows(clean.anexos), ativo: clean.ativo !== false }
          delete fixedRule.status
          delete fixedRule.valor_pago
          delete fixedRule.pagamentos
          delete fixedRule.parcelas
          delete fixedRule.intervalo_parcelas
          delete fixedRule.dividir_total
          delete fixedRule.cartao_id
          fixedRule.recorrencia = 'fixo'
          nextFinance.transactions = rows(nextFinance.transactions).filter(item => String(item.id) !== String(clean.id))
          const fixedList = rows(nextFinance.fixed)
          nextFinance.fixed = fixedList.some(item => String(item.id) === String(fixedRule.id)) ? fixedList.map(item => String(item.id) === String(fixedRule.id) ? fixedRule : item) : [fixedRule, ...fixedList]
        } else {
          const payments = rows(clean.pagamentos)
          const value = clampMoney(clean.valor)
          let paid = payments.length ? Math.min(value, payments.reduce((sum, payment) => sum + clampMoney(payment.valor), 0)) : clampMoney(clean.valor_pago)
          if (clean.status === 'pago') paid = value
          if (clean.status === 'pendente' && !payments.length) paid = 0
          const status = paid >= value && value > 0 ? 'pago' : paid > 0 ? 'parcial' : clean.status === 'pago' ? 'pago' : 'pendente'
          const accountId = String(clean.conta_id || '')
          const next = { ...clean, titulo: label, valor: value, valor_pago: paid, status, pagamentos: payments, anexos: rows(clean.anexos), cartao_id: accountId.startsWith('card|') ? accountId.slice(5) : '', recorrencia: recurring }
          delete next.dia_mes
          delete next.mes_inicio
          delete next.mes_fim
          delete next.ativo
          const fixedList = rows(nextFinance.fixed)
          if (fixedList.some(item => String(item.id) === String(next.id))) {
            nextFinance.fixed = fixedList.filter(item => String(item.id) !== String(next.id))
            nextFinance.fixedOccurrences = rows(nextFinance.fixedOccurrences).filter(item => String(item.fixo_id) !== String(next.id))
          }
          const list = rows(nextFinance.transactions)
          nextFinance.transactions = list.some(item => String(item.id) === String(next.id)) ? list.map(item => String(item.id) === String(next.id) ? next : item) : [next, ...list]
        }
      } else if (kind === 'account') {
        const next = { ...clean, nome: label, saldo_inicial: Number(clean.saldo_inicial || 0), cor: clean.cor || '#718269' }
        nextFinance.accounts = rows(nextFinance.accounts).some(item => String(item.id) === String(next.id)) ? rows(nextFinance.accounts).map(item => String(item.id) === String(next.id) ? next : item) : [...rows(nextFinance.accounts), next]
      } else if (kind === 'card') {
        const next = { ...clean, nome: label, limite: clampMoney(clean.limite), fechamento: Math.min(31, Math.max(1, Number(clean.fechamento || 1))), vencimento: Math.min(31, Math.max(1, Number(clean.vencimento || 10))), cor: clean.cor || '#8a7d72' }
        nextFinance.cards = rows(nextFinance.cards).some(item => String(item.id) === String(next.id)) ? rows(nextFinance.cards).map(item => String(item.id) === String(next.id) ? next : item) : [...rows(nextFinance.cards), next]
      } else {
        const list = rows(nextFinance.categories)
        const previous = list.find(item => String(item.id) === String(clean.id))
        const next = { ...clean, nome: label }
        if (previous && previous.nome !== label) {
          nextFinance.transactions = rows(nextFinance.transactions).map(item => item.categoria === previous.nome ? { ...item, categoria: label } : item)
          nextFinance.fixed = rows(nextFinance.fixed).map(item => item.categoria === previous.nome ? { ...item, categoria: label } : item)
        }
        nextFinance.categories = list.some(item => String(item.id) === String(next.id)) ? list.map(item => String(item.id) === String(next.id) ? next : item) : [...list, next]
      }
      return { ...current, finance: nextFinance }
    })
    if (snapshot._persisted === false) setDraft(current => current && String(current.id) === String(snapshot.id) ? { ...current, _persisted: true, _isFixed: String(snapshot.recorrencia || '') === 'fixo' } : current)
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
        const key = kind === 'account' ? 'accounts' : kind === 'card' ? 'cards' : 'categories'
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
    if (item._isFixed) {
      updateOccurrence(item, { status: item.status === 'pago' ? 'pendente' : 'pago', valor_pago: item.status === 'pago' ? 0 : clampMoney(item.valor) })
      return
    }
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
    const answer = prompt(`Valor do pagamento (restante ${money.format(remaining)}):`, String(remaining))
    if (answer === null) return
    const amount = clampMoney(answer)
    if (!amount) return
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
    const quantity = Math.max(2, Number(draft.parcelas || 2))
    const lot = String(draft.lote_id || uid('lote'))
    const total = clampMoney(draft.valor)
    const installment = draft.dividir_total === false ? total : total / quantity
    const baseTitle = String(draft.titulo || '').replace(/\s+\(\d+\/\d+\)$/, '').trim()
    const generated = Array.from({ length: quantity }, (_, index) => ({
      ...draft,
      id: index === 0 ? String(draft.id || uid('fin')) : uid('fin'),
      lote_id: lot,
      parcela_numero: index + 1,
      parcelas_total: quantity,
      titulo: `${baseTitle} (${index + 1}/${quantity})`,
      valor: installment,
      data: moveDateForInstallment(dateKey(draft.data) || today, index, String(draft.intervalo_parcelas || 'mensal')),
      status: index === 0 ? String(draft.status || 'pendente') : 'pendente',
      valor_pago: index === 0 ? paidAmount(draft) : 0,
      pagamentos: index === 0 ? rows(draft.pagamentos) : [],
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
    commit(current => ({ ...current, finance: { ...current.finance, fixed: rows(current.finance.fixed).filter(item => String(item.id) !== String(draft.id)), fixedOccurrences: rows(current.finance.fixedOccurrences).filter(item => String(item.fixo_id) !== String(draft.id)), transactions: [...rows(current.finance.transactions).filter(item => String(item.id) !== String(draft.id) && String(item.lote_id || '') !== lot), ...generated] } }))
    setDraft({ ...generated[0], _persisted: true })
  }
  function reconcile(account: Row) {
    const answer = prompt(`Saldo real de “${account.nome}”:`, String(accountBalance(account)))
    if (answer === null || !Number.isFinite(Number(answer))) return
    const diff = Number(answer) - accountBalance(account)
    if (Math.abs(diff) < 0.01) return
    commit(current => ({ ...current, finance: { ...current.finance, transactions: [{ id: uid('fin'), titulo: 'Ajuste de saldo', valor: Math.abs(diff), valor_pago: Math.abs(diff), tipo: diff >= 0 ? 'receita' : 'despesa', categoria: 'Ajuste', conta_id: account.id, data: today, status: 'pago', observacao: 'Conciliação bancária', pagamentos: [{ id: uid('pay'), data: today, valor: Math.abs(diff) }], anexos: [], recorrencia: 'unico' }, ...rows(current.finance.transactions)] } }))
  }

  const filtered = useMemo(() => monthItems.filter(item => {
    const text = query.trim().toLocaleLowerCase('pt-BR')
    if (text && !`${item.titulo || ''} ${item.categoria || ''} ${cleanText(item.observacao)}`.toLocaleLowerCase('pt-BR').includes(text)) return false
    if (statusFilter === 'pago' && item.status !== 'pago') return false
    if (statusFilter === 'pendente' && item.status === 'pago') return false
    if (statusFilter === 'parcial' && item.status !== 'parcial') return false
    if (statusFilter === 'atrasado' && (item.status === 'pago' || dateKey(item.data) >= today)) return false
    if (categoryFilter && item.categoria !== categoryFilter) return false
    if (originFilter && String(item.conta_id || '') !== originFilter) return false
    return true
  }).sort((a, b) => order === 'date_asc' ? String(a.data).localeCompare(String(b.data)) : order === 'value_desc' ? clampMoney(b.valor) - clampMoney(a.valor) : order === 'value_asc' ? clampMoney(a.valor) - clampMoney(b.valor) : order === 'az' ? String(a.titulo).localeCompare(String(b.titulo), 'pt-BR') : String(b.data).localeCompare(String(a.data))), [monthItems, query, statusFilter, categoryFilter, originFilter, order, today])

  const recent = [...monthItems].sort((a, b) => String(b.data || '').localeCompare(String(a.data || ''))).slice(0, 8)
  const catReport = Object.entries(monthItems.reduce((map: Record<string, number>, item) => { if (item.tipo !== 'receita' && !item.ignorar_calculo) map[item.categoria || 'Sem categoria'] = (map[item.categoria || 'Sem categoria'] || 0) + clampMoney(item.valor); return map }, {})).sort((a, b) => b[1] - a[1])
  const accountSummary = draft ? originName(draft.conta_id, accounts, cards) : 'Sem origem'

  const transactionRow = (item: Row) => {
    const incomeItem = item.tipo === 'receita'
    const remaining = Math.max(0, clampMoney(item.valor) - paidAmount(item))
    return <article key={`${item._isFixed ? 'fix' : 'tx'}-${String(item.id)}`} className="mai-finance-v4-row mai-item-row-v2" data-status={String(item.status || 'pendente')}>
      <button type="button" className="mai-finance-v4-status" data-paid={item.status === 'pago'} data-partial={item.status === 'parcial'} title={item.status === 'pago' ? 'Marcar como pendente' : 'Marcar como pago'} onClick={() => togglePaid(item)}>{item.status === 'pago' ? '✓' : item.status === 'parcial' ? '◐' : ''}</button>
      <button type="button" className="mai-finance-v4-row-main" onClick={() => openTransaction(item)}>
        <span className="mai-item-copy-v2"><span className="mai-item-titleline-v2"><strong>{String(item.titulo || 'Lançamento')}</strong></span><span className="mai-item-subline-v2"><span>{naturalDate(dateKey(item.data), today)}</span><span>·</span><span>{item.categoria || 'Sem categoria'}</span>{item.conta_id ? <><span>·</span><span>{originName(item.conta_id, accounts, cards)}</span></> : null}{item._isFixed ? <><span>·</span><span>Fixo</span></> : item.lote_id ? <><span>·</span><span>Parcela {item.parcela_numero}/{item.parcelas_total}</span></> : null}{item.ignorar_calculo ? <><span>·</span><span>fora dos cálculos</span></> : null}</span></span>
        <span className="mai-finance-v4-value" data-income={incomeItem}>{incomeItem ? '+' : '−'} {money.format(clampMoney(item.valor))}{item.status === 'parcial' ? <small>restam {money.format(remaining)}</small> : null}</span>
      </button>
    </article>
  }

  return <div className="mai-v3-area-page mai-v4-finance">
    <header className="mai-v3-area-header"><div><h1>Finanças</h1><p>Seu financeiro completo, sem perder a simplicidade.</p></div></header>

    <div className="mai-finance-v4-topline">
      <div className="mai-finance-v4-month"><button type="button" onClick={() => moveMonth(-1)} aria-label="Mês anterior">‹</button><button type="button" onClick={() => setMonth(today.slice(0, 7))}><strong>{monthLabel(month)}</strong><small>{month === today.slice(0, 7) ? 'mês atual' : 'voltar ao mês atual'}</small></button><button type="button" onClick={() => moveMonth(1)} aria-label="Próximo mês">›</button></div>
      <div className="mai-v3-area-tabs mai-finance-v4-tabs">{([{ id: 'overview', label: 'Visão geral' }, { id: 'transactions', label: 'Lançamentos' }, { id: 'accounts', label: 'Contas' }, { id: 'cards', label: 'Cartões' }, { id: 'reports', label: 'Relatórios' }, { id: 'categories', label: 'Categorias' }] as { id: Tab; label: string }[]).map(item => <button key={item.id} data-active={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
    </div>

    {tab === 'overview' ? <>
      <div className="mai-v3-finance-summary mai-v4-finance-summary">
        <article><span>Saldo Atual</span><strong>{money.format(realBalance)}</strong></article>
        <article><span>Previsto</span><strong>{money.format(projectedBalance)}</strong></article>
        <article><span>Receitas</span><strong data-positive={income >= 0}>{money.format(income)}</strong></article>
        <article><span>Despesas</span><strong data-negative={expense > 0}>{money.format(expense)}</strong></article>
        <article><span>Cartões</span><strong>{money.format(invoice)}</strong></article>
        <article><span>Balanço Mensal</span><strong data-positive={result >= 0} data-negative={result < 0}>{money.format(result)}</strong></article>
      </div>
      <section className="mai-v3-simple-section"><div className="mai-finance-v4-section-head"><div><h2>Últimos lançamentos</h2><small>{monthLabel(month)} · únicos, parcelados e fixos no mesmo lugar</small></div><button type="button" onClick={() => openNew('transaction')}><span className="material-symbols-rounded">add</span>Adicionar lançamento</button></div><div className="mai-v3-finance-rows mai-v3-simple-list">{recent.map(transactionRow)}{!recent.length ? <div className="mai-v3-empty-line">Nenhum lançamento.</div> : null}</div></section>
    </> : null}

    {tab === 'transactions' ? <section className="mai-v3-simple-section">
      <div className="mai-finance-v4-section-head"><div><h2>Lançamentos</h2><small>{filtered.length} no período · únicos, parcelados e fixos</small></div><button type="button" onClick={() => openNew('transaction')}><span className="material-symbols-rounded">add</span>Adicionar lançamento</button></div>
      <div className="mai-finance-v4-filters"><label><span className="material-symbols-rounded">search</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar" /></label><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">Todos os status</option><option value="pago">Pago</option><option value="parcial">Parcial</option><option value="pendente">Pendente</option><option value="atrasado">Atrasado</option></select><select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value="">Todas as categorias</option>{categories.map(item => <option key={String(item.id)} value={item.nome}>{item.nome}</option>)}</select><select value={originFilter} onChange={event => setOriginFilter(event.target.value)}><option value="">Todas as origens</option>{accounts.map(item => <option key={String(item.id)} value={item.id}>{item.nome}</option>)}{cards.map(item => <option key={String(item.id)} value={`card|${item.id}`}>{item.nome}</option>)}</select><select value={order} onChange={event => setOrder(event.target.value)}><option value="date_desc">Data ↓</option><option value="date_asc">Data ↑</option><option value="value_desc">Valor ↓</option><option value="value_asc">Valor ↑</option><option value="az">A–Z</option></select></div>
      <div className="mai-v3-finance-rows mai-v3-simple-list">{filtered.map(transactionRow)}{!filtered.length ? <div className="mai-v3-empty-line">Nenhum lançamento encontrado.</div> : null}</div>
    </section> : null}

    {tab === 'accounts' ? <section className="mai-v3-simple-section"><div className="mai-finance-v4-section-head"><div><h2>Contas</h2><small>Saldos reais e conciliação.</small></div><button type="button" onClick={() => openNew('account')}><span className="material-symbols-rounded">add</span>Adicionar conta</button></div><div className="mai-v3-account-list mai-finance-v4-entity-list">{accounts.map(account => <article key={String(account.id)}><i style={{ background: account.cor || 'var(--v3-accent)' }} /><button type="button" onClick={() => openExisting('account', account)}><strong>{account.nome}</strong><small>Saldo inicial {money.format(Number(account.saldo_inicial || 0))}</small></button><b>{money.format(accountBalance(account))}</b><button type="button" className="mai-finance-v4-text-action" onClick={() => reconcile(account)}>Conciliar</button></article>)}{!accounts.length ? <div className="mai-v3-empty-line">Nenhuma conta cadastrada.</div> : null}</div></section> : null}

    {tab === 'cards' ? <section className="mai-v3-simple-section"><div className="mai-finance-v4-section-head"><div><h2>Cartões</h2><small>Fatura, limite disponível e vencimento.</small></div><button type="button" onClick={() => openNew('card')}><span className="material-symbols-rounded">add</span>Adicionar cartão</button></div><div className="mai-v3-card-list mai-finance-v4-card-list">{cards.map(card => { const cardMonthInvoice = cardInvoice(card); const available = Math.max(0, clampMoney(card.limite) - cardMonthInvoice); return <article key={String(card.id)}><i style={{ background: card.cor || '#8a7d72' }} /><button type="button" onClick={() => openExisting('card', card)}><strong>{card.nome}</strong><small>Fecha dia {card.fechamento || '—'} · vence dia {card.vencimento || '—'}</small></button><span><b>{money.format(cardMonthInvoice)}</b><small>fatura · {money.format(available)} disponível</small></span></article> })}{!cards.length ? <div className="mai-v3-empty-line">Nenhum cartão cadastrado.</div> : null}</div></section> : null}

    {tab === 'reports' ? <section className="mai-v3-simple-section"><div className="mai-finance-v4-section-head"><div><h2>Relatórios</h2><small>{monthLabel(month)}</small></div></div><div className="mai-finance-v4-reports"><article><header><strong>Despesas por categoria</strong><small>{money.format(expense)}</small></header>{catReport.map(([name, value]) => <div className="mai-finance-v4-report-row" key={name}><span>{name}</span><i><b style={{ width: `${expense ? value / expense * 100 : 0}%` }} /></i><strong>{money.format(value)}</strong></div>)}{!catReport.length ? <div className="mai-v3-empty-line">Sem despesas no período.</div> : null}</article><article><header><strong>Contas</strong><small>Saldo atual</small></header>{accounts.map(account => <div className="mai-finance-v4-report-simple" key={String(account.id)}><span>{account.nome}</span><strong>{money.format(accountBalance(account))}</strong></div>)}<header className="mai-finance-v4-report-subhead"><strong>Cartões</strong><small>Fatura do mês</small></header>{cards.map(card => <div className="mai-finance-v4-report-simple" key={String(card.id)}><span>{card.nome}</span><strong>{money.format(cardInvoice(card))}</strong></div>)}</article></div></section> : null}

    {tab === 'categories' ? <section className="mai-v3-simple-section"><div className="mai-finance-v4-section-head"><div><h2>Categorias</h2><small>As mesmas categorias disponíveis direto no lançamento.</small></div><button type="button" onClick={() => openNew('category')}><span className="material-symbols-rounded">add</span>Adicionar categoria</button></div><div className="mai-finance-v4-category-list">{categories.map(category => { const count = transactions.filter(item => item.categoria === category.nome).length + fixed.filter(item => item.categoria === category.nome).length; const spent = monthItems.filter(item => item.tipo !== 'receita' && item.categoria === category.nome && !item.ignorar_calculo).reduce((sum, item) => sum + clampMoney(item.valor), 0); return <button type="button" key={String(category.id)} onClick={() => openExisting('category', category)}><span><strong>{category.nome}</strong><small>{count} {count === 1 ? 'lançamento' : 'lançamentos'}</small></span><b>{money.format(spent)}</b></button> })}{!categories.length ? <div className="mai-v3-empty-line">Nenhuma categoria cadastrada.</div> : null}</div></section> : null}

    {draft ? <div className="mai-v3-create-layer" onMouseDown={() => setDraft(null)}><form className={`mai-v3-create-drawer mai-finance-v4-drawer mai-finance-v4-drawer-${kind}`} onSubmit={event => event.preventDefault()} onMouseDown={event => event.stopPropagation()}><header className="mai-v3-drawer-header"><div><small>{draft._persisted ? 'Salvamento automático' : 'Novo'}</small><strong>{kind === 'transaction' ? draft._persisted ? 'Editar lançamento' : 'Novo lançamento' : kind === 'account' ? draft._persisted ? 'Editar conta' : 'Nova conta' : kind === 'card' ? draft._persisted ? 'Editar cartão' : 'Novo cartão' : draft._persisted ? 'Editar categoria' : 'Nova categoria'}</strong></div><button type="button" className="mai-v3-close" onClick={() => setDraft(null)}>×</button></header><div className="mai-v3-drawer-body mai-create-unified-body" onMouseDown={() => createTool && setCreateTool('')}>
      {kind === 'transaction' ? <>
        <input className="mai-v3-title-input" autoFocus value={draft.titulo || ''} placeholder="Nome do lançamento" onMouseDown={event => event.stopPropagation()} onChange={event => setDraft({ ...draft, titulo: event.target.value })} />
        <textarea className="mai-v3-description-input mai-create-unified-description" rows={2} value={draft.observacao || ''} placeholder="Descrição" onMouseDown={event => event.stopPropagation()} onChange={event => setDraft({ ...draft, observacao: event.target.value })} />
        <div className="mai-task-v4-toolbar mai-context-unified-tools mai-create-unified-tools" onMouseDown={event => event.stopPropagation()}>
          <CreateTool id="finance-date" icon="calendar_today" label="Data" summary={createNaturalDate(dateKey(draft.data), today)} color="#4f7cac" open={createTool} setOpen={setCreateTool}><CreateCalendarPicker value={dateKey(draft.data)} today={today} onChange={value => setDraft({ ...draft, data: value, dia_mes: Number(value.slice(8)), mes_inicio: draft.mes_inicio || value.slice(0, 7) })} close={() => setCreateTool('')} /></CreateTool>
          <CreateTool id="finance-value" icon="payments" label="Valor" summary={money.format(clampMoney(draft.valor))} color="#4b8b6c" open={createTool} setOpen={setCreateTool}><CreateNumberEditor value={clampMoney(draft.valor)} onChange={value => setDraft({ ...draft, valor: value })} /></CreateTool>
          <CreateTool id="finance-type" icon={draft.tipo === 'receita' ? 'arrow_downward' : 'arrow_upward'} label="Tipo" summary={draft.tipo === 'receita' ? 'Receita' : 'Despesa'} color={draft.tipo === 'receita' ? '#4b8b6c' : '#c85b52'} open={createTool} setOpen={setCreateTool}><CreateOptionList value={String(draft.tipo || 'despesa')} onChange={value => setDraft({ ...draft, tipo: value })} close={() => setCreateTool('')} options={[{ value: 'despesa', label: 'Despesa', icon: 'arrow_upward' }, { value: 'receita', label: 'Receita', icon: 'arrow_downward' }]} /></CreateTool>
          <CreateTool id="finance-status" icon="task_alt" label="Status" summary={statusLabel(draft.status)} color="#5779a6" open={createTool} setOpen={setCreateTool}><CreateOptionList value={String(draft.status || 'pendente')} onChange={value => setDraft({ ...draft, status: value, valor_pago: value === 'pago' ? clampMoney(draft.valor) : value === 'pendente' ? 0 : draft.valor_pago })} close={() => setCreateTool('')} options={[{ value: 'pendente', label: 'Pendente', icon: 'schedule' }, { value: 'parcial', label: 'Parcial', icon: 'pending' }, { value: 'pago', label: 'Pago', icon: 'check_circle' }]} /></CreateTool>
          <CreateTool id="finance-category" icon="sell" label="Categoria" summary={String(draft.categoria || 'Não selecionado')} color="#b27a35" open={createTool} setOpen={setCreateTool}><div className="mai-finance-v4-category-picker"><CreateOptionList value={String(draft.categoria || '')} onChange={value => setDraft({ ...draft, categoria: value })} close={() => setCreateTool('')} options={[{ value: '', label: 'Sem categoria', icon: 'remove_circle' }, ...categories.map(category => ({ value: String(category.nome), label: String(category.nome), icon: 'sell' }))]} /><div className="mai-finance-v4-category-create"><input value={categoryDraftName} onChange={event => setCategoryDraftName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addCategoryFromLaunch() } }} placeholder="Nova categoria" /><button type="button" onClick={addCategoryFromLaunch}>Adicionar</button></div></div></CreateTool>
          <CreateTool id="finance-account" icon="account_balance_wallet" label="Conta" summary={accountSummary} color="#75808b" open={createTool} setOpen={setCreateTool}><CreateOptionList value={String(draft.conta_id || '')} onChange={value => setDraft({ ...draft, conta_id: value })} close={() => setCreateTool('')} options={[{ value: '', label: 'Sem origem', icon: 'remove_circle' }, ...accounts.map(account => ({ value: String(account.id), label: String(account.nome || 'Conta'), icon: 'account_balance' })), ...cards.map(card => ({ value: `card|${String(card.id)}`, label: String(card.nome || 'Cartão'), icon: 'credit_card' }))]} /></CreateTool>
        </div>
        <button type="button" className="mai-finance-v4-details-toggle" data-open={detailsOpen} onClick={() => setDetailsOpen(value => !value)}><span>Parcelamento, fixo e mais detalhes</span><span className="material-symbols-rounded">expand_more</span></button>
        {detailsOpen ? <div className="mai-finance-v4-details">
          {!draft.lote_id ? <label><span>Forma do lançamento</span><select value={draft.recorrencia || 'unico'} onChange={event => setDraft({ ...draft, recorrencia: event.target.value, _isFixed: event.target.value === 'fixo' })}><option value="unico">Único</option><option value="parcelado">Parcelado</option><option value="fixo">Fixo mensal</option></select></label> : <label><span>Parcela</span><input disabled value={`${draft.parcela_numero || 1}/${draft.parcelas_total || 1}`} /></label>}
          {draft.recorrencia === 'parcelado' && !draft.lote_id ? <><label><span>Parcelas</span><input type="number" min="2" value={draft.parcelas || 2} onChange={event => setDraft({ ...draft, parcelas: Number(event.target.value) })} /></label><label><span>Intervalo</span><select value={draft.intervalo_parcelas || 'mensal'} onChange={event => setDraft({ ...draft, intervalo_parcelas: event.target.value })}><option value="semanal">Semanal</option><option value="quinzenal">Quinzenal</option><option value="mensal">Mensal</option><option value="anual">Anual</option></select></label><label className="mai-finance-v4-toggle"><input type="checkbox" checked={draft.dividir_total !== false} onChange={event => setDraft({ ...draft, dividir_total: event.target.checked })} /><span>Dividir o valor total entre as parcelas</span></label><button type="button" className="mai-finance-v4-action-card" onClick={generateInstallments}><span className="material-symbols-rounded">splitscreen</span><span><strong>Gerar parcelas</strong><small>Cria todas as parcelas a partir deste lançamento.</small></span></button></> : null}
          {draft.recorrencia === 'fixo' ? <><label><span>Dia do mês</span><input type="number" min="1" max="31" value={draft.dia_mes || Number(today.slice(8))} onChange={event => setDraft({ ...draft, dia_mes: Number(event.target.value) })} /></label><label><span>Início</span><input type="month" value={String(draft.mes_inicio || month).slice(0, 7)} onChange={event => setDraft({ ...draft, mes_inicio: event.target.value })} /></label><label><span>Fim opcional</span><input type="month" value={String(draft.mes_fim || '').slice(0, 7)} onChange={event => setDraft({ ...draft, mes_fim: event.target.value })} /></label><label className="mai-finance-v4-toggle"><input type="checkbox" checked={draft.ativo !== false} onChange={event => setDraft({ ...draft, ativo: event.target.checked })} /><span>Lançamento fixo ativo</span></label>{draft._persisted ? <><button type="button" className="mai-finance-v4-action-card" onClick={() => editFixedOccurrence(draft)}><span className="material-symbols-rounded">edit_calendar</span><span><strong>Alterar somente {monthLabel(month)}</strong><small>Muda valor ou data apenas desta ocorrência.</small></span></button><button type="button" className="mai-finance-v4-action-card" onClick={() => ignoreFixed(draft)}><span className="material-symbols-rounded">event_busy</span><span><strong>Ignorar neste mês</strong><small>Pula esta ocorrência sem apagar a regra fixa.</small></span></button></> : null}</> : null}
          <label className="mai-finance-v4-toggle"><input type="checkbox" checked={draft.ignorar_calculo === true} onChange={event => setDraft({ ...draft, ignorar_calculo: event.target.checked })} /><span>Ignorar nos cálculos de saldo e relatórios</span></label>
          {draft.recorrencia !== 'fixo' ? <div className="mai-finance-v4-payments"><header><div><strong>Pagamentos</strong><small>{money.format(paidAmount(draft))} de {money.format(clampMoney(draft.valor))}</small></div><button type="button" onClick={addPayment}>+ Pagamento</button></header>{rows(draft.pagamentos).map((payment, index) => <article key={String(payment.id || index)}><span>{naturalDate(dateKey(payment.data), today)}</span><strong>{money.format(clampMoney(payment.valor))}</strong><button type="button" onClick={() => removePayment(index)}>×</button></article>)}{!rows(draft.pagamentos).length ? <small className="mai-finance-v4-muted">Nenhum pagamento parcial registrado.</small> : null}</div> : null}
        </div> : null}
        <ItemAttachments attachments={rows(draft.anexos)} onChange={anexos => setDraft({ ...draft, anexos })} />
      </> : kind === 'account' ? <div className="mai-finance-v4-form-grid"><label className="wide"><span>Nome</span><input autoFocus value={draft.nome || ''} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></label><label><span>Saldo inicial</span><input type="number" step="0.01" value={draft.saldo_inicial || 0} onChange={event => setDraft({ ...draft, saldo_inicial: Number(event.target.value) })} /></label><label><span>Cor</span><input type="color" value={draft.cor || '#718269'} onChange={event => setDraft({ ...draft, cor: event.target.value })} /></label>{draft._persisted ? <div className="mai-finance-v4-account-preview wide"><span>Saldo atual</span><strong>{money.format(accountBalance(draft))}</strong><button type="button" onClick={() => reconcile(draft)}>Conciliar saldo</button></div> : null}</div> : kind === 'card' ? <div className="mai-finance-v4-form-grid"><label className="wide"><span>Nome</span><input autoFocus value={draft.nome || ''} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></label><label><span>Limite</span><input type="number" step="0.01" value={draft.limite || 0} onChange={event => setDraft({ ...draft, limite: Number(event.target.value) })} /></label><label><span>Conta de pagamento</span><select value={draft.conta_id || ''} onChange={event => setDraft({ ...draft, conta_id: event.target.value })}><option value="">Nenhuma</option>{accounts.map(account => <option key={String(account.id)} value={account.id}>{account.nome}</option>)}</select></label><label><span>Fecha dia</span><input type="number" min="1" max="31" value={draft.fechamento || 1} onChange={event => setDraft({ ...draft, fechamento: Number(event.target.value) })} /></label><label><span>Vence dia</span><input type="number" min="1" max="31" value={draft.vencimento || 10} onChange={event => setDraft({ ...draft, vencimento: Number(event.target.value) })} /></label><label><span>Cor</span><input type="color" value={draft.cor || '#8a7d72'} onChange={event => setDraft({ ...draft, cor: event.target.value })} /></label>{draft._persisted ? <div className="mai-finance-v4-account-preview wide"><span>Fatura de {monthLabel(month)}</span><strong>{money.format(cardInvoice(draft))}</strong><small>{money.format(Math.max(0, clampMoney(draft.limite) - cardInvoice(draft)))} disponível</small></div> : null}</div> : <div className="mai-finance-v4-form-grid"><label className="wide"><span>Nome</span><input autoFocus value={draft.nome || ''} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></label></div>}
    </div><footer className="mai-v3-drawer-footer"><div>{draft._persisted ? <button type="button" className="mai-finance-v4-delete" onClick={removeDraft}><span className="material-symbols-rounded">delete</span>Excluir</button> : null}</div><span className="mai-autosave-status">Alterações salvas automaticamente</span></footer></form></div> : null}
  </div>
}
