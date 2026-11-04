'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { MaiState } from '../../lib/v2/state-model'
import { authedFetch } from '../../lib/v2/sync'
import of from './OpenFinance.module.css'

type Row = Record<string, any>
type Commit = (change: (current: MaiState) => MaiState) => void

type Link = { itemId: string; banco: string; ultimaSync?: string }
type Pending = { id: string; accountId: string; itemId: string; data: string; titulo: string; valor: number; tipo: 'receita' | 'despesa'; pendente: boolean; categoria: string; parcela: string }
type BankAccount = { id: string; itemId: string; nome: string; tipo: 'conta' | 'cartao'; saldo: number; limite: number; limite_disponivel: number }
export type OpenFinanceData = { itens: Link[]; contas: BankAccount[]; vinculos: Record<string, string>; pendentes: Pending[]; vistos: string[] }

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const num = (value: unknown) => Number(value) || 0
const cents = (value: number) => Math.round(value * 100) / 100
const FATURA = /pagamento (de |da |do )?fatura|pagamento fatura|fatura (do )?cart/i // pagamento de fatura já aparece como compras no cartão
const shortName = (nome: string) => nome.replace(/^MeuPluggy\s*·\s*/i, '').split(' - ')[0].replace(/\s+S\.?\s?A\.?$/i, '').trim() || 'Banco'
const AUTO_MINUTES = 15

export function readOpenFinance(state: MaiState): OpenFinanceData {
  const raw = (state.finance?.openFinance && typeof state.finance.openFinance === 'object' ? state.finance.openFinance : {}) as Partial<OpenFinanceData>
  return {
    itens: Array.isArray(raw.itens) ? raw.itens : [],
    contas: Array.isArray(raw.contas) ? raw.contas.map(c => ({ ...c, limite: num((c as any).limite) })) : [],
    vinculos: raw.vinculos && typeof raw.vinculos === 'object' ? raw.vinculos : {},
    pendentes: Array.isArray(raw.pendentes) ? raw.pendentes : [],
    vistos: Array.isArray(raw.vistos) ? raw.vistos : [],
  }
}

function patchOpenFinance(commit: Commit, change: (data: OpenFinanceData, finance: Row) => { data?: OpenFinanceData; finance?: Row }) {
  commit(current => {
    const finance = (current.finance || {}) as Row
    const result = change(readOpenFinance(current), finance)
    return { ...current, finance: { ...finance, ...(result.finance || {}), openFinance: result.data || readOpenFinance(current) } }
  })
}

const bankLabel = (nome: string) => /nu pagamentos|nubank/i.test(nome) ? 'Nubank' : shortName(nome)

/**
 * Cada conta/cartão do banco vira um item PRÓPRIO do app (marcado com pluggy_id); nunca mistura com os seus manuais.
 * Vínculos antigos para itens manuais são desfeitos: o saldo inicial que o sync mexeu volta a 0 e o que foi importado migra para o item do banco.
 */
function resolveLinks(links: Record<string, string>, bank: BankAccount[], finance: Row) {
  const accounts: Row[] = [...((finance.accounts || []) as Row[])]
  const cards: Row[] = [...((finance.cards || []) as Row[])]
  const next = { ...links }
  const moved: Record<string, string> = {}
  const stale: Record<string, string> = {}
  const find = (target: string) => target.startsWith('card|') ? cards.find(c => `card|${c.id}` === target) : accounts.find(a => String(a.id) === target)
  for (const b of bank) {
    const target = next[b.id]
    if (!target) continue
    const item = find(target)
    if (item && item.pluggy_id) continue
    if (item) stale[target] = b.id
    delete next[b.id]
  }
  const prefix = (b: BankAccount) => bankLabel(bank.find(x => x.itemId === b.itemId && x.tipo === 'conta')?.nome || b.nome)
  for (const b of bank) {
    if (next[b.id]) continue
    const id = uid(b.tipo === 'cartao' ? 'crd' : 'cta')
    if (b.tipo === 'cartao') {
      const base = shortName(b.nome)
      const nome = `${/cart[aã]o/i.test(base) ? base : `${prefix(b)} ${base}`} (Open Finance)`
      cards.push({ id, pluggy_id: b.id, nome, limite: b.limite, fechamento: 1, vencimento: 10, conta_id: '', cor: '#4073FF', foto: '' })
      next[b.id] = `card|${id}`
    } else {
      accounts.push({ id, pluggy_id: b.id, nome: `${bankLabel(b.nome)} (Open Finance)`, saldo_inicial: 0, cor: '#4073FF', foto: '' })
      next[b.id] = id
    }
    if (stale[Object.keys(stale).find(t => stale[t] === b.id) || '']) moved[Object.keys(stale).find(t => stale[t] === b.id) as string] = next[b.id]
  }
  const restored = accounts.map(a => stale[String(a.id)] ? { ...a, saldo_inicial: 0 } : a)
  return { links: next, accounts: restored, cards, moved }
}

