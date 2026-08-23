import { dateKey, emptyState, normalizeState, type LegacyTask, type MaiState } from './state-model'
import { loadLocalState, saveLocalState } from './storage'
import { queueRemoteSync } from './sync'

export type { LegacyTask, MaiState } from './state-model'
export type { SyncPhase, SyncStatus } from './sync'
export { dateKey, emptyState, normalizeState }
export { flushRemoteSync, getSyncStatus, hydrateRemoteState, subscribeSyncStatus } from './sync'

type Row = Record<string, any>
type PendingRepeatTransition = { from: string; to: string; rule: string; completedAt: string }

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
let pendingRepeatTransition: PendingRepeatTransition | null = null

function calculateNextRepeat(value: string, rule: string) {
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

function resetEmbeddedSubtasks(value: unknown): unknown[] {
  return rows(value).map(subtask => ({
    ...subtask,
    concluida: false,
    concluida_em: '',
    subtarefas: resetEmbeddedSubtasks(subtask.subtarefas),
  }))
}

function reconcileRecurringTaskCompletions(previous: MaiState, candidate: MaiState): MaiState {
  const previousById = new Map(previous.tasks.map(task => [String(task.id), task]))
  const history = rows(candidate.taskCompletions)
  const replacements = new Map<string, LegacyTask>()
  const completedRoots = new Set<string>()
  let nextHistory = [...history]
  let changed = false

  candidate.tasks.forEach(task => {
    const id = String(task.id)
    const before = previousById.get(id)
    const rule = String(task.repeticao || before?.repeticao || '')
    const currentDue = String(task.data_vencimento || '')
    const beforeDue = String(before?.data_vencimento || '')
    if (!rule) return

    const completedNormally = task.concluida === true && Boolean(currentDue)
    const advancedByLegacyToggle = Boolean(
      pendingRepeatTransition &&
      before &&
      before.concluida !== true &&
      task.concluida !== true &&
      String(before.repeticao || '') === pendingRepeatTransition.rule &&
      beforeDue === pendingRepeatTransition.from &&
      currentDue === pendingRepeatTransition.to
    )
    if (!completedNormally && !advancedByLegacyToggle) return

    const source = (advancedByLegacyToggle && before ? before : task) as LegacyTask
    const occurrenceDue = String(source.data_vencimento || beforeDue || currentDue)
    if (!occurrenceDue) return
    const completedAt = String(task.concluida_em || pendingRepeatTransition?.completedAt || new Date().toISOString())

    if (!source.parent_id) {
      const completionKey = `${id}|${occurrenceDue}`
      const alreadyRecorded = nextHistory.some(entry => `${String(entry.task_id || '')}|${String(entry.data_vencimento || entry.data || '')}` === completionKey)
      if (!alreadyRecorded) {
        nextHistory = [...nextHistory, {
          id: `tc:${id}:${occurrenceDue}`,
          task_id: id,
          data: occurrenceDue.slice(0, 10),
          data_vencimento: occurrenceDue,
          concluida_em: completedAt,
          titulo: String(source.titulo || task.titulo || 'Tarefa'),
          projeto_id: String(source.projeto_id || task.projeto_id || 'entrada'),
          prioridade: Number(source.prioridade || task.prioridade || 4),
          repeticao: rule,
          snapshot: { ...source, concluida: false, concluida_em: '' },
        }]
      }
    }

    const nextDue = advancedByLegacyToggle ? currentDue : calculateNextRepeat(occurrenceDue, rule)
    replacements.set(id, {
      ...task,
      data_vencimento: nextDue,
      concluida: false,
      concluida_em: '',
      subtarefas: resetEmbeddedSubtasks(task.subtarefas),
    })
    completedRoots.add(id)
    changed = true
  })

  if (!changed) return candidate

  const resetDescendants = new Set<string>()
  let added = true
  while (added) {
    added = false
    candidate.tasks.forEach(task => {
      const id = String(task.id)
      const parentId = String(task.parent_id || '')
      if (!parentId || resetDescendants.has(id) || completedRoots.has(id)) return
      if (completedRoots.has(parentId) || resetDescendants.has(parentId)) {
        resetDescendants.add(id)
        added = true
      }
    })
  }

  return {
    ...candidate,
    taskCompletions: nextHistory,
    tasks: candidate.tasks.map(task => {
      const replacement = replacements.get(String(task.id))
      if (replacement) return replacement
      if (resetDescendants.has(String(task.id))) return { ...task, concluida: false, concluida_em: '' }
      return task
    }),
  }
}

export function loadState(): MaiState {
  const loaded = loadLocalState()
  const repaired = reconcileRecurringTaskCompletions(emptyState(), loaded)
  pendingRepeatTransition = null
  if (repaired === loaded) return loaded
  const migrated = normalizeState({
    ...repaired,
    version: Number(repaired.version || 0) + 1,
    meta: { ...(repaired.meta || {}), updatedAt: new Date().toISOString() },
  })
  saveLocalState(migrated)
  queueRemoteSync(migrated)
  return migrated
}

export function persistState(state: MaiState): MaiState {
  const previous = loadLocalState()
  const reconciled = reconcileRecurringTaskCompletions(previous, state)
  pendingRepeatTransition = null
  const next: MaiState = normalizeState({
    ...reconciled,
    version: Number(reconciled.version || 0) + 1,
    meta: { ...(reconciled.meta || {}), updatedAt: new Date().toISOString() },
  })
  saveLocalState(next)
  queueRemoteSync(next)
  return next
}

export function nextRepeat(value: string, rule: string) {
  const next = calculateNextRepeat(value, rule)
  if (next && next !== value) {
    pendingRepeatTransition = { from: value, to: next, rule, completedAt: new Date().toISOString() }
  }
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
