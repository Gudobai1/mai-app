// Cliente server-side da Pluggy (Open Finance). Nunca importar no navegador.
const BASE = 'https://api.pluggy.ai'

let cached: { key: string; exp: number } | null = null

export function pluggyConfigured() {
  return Boolean(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET)
}

async function apiKey() {
  if (cached && cached.exp > Date.now() + 60_000) return cached.key
  const clientId = process.env.PLUGGY_CLIENT_ID
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('PLUGGY_NOT_CONFIGURED')
  const response = await fetch(`${BASE}/auth`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, clientSecret }), cache: 'no-store' })
  if (!response.ok) throw new Error(`Pluggy auth ${response.status}`)
  const data = await response.json() as { apiKey?: string }
  if (!data.apiKey) throw new Error('Pluggy auth sem apiKey')
  cached = { key: data.apiKey, exp: Date.now() + 110 * 60_000 } // a chave vale 2h
  return cached.key
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { ...init, cache: 'no-store', headers: { 'content-type': 'application/json', 'X-API-KEY': await apiKey(), ...(init.headers || {}) } })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    let message = ''
    try { const parsed = JSON.parse(detail); message = String(parsed.message || parsed.error || parsed.code || '') } catch { message = detail }
    throw new Error(`Pluggy ${path.split('?')[0]} ${response.status}${message ? `: ${message.slice(0, 160)}` : ''}`)
  }
  return response.json() as Promise<T>
}

export async function createConnectToken(updateItemId?: string) {
  const data = await call<{ accessToken: string }>('/connect_token', { method: 'POST', body: JSON.stringify(updateItemId ? { itemId: updateItemId } : {}) })
  return data.accessToken
}

type Paged<T> = { results: T[]; totalPages?: number; page?: number }
type PluggyItem = { id: string; status?: string; connector?: { name?: string; imageUrl?: string }; lastUpdatedAt?: string }
type PluggyAccount = { id: string; type?: string; subtype?: string; name?: string; number?: string; balance?: number; currencyCode?: string; creditData?: { availableCreditLimit?: number; creditLimit?: number; balanceCloseDate?: string | null; balanceDueDate?: string | null } | null }
type PluggyBill = { id: string; dueDate?: string | null; totalAmount?: number | null }
type PluggyInvestment = { id: string; name?: string; type?: string; subtype?: string; balance?: number; value?: number; amount?: number; amountOriginal?: number | null; amountProfit?: number | null; institution?: { name?: string } | null; code?: string | null }
type PluggyTransaction = { id: string; accountId: string; date: string; description?: string; descriptionRaw?: string | null; type?: 'DEBIT' | 'CREDIT'; amount: number; status?: string; category?: string | null; creditCardMetadata?: { installmentNumber?: number; totalInstallments?: number; billId?: string | null } | null }

export type SyncedItem = {
  itemId: string
  banco: string
  status: string
  accounts: { id: string; nome: string; tipo: 'conta' | 'cartao'; saldo: number; limite: number; limite_disponivel: number; vencimento_dia: number; fechamento_dia: number }[]
  bills: { id: string; accountId: string; dueDate: string; total: number }[]
  investments: { id: string; nome: string; tipo: string; valor_atual: number; aportado: number }[]
  transactions: { id: string; accountId: string; data: string; titulo: string; valor: number; tipo: 'receita' | 'despesa'; pendente: boolean; categoria: string; parcela: string; billId: string }[]
}

type CursorPage<T> = { results: T[]; next?: string | null }

/** /transactions foi descontinuado: usa /v2/transactions com paginação por cursor (`next` já vem como query string). */
async function allTransactions(accountId: string, from: string) {
  const id = encodeURIComponent(accountId)
  const out: PluggyTransaction[] = []
  let query: string | null = `?accountId=${id}&dateFrom=${from}`
  for (let page = 0; query && page < 40; page += 1) {
    const data: CursorPage<PluggyTransaction> = await call<CursorPage<PluggyTransaction>>(`/v2/transactions${query}`)
    out.push(...data.results)
    const next: string | null | undefined = data.next
    query = next ? (next.startsWith('?') ? next : `?${next}`) : null
  }
  return out.filter(tx => String(tx.date).slice(0, 10) >= from)
}

