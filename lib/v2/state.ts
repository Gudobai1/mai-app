import { createClient } from '@supabase/supabase-js'

export type LegacyTask = {
  id: string
  titulo: string
  descricao?: string
  data_vencimento?: string
  prioridade?: number
  concluida?: boolean
  projeto_id?: string
  criado_em?: string
  concluida_em?: string
  ordem?: number
  notas?: unknown[]
  anexos?: unknown[]
  subtarefas?: unknown[]
  repeticao?: string
  secao?: string
  ocultar_agenda?: boolean
}

export type MaiState = {
  version: number
  configs: { calendarios: string[]; [key: string]: unknown }
  tasks: LegacyTask[]
  projects: unknown[]
  habits: unknown[]
  habitEntries: unknown[]
  notes: unknown[]
  events: unknown[]
  eventCompletions: unknown[]
  finance: Record<string, unknown>
  goals: unknown[]
  goalCategories: unknown[]
  health: Record<string, unknown>
  drive: Record<string, unknown>
  meta: Record<string, unknown>
  [key: string]: unknown
}

export type SyncPhase = 'local' | 'loading' | 'syncing' | 'synced' | 'offline' | 'error'
export type SyncStatus = { phase: SyncPhase; message: string; at?: string }

const STORAGE_KEY = 'mai-faithful-port-state-v1'
const ACCESS_TOKEN_KEY = 'mai-supabase-access-token'
const REFRESH_TOKEN_KEY = 'mai-supabase-refresh-token'
const SYNC_DELAY = 450
const RETRY_DELAYS = [3_000, 10_000, 30_000]

let syncTimer: ReturnType<typeof setTimeout> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryAttempt = 0
let latestSnapshot: MaiState | null = null
let sending = false
let status: SyncStatus = { phase: 'local', message: 'Salvo neste dispositivo' }
const listeners = new Set<(next: SyncStatus) => void>()

export function dateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function emptyState(): MaiState {
  const now = new Date().toISOString()
  return {
    version: 1,
    configs: {
      calendarios: [],
      theme: 'light',
      todaySections: ['tasks', 'events', 'habits', 'finance', 'goals', 'health'],
      todayGroup: 'type',
      upcomingView: 'month',
    },
    tasks: [],
    projects: [],
    habits: [],
    habitEntries: [],
    notes: [],
    events: [],
    eventCompletions: [],
    finance: { transactions: [], categories: [], accounts: [], cards: [], fixed: [], fixedOccurrences: [] },
    goals: [],
    goalCategories: [],
    health: {
      trackers: [],
      library: [],
      diary: {},
      goals: { kcal: 2000, agua: 2500, p: 160, c: 250, g: 60, fibra: 30, sodio: 2000, acucar: 40, deitar: '22:30', horasIdeais: 8, rem: 90, profundo: 90 },
    },
    drive: { items: [] },
    meta: { createdAt: now, updatedAt: now },
  }
}

function rows(value: unknown) {
  return Array.isArray(value) ? value : []
}

export function normalizeState(value: unknown): MaiState {
  const saved = value && typeof value === 'object' ? value as Partial<MaiState> : {}
  const fallback = emptyState()
  const finance = saved.finance && typeof saved.finance === 'object' ? saved.finance : {}
  const health = saved.health && typeof saved.health === 'object' ? saved.health : {}
  const drive = saved.drive && typeof saved.drive === 'object' ? saved.drive : {}
  return {
    ...fallback,
    ...saved,
    version: Number(saved.version || fallback.version),
    configs: { ...fallback.configs, ...(saved.configs || {}), calendarios: rows(saved.configs?.calendarios).map(String) },
    tasks: rows(saved.tasks) as LegacyTask[],
    projects: rows(saved.projects),
    habits: rows(saved.habits),
    habitEntries: rows(saved.habitEntries),
    notes: rows(saved.notes),
    events: rows(saved.events),
    eventCompletions: rows(saved.eventCompletions),
    finance: {
      ...fallback.finance,
      ...finance,
      transactions: rows(finance.transactions),
      categories: rows(finance.categories),
      accounts: rows(finance.accounts),
      cards: rows(finance.cards),
      fixed: rows(finance.fixed),
      fixedOccurrences: rows(finance.fixedOccurrences),
    },
    goals: rows(saved.goals),
    goalCategories: rows(saved.goalCategories),
    health: {
      ...fallback.health,
      ...health,
      trackers: rows(health.trackers),
      library: rows(health.library),
      diary: health.diary && typeof health.diary === 'object' ? health.diary : {},
      goals: health.goals && typeof health.goals === 'object' ? health.goals : fallback.health.goals,
    },
    drive: { ...fallback.drive, ...drive, items: rows(drive.items) },
    meta: { ...fallback.meta, ...(saved.meta || {}) },
  }
}

