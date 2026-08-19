import { dateKey, emptyState, normalizeState, type LegacyTask, type MaiState } from './state-model'
import { loadLocalState, saveLocalState } from './storage'
import { queueRemoteSync } from './sync'

export type { LegacyTask, MaiState } from './state-model'
export type { SyncPhase, SyncStatus } from './sync'
export { dateKey, emptyState, normalizeState }
export { flushRemoteSync, getSyncStatus, hydrateRemoteState, subscribeSyncStatus } from './sync'

export function loadState(): MaiState {
  return loadLocalState()
}

export function persistState(state: MaiState): MaiState {
  const next: MaiState = normalizeState({
    ...state,
    version: Number(state.version || 0) + 1,
    meta: { ...(state.meta || {}), updatedAt: new Date().toISOString() },
  })
  saveLocalState(next)
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