const INVESTMENT_TYPE: Record<string, string> = { FIXED_INCOME: 'Renda fixa', MUTUAL_FUND: 'Fundo', EQUITY: 'Ações', ETF: 'ETF', COE: 'COE', SECURITY: 'Previdência', OTHER: 'Investimento' }

async function allInvestments(itemId: string) {
  const out: PluggyInvestment[] = []
  for (let page = 1; page <= 10; page += 1) {
    const data = await call<Paged<PluggyInvestment>>(`/investments?itemId=${encodeURIComponent(itemId)}&pageSize=500&page=${page}`)
    out.push(...data.results)
    if (page >= (data.totalPages || 1)) break
  }
  return out
}

export async function syncItem(itemId: string, from: string): Promise<SyncedItem> {
  const item = await call<PluggyItem>(`/items/${encodeURIComponent(itemId)}`)
  const base: SyncedItem = { itemId, banco: item.connector?.name || 'Banco', status: item.status || 'UNKNOWN', accounts: [], bills: [], investments: [], transactions: [] }
  if (item.status && !['UPDATED', 'PARTIAL_SUCCESS'].includes(item.status)) return base
  try {
    for (const inv of await allInvestments(itemId)) {
      const atual = Number(inv.balance ?? inv.value ?? inv.amount ?? 0)
      const aportado = Number(inv.amountOriginal ?? (inv.amountProfit != null ? atual - Number(inv.amountProfit) : atual))
      base.investments.push({ id: inv.id, nome: String(inv.name || inv.code || 'Investimento'), tipo: INVESTMENT_TYPE[String(inv.type || '')] || 'Investimento', valor_atual: atual, aportado: aportado > 0 ? aportado : atual })
    }
  } catch { /* investimentos são opcionais: o banco pode não ter ou a Pluggy pode recusar */ }
  const accounts = await call<Paged<PluggyAccount>>(`/accounts?itemId=${encodeURIComponent(itemId)}`)
  for (const account of accounts.results) {
    const credit = account.type === 'CREDIT'
    base.accounts.push({
      id: account.id,
      nome: [item.connector?.name, account.name].filter(Boolean).join(' · ') || 'Conta',
      tipo: credit ? 'cartao' : 'conta',
      saldo: Number(account.balance || 0),
      limite: Number(account.creditData?.creditLimit || 0),
      limite_disponivel: Number(account.creditData?.availableCreditLimit || 0),
      vencimento_dia: Number(String(account.creditData?.balanceDueDate || '').slice(8, 10)) || 0,
      fechamento_dia: Number(String(account.creditData?.balanceCloseDate || '').slice(8, 10)) || 0,
    })
    if (credit) {
      try {
        const bills = await call<Paged<PluggyBill>>(`/bills?accountId=${encodeURIComponent(account.id)}`)
        for (const bill of bills.results) if (bill.dueDate && bill.totalAmount != null) base.bills.push({ id: bill.id, accountId: account.id, dueDate: String(bill.dueDate).slice(0, 10), total: Math.abs(Number(bill.totalAmount)) })
      } catch { /* faturas são opcionais: sem elas, a fatura aberta soma as compras da janela */ }
    }
    for (const tx of await allTransactions(account.id, from)) {
      const credit_in = tx.type === 'CREDIT'
      // Em cartão a Pluggy manda compras como DEBIT; pagamentos/estornos como CREDIT.
      base.transactions.push({
        id: tx.id,
        accountId: account.id,
        data: String(tx.date).slice(0, 10),
        titulo: String(tx.description || tx.descriptionRaw || 'Sem descrição').trim(),
        valor: Math.abs(Number(tx.amount || 0)),
        tipo: credit_in ? 'receita' : 'despesa',
        pendente: tx.status === 'PENDING',
        categoria: String(tx.category || ''),
        billId: String(tx.creditCardMetadata?.billId || ''),
        parcela: tx.creditCardMetadata?.totalInstallments ? `${tx.creditCardMetadata.installmentNumber || 1}/${tx.creditCardMetadata.totalInstallments}` : '',
      })
    }
  }
  return base
}