export function loadState(): MaiState {
  if (typeof window === 'undefined') return emptyState()
  try {
    return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'))
  } catch {
    return emptyState()
  }
}

function setSyncStatus(next: SyncStatus) {
  status = next
  listeners.forEach(listener => listener(next))
}

export function subscribeSyncStatus(listener: (next: SyncStatus) => void) {
  listeners.add(listener)
  listener(status)
  return () => { listeners.delete(listener) }
}

export function getSyncStatus() {
  return status
}

async function refreshAccessToken() {
  if (typeof window === 'undefined') return ''
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!refreshToken || !url || !key) return ''
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken })
  if (error || !data.session) return ''
  localStorage.setItem(ACCESS_TOKEN_KEY, data.session.access_token)
  localStorage.setItem(REFRESH_TOKEN_KEY, data.session.refresh_token)
  return data.session.access_token
}

async function stateFetch(path: string, init: RequestInit = {}) {
  let token = localStorage.getItem(ACCESS_TOKEN_KEY) || ''
  if (!token) return null
  const run = (value: string) => fetch(path, {
    ...init,
    cache: 'no-store',
    headers: { ...(init.headers || {}), Authorization: `Bearer ${value}` },
  })
  let response = await run(token)
  if (response.status === 401) {
    token = await refreshAccessToken()
    if (token) response = await run(token)
  }
  return response
}

function remoteSnapshot(state: MaiState): MaiState {
  return {
    ...state,
    events: rows(state.events).filter((event: any) => event?.tipo !== 'google' && event?.tipo !== 'gcalendar' && event?.external_provider !== 'google'),
    drive: { ...(state.drive || {}), items: [] },
  }
}

function scheduleRetry() {
  if (!latestSnapshot || retryTimer) return
  const delay = RETRY_DELAYS[Math.min(retryAttempt, RETRY_DELAYS.length - 1)]
  retryAttempt += 1
  retryTimer = setTimeout(() => {
    retryTimer = null
    void flushRemoteSync()
  }, delay)
}

export async function flushRemoteSync() {
  if (typeof window === 'undefined' || sending || !latestSnapshot) return
  if (!navigator.onLine) {
    setSyncStatus({ phase: 'offline', message: 'Sem internet · alterações preservadas' })
    scheduleRetry()
    return
  }
  const snapshot = latestSnapshot
  sending = true
  setSyncStatus({ phase: 'syncing', message: 'Sincronizando…' })
  try {
    const response = await stateFetch('/api/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: remoteSnapshot(snapshot) }),
    })
    if (!response) {
      setSyncStatus({ phase: 'local', message: 'Salvo neste dispositivo' })
      return
    }
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Falha ao sincronizar')
    const payload = await response.json().catch(() => ({}))
    if (latestSnapshot === snapshot) latestSnapshot = null
    retryAttempt = 0
    setSyncStatus({ phase: 'synced', message: 'Tudo salvo', at: payload.updated_at || new Date().toISOString() })
  } catch {
    setSyncStatus({ phase: navigator.onLine ? 'error' : 'offline', message: navigator.onLine ? 'Não foi possível sincronizar' : 'Sem internet · alterações preservadas' })
    scheduleRetry()
  } finally {
    sending = false
    if (latestSnapshot && latestSnapshot !== snapshot) void flushRemoteSync()
  }
}

