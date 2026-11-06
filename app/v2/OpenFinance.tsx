'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { MaiState } from '../../lib/v2/state-model'
import { authedFetch } from '../../lib/v2/sync'
import { isNativeApp, nativePlugin } from '../../lib/native/native'
import of from './OpenFinance.module.css'

type Row = Record<string, any>
type Commit = (change: (current: MaiState) => MaiState) => void

/** Vínculo automático de lançamentos, configurado em cada banco. */
export type MatchConfig = { ligado: boolean; depois: number; antes: number; palavra: boolean }
export const MATCH_DEFAULTS: MatchConfig = { ligado: true, depois: 45, antes: 10, palavra: true }
export const matchConfig = (link?: { vinc?: Partial<MatchConfig> }): MatchConfig => {
  const raw = link?.vinc || {}
  const days = (value: unknown, fallback: number) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.min(365, Math.round(Number(value))) : fallback
  return { ligado: raw.ligado !== false, depois: days(raw.depois, MATCH_DEFAULTS.depois), antes: days(raw.antes, MATCH_DEFAULTS.antes), palavra: raw.palavra !== false }
}
type Link = { itemId: string; banco: string; ultimaSync?: string; url?: string; vinc?: Partial<MatchConfig> }
type Pending = { id: string; accountId: string; itemId: string; data: string; titulo: string; valor: number; tipo: 'receita' | 'despesa'; pendente: boolean; categoria: string; parcela: string; billId?: string }
export type BankAccount = { id: string; itemId: string; nome: string; tipo: 'conta' | 'cartao'; saldo: number; limite: number; limite_disponivel: number; vencimento_dia?: number; fechamento_dia?: number }
export type OpenFinanceData = { itens: Link[]; contas: BankAccount[]; vinculos: Record<string, string>; pendentes: Pending[]; vistos: string[]; dispensadas: string[] }

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const num = (value: unknown) => Number(value) || 0
const cents = (value: number) => Math.round(value * 100) / 100
const FATURA = /pagamento (de |da |do )?fatura|pagamento fatura|fatura (do )?cart/i // pagamento de fatura já aparece como compras no cartão
const shortName = (nome: string) => nome.replace(/^MeuPluggy\s*·\s*/i, '').split(' - ')[0].replace(/\s+S\.?\s?A\.?$/i, '').trim() || 'Banco'
const AUTO_MINUTES = 15
/** A Pluggy não deixa atualizar o MeuPluggy por API: o botão Sincronizar abre a página da conexão (link guardado em cada conexão) para você clicar em atualizar. */
const MEU_PLUGGY_DEFAULTS: Record<string, string> = { '4a0f43fc-2110-456e-8a2f-5020bb32984e': 'https://meu.pluggy.ai/connections/f435a5e6-6469-4a1f-8f24-cb1d9cb1c644' }
const meuPluggyUrl = (item: Link) => item.url || MEU_PLUGGY_DEFAULTS[item.itemId] || ''
const validMeuPluggyUrl = (value: string) => /^https:\/\/meu\.pluggy\.ai\/\S+$/.test(value)

export function readOpenFinance(state: MaiState): OpenFinanceData {
  const raw = (state.finance?.openFinance && typeof state.finance.openFinance === 'object' ? state.finance.openFinance : {}) as Partial<OpenFinanceData>
  return {
    itens: Array.isArray(raw.itens) ? raw.itens : [],
    contas: Array.isArray(raw.contas) ? raw.contas.map(c => ({ ...c, limite: num((c as any).limite) })) : [],
    vinculos: raw.vinculos && typeof raw.vinculos === 'object' ? raw.vinculos : {},
    pendentes: Array.isArray(raw.pendentes) ? raw.pendentes : [],
    vistos: Array.isArray(raw.vistos) ? raw.vistos : [],
    dispensadas: Array.isArray(raw.dispensadas) ? raw.dispensadas : [],
  }
}

function patchOpenFinance(commit: Commit, change: (data: OpenFinanceData, finance: Row) => { data?: OpenFinanceData; finance?: Row }) {
  commit(current => {
    const finance = (current.finance || {}) as Row
    const result = change(readOpenFinance(current), finance)
    return { ...current, finance: { ...finance, ...(result.finance || {}), openFinance: result.data || readOpenFinance(current) } }
  })
}

/** Nome sugerido para o item do app: conta = banco; cartão = banco + nome do cartão. */
export function suggestedName(b: BankAccount, all: BankAccount[]) {
  if (b.tipo !== 'cartao') return bankLabel(b.nome)
  const base = shortName(b.nome)
  return /cart[aã]o/i.test(base) ? base : `${bankLabel(all.find(x => x.itemId === b.itemId && x.tipo === 'conta')?.nome || b.nome)} ${base}`
}

export const bankLabel = (nome: string) => /nu pagamentos|nubank/i.test(nome) ? 'Nubank' : shortName(nome)

/**
 * Cada conta/cartão do banco vira um item PRÓPRIO do app (marcado com pluggy_id); nunca mistura com os seus manuais.
 * Vínculos antigos para itens manuais são desfeitos: o saldo inicial que o sync mexeu volta a 0 e o que foi importado migra para o item do banco.
 */
