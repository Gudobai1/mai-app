/* Temas do MAI (baseados no Todoist) e modo Claro/Escuro/Sistema. */

export type ThemeId = 'todoist' | 'pedra-da-lua' | 'tangerina' | 'kale' | 'mirtilo' | 'lavanda' | 'framboesa'
export type ThemeMode = 'light' | 'dark' | 'system'

/* `color` é a cor de destaque no claro; `dark` no escuro (usadas nas prévias). */
export const THEMES: { id: ThemeId; label: string; color: string; dark: string }[] = [
  { id: 'todoist', label: 'Todoist', color: '#DC4C3E', dark: '#E8685B' },
  { id: 'pedra-da-lua', label: 'Pedra da lua', color: '#4F5B70', dark: '#8B97AE' },
  { id: 'tangerina', label: 'Tangerina', color: '#C77300', dark: '#F0A030' },
  { id: 'kale', label: 'Kale', color: '#4F7F3F', dark: '#7DB36B' },
  { id: 'mirtilo', label: 'Mirtilo', color: '#3A6BB8', dark: '#6A9BE0' },
  { id: 'lavanda', label: 'Lavanda', color: '#7A68B8', dark: '#A596DB' },
  { id: 'framboesa', label: 'Framboesa', color: '#C94A6C', dark: '#E2708D' },
]

const LEGACY: Record<string, ThemeId> = { blue: 'mirtilo', teal: 'kale', green: 'kale', orange: 'tangerina', pink: 'framboesa', mono: 'pedra-da-lua', sage: 'todoist' }

export function normalizeTheme(value: unknown): ThemeId {
  const id = String(value || '')
  if (THEMES.some(item => item.id === id)) return id as ThemeId
  return LEGACY[id] || 'todoist'
}

export function normalizeMode(value: unknown): ThemeMode {
  return value === 'dark' || value === 'system' ? value : 'light'
}

export function prefersDark() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function isDarkMode(mode: unknown, systemDark = prefersDark()) {
  const resolved = normalizeMode(mode)
  return resolved === 'dark' || (resolved === 'system' && systemDark)
}
