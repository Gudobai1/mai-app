import { emptyState, normalizeState, type MaiState } from './state-model'

export const STATE_STORAGE_KEY = 'mai-faithful-port-state-v1'

export function hasLocalState() {
  return typeof window !== 'undefined' && localStorage.getItem(STATE_STORAGE_KEY) !== null
}

export function loadLocalState(): MaiState {
  if (typeof window === 'undefined') return emptyState()
  try {
    return normalizeState(JSON.parse(localStorage.getItem(STATE_STORAGE_KEY) || 'null'))
  } catch {
    return emptyState()
  }
}

export function saveLocalState(state: MaiState) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state))
}
