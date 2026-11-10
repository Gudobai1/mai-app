/* Cores do Todoist (nomes em português) — usadas em projetos, hábitos, categorias etc. */
export type PaletteColor = { id: string; label: string; color: string }

export const PALETTE: PaletteColor[] = [
  { id: 'berry_red', label: 'Cereja', color: '#B8255F' },
  { id: 'red', label: 'Vermelho', color: '#DB4035' },
  { id: 'orange', label: 'Laranja', color: '#FF9933' },
  { id: 'yellow', label: 'Amarelo', color: '#FAD000' },
  { id: 'olive_green', label: 'Verde oliva', color: '#AFB83B' },
  { id: 'lime_green', label: 'Verde limão', color: '#7ECC49' },
  { id: 'green', label: 'Verde', color: '#299438' },
  { id: 'mint_green', label: 'Verde Menta', color: '#6ACCBC' },
  { id: 'teal', label: 'Azul petróleo', color: '#158FAD' },
  { id: 'sky_blue', label: 'Azul celeste', color: '#14AAF5' },
  { id: 'light_blue', label: 'Azul Claro', color: '#96C3EB' },
  { id: 'blue', label: 'Azul', color: '#4073FF' },
  { id: 'grape', label: 'Uva', color: '#884DFF' },
  { id: 'violet', label: 'Violeta', color: '#AF38EB' },
  { id: 'lavender', label: 'Lavanda', color: '#EB96EB' },
  { id: 'magenta', label: 'Magenta', color: '#E05194' },
  { id: 'salmon', label: 'Salmão', color: '#FF8D85' },
  { id: 'charcoal', label: 'Carvão', color: '#808080' },
  { id: 'grey', label: 'Cinza', color: '#B8B8B8' },
  { id: 'taupe', label: 'Taupe', color: '#CCAC93' },
]

/* Estilo das cores (Configurações → Aparência). Trocar o estilo regrava no app as cores que já eram da paleta (projetos, hábitos, categorias…) e muda as oferecidas nos seletores. */
export type ColorStyle = 'padrao' | 'pastel' | 'neon' | 'terroso' | 'profundo' | 'suave' | 'vivo' | 'retro' | 'sorvete' | 'quente' | 'frio' | 'desbotado'
export const COLOR_STYLES: { id: ColorStyle; label: string; hint: string }[] = [
  { id: 'padrao', label: 'Padrão', hint: 'Cores do Todoist' },
  { id: 'pastel', label: 'Pastel', hint: 'Claras e suaves' },
  { id: 'neon', label: 'Neon', hint: 'Vivas e saturadas' },
  { id: 'terroso', label: 'Terroso', hint: 'Foscas e naturais' },
  { id: 'profundo', label: 'Profundo', hint: 'Escuras e densas' },
  { id: 'suave', label: 'Suave', hint: 'Delicadas, meio-tom' },
  { id: 'vivo', label: 'Vivo', hint: 'Fortes e alegres' },
  { id: 'retro', label: 'Retrô', hint: 'Tom de revista antiga' },
  { id: 'sorvete', label: 'Sorvete', hint: 'Doces e claras' },
  { id: 'quente', label: 'Quente', hint: 'Do vermelho ao amarelo' },
  { id: 'frio', label: 'Frio', hint: 'Do verde-água ao violeta' },
  { id: 'desbotado', label: 'Desbotado', hint: 'Lavadas, discretas' },
]
function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min
  if (!d) return [0, 0, l]
  const sat = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, sat, l]
}
function fromHsl(h: number, sat: number, l: number) {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * sat, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return '#' + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
}
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const STYLE_FN: Record<ColorStyle, (h: number, s: number, l: number) => [number, number, number]> = {
  padrao: (h, s, l) => [h, s, l],
  pastel: h => [h, 0.7, 0.82],
  neon: h => [h, 1, 0.55],
  terroso: (h, _s, l) => [h, 0.32, clamp(l, 0.38, 0.5)],
  profundo: h => [h, 0.6, 0.28],
  suave: h => [h, 0.45, 0.62],
  vivo: h => [h, 0.9, 0.5],
  retro: h => [h + 15, 0.45, 0.5],
  sorvete: h => [h + 20, 0.85, 0.76],
  quente: h => [5 + (h / 360) * 55, 0.75, 0.52],
  frio: h => [170 + (h / 360) * 110, 0.65, 0.5],
  desbotado: h => [h, 0.2, 0.6],
}
const GRAY_SHIFT: Record<ColorStyle, number> = { padrao: 0, pastel: 0.12, neon: -0.1, terroso: 0.04, profundo: -0.18, suave: 0.06, vivo: -0.04, retro: 0.02, sorvete: 0.09, quente: -0.02, frio: -0.06, desbotado: 0.1 }
export function styleColor(hex: string, style: ColorStyle) {
  if (style === 'padrao' || !/^#[0-9a-f]{6}$/i.test(hex)) return hex
  const [h, sat, l] = toHsl(hex)
  if (sat < 0.05) return fromHsl(0, 0, clamp(l + GRAY_SHIFT[style], 0.05, 0.95))
  const [nh, ns, nl] = STYLE_FN[style](h, sat, l)
  return fromHsl(nh, ns, nl)
}
/** Regrava, em qualquer parte do estado, as cores que pertencem à paleta (de qualquer estilo) para o estilo escolhido. */
export function restyleColors<T>(value: T, style: ColorStyle): T {
  const lookup = new Map<string, number>()
  for (const item of COLOR_STYLES) PALETTE.forEach((color, index) => { const key = styleColor(color.color, item.id).toLowerCase(); if (!lookup.has(key)) lookup.set(key, index) })
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') {
      if (node.length !== 7 || node[0] !== '#') return node
      const index = lookup.get(node.toLowerCase())
      return index === undefined ? node : styleColor(PALETTE[index].color, style)
    }
    if (Array.isArray(node)) return node.map(walk)
    if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([key, entry]) => [key, walk(entry)]))
    return node
  }
  return walk(value) as T
}
let paletteStyle: ColorStyle = 'padrao'
export const setPaletteStyle = (style: ColorStyle) => { paletteStyle = style }
export const getPaletteStyle = () => paletteStyle
/** Cores oferecidas agora, no estilo escolhido. */
export const getPalette = (): PaletteColor[] => PALETTE.map(item => ({ ...item, color: styleColor(item.color, paletteStyle) }))

export const DEFAULT_COLOR = PALETTE[11].color // Azul
export const colorName = (hex: unknown) => {
  const value = String(hex || '').toLowerCase()
  return PALETTE.find(item => COLOR_STYLES.some(style => styleColor(item.color, style.id).toLowerCase() === value))?.label || 'Personalizada'
}
