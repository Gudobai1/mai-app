export type LegacyTask = {
  id: string
  titulo: string
  descricao?: string
  data_vencimento?: string
  prioridade?: number
  concluida?: boolean
  projeto_id?: string
  criado_em?: string
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

const STORAGE_KEY = 'mai-faithful-port-state-v1'
let syncTimer: ReturnType<typeof setTimeout> | null = null

export function dateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function emptyState(): MaiState {
  return {
    version: 1,
    configs: { calendarios: [] },
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
    health: { trackers: [], library: [], diary: {}, goals: {} },
    drive: { items: [] },
    meta: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  }
}

export function loadState(): MaiState {
  if (typeof window === 'undefined') return emptyState()
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (!saved || typeof saved !== 'object') return emptyState()
    return {
      ...emptyState(),
      ...saved,
      configs: { calendarios: [], ...(saved.configs || {}) },
      tasks: Array.isArray(saved.tasks) ? saved.tasks : [],
    }
  } catch {
    return emptyState()
  }
}

function queueRemoteSync(snapshot: MaiState) {
  if (typeof window === 'undefined') return
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(async () => {
    const token = localStorage.getItem('mai-supabase-access-token')
    if (!token) return
    try {
      await fetch('/api/state', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ data: snapshot }),
      })
    } catch {
      // A alteração já está segura localmente; a próxima gravação tenta sincronizar novamente.
    }
  }, 350)
}

export function persistState(state: MaiState): MaiState {
  const next: MaiState = {
    ...state,
    version: Number(state.version || 0) + 1,
    meta: {
      ...(state.meta || {}),
      updatedAt: new Date().toISOString(),
    },
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  queueRemoteSync(next)
  return next
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