function resolveLinks(links: Record<string, string>, bank: BankAccount[], finance: Row, dismissed: string[] = []) {
  const unsuffix = (item: Row) => item.pluggy_id && /\s\(Open Finance\)$/.test(String(item.nome)) ? { ...item, nome: String(item.nome).replace(/\s\(Open Finance\)$/, '') } : item
  const accounts: Row[] = ((finance.accounts || []) as Row[]).map(unsuffix)
  const cards: Row[] = ((finance.cards || []) as Row[]).map(unsuffix)
  const next = { ...links }
  const moved: Record<string, string> = {}
  const skip = new Set(dismissed)
  const stale: Record<string, string> = {}
  const find = (target: string) => target.startsWith('card|') ? cards.find(c => `card|${c.id}` === target) : accounts.find(a => String(a.id) === target)
  for (const b of bank) {
    const target = next[b.id]
    if (!target) continue
    const item = find(target)
    if (item && item.pluggy_id) continue
    if (item) stale[target] = b.id
    else skip.add(b.id) // você excluiu o item do app: não recria sozinho (volta pelo "Criar conta" > Open Finance)
    delete next[b.id]
  }
  for (const b of bank) {
    if (next[b.id] || skip.has(b.id)) continue
    const id = uid(b.tipo === 'cartao' ? 'crd' : 'cta')
    if (b.tipo === 'cartao') {
      const nome = suggestedName(b, bank)
      cards.push({ id, pluggy_id: b.id, nome, limite: b.limite, fechamento: 1, vencimento: 10, conta_id: '', cor: '#4073FF', foto: '' })
      next[b.id] = `card|${id}`
    } else {
      accounts.push({ id, pluggy_id: b.id, nome: suggestedName(b, bank), saldo_inicial: 0, cor: '#4073FF', foto: '' })
      next[b.id] = id
    }
    if (stale[Object.keys(stale).find(t => stale[t] === b.id) || '']) moved[Object.keys(stale).find(t => stale[t] === b.id) as string] = next[b.id]
  }
  const restored = accounts.map(a => stale[String(a.id)] ? { ...a, saldo_inicial: 0 } : a)
  return { links: next, accounts: restored, cards, moved, dismissed: [...skip].filter(id => !next[id]) }
}

/** Lança direto na conta/cartão do banco, já pago. Nunca mexe nos seus lançamentos manuais. */
/** Compra no cartão (do banco) é sempre concluída; só a fatura do cartão fica em aberto. Corrige também o que já tinha entrado como aberto. */
function settleCardPurchase(tx: Row): Row {
  if (!tx.pluggy_id || !tx.cartao_id || tx.ajuste_fatura === true || tx.status === 'pago') return tx
  const total = num(tx.valor)
  return { ...tx, status: 'pago', valor_pago: total, pagamentos: [{ id: uid('pay'), data: String(tx.data).slice(0, 10), valor: total }] }
}

function importPending(list: Pending[], links: Record<string, string>, rows: Row[]) {
  const out = [...rows]
  const remaining: Pending[] = []
  const skipped: string[] = []
  for (const p of list) {
    const target = links[p.accountId]
    if (!target) { remaining.push(p); continue }
    const isCard = target.startsWith('card|')
    if (isCard && p.tipo === 'receita') { skipped.push(p.id); continue } // pagamento de fatura/estorno no cartão
    const settled = p.pendente && !isCard ? { status: 'pendente', valor_pago: 0, pagamentos: [] as Row[] } : null // compra no cartão entra sempre concluída: quem fica em aberto é a fatura
    out.push({
      id: uid('fin'), pluggy_id: p.id, titulo: (p.parcela ? `${p.titulo} (${p.parcela})` : p.titulo).replace(/\s*\|\s*/g, ' · '), observacao: 'Open Finance', valor: p.valor, tipo: p.tipo, data: p.data,
      categoria: p.categoria || '', conta_id: target, cartao_id: isCard ? target.slice(5) : '', fatura_bill_id: p.billId || '', anexos: [], recorrencia: 'unico',
      ignorar_calculo: !isCard && FATURA.test(p.titulo),
      ...(settled || { status: 'pago', valor_pago: p.valor, pagamentos: [{ id: uid('pay'), data: p.data, valor: p.valor }] }),
    })
  }
  return { rows: out, remaining, skipped }
}

// Palavras que não identificam a origem de um lançamento (tipo de operação, sufixo de empresa, conectivos).
const GENERIC_WORDS = new Set(['estorno', 'devolucao', 'reembolso', 'pagamento', 'transferencia', 'transf', 'recebida', 'recebido', 'enviada', 'enviado', 'pix', 'ted', 'doc', 'compra', 'credito', 'debito', 'cartao', 'fatura', 'ltda', 'eireli', 'brasil', 'para', 'com', 'dos', 'das', 'por', 'sobre', 'online', 'loja', 'conta'])
const keywords = (text: unknown) => new Set(String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length >= 4 && !GENERIC_WORDS.has(word)))
const dayMs = (value: unknown) => Date.parse(`${String(value).slice(0, 10)}T12:00:00Z`)

/**
 * Vínculo automático: um lançamento seu (ex.: "devolução amazon", 85,67) e um do banco (ex.: "estorno amazon ltda", 85,67)
 * com o MESMO valor, mesma conta/tipo, datas próximas e uma palavra-chave em comum viram um só.
 * Só vincula quando o par é único dos dois lados (sem dúvida) e nunca refaz o que você desvinculou.
 */
