import type { CSSProperties } from 'react'
import { Icon } from '../../ds'

/*
 * Ícones do menu lateral: o mesmo `Icon` único do app (docs/PADROES.md, "Ícones").
 * Pacote, grossura e cantos vêm de Configurações → Aparência; aqui só se escolhe o nome do ícone de cada área.
 */
const NAMES: Record<string, string> = {
  search: 'search',
  today: 'today',
  upcoming: 'event_upcoming',
  completed: 'task_alt',
  finance: 'account_balance_wallet',
  habits: 'autorenew',
  goals: 'flag',
  notes: 'sticky_note_2',
  files: 'folder',
  inbox: 'inbox',
  settings: 'settings',
}

export function SidebarIcon({ name, size = 22, style }: { name: string; size?: number; style?: CSSProperties }) {
  const icon = NAMES[name]
  if (!icon) return null
  return <Icon name={icon} size={size} filled={false} style={{ color: 'var(--sidebar-icon-color, var(--ds-muted))', flexShrink: 0, ...style }} />
}
