import {
  createStatelessSupabaseClient,
  readSupabaseAccessToken,
  readSupabaseRefreshToken,
  saveSupabaseSession,
} from '../supabase/browser'
import { hasLocalState, saveLocalState } from './storage'
import { normalizeState, stateRows, stateTimestamp, type MaiState } from './state-model'

export type SyncPhase = 'local' | 'loading' | 'syncing' | 'synced' | 'offline' | 'error'
export type SyncStatus = { phase: SyncPhase; message: string; at?: string }

const SYNC_DELAY = 450
const RETRY_DELAYS = [3_000, 10_000, 30_000]

let syncTimer: ReturnType<typeof setTimeout> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryAttempt = 0
let latestSnapshot: MaiState | null = null
let sending = false
let status: SyncStatus = { phase: 'local', message: 'Salvo neste dispositivo' }
const listeners = new Set<(next: SyncStatus) => void>()

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
  const refreshToken = readSupabaseRefreshToken()
  const supabase = createStatelessSupabaseClient()
  if (!refreshToken || !supabase) return ''

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken })
  if (error || !data.session) return ''
  saveSupabaseSession(data.session)
  return data.session.access_token
}

async function stateFetch(path: string, init: RequestInit = {}) {
  let token = readSupabaseAccessToken()
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
    events: stateRows(state.events).filter((event: any) => event?.tipo !== 'google' && event?.tipo !== 'gcalendar' && event?.external_provider !== 'google'),
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
    setSyncStatus({
      phase: navigator.onLine ? 'error' : 'offline',
      message: navigator.onLine ? 'Não foi possível sincronizar' : 'Sem internet · alterações preservadas',
    })
    scheduleRetry()
  } finally {
    sending = false
    if (latestSnapshot && latestSnapshot !== snapshot) void flushRemoteSync()
  }
}

export function queueRemoteSync(snapshot: MaiState) {
  if (typeof window === 'undefined') return
  latestSnapshot = snapshot
  if (!readSupabaseAccessToken()) {
    setSyncStatus({ phase: 'local', message: 'Salvo neste dispositivo' })
    return
  }

  setSyncStatus({
    phase: navigator.onLine ? 'syncing' : 'offline',
    message: navigator.onLine ? 'Aguardando sincronização…' : 'Sem internet · alterações preservadas',
  })
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    void flushRemoteSync()
  }, SYNC_DELAY)
}

export async function hydrateRemoteState(local: MaiState): Promise<MaiState> {
  if (typeof window === 'undefined' || !readSupabaseAccessToken()) return local

  // A fresh browser receives an in-memory empty state with a current timestamp.
  // It must never win over the real cloud state just because it was created later.
  const hadLocalSnapshot = hasLocalState()
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

    const cachedEvents = stateRows(local.events).filter((event: any) => event?.tipo === 'google' || event?.tipo === 'gcalendar' || event?.external_provider === 'google')
    const next = { ...remote, events: [...stateRows(remote.events), ...cachedEvents] }
    saveLocalState(next)
    setSyncStatus({ phase: 'synced', message: 'Tudo salvo', at: payload.updated_at })
    return next
  } catch {
    setSyncStatus({ phase: 'error', message: 'Não foi possível carregar a nuvem' })
    return local
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (latestSnapshot) void flushRemoteSync()
  })
  window.addEventListener('offline', () => setSyncStatus({ phase: 'offline', message: 'Sem internet · alterações preservadas' }))
}