export function autoLinkRows(rows: Row[], configFor: (bank: Row) => MatchConfig = () => MATCH_DEFAULTS): { rows: Row[]; linked: number } {
  const manual = rows.filter(tx => !tx.pluggy_id && !tx.ajuste_fatura && !tx._isFixed && !tx.of_nolink && num(tx.valor) > 0)
  const bank = rows.filter(tx => tx.pluggy_id && tx.observacao === 'Open Finance' && !tx.of_linked && !tx.ajuste_fatura && num(tx.valor) > 0)
  const manualWords = new Map(manual.map(tx => [String(tx.id), keywords(tx.titulo)]))
  const matches = new Map<string, string[]>() // banco -> seus lançamentos candidatos
  const taken = new Map<string, number>() // seu lançamento -> quantos bancos casam
  for (const b of bank) {
    const cfg = configFor(b)
    if (!cfg.ligado) continue
    const words = keywords(b.titulo)
    if (cfg.palavra && !words.size) continue
    const found = manual.filter(m => {
      if (m.tipo !== b.tipo || String(m.conta_id || '') !== String(b.conta_id || '')) return false
      if (Math.round(num(m.valor) * 100) !== Math.round(num(b.valor) * 100)) return false
      const gap = (dayMs(b.data) - dayMs(m.data)) / 86400000
      if (!(gap >= -cfg.antes && gap <= cfg.depois)) return false // gap > 0: o seu lançamento veio antes do dinheiro cair
      return !cfg.palavra || [...(manualWords.get(String(m.id)) || [])].some(word => words.has(word))
    }).map(m => String(m.id))
    if (found.length) { matches.set(String(b.id), found); for (const id of found) taken.set(id, (taken.get(id) || 0) + 1) }
  }
  let out = rows
  let linked = 0
  for (const [bankId, found] of matches) {
    if (found.length !== 1 || taken.get(found[0]) !== 1) continue
    const bankRow = out.find(tx => String(tx.id) === bankId)
    const merged = linkTransactions({ transactions: out }, found[0], bankId)
    out = merged.map(tx => String(tx.id) !== found[0] || !bankRow || tx.status === 'pago' || bankRow.status !== 'pago' ? tx : { ...tx, status: 'pago', valor_pago: bankRow.valor_pago, pagamentos: bankRow.pagamentos }) // recebido/pago no banco: o seu lançamento também fica quitado
    linked += 1
  }
  return { rows: out, linked }
}

const CATEGORY_COLORS = ['var(--ds-rose-fg)', 'var(--ds-peach-fg)', 'var(--ds-sky-fg)', 'var(--ds-lilac-fg)', 'var(--ds-mint-fg)', 'var(--ds-teal-fg)', 'var(--ds-accent)']
/** As categorias automáticas do banco passam a existir no app (com cor), para valerem nos relatórios e filtros. */
function withBankCategories(categories: Row[], rows: Row[]) {
  const have = new Set(categories.map(item => String(item.nome || '').trim().toLocaleLowerCase('pt-BR')))
  const names = [...new Set(rows.filter(tx => tx.pluggy_id && !tx.ajuste_fatura && tx.categoria).map(tx => String(tx.categoria).trim()))].filter(name => name && !have.has(name.toLocaleLowerCase('pt-BR')))
  return names.length ? [...categories, ...names.map((nome, index) => ({ id: uid('cat'), nome, cor: CATEGORY_COLORS[(categories.length + index) % CATEGORY_COLORS.length] }))] : categories
}

/** Investimentos do banco viram investimentos normais do app (atualiza valor e aportado a cada sincronização). */
function upsertInvestments(current: Row[], items: { banco: string; investments?: any[] }[]) {
  // do banco, só o que tem saldo ou aporte: posições zeradas saem (e voltam sozinhas se ganharem saldo)
  const next = current.filter(row => !row.pluggy_id || num(row.valor_atual) > 0.005 || num(row.aportado) > 0.005 || (Array.isArray(row.movimentos) && row.movimentos.length > 0))
  for (const item of items) for (const inv of item.investments || []) {
    if (num(inv.valor_atual) <= 0.005 && num(inv.aportado) <= 0.005 && !next.some(row => row.pluggy_id === inv.id)) continue
    const index = next.findIndex(row => row.pluggy_id === inv.id)
    if (index >= 0) next[index] = { ...next[index], aportado: cents(num(inv.aportado)), valor_atual: cents(num(inv.valor_atual)) }
    else next.push({ id: uid('inv'), pluggy_id: inv.id, nome: inv.nome, tipo: inv.tipo, instituicao: shortName(item.banco), icone: 'trending_up', cor: '#4073FF', foto: '', aportado: cents(num(inv.aportado)), valor_atual: cents(num(inv.valor_atual)), observacao: 'Open Finance', movimentos: [] })
  }
  return next
}