function queueRemoteSync(snapshot: MaiState) {
  if (typeof window === 'undefined') return
  latestSnapshot = snapshot
  if (!localStorage.getItem(ACCESS_TOKEN_KEY)) {
    setSyncStatus({ phase: 'local', message: 'Salvo neste dispositivo' })
    return
  }
  setSyncStatus({ phase: navigator.onLine ? 'syncing' : 'offline', message: navigator.onLine ? 'Aguardando sincronização…' : 'Sem internet · alterações preservadas' })
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    void flushRemoteSync()
  }, SYNC_DELAY)
}

function stateTimestamp(state: MaiState) {
  const timestamp = Date.parse(String(state.meta?.updatedAt || ''))
  return Number.isFinite(timestamp) ? timestamp : 0
}

export async function hydrateRemoteState(local: MaiState): Promise<MaiState> {
  if (typeof window === 'undefined' || !localStorage.getItem(ACCESS_TOKEN_KEY)) return local
  // A fresh browser receives an in-memory empty state with a current timestamp.
  // It must never win over the real cloud state just because it was created later.
  const hadLocalSnapshot = localStorage.getItem(STORAGE_KEY) !== null
  if (!navigator.onLine) {
    setSyncStatus({ phase: 'offline', message: 'Sem internet · usando dados deste dispositivo' })
    return local
  }
  setSyncStatus({ phase: 'loading', message: 'Carregando seus dados…' })
  try {
    const response = await stateFetch('/api/state')
    if (!response) return local
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Falha ao carregar')
    const payload = await response.json()
    if (!payload?.data) {
      queueRemoteSync(local)
      return local
    }
    const remote = normalizeState(payload.data)
    const remoteAt = Math.max(Date.parse(String(payload.updated_at || '')) || 0, stateTimestamp(remote))
    if (hadLocalSnapshot && stateTimestamp(local) > remoteAt) {
      queueRemoteSync(local)
      return local
    }
    const cachedEvents = rows(local.events).filter((event: any) => event?.tipo === 'google' || event?.tipo === 'gcalendar' || event?.external_provider === 'google')
    const next = { ...remote, events: [...rows(remote.events), ...cachedEvents] }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setSyncStatus({ phase: 'synced', message: 'Tudo salvo', at: payload.updated_at })
    return next
  } catch {
    setSyncStatus({ phase: 'error', message: 'Não foi possível carregar a nuvem' })
    return local
  }
}

export function persistState(state: MaiState): MaiState {
  const next: MaiState = normalizeState({
    ...state,
    version: Number(state.version || 0) + 1,
    meta: { ...(state.meta || {}), updatedAt: new Date().toISOString() },
  })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  queueRemoteSync(next)
  return next
}

export function nextRepeat(value: string, rule: string) {
  if (!value || !rule) return value
  const hasTime = value.includes('T')
  const date = new Date(hasTime ? value : `${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  if (rule === 'diariamente') date.setDate(date.getDate() + 1)
  else if (rule === 'semanalmente') date.setDate(date.getDate() + 7)
  else if (rule === 'mensalmente') date.setMonth(date.getMonth() + 1)
  else if (rule === 'anualmente') date.setFullYear(date.getFullYear() + 1)
  else if (rule.startsWith('intervalo:')) date.setDate(date.getDate() + Math.max(1, Number(rule.split(':')[1]) || 1))
  else if (rule.startsWith('semanal:')) {
    const days = rule.split(':')[1].split(',').map(Number)
    let amount = 1
    while (amount <= 7 && !days.includes((date.getDay() + amount) % 7)) amount += 1
    date.setDate(date.getDate() + amount)
  }
  const next = dateKey(date)
  return hasTime ? `${next}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` : next
}

export function createTask(title: string): LegacyTask {
  return {
    id: `t-${crypto.randomUUID()}`,
    titulo: title.trim(),
    descricao: '',
    data_vencimento: dateKey(),
    prioridade: 4,
    concluida: false,
    projeto_id: 'entrada',
    criado_em: new Date().toISOString(),
    ordem: Date.now(),
    notas: [],
    anexos: [],
    subtarefas: [],
    repeticao: '',
    secao: '',
    ocultar_agenda: false,
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (latestSnapshot) void flushRemoteSync()
  })
  window.addEventListener('offline', () => setSyncStatus({ phase: 'offline', message: 'Sem internet · alterações preservadas' }))
}