/** Lança direto na conta/cartão do banco, já pago. Nunca mexe nos seus lançamentos manuais. */
function importPending(list: Pending[], links: Record<string, string>, rows: Row[]) {
  const out = [...rows]
  const remaining: Pending[] = []
  const skipped: string[] = []
  for (const p of list) {
    const target = links[p.accountId]
    if (!target) { remaining.push(p); continue }
    const isCard = target.startsWith('card|')
    if (isCard && p.tipo === 'receita') { skipped.push(p.id); continue } // pagamento de fatura/estorno no cartão
    const settled = p.pendente ? { status: 'pendente', valor_pago: 0, pagamentos: [] as Row[] } : null
    out.push({
      id: uid('fin'), pluggy_id: p.id, titulo: (p.parcela ? `${p.titulo} (${p.parcela})` : p.titulo).replace(/\s*\|\s*/g, ' · '), observacao: 'Open Finance', valor: p.valor, tipo: p.tipo, data: p.data,
      categoria: '', conta_id: target, cartao_id: isCard ? target.slice(5) : '', anexos: [], recorrencia: 'unico',
      ignorar_calculo: !isCard && FATURA.test(p.titulo),
      ...(settled || { status: 'pago', valor_pago: p.valor, pagamentos: [{ id: uid('pay'), data: p.data, valor: p.valor }] }),
    })
  }
  return { rows: out, remaining, skipped }
}

/** Investimentos do banco viram investimentos normais do app (atualiza valor e aportado a cada sincronização). */
function upsertInvestments(current: Row[], items: { banco: string; investments?: any[] }[]) {
  const next = [...current]
  for (const item of items) for (const inv of item.investments || []) {
    const index = next.findIndex(row => row.pluggy_id === inv.id)
    if (index >= 0) next[index] = { ...next[index], aportado: cents(num(inv.aportado)), valor_atual: cents(num(inv.valor_atual)) }
    else next.push({ id: uid('inv'), pluggy_id: inv.id, nome: inv.nome, tipo: inv.tipo, instituicao: shortName(item.banco), icone: 'trending_up', cor: '#4073FF', foto: '', aportado: cents(num(inv.aportado)), valor_atual: cents(num(inv.valor_atual)), observacao: 'Open Finance', movimentos: [] })
  }
  return next
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

  async function sync(itemIds: string[], silent = false) {
    setBusy('sync'); if (!silent) setMessage('')
    try {
      const first = !data.itens.some(item => item.ultimaSync)
      const from = new Date(Date.now() - (first ? 90 : 14) * 86400_000).toISOString().slice(0, 10)
      const json = await api('/api/pluggy/sync', { itemIds, from })
      const items = (json.items || []) as { itemId: string; banco: string; status: string; accounts: any[]; investments?: any[]; transactions: any[] }[]
      let added = 0
      patchOpenFinance(commit, (current, finance) => {
        // lançamentos seus que a versão anterior casou com o banco voltam a ser só seus (o movimento do banco entra no item do banco)
        const rows = ((finance.transactions || []) as Row[]).map(tx => tx.pluggy_id && tx.observacao !== 'Open Finance' ? Object.fromEntries(Object.entries(tx).filter(([key]) => key !== 'pluggy_id')) : tx)
        const known = new Set([...current.vistos, ...current.pendentes.map(p => p.id), ...rows.map(tx => String(tx.pluggy_id || '')).filter(Boolean)])
        const fresh: Pending[] = items.flatMap(item => item.transactions.filter(tx => !known.has(tx.id)).map(tx => ({ ...tx, itemId: item.itemId } as Pending)))
        const bank: BankAccount[] = [...current.contas.filter(c => !items.some(i => i.itemId === c.itemId)), ...items.flatMap(item => item.accounts.map(a => ({ ...a, itemId: item.itemId } as BankAccount)))]
        const resolved = resolveLinks(current.vinculos, bank, finance)
        const migratedRows = Object.keys(resolved.moved).length ? rows.map(tx => {
          const to = tx.pluggy_id && tx.observacao === 'Open Finance' ? resolved.moved[String(tx.conta_id)] : ''
          return to ? { ...tx, conta_id: to, cartao_id: to.startsWith('card|') ? to.slice(5) : '' } : tx
        }) : rows
        const imported = importPending([...current.pendentes, ...fresh], resolved.links, migratedRows)
        added = imported.rows.length - migratedRows.length
        const itens = current.itens.map(link => { const hit = items.find(i => i.itemId === link.itemId); return hit ? { ...link, banco: hit.banco, ultimaSync: new Date().toISOString() } : link })
        return {
          finance: { accounts: resolved.accounts, cards: resolved.cards, transactions: imported.rows, investments: upsertInvestments((finance.investments || []) as Row[], items) },
          data: { ...current, itens, contas: bank, vinculos: resolved.links, pendentes: imported.remaining, vistos: [...current.vistos, ...imported.skipped] },
        }
      })
      const waiting = items.filter(item => !['UPDATED', 'PARTIAL_SUCCESS'].includes(item.status))
      const text = json.errors?.length ? `Falha em ${json.errors.length} conexão(ões): ${json.errors[0].error}` : waiting.length ? 'O banco ainda está atualizando os dados. Tente de novo em instantes.' : added > 0 ? `Sincronizado. ${added} ${added === 1 ? 'lançamento novo' : 'lançamentos novos'}.` : 'Sincronizado. Nada novo.'
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
          void sync([itemId])
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
    void sync([itemId])
  }

  function disconnect(itemId: string) {
    if (!window.confirm('Desconectar este banco do app? Os lançamentos já importados continuam.')) return
    patchOpenFinance(commit, current => {
      const ids = new Set(current.contas.filter(c => c.itemId === itemId).map(c => c.id))
      const vinculos = Object.fromEntries(Object.entries(current.vinculos).filter(([id]) => !ids.has(id)))
      return { data: { ...current, itens: current.itens.filter(i => i.itemId !== itemId), contas: current.contas.filter(c => c.itemId !== itemId), vinculos, pendentes: current.pendentes.filter(p => p.itemId !== itemId) } }
    })
  }

  /** Saldo da conta e limite do cartão seguem o banco. `withoutInitial` = saldo do app sem o saldo inicial. */
  function applyBalances(withoutInitial: (account: Row) => number) {
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
        const initial = cents(bank.saldo - withoutInitial(account))
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
  useEffect(() => {
    const tick = () => {
      const { data: current, busy: working, sync: run } = latest.current
      if (working !== '' || !current.itens.length || document.visibilityState === 'hidden') return
      const now = Date.now()
      if (now - lastAttempt.current < 60_000) return // evita laço se o banco der erro
      const stale = current.itens.some(item => !item.ultimaSync || now - Date.parse(item.ultimaSync) > AUTO_MINUTES * 60_000)
      if (!stale) return
      lastAttempt.current = now
      void run(current.itens.map(item => item.itemId), true)
    }
    tick()
    const timer = window.setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick) }
  }, [])

  return { data, busy, message, sync, connect, addItemId, disconnect, applyBalances }
}