const monthOf = (date: string) => date.slice(0, 7)
const nextMonth = (month: string) => { const [y, m] = month.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}` }
const dueOf = (month: string, day: number) => { const [y, m] = month.split('-').map(Number); return `${month}-${String(Math.min(day, new Date(y, m, 0).getDate())).padStart(2, '0')}` }

/** Mês (do vencimento) da fatura de uma data. O ciclo vai do fechamento anterior (inclusive) ao fechamento (exclusive), como no extrato do banco. */
function invoiceMonthOf(date: string, closingDay: number, dueDay: number) {
  const closingMonth = Number(date.slice(8, 10)) >= closingDay ? nextMonth(monthOf(date)) : monthOf(date)
  return dueDay > closingDay ? closingMonth : nextMonth(closingMonth)
}

type BillInfo = { id: string; accountId: string; dueDate: string; total: number }

/**
 * Cartões do banco: valor das faturas fechadas vem direto da Pluggy (sem recalcular); cada compra entra na fatura que o banco indica
 * (ou, sem essa informação, no ciclo do fechamento). A fatura aberta não existe na Pluggy: vale compras do ciclo menos pagamentos já feitos nele.
 */
function applyCardBills(rows: Row[], cards: Row[], links: Record<string, string>, bank: BankAccount[], items: { bills?: BillInfo[]; transactions: any[] }[]) {
  let nextRows = rows
  const cardIds = new Set(cards.map(card => String(card.id)))
  const nextCards = cards.map(card => {
    const bankCard = bank.find(b => b.tipo === 'cartao' && links[b.id] === `card|${card.id}`)
    if (!bankCard) return card
    const cardId = String(card.id)
    const sameBankAccount = bank.find(b => b.itemId === bankCard.itemId && b.tipo === 'conta' && links[b.id] && !links[b.id].startsWith('card|'))
    const payAccount = String(card.conta_id || '') || (sameBankAccount ? links[sameBankAccount.id] : '')
    const closingDay = Number(card.fechamento) || Number(bankCard.fechamento_dia) || 1
    const dueDay = Number(card.vencimento) || Number(bankCard.vencimento_dia) || 10
    const bills = items.flatMap(item => item.bills || []).filter(bill => bill.accountId === bankCard.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    const billMonth = new Map(bills.map(bill => [bill.id, monthOf(bill.dueDate)]))
    const monthFor = (tx: Row) => billMonth.get(String(tx.fatura_bill_id || tx.billId || '')) || invoiceMonthOf(String(tx.data).slice(0, 10), closingDay, dueDay)
    nextRows = nextRows.map(tx => tx.pluggy_id && !tx.ajuste_fatura && String(tx.cartao_id) === cardId ? { ...tx, competencia_fatura: monthFor(tx) } : tx)

    for (const bill of bills) {
      const month = monthOf(bill.dueDate)
      const index = nextRows.findIndex(tx => tx.ajuste_fatura === true && String(tx.ajuste_fatura_card_id || tx.cartao_id || '') === cardId && String(tx.competencia_fatura || monthOf(String(tx.data))) === month)
      if (index >= 0) { nextRows = nextRows.map((tx, i) => i === index ? { ...tx, valor: cents(bill.total), pluggy_bill: bill.id, data: bill.dueDate, ajuste_delta: undefined } : tx); continue }
      nextRows = [...nextRows, { id: uid('invoice'), pluggy_bill: bill.id, titulo: `Fatura ${String(card.nome || 'Cartão')}`, tipo: 'despesa', data: bill.dueDate, valor: cents(bill.total), valor_pago: 0, status: 'pendente', pagamentos: [], categoria: 'Fatura do cartão', conta_id: `card|${cardId}`, cartao_id: cardId, conta_pagamento_id: payAccount, anexos: [], ignorar_calculo: true, recorrencia: 'unico', ajuste_fatura: true, ajuste_fatura_card_id: cardId, competencia_fatura: month }]
    }

    // pagamento: o que você marcou à mão é respeitado; se o banco também mostra o pagamento da fatura, a fatura fecha como paga sem duplicar
    nextRows = nextRows.map(tx => {
      if (tx.ajuste_fatura !== true || String(tx.ajuste_fatura_card_id || tx.cartao_id || '') !== cardId || !(tx.pluggy_bill || tx.pluggy_open)) return tx
      const total = num(tx.valor)
      let paid = Math.min(total, num(tx.valor_pago))
      let payments = Array.isArray(tx.pagamentos) ? tx.pagamentos : []
      if (tx.pluggy_bill && total > 0 && paid < total - 0.015) {
        const due = new Date(`${String(tx.data).slice(0, 10)}T12:00:00`).getTime()
        const bankPay = nextRows.find(r => r.pluggy_id && !r.ajuste_fatura && r.tipo === 'despesa' && FATURA.test(String(r.titulo)) && Math.abs(num(r.valor) - (total - paid)) < 0.015 && Math.abs(new Date(`${String(r.data).slice(0, 10)}T12:00:00`).getTime() - due) <= 12 * 86400000)
        if (bankPay) { payments = [...payments, { id: uid('pay'), data: String(bankPay.data).slice(0, 10), valor: num(bankPay.valor) }]; paid = total }
      }
      const status = total > 0 && paid >= total - 0.015 ? 'pago' : paid > 0 ? 'parcial' : 'pendente'
      return { ...tx, valor_pago: cents(paid), pagamentos: payments, status, conta_pagamento_id: String(tx.conta_pagamento_id || '') || payAccount }
    })

    // fatura aberta: o banco ainda não emitiu
    const today = new Date()
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const openMonth = invoiceMonthOf(todayKey, closingDay, dueDay)
    if (!billMonth.size || ![...billMonth.values()].includes(openMonth)) {
      const purchases = nextRows.filter(tx => tx.pluggy_id && !tx.ajuste_fatura && String(tx.cartao_id) === cardId && !tx.ignorar_calculo && tx.tipo !== 'receita' && tx.competencia_fatura === openMonth).reduce((sum, tx) => sum + num(tx.valor), 0)
      const previousTotals = bills.map(bill => cents(bill.total))
      const credits = items.flatMap(item => item.transactions).filter(tx => tx.accountId === bankCard.id && tx.tipo === 'receita' && invoiceMonthOf(String(tx.data).slice(0, 10), closingDay, dueDay) === openMonth && !previousTotals.some(total => Math.abs(total - num(tx.valor)) < 0.015)).reduce((sum, tx) => sum + num(tx.valor), 0)
      const net = Math.max(0, cents(purchases - credits))
      const index = nextRows.findIndex(tx => tx.ajuste_fatura === true && String(tx.ajuste_fatura_card_id || tx.cartao_id || '') === cardId && String(tx.competencia_fatura || monthOf(String(tx.data))) === openMonth)
      if (index < 0) nextRows = [...nextRows, { id: uid('invoice'), pluggy_open: true, titulo: `Fatura ${String(card.nome || 'Cartão')}`, tipo: 'despesa', data: dueOf(openMonth, dueDay), valor: net, valor_pago: 0, status: 'pendente', pagamentos: [], categoria: 'Fatura do cartão', conta_id: `card|${cardId}`, cartao_id: cardId, conta_pagamento_id: payAccount, anexos: [], ignorar_calculo: true, recorrencia: 'unico', ajuste_fatura: true, ajuste_fatura_card_id: cardId, competencia_fatura: openMonth }]
      else if (nextRows[index].pluggy_open) nextRows = nextRows.map((tx, i) => i === index ? { ...tx, valor: net, ajuste_delta: undefined } : tx)
      // cópia manual antiga dessa mesma fatura, de um cartão que já não existe: era o mesmo valor, sai para não contar duas vezes
      nextRows = nextRows.filter(tx => !(tx.ajuste_fatura === true && !tx.pluggy_open && !tx.pluggy_bill && !cardIds.has(String(tx.ajuste_fatura_card_id || tx.cartao_id || '')) && String(tx.competencia_fatura || monthOf(String(tx.data))) === openMonth && (Math.abs(num(tx.valor) - net) < 0.015 || String(tx.titulo || '').toLowerCase().includes(String(card.nome || '#').toLowerCase().split(' ')[0]))))
    }
    // quanto já estava pago nas faturas quando o banco informou o limite disponível: pagamentos feitos depois somam ao disponível
    const paidNow = nextRows.filter(tx => tx.ajuste_fatura === true && String(tx.ajuste_fatura_card_id || tx.cartao_id || '') === cardId).reduce((sum, tx) => sum + num(tx.valor_pago), 0)
    return { ...card, conta_id: payAccount, limite_pago_base: cents(paidNow) }
  })
  return { cards: nextCards, transactions: nextRows }
}

/** Registra (ou desfaz) o vínculo de um item do app com uma conta/cartão do banco, ao salvar o item. */
export function bindOpenFinance(finance: Row, target: string, pluggyId?: string): OpenFinanceData {
  const data = readOpenFinance({ finance } as unknown as MaiState)
  const vinculos = Object.fromEntries(Object.entries(data.vinculos).filter(([, value]) => value !== target))
  if (pluggyId) vinculos[pluggyId] = target
  const dispensadas = data.dispensadas.filter(id => id !== pluggyId)
  if (!pluggyId) for (const [id, value] of Object.entries(data.vinculos)) if (value === target) dispensadas.push(id)
  return { ...data, vinculos, dispensadas }
}

let widgetLoading: Promise<void> | null = null
function loadWidget() {
  const w = window as any
  if (w.PluggyConnect) return Promise.resolve()
  if (!widgetLoading) widgetLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.pluggy.ai/pluggy-connect/v2.7.0/pluggy-connect.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => { widgetLoading = null; reject(new Error('Não foi possível carregar o widget da Pluggy')) }
    document.head.appendChild(script)
  })
  return widgetLoading
}

/** Estado e ações do Open Finance. Roda no módulo inteiro: sincroniza sozinho, sem precisar abrir a aba Contas. */
export function useOpenFinance(state: MaiState, commit: Commit) {
  const data = useMemo(() => readOpenFinance(state), [state])
  const [busy, setBusy] = useState<'' | 'connect' | 'sync'>('')
  const [message, setMessage] = useState('')

  async function api(path: string, body: unknown) {
    const response = await authedFetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!response) throw new Error('Entre na sua conta para usar o Open Finance.')
    const json = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(json.error || `Erro ${response.status}`)
    return json
  }

  async function sync(itemIds: string[], silent = false, refresh = true) {
    setBusy('sync'); if (!silent) setMessage('')
    try {
      const from = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10) // o banco refaz lançamentos de cartão quando a fatura fecha: relê sempre 90 dias
      const json = await api('/api/pluggy/sync', { itemIds, from, refresh })
      const items = (json.items || []) as { itemId: string; banco: string; status: string; accounts: any[]; bills?: { id: string; accountId: string; dueDate: string; total: number }[]; investments?: any[]; transactions: any[] }[]
      let added = 0
      let autoLinked = 0
      patchOpenFinance(commit, (current, finance) => {
        // lançamentos seus que a versão anterior casou com o banco voltam a ser só seus (o movimento do banco entra no item do banco)
        const cleaned = ((finance.transactions || []) as Row[]).map(tx => tx.pluggy_id && tx.observacao !== 'Open Finance' && !tx.of_linked ? Object.fromEntries(Object.entries(tx).filter(([key]) => key !== 'pluggy_id')) : tx)
        // o banco troca o id dos lançamentos quando refaz (fatura fecha, pendente vira lançado): o que sumiu do banco na janela lida sai daqui
        const remote = new Map<string, Set<string>>()
        for (const item of items) for (const tx of item.transactions) { const set = remote.get(tx.accountId) || new Set<string>(); set.add(tx.id); remote.set(tx.accountId, set) }
        const linksNow = current.vinculos
        const remoteById = new Map<string, any>()
        for (const item of items) for (const tx of item.transactions) remoteById.set(tx.id, tx)
        const rows = cleaned.map(tx => {
          const hit = tx.pluggy_id && (tx.observacao === 'Open Finance' || tx.of_linked) ? remoteById.get(String(tx.pluggy_id)) : null
          if (hit && tx.of_linked) return { ...tx, valor: hit.valor, fatura_bill_id: hit.billId || '' } // vinculado: o que é seu (título, categoria, pagamentos, data) fica
          return hit ? { ...tx, valor: hit.valor, data: hit.data, fatura_bill_id: hit.billId || '', categoria: tx.categoria || hit.categoria || '' } : tx
        }).filter(tx => {
          if (!tx.pluggy_id || tx.observacao !== 'Open Finance' || String(tx.data).slice(0, 10) < from) return true
          const owner = Object.keys(linksNow).find(id => linksNow[id] === String(tx.conta_id) && remote.has(id))
          return !owner || remote.get(owner)!.has(String(tx.pluggy_id))
        })
        const known = new Set([...current.vistos, ...current.pendentes.map(p => p.id), ...rows.map(tx => String(tx.pluggy_id || '')).filter(Boolean)])
        const fresh: Pending[] = items.flatMap(item => item.transactions.filter(tx => !known.has(tx.id)).map(tx => ({ ...tx, itemId: item.itemId } as Pending)))
        const bank: BankAccount[] = [...current.contas.filter(c => !items.some(i => i.itemId === c.itemId)), ...items.flatMap(item => item.accounts.map(a => ({ ...a, itemId: item.itemId } as BankAccount)))]
        const resolved = resolveLinks(current.vinculos, bank, finance, current.dispensadas)
        const migratedRows = Object.keys(resolved.moved).length ? rows.map(tx => {
          const to = tx.pluggy_id && tx.observacao === 'Open Finance' ? resolved.moved[String(tx.conta_id)] : ''
          return to ? { ...tx, conta_id: to, cartao_id: to.startsWith('card|') ? to.slice(5) : '' } : tx
        }) : rows
        const imported0 = importPending([...current.pendentes, ...fresh], resolved.links, migratedRows)
        added = imported0.rows.length - migratedRows.length
        const cfgByTarget = new Map<string, MatchConfig>() // conta/cartão do app -> configuração do banco dele
        for (const account of bank) { const target = resolved.links[account.id]; if (target) cfgByTarget.set(target, matchConfig(current.itens.find(link => link.itemId === account.itemId))) }
        const auto = autoLinkRows(imported0.rows, row => cfgByTarget.get(String(row.conta_id || '')) || MATCH_DEFAULTS)
        autoLinked = auto.linked
        const imported = { ...imported0, rows: auto.rows.map(settleCardPurchase) }
        const itens = current.itens.map(link => { const hit = items.find(i => i.itemId === link.itemId); return hit ? { ...link, banco: hit.banco, ultimaSync: new Date().toISOString() } : link })
        return {
          finance: { categories: withBankCategories((finance.categories || []) as Row[], imported.rows), ...(() => { const billed = applyCardBills(imported.rows, resolved.cards, resolved.links, bank, items); return { accounts: resolved.accounts.map((account: Row) => account.pluggy_id ? { ...account, pago_base: cents(billed.transactions.filter((tx: Row) => tx.ajuste_fatura === true && String(tx.conta_pagamento_id || '') === String(account.id)).reduce((sum: number, tx: Row) => sum + num(tx.valor_pago), 0)) } : account), ...billed } })(), investments: upsertInvestments((finance.investments || []) as Row[], items) },
          data: { ...current, itens, contas: bank, vinculos: resolved.links, dispensadas: resolved.dismissed, pendentes: imported.remaining, vistos: [...current.vistos, ...imported.skipped] },
        }
      })
      const waiting = items.filter(item => !['UPDATED', 'PARTIAL_SUCCESS'].includes(item.status))
      const note = (json.notes || [])[0] as string | undefined
      const text = json.errors?.length ? `Falha em ${json.errors.length} conexão(ões): ${json.errors[0].error}` : note ? note : waiting.length ? 'O banco ainda está atualizando os dados. Tente de novo em instantes.' : (added > 0 ? `Sincronizado. ${added} ${added === 1 ? 'lançamento novo' : 'lançamentos novos'}` : 'Sincronizado. Nada novo') + (autoLinked ? `; ${autoLinked} vinculado${autoLinked === 1 ? '' : 's'} ao seu.` : '.')
      if (!silent || json.errors?.length) setMessage(text)
    } catch (error: any) {
      if (!silent) setMessage(error?.message || 'Falha ao sincronizar')
    } finally { setBusy('') }
  }

  async function connect() {
    setBusy('connect'); setMessage('')
    try {
      const json = await api('/api/pluggy/connect-token', {})
      await loadWidget()
      const Widget = (window as any).PluggyConnect
      const widget = new Widget({
        connectToken: json.accessToken, theme: 'dark', language: 'pt',
        onSuccess: (payload: any) => {
          const item = payload?.item || payload
          const itemId = String(item?.id || '')
          if (!itemId) return
          patchOpenFinance(commit, current => ({ data: { ...current, itens: current.itens.some(i => i.itemId === itemId) ? current.itens : [...current.itens, { itemId, banco: String(item?.connector?.name || 'Banco') }] } }))
          void sync([itemId], false, false)
        },
        onError: (error: any) => setMessage(String(error?.message || 'Erro ao conectar o banco')),
        onClose: () => setBusy(''),
      })
      widget.init()
    } catch (error: any) {
      setMessage(error?.message || 'Falha ao abrir a conexão')
      setBusy('')
    }
  }

  function addItemId() {
    const raw = window.prompt('Cole o Item ID do MeuPluggy (aparece em Connected Items, na página Demo do painel da Pluggy):')
    const itemId = String(raw || '').trim()
    if (!itemId) return
    if (!/^[\w-]{8,64}$/.test(itemId)) { setMessage('Esse ID não parece válido.'); return }
    patchOpenFinance(commit, current => ({ data: { ...current, itens: current.itens.some(i => i.itemId === itemId) ? current.itens : [...current.itens, { itemId, banco: 'MeuPluggy' }] } }))
    void sync([itemId], false, false)
    setLink(itemId, '')
  }

  /** Guarda o link da conexão no MeuPluggy; vazio remove. Devolve false se o link for inválido. */
  function setLink(itemId: string, current: string) {
    const raw = window.prompt('Link desta conexão no MeuPluggy (https://meu.pluggy.ai/connections/…). Deixe vazio para não abrir nada ao sincronizar:', current)
    if (raw === null) return
    const url = raw.trim()
    if (url && !validMeuPluggyUrl(url)) { setMessage('Esse link não parece ser do MeuPluggy (https://meu.pluggy.ai/connections/…).'); return }
    patchOpenFinance(commit, data => ({ data: { ...data, itens: data.itens.map(i => i.itemId === itemId ? { ...i, url } : i) } }))
    setMessage(url ? 'Link do MeuPluggy salvo.' : 'Link removido.')
  }

  function setMatch(itemId: string, patch: Partial<MatchConfig>) { patchOpenFinance(commit, current => ({ data: { ...current, itens: current.itens.map(i => i.itemId === itemId ? { ...i, vinc: { ...matchConfig(i), ...patch } } : i) } })) }
  const matchOf = (itemId: string) => matchConfig(data.itens.find(i => i.itemId === itemId))

  /** Grava o link digitado no campo da conta/cartão. Devolve o motivo se não for válido ('' = salvo). */
  function saveLink(itemId: string, raw: string) {
    const url = raw.trim()
    if (url && !validMeuPluggyUrl(url)) return 'Cole o link da conexão: https://meu.pluggy.ai/connections/…'
    patchOpenFinance(commit, current => ({ data: { ...current, itens: current.itens.map(i => i.itemId === itemId ? { ...i, url } : i) } }))
    return ''
  }

  /** Abre a página da conexão no MeuPluggy (para você clicar em atualizar) e já lê o que a Pluggy tem. Precisa ser chamado direto de um clique, senão o navegador bloqueia o pop-up. */
  function refreshAt(itemId: string) {
    const link = data.itens.find(i => i.itemId === itemId)
    const url = link ? meuPluggyUrl(link) : ''
    if (url && isNativeApp()) { void nativePlugin('Browser')?.open?.({ url }) }
    else if (url) { try { window.open(url, `meu-pluggy-${itemId}`, 'popup,width=520,height=780') } catch { /* popup bloqueado: segue só com a leitura */ } }
    else setMessage('Defina o link desta conexão no MeuPluggy para abrir a página de atualização.')
    void sync([itemId], false, false)
  }
  const linkOf = (itemId: string) => { const link = data.itens.find(i => i.itemId === itemId); return link ? meuPluggyUrl(link) : '' }

  function disconnect(itemId: string) {
    if (!window.confirm('Desconectar este banco do app? Os lançamentos já importados continuam.')) return
    patchOpenFinance(commit, current => {
      const ids = new Set(current.contas.filter(c => c.itemId === itemId).map(c => c.id))
      const vinculos = Object.fromEntries(Object.entries(current.vinculos).filter(([id]) => !ids.has(id)))
      return { data: { ...current, itens: current.itens.filter(i => i.itemId !== itemId), contas: current.contas.filter(c => c.itemId !== itemId), vinculos, pendentes: current.pendentes.filter(p => p.itemId !== itemId) } }
    })
  }

  /** Saldo da conta e limite do cartão seguem o banco. `withoutInitial` = saldo do app sem o saldo inicial. */
  function applyBalances(withoutInitial: (account: Row) => number, invoicePaid: (account: Row) => number = () => 0) {
    const finance = (state.finance || {}) as Row
    const accounts = (finance.accounts || []) as Row[]
    const cards = (finance.cards || []) as Row[]
    const wantAccount = new Map<string, number>()
    const wantLimit = new Map<string, number>()
    for (const bank of data.contas) {
      const target = data.vinculos[bank.id]
      if (!target) continue
      if (bank.tipo === 'conta') {
        const account = accounts.find(a => String(a.id) === target)
        if (!account) continue
        const manualSincePaid = invoicePaid(account) // fatura paga à mão depois do último sync já sai do saldo (o banco assume no próximo)
        const initial = cents(bank.saldo - manualSincePaid - withoutInitial(account))
        if (Math.abs(initial - num(account.saldo_inicial)) > 0.005) wantAccount.set(String(account.id), initial)
      } else if (bank.limite > 0) {
        const card = cards.find(c => `card|${c.id}` === target)
        if (card && Math.abs(bank.limite - num(card.limite)) > 0.005) wantLimit.set(String(card.id), cents(bank.limite))
      }
    }
    if (!wantAccount.size && !wantLimit.size) return
    commit(current => {
      const f = (current.finance || {}) as Row
      return { ...current, finance: {
        ...f,
        accounts: ((f.accounts || []) as Row[]).map(a => wantAccount.has(String(a.id)) ? { ...a, saldo_inicial: wantAccount.get(String(a.id)) } : a),
        cards: ((f.cards || []) as Row[]).map(c => wantLimit.has(String(c.id)) ? { ...c, limite: wantLimit.get(String(c.id)) } : c),
      } }
    })
  }

  // Sincronização automática: ao abrir, a cada 15 min e quando o app volta ao primeiro plano.
  const latest = useRef({ data, busy, sync })
  latest.current = { data, busy, sync }
  const lastAttempt = useRef(0)
  const lastForced = useRef(0)
  useEffect(() => {
    const tick = () => {
      const { data: current, busy: working, sync: run } = latest.current
      if (working !== '' || !current.itens.length || document.visibilityState === 'hidden') return
      const now = Date.now()
      if (now - lastAttempt.current < 60_000) return // evita laço se o banco der erro
      const stale = current.itens.some(item => !item.ultimaSync || now - Date.parse(item.ultimaSync) > AUTO_MINUTES * 60_000)
      if (!stale) return
      lastAttempt.current = now
      const forced = now - lastForced.current > 61 * 60_000 // a Pluggy só aceita 1 atualização forçada por hora
      if (forced) lastForced.current = now
      void run(current.itens.map(item => item.itemId), true, forced)
    }
    tick()
    const timer = window.setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick) }
  }, [])

  const info = (pluggyId?: string) => {
    const bank = pluggyId ? data.contas.find(c => c.id === pluggyId) : undefined
    if (!bank) return null
    const item = data.itens.find(i => i.itemId === bank.itemId)
    return { itemId: bank.itemId, banco: bankLabel(bank.nome), tipo: bank.tipo, saldo: bank.saldo, limite: bank.limite || bank.limite_disponivel, atualizado: item?.ultimaSync || '' }
  }
  const available = (kind: 'conta' | 'cartao') => data.contas.filter(c => c.tipo === kind && !data.vinculos[c.id])

  return { data, busy, message, sync, connect, addItemId, setLink, saveLink, setMatch, matchOf, refreshAt, linkOf, disconnect, applyBalances, info, available }
}

export type OpenFinanceController = ReturnType<typeof useOpenFinance>

/** Linha discreta no fim das listas: as contas, cartões e investimentos do banco aparecem nas listas normais, iguais aos manuais. */
export function OpenFinancePanel({ ctl }: { ctl: OpenFinanceController }) {
  const { data, busy, message, connect } = ctl
  // Sem a linha geral: com banco conectado, o botão de atualizar fica em cada conta/cartão (ao abri-lo). Aqui só o convite inicial e os avisos.
  if (!data.itens.length) return <div className={of.line}>
    <span className={of.status}>Open Finance: conecte seu banco para lançar e atualizar tudo sozinho</span>
    <div className={of.actions}><button type="button" data-primary="true" disabled={busy !== ''} onClick={connect}>Conectar banco</button></div>
    {message ? <p className={of.message} role="status">{message}</p> : null}
  </div>
  return message ? <div className={of.line}><p className={of.message} role="status">{message}</p></div> : null
}


/** Vincula um lançamento seu a um lançamento do banco: vira um só (mantém o que é seu, passa a acompanhar o valor do banco) e o do banco não é duplicado. */
export function linkTransactions(finance: Row, manualId: string, bankId: string): Row[] {
  const list = (finance.transactions || []) as Row[]
  const bank = list.find(tx => String(tx.id) === bankId)
  if (!bank || !bank.pluggy_id) return list
  return list.filter(tx => String(tx.id) !== bankId).map(tx => String(tx.id) !== manualId ? tx : {
    ...tx, pluggy_id: bank.pluggy_id, of_linked: true, valor: bank.valor, fatura_bill_id: bank.fatura_bill_id || '', competencia_fatura: bank.competencia_fatura || tx.competencia_fatura,
    conta_id: tx.conta_id || bank.conta_id, cartao_id: tx.cartao_id || bank.cartao_id || '',
  })
}

/** Desfaz o vínculo: o lançamento volta a ser só seu e o do banco reaparece no próximo sync. */
export function unlinkTransaction(list: Row[], id: string): Row[] {
  return list.map(tx => String(tx.id) !== id ? tx : { ...Object.fromEntries(Object.entries(tx).filter(([key]) => !['pluggy_id', 'of_linked', 'fatura_bill_id'].includes(key))), of_nolink: true }) // of_nolink: o vínculo automático não refaz o que você desfez
}
