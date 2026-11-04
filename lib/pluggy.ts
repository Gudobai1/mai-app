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
  if (!response.ok) throw new Error(`Pluggy ${path.split('?')[0]} ${response.status}`)
  return response.json() as Promise<T>
}

export async function createConnectToken(updateItemId?: string) {
  const data = await call<{ accessToken: string }>('/connect_token', { method: 'POST', body: JSON.stringify(updateItemId ? { itemId: updateItemId } : {}) })
  return data.accessToken
}

type Paged<T> = { results: T[]; totalPages?: number; page?: number }
type PluggyItem = { id: string; status?: string; connector?: { name?: string; imageUrl?: string }; lastUpdatedAt?: string }
type PluggyAccount = { id: string; type?: string; subtype?: string; name?: string; number?: string; balance?: number; currencyCode?: string; creditData?: { availableCreditLimit?: number; creditLimit?: number } | null }
type PluggyTransaction = { id: string; accountId: string; date: string; description?: string; descriptionRaw?: string | null; type?: 'DEBIT' | 'CREDIT'; amount: number; status?: string; category?: string | null; creditCardMetadata?: { installmentNumber?: number; totalInstallments?: number } | null }

export type SyncedItem = {
  itemId: string
  banco: string
  status: string
  accounts: { id: string; nome: string; tipo: 'conta' | 'cartao'; saldo: number; limite: number; limite_disponivel: number }[]
  transactions: { id: string; accountId: string; data: string; titulo: string; valor: number; tipo: 'receita' | 'despesa'; pendente: boolean; categoria: string; parcela: string }[]
}

async function allTransactions(accountId: string, from: string) {
  const out: PluggyTransaction[] = []
  for (let page = 1; page <= 20; page += 1) {
    const data = await call<Paged<PluggyTransaction>>(`/transactions?accountId=${encodeURIComponent(accountId)}&from=${from}&pageSize=500&page=${page}`)
    out.push(...data.results)
    if (page >= (data.totalPages || 1)) break
  }
  return out
}

export async function syncItem(itemId: string, from: string): Promise<SyncedItem> {
  const item = await call<PluggyItem>(`/items/${encodeURIComponent(itemId)}`)
  const base: SyncedItem = { itemId, banco: item.connector?.name || 'Banco', status: item.status || 'UNKNOWN', accounts: [], transactions: [] }
  if (item.status && !['UPDATED', 'PARTIAL_SUCCESS'].includes(item.status)) return base
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
    })
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
        parcela: tx.creditCardMetadata?.totalInstallments ? `${tx.creditCardMetadata.installmentNumber || 1}/${tx.creditCardMetadata.totalInstallments}` : '',
      })
    }
  }
  return base
}
