'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { MaiState } from '../../lib/v2/state-model'
import { authedFetch } from '../../lib/v2/sync'
import fm from './FinanceModern.module.css'
import of from './OpenFinance.module.css'

type Row = Record<string, any>
type Commit = (change: (current: MaiState) => MaiState) => void

type Link = { itemId: string; banco: string; ultimaSync?: string }
type Pending = { id: string; accountId: string; itemId: string; data: string; titulo: string; valor: number; tipo: 'receita' | 'despesa'; pendente: boolean; categoria: string; parcela: string }
type BankAccount = { id: string; itemId: string; nome: string; tipo: 'conta' | 'cartao'; saldo: number; limite_disponivel: number }
export type OpenFinanceData = { itens: Link[]; contas: BankAccount[]; vinculos: Record<string, string>; pendentes: Pending[]; vistos: string[] }

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const num = (value: unknown) => Number(value) || 0
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00`) - Date.parse(`${b}T12:00:00`)) / 86400_000

export function readOpenFinance(state: MaiState): OpenFinanceData {
  const raw = (state.finance?.openFinance && typeof state.finance.openFinance === 'object' ? state.finance.openFinance : {}) as Partial<OpenFinanceData>
  return {
    itens: Array.isArray(raw.itens) ? raw.itens : [],
    contas: Array.isArray(raw.contas) ? raw.contas : [],
    vinculos: raw.vinculos && typeof raw.vinculos === 'object' ? raw.vinculos : {},
    pendentes: Array.isArray(raw.pendentes) ? raw.pendentes : [],
    vistos: Array.isArray(raw.vistos) ? raw.vistos : [],
  }
}

function patchOpenFinance(commit: Commit, change: (data: OpenFinanceData, finance: Row) => { data?: OpenFinanceData; finance?: Row }) {
  commit(current => {
    const finance = (current.finance || {}) as Row
    const result = change(readOpenFinance(current), finance)
    const nextFinance = { ...finance, ...(result.finance || {}) }
    return { ...current, finance: { ...nextFinance, openFinance: result.data || readOpenFinance(current) } }
  })
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

const AUTO_MINUTES = 15

/** Estado + ações do Open Finance. Roda no módulo inteiro: sincroniza sozinho, sem precisar abrir a aba Contas. */
export function useOpenFinance(state: MaiState, commit: Commit) {
  const data = useMemo(() => readOpenFinance(state), [state])
  const [busy, setBusy] = useState<'' | 'connect' | 'sync'>('')
  const [message, setMessage] = useState('')
  const transactions = (state.finance?.transactions || []) as Row[]

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
      const from = data.itens.some(item => item.ultimaSync) ? new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10) : new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10)
      const json = await api('/api/pluggy/sync', { itemIds, from })
      const items = (json.items || []) as { itemId: string; banco: string; status: string; accounts: any[]; transactions: any[] }[]
      patchOpenFinance(commit, current => {
        const known = new Set([...current.vistos, ...current.pendentes.map(p => p.id)])
        const have = new Set((transactions).map(tx => String(tx.pluggy_id || '')).filter(Boolean))
        const fresh: Pending[] = items.flatMap(item => item.transactions.filter(tx => !known.has(tx.id) && !have.has(tx.id)).map(tx => ({ ...tx, itemId: item.itemId } as Pending)))
        const contas = [...current.contas.filter(c => !items.some(i => i.itemId === c.itemId)), ...items.flatMap(item => item.accounts.map(a => ({ ...a, itemId: item.itemId } as BankAccount)))]
        const itens = current.itens.map(link => { const hit = items.find(i => i.itemId === link.itemId); return hit && hit.status !== 'LOGIN_ERROR' ? { ...link, banco: hit.banco, ultimaSync: new Date().toISOString() } : link })
        return { data: { ...current, itens, contas, pendentes: [...current.pendentes, ...fresh] } }
      })
      const waiting = items.filter(item => !['UPDATED', 'PARTIAL_SUCCESS'].includes(item.status))
      const count = items.reduce((sum, item) => sum + item.transactions.length, 0)
      const text = json.errors?.length ? `Falha em ${json.errors.length} conexão(ões): ${json.errors[0].error}` : waiting.length ? 'O banco ainda está atualizando os dados. Tente de novo em instantes.' : `Sincronizado. ${count} movimentos lidos no período.`
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
        connectToken: json.accessToken,
        theme: 'dark',
        language: 'pt',
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

  function link(accountId: string, target: string) {
    patchOpenFinance(commit, current => ({ data: { ...current, vinculos: { ...current.vinculos, [accountId]: target } } }))
  }

  function targetOf(pending: Pending) { return data.vinculos[pending.accountId] || '' }
  function match(pending: Pending) {
    return transactions.find(tx => !tx.pluggy_id && String(tx.tipo) === pending.tipo && Math.abs(num(tx.valor) - pending.valor) < 0.005 && dayDiff(String(tx.data).slice(0, 10), pending.data) <= 3)
  }

  function importOne(pending: Pending, mode: 'new' | 'link') {
    const target = targetOf(pending)
    if (!target && mode === 'new') { setMessage('Vincule a conta do banco a uma conta do app antes de importar.'); return }
    patchOpenFinance(commit, (current, finance) => {
      const rows = (finance.transactions || []) as Row[]
      let nextRows = rows
      if (mode === 'link') {
        const hit = rows.find(tx => !tx.pluggy_id && String(tx.tipo) === pending.tipo && Math.abs(num(tx.valor) - pending.valor) < 0.005 && dayDiff(String(tx.data).slice(0, 10), pending.data) <= 3)
        if (hit) nextRows = rows.map(tx => tx === hit ? { ...tx, pluggy_id: pending.id, status: 'pago', valor_pago: tx.valor, pagamentos: [{ id: uid('pay'), data: pending.data, valor: tx.valor }] } : tx)
      } else {
        const isCard = target.startsWith('card|')
        nextRows = [...rows, {
          id: uid('fin'), pluggy_id: pending.id, titulo: pending.parcela ? `${pending.titulo} (${pending.parcela})` : pending.titulo, observacao: 'Importado via Open Finance', valor: pending.valor, tipo: pending.tipo, data: pending.data,
          categoria: '', conta_id: target, cartao_id: isCard ? target.slice(5) : '', anexos: [], ignorar_calculo: false, recorrencia: 'unico',
          ...(pending.pendente ? { status: 'pendente', valor_pago: 0, pagamentos: [] } : { status: 'pago', valor_pago: pending.valor, pagamentos: [{ id: uid('pay'), data: pending.data, valor: pending.valor }] }),
        }]
      }
      return { finance: { transactions: nextRows }, data: { ...current, pendentes: current.pendentes.filter(p => p.id !== pending.id), vistos: [...current.vistos, pending.id] } }
    })
  }

  function ignore(pending: Pending) {
    patchOpenFinance(commit, current => ({ data: { ...current, pendentes: current.pendentes.filter(p => p.id !== pending.id), vistos: [...current.vistos, pending.id] } }))
  }

  function disconnect(itemId: string) {
    if (!window.confirm('Desconectar este banco do app? Os lançamentos já importados continuam.')) return
    patchOpenFinance(commit, current => ({ data: { ...current, itens: current.itens.filter(i => i.itemId !== itemId), contas: current.contas.filter(c => c.itemId !== itemId), pendentes: current.pendentes.filter(p => p.itemId !== itemId) } }))
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

  return { data, busy, message, sync, connect, addItemId, link, importOne, ignore, disconnect, match }
}

export type OpenFinanceController = ReturnType<typeof useOpenFinance>

export function OpenFinancePanel({ ctl, accounts, cards }: { ctl: OpenFinanceController; accounts: Row[]; cards: Row[] }) {
  const { data, busy, message, sync, connect, addItemId, link, importOne, ignore, disconnect, match } = ctl
  const readyPending = data.pendentes.filter(p => !(data.contas.find(c => c.id === p.accountId)?.tipo === 'cartao' && p.tipo === 'receita'))
  const targets = [...accounts.map(a => ({ id: String(a.id), label: String(a.nome) })), ...cards.map(c => ({ id: `card|${c.id}`, label: `${c.nome} (cartão)` }))]
  const last = data.itens.map(i => i.ultimaSync).filter(Boolean).sort().pop()

  return <section className={of.panel}>
    <div className={of.head}>
      <div><strong>Open Finance</strong><span>{data.itens.length ? `${data.itens.length} ${data.itens.length === 1 ? 'banco conectado' : 'bancos conectados'}${last ? ` · atualizado ${new Date(last).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}` : 'Conecte seus bancos para importar movimentos automaticamente.'}</span></div>
      <div className={of.actions}>
        {data.itens.length ? <button type="button" disabled={busy !== ''} onClick={() => sync(data.itens.map(i => i.itemId))}>{busy === 'sync' ? 'Sincronizando…' : 'Sincronizar'}</button> : null}
        <button type="button" disabled={busy !== ''} onClick={addItemId} title="Para contas reais no uso pessoal, via MeuPluggy">Usar ID do MeuPluggy</button>
        <button type="button" data-primary="true" disabled={busy !== ''} onClick={connect}>{busy === 'connect' ? 'Abrindo…' : 'Conectar banco'}</button>
      </div>
    </div>
    {message ? <p className={of.message} role="status">{message}</p> : null}

    {data.itens.map(item => <div key={item.itemId} className={of.bank}>
      <div className={of.bankTop}><b>{item.banco}</b><button type="button" onClick={() => disconnect(item.itemId)}>Desconectar</button></div>
      {data.contas.filter(c => c.itemId === item.itemId).map(account => <div key={account.id} className={of.accountRow}>
        <span className={of.accountName}>{account.nome}<small>{account.tipo === 'cartao' ? `Limite disponível ${money.format(account.limite_disponivel)}` : `Saldo no banco ${money.format(account.saldo)}`}</small></span>
        <select value={data.vinculos[account.id] || ''} onChange={event => link(account.id, event.target.value)} aria-label={`Vincular ${account.nome}`}>
          <option value="">Vincular a…</option>
          {targets.filter(t => account.tipo === 'cartao' ? t.id.startsWith('card|') : !t.id.startsWith('card|')).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>)}
    </div>)}

    {readyPending.length ? <div className={of.review}>
      <div className={of.reviewHead}><strong>Para revisar</strong><span>{readyPending.length}</span></div>
      {readyPending.map(pending => { const hit = match(pending); const account = data.contas.find(c => c.id === pending.accountId); return <div key={pending.id} className={of.pending}>
        <div className={of.pendingMain}>
          <span className={of.pendingTitle}>{pending.titulo}</span>
          <span className={of.pendingSub}>{pending.data.split('-').reverse().slice(0, 2).join('/')} · {account?.nome || 'Conta'}{pending.pendente ? ' · pendente' : ''}{hit ? <em> · parece com “{String(hit.titulo)}”</em> : null}</span>
        </div>
        <b className={pending.tipo === 'receita' ? fm.pos : fm.neg}>{pending.tipo === 'receita' ? '+ ' : '− '}{money.format(pending.valor)}</b>
        <div className={of.rowActions}>
          {hit ? <button type="button" data-primary="true" onClick={() => importOne(pending, 'link')}>Vincular</button> : null}
          <button type="button" data-primary={hit ? undefined : 'true'} onClick={() => importOne(pending, 'new')}>Importar</button>
          <button type="button" onClick={() => ignore(pending)}>Ignorar</button>
        </div>
      </div> })}
    </div> : null}
  </section>
}
