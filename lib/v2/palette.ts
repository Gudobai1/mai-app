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

export const DEFAULT_COLOR = PALETTE[11].color // Azul
export const colorName = (hex: unknown) => PALETTE.find(item => item.color.toLowerCase() === String(hex || '').toLowerCase())?.label || 'Personalizada'