export type OpenFinanceController = ReturnType<typeof useOpenFinance>

export function OpenFinancePanel({ ctl }: { ctl: OpenFinanceController }) {
  const { data, busy, message, sync, connect, addItemId, disconnect } = ctl
  const last = data.itens.map(i => i.ultimaSync).filter(Boolean).sort().pop()
  const waiting = data.pendentes.length
  const status = !data.itens.length ? 'Conecte seu banco para lançar movimentos e atualizar saldos sozinho.'
    : `${busy === 'sync' ? 'Sincronizando…' : last ? `Atualizado ${new Date(last).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : 'Aguardando a primeira sincronização'}${waiting ? ` · ${waiting} movimentos na fila` : ''}`

  return <section className={of.panel}>
    <div className={of.head}>
      <div className={of.title}><strong>Open Finance</strong><span>{status}</span></div>
      <div className={of.actions}>
        {data.itens.length ? <button type="button" disabled={busy !== ''} onClick={() => sync(data.itens.map(i => i.itemId))}>Sincronizar</button> : null}
        <button type="button" data-primary="true" disabled={busy !== ''} onClick={connect}>{data.itens.length ? 'Conectar outro' : 'Conectar banco'}</button>
        <details className={of.more}><summary aria-label="Mais opções">⋯</summary><div><button type="button" onClick={addItemId}>Usar ID do MeuPluggy</button></div></details>
      </div>
    </div>
    {message ? <p className={of.message} role="status">{message}</p> : null}
    {data.itens.map(item => <div key={item.itemId} className={of.bank}>
      {data.contas.filter(c => c.itemId === item.itemId).map(account => { const linked = data.vinculos[account.id] || ''; return <div key={account.id} className={of.accountRow}>
        <span className={of.accountName}>{bankLabel(account.nome)}<small>{account.tipo === 'cartao' ? `Cartão · limite ${money.format(account.limite || account.limite_disponivel)}` : `Conta · saldo ${money.format(account.saldo)}`}</small></span>
        <span className={of.where}>{linked ? (account.tipo === 'cartao' ? 'Em Cartões' : 'Em Contas') : 'Aguardando'}</span>
      </div> })}
      <button type="button" className={of.disconnect} onClick={() => disconnect(item.itemId)}>Desconectar {shortName(item.banco)}</button>
    </div>)}
  </section>
}
