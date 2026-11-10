'use client'

/**
 * Aparência personalizável (docs/PADROES.md, "Aparência"): pacote de ícones, grossura, cantos, fonte e cor de destaque.
 * Fica em `state.configs.appearance`; `applyAppearance` joga o valor no app inteiro (variáveis CSS + este mesmo estado, que o `Icon` lê).
 */
export type IconPack = 'lucide' | 'outlined' | 'sharp' | 'rounded'
export type Appearance = { iconPack: IconPack; weight: number; corners: 'round' | 'square'; font: string; accent: string }

export const DEFAULT_APPEARANCE: Appearance = { iconPack: 'lucide', weight: 1.5, corners: 'square', font: 'system', accent: '' }

export const ICON_PACKS: { id: IconPack; label: string; hint: string }[] = [
  { id: 'lucide', label: 'Linhas', hint: 'Traço contínuo, leve' },
  { id: 'outlined', label: 'Contorno', hint: 'Material, contorno' },
  { id: 'sharp', label: 'Reto', hint: 'Material, cantos vivos' },
  { id: 'rounded', label: 'Suave', hint: 'Material, cantos redondos' },
]

const SYSTEM_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
export const FONTS: { id: string; label: string; family?: string; google?: string }[] = [
  { id: 'system', label: 'Padrão do sistema' },
  { id: 'inter', label: 'Inter', family: 'Inter', google: 'Inter:wght@400;500;600;700' },
  { id: 'manrope', label: 'Manrope', family: 'Manrope', google: 'Manrope:wght@400;500;600;700' },
  { id: 'dmsans', label: 'DM Sans', family: 'DM Sans', google: 'DM+Sans:wght@400;500;600;700' },
  { id: 'plex', label: 'IBM Plex Sans', family: 'IBM Plex Sans', google: 'IBM+Plex+Sans:wght@400;500;600;700' },
  { id: 'grotesk', label: 'Space Grotesk', family: 'Space Grotesk', google: 'Space+Grotesk:wght@400;500;600;700' },
  { id: 'worksans', label: 'Work Sans', family: 'Work Sans', google: 'Work+Sans:wght@400;500;600;700' },
  { id: 'serif', label: 'Source Serif', family: 'Source Serif 4', google: 'Source+Serif+4:wght@400;500;600;700' },
  { id: 'mono', label: 'JetBrains Mono', family: 'JetBrains Mono', google: 'JetBrains+Mono:wght@400;500;600;700' },
]

export function normalizeAppearance(raw: unknown): Appearance {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<Appearance>
  const pack = ICON_PACKS.some(item => item.id === value.iconPack) ? (value.iconPack as IconPack) : DEFAULT_APPEARANCE.iconPack
  const weight = Math.min(2.5, Math.max(1, Number(value.weight) || DEFAULT_APPEARANCE.weight))
  return {
    iconPack: pack,
    weight,
    corners: value.corners === 'round' ? 'round' : 'square',
    font: FONTS.some(item => item.id === value.font) ? String(value.font) : 'system',
    accent: /^#[0-9a-f]{6}$/i.test(String(value.accent || '')) ? String(value.accent) : '',
  }
}

/* Estado lido pelo Icon (useSyncExternalStore). */
let current: Appearance = DEFAULT_APPEARANCE
const listeners = new Set<() => void>()
export const getAppearance = () => current
export const subscribeAppearance = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

/** Peso do traço (1–2,5) vira a espessura da fonte Material (200–500). */
export const materialWeight = (weight: number) => Math.round(Math.min(500, Math.max(200, 100 + weight * 133)) / 50) * 50
export const MATERIAL_FAMILY: Record<Exclude<IconPack, 'lucide'>, string> = { outlined: 'Material Symbols Outlined', sharp: 'Material Symbols Sharp', rounded: 'Material Symbols Rounded' }

function loadFont(id: string, href: string) {
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function applyAppearance(raw: unknown) {
  const next = normalizeAppearance(raw)
  const root = document.documentElement
  const changed = JSON.stringify(next) !== JSON.stringify(current)
  current = next
  if (next.iconPack !== 'lucide') {
    const name = next.iconPack === 'sharp' ? 'Material+Symbols+Sharp' : 'Material+Symbols+Rounded'
    if (next.iconPack !== 'outlined') loadFont(`mai-icons-${next.iconPack}`, `https://fonts.googleapis.com/css2?family=${name}:opsz,wght,FILL,GRAD@20..24,200..500,0..1,0&display=swap`)
  }
  const font = FONTS.find(item => item.id === next.font)
  if (font?.family && font.google) {
    loadFont(`mai-font-${font.id}`, `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`)
    root.style.setProperty('--ds-font', `'${font.family}', ${SYSTEM_STACK}`)
    root.dataset.maiFont = font.id
  } else {
    root.style.removeProperty('--ds-font')
    delete root.dataset.maiFont
  }
  if (next.accent) {
    root.style.setProperty('--ds-accent', next.accent)
    root.style.setProperty('--ds-accent-strong', `color-mix(in srgb, ${next.accent} 80%, black)`)
    root.style.setProperty('--ds-accent-soft', `color-mix(in srgb, ${next.accent} 16%, transparent)`)
    root.style.setProperty('--ds-on-accent', luminance(next.accent) > 0.6 ? '#111111' : '#FFFFFF')
  } else {
    for (const key of ['--ds-accent', '--ds-accent-strong', '--ds-accent-soft', '--ds-on-accent']) root.style.removeProperty(key)
  }
  if (changed) listeners.forEach(listener => listener())
}
