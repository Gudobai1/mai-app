export type LegacyTask = {
  id: string
  titulo: string
  descricao?: string
  data_vencimento?: string
  prioridade?: number
  concluida?: boolean
  projeto_id?: string
  parent_id?: string
  criado_em?: string
  concluida_em?: string
  ordem?: number
  notas?: unknown[]
  anexos?: unknown[]
  subtarefas?: unknown[]
  lembretes?: unknown[]
  etiquetas?: string[]
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

const NEW_TODAY_SECTIONS = ['summary', 'flow', 'goals', 'notes', 'health']
const TODAY_BLOCKS = ['habits', 'goals', 'notes', 'finance', 'health']
const DEFAULT_SIDE = ['habits', 'goals', 'notes', 'finance', 'health']

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
      accentPalette: 'sage',
      lastView: 'home',
      taskModuleScope: 'entrada',
      sidebarProjectsOpen: true,
      todayFilters: { project: 'all', priority: 'all', status: 'open', overdueOnly: false },
      todaySections: [...NEW_TODAY_SECTIONS],
      todayMainSections: [],
      todaySideSections: [...DEFAULT_SIDE],
      todayHiddenSections: [],
      todayGroup: 'type',
      upcomingView: 'list',
      upcomingFilters: { tasks: true, events: true, project: 'all', priority: 'all' },
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

export function stateRows(value: unknown) {
  return Array.isArray(value) ? value : []
}

function normalizeTodaySections(value: unknown) {
  const saved = stateRows(value).map(String)
  const usesNewLayout = saved.some(item => ['summary', 'flow', 'notes'].includes(item))
  if (!usesNewLayout) return [...NEW_TODAY_SECTIONS]
  const allowed = new Set(NEW_TODAY_SECTIONS)
  const next = saved.filter(item => allowed.has(item))
  return next.length ? next : [...NEW_TODAY_SECTIONS]
}

function normalizeSideBlocks(value: unknown) {
  const allowed = new Set(TODAY_BLOCKS)
  const saved = stateRows(value).map(String).filter(item => allowed.has(item))
  const migrated = saved.length ? saved : DEFAULT_SIDE
  if (!migrated.includes('habits')) migrated.unshift('habits')
  return [...new Set(migrated)]
}

export function normalizeState(value: unknown): MaiState {
  const saved = value && typeof value === 'object' ? value as Partial<MaiState> : {}
  const fallback = emptyState()
  const finance = saved.finance && typeof saved.finance === 'object' ? saved.finance : {}
  const health = saved.health && typeof saved.health === 'object' ? saved.health : {}
  const drive = saved.drive && typeof saved.drive === 'object' ? saved.drive : {}
  const legacySections = normalizeTodaySections(saved.configs?.todaySections)
  const sideSections = normalizeSideBlocks(saved.configs?.todaySideSections)
  const hiddenSections = stateRows(saved.configs?.todayHiddenSections).map(String).filter(item => TODAY_BLOCKS.includes(item))
  return {
    ...fallback,
    ...saved,
    version: Number(saved.version || fallback.version),
    configs: {
      ...fallback.configs,
      ...(saved.configs || {}),
      calendarios: stateRows(saved.configs?.calendarios).map(String),
      todaySections: legacySections,
      todayMainSections: [],
      todaySideSections: sideSections,
      todayHiddenSections: [...new Set(hiddenSections)],
      accentPalette: String(saved.configs?.accentPalette || 'sage'),
      upcomingView: saved.configs?.upcomingView === 'month' ? 'month' : 'list',
      taskModuleScope: String(saved.configs?.taskModuleScope || 'entrada'),
      upcomingFilters: saved.configs?.upcomingFilters && typeof saved.configs.upcomingFilters === 'object' ? saved.configs.upcomingFilters : fallback.configs.upcomingFilters,
    },
    tasks: stateRows(saved.tasks) as LegacyTask[],
    projects: stateRows(saved.projects),
    habits: stateRows(saved.habits),
    habitEntries: stateRows(saved.habitEntries),
    notes: stateRows(saved.notes),
    events: stateRows(saved.events),
    eventCompletions: stateRows(saved.eventCompletions),
    finance: {
      ...fallback.finance,
      ...finance,
      transactions: stateRows(finance.transactions),
      categories: stateRows(finance.categories),
      accounts: stateRows(finance.accounts),
      cards: stateRows(finance.cards),
      fixed: stateRows(finance.fixed),
      fixedOccurrences: stateRows(finance.fixedOccurrences),
    },
    goals: stateRows(saved.goals),
    goalCategories: stateRows(saved.goalCategories),
    health: {
      ...fallback.health,
      ...health,
      trackers: stateRows(health.trackers),
      library: stateRows(health.library),
      diary: health.diary && typeof health.diary === 'object' ? health.diary : {},
      goals: health.goals && typeof health.goals === 'object' ? health.goals : fallback.health.goals,
    },
    drive: { ...fallback.drive, ...drive, items: stateRows(drive.items) },
    meta: { ...fallback.meta, ...(saved.meta || {}) },
  }
}

export function stateTimestamp(state: MaiState) {
  const timestamp = Date.parse(String(state.meta?.updatedAt || ''))
  return Number.isFinite(timestamp) ? timestamp : 0
}
