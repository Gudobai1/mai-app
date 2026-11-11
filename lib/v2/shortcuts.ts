/**
 * Atalhos de teclado do app (desktop). Regra única: lista, padrões e leitura da configuração.
 * Config em `state.configs.shortcuts` ({ newTask, search, settings }); cada valor é UMA tecla sem modificadores
 * ('' = desligado). Ctrl+Espaço (busca), Ctrl+Z (desfazer) e Esc (fechar) são fixos.
 */
export type ShortcutId = 'newTask' | 'search' | 'settings'
export type Shortcuts = Record<ShortcutId, string>

export const SHORTCUT_ACTIONS: { id: ShortcutId; label: string; hint: string }[] = [
  { id: 'newTask', label: 'Novo item do módulo aberto', hint: 'Cria tarefa, hábito, meta, nota ou lançamento, conforme a tela.' },
  { id: 'search', label: 'Pesquisar', hint: 'Abre a busca no centro da tela.' },
  { id: 'settings', label: 'Abrir configurações', hint: 'Abre esta janela de configurações.' },
]
export const DEFAULT_SHORTCUTS: Shortcuts = { newTask: 'q', search: 'f', settings: '' }
export const FIXED_SHORTCUTS = [
  { keys: 'Ctrl + Espaço', label: 'Pesquisar (sempre ativo)' },
  { keys: 'Ctrl + Z', label: 'Desfazer a última ação' },
  { keys: 'Esc', label: 'Fechar janela ou busca' },
]

const valid = (value: unknown) => typeof value === 'string' && (value.length === 1 && /^[a-z0-9,./;'[\]\\-]$/i.test(value))

export function normalizeShortcuts(raw: unknown): Shortcuts {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = { ...DEFAULT_SHORTCUTS }
  const used = new Set<string>()
  for (const action of SHORTCUT_ACTIONS) {
    const item = value[action.id]
    const key = item === '' ? '' : valid(item) ? String(item).toLowerCase() : DEFAULT_SHORTCUTS[action.id]
    if (key && used.has(key)) { out[action.id] = ''; continue }
    if (key) used.add(key)
    out[action.id] = key
  }
  return out
}

export const shortcutLabel = (key: string) => (key ? key.toUpperCase() : '')

/** Qual ação a tecla dispara (só sem Ctrl/Cmd/Alt). */
export function matchShortcut(event: KeyboardEvent, shortcuts: Shortcuts): ShortcutId | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return null
  const key = event.key.toLowerCase()
  return SHORTCUT_ACTIONS.find(action => shortcuts[action.id] && shortcuts[action.id] === key)?.id || null
}
