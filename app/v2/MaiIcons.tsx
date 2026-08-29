import type { CSSProperties, ReactNode } from 'react'

/**
 * Sistema único de ícones do MAI.
 *
 * Persistimos apenas o identificador textual (ex.: "target", "savings") no
 * estado do aplicativo. O identificador é pequeno, funciona offline depois do
 * cache normal do app e é sincronizado pelo mesmo snapshot local + Supabase.
 * Imagens/fotos escolhidas pelo usuário continuam sendo arquivos e são tratadas
 * separadamente pelo Google Drive.
 */
export const MAI_ICON_SYSTEM = 'material-symbols-rounded-v1' as const

export const MAI_ENTITY_ICONS = [
  'folder', 'work', 'home', 'star', 'favorite', 'target', 'rocket_launch', 'school',
  'fitness_center', 'directions_run', 'directions_bike', 'bedtime', 'self_improvement',
  'spa', 'local_drink', 'restaurant', 'menu_book', 'lightbulb', 'code', 'palette',
  'psychology', 'monitor_heart', 'payments', 'savings', 'account_balance',
  'trending_up', 'monitoring', 'shield', 'public', 'travel', 'flight',
  'directions_car', 'devices', 'pets', 'inventory_2', 'celebration', 'emergency',
  'bolt', 'air', 'attach_money', 'cleaning_services', 'real_estate_agent',
  'currency_bitcoin',
] as const

export type MaiEntityIconName = typeof MAI_ENTITY_ICONS[number]

const aliases: Record<string, string> = {
  menu: 'menu',
  plus: 'add',
  search: 'search',
  inbox: 'inbox',
  today: 'today',
  upcoming: 'event_upcoming',
  calendar: 'calendar_month',
  completed: 'task_alt',
  settings: 'settings',
  habits: 'repeat',
  goals: 'target',
  notes: 'description',
  finance: 'account_balance_wallet',
  health: 'favorite',
  files: 'folder',
  chevron: 'chevron_right',
  close: 'close',
  edit: 'edit',
  view_column: 'view_column',
  account_tree: 'account_tree',
  content_copy: 'content_copy',
  archive: 'archive',
  delete: 'delete',
}

export function resolveMaiIcon(name: string) {
  const clean = String(name || '').trim()
  return aliases[clean] || clean || 'folder'
}

export function MaiIcon({ name, size = 18, className = '' }: { name: string; size?: number; className?: string }): ReactNode {
  const style = {
    fontSize: size,
    width: size,
    height: size,
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
  } satisfies CSSProperties

  return <span className={`material-symbols-rounded mai-icon ${className}`.trim()} style={style} aria-hidden="true">{resolveMaiIcon(name)}</span>
}

export function MaiIconPicker({ value, onChange, icons = MAI_ENTITY_ICONS, size = 19 }: {
  value?: string
  onChange: (icon: string) => void
  icons?: readonly string[]
  size?: number
}) {
  return <>{icons.map(icon => <button type="button" key={icon} data-active={String(value || '') === icon} onClick={() => onChange(icon)} title={icon}><MaiIcon name={icon} size={size} /></button>)}</>
}
