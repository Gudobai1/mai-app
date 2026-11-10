/*
 * Personalização do menu lateral (Configurações → Barra lateral): mostrar ou não os ícones e, por item,
 * trocar o ícone ou ocultar. Fica em `state.configs.sidebar`; a barra do computador e o menu do celular leem daqui.
 */
export type SidebarEntry = { icon?: string; hidden?: boolean }
export type SidebarConfig = { icons: boolean; items: Record<string, SidebarEntry> }

export const SIDEBAR_ITEMS: { id: string; label: string; icon: string }[] = [
  { id: 'search', label: 'Buscar', icon: 'search' },
  { id: 'inbox', label: 'Entrada', icon: 'inbox' },
  { id: 'today', label: 'Hoje', icon: 'today' },
  { id: 'upcoming', label: 'Em breve', icon: 'event_upcoming' },
  { id: 'finance', label: 'Finanças', icon: 'account_balance_wallet' },
  { id: 'habits', label: 'Hábitos', icon: 'autorenew' },
  { id: 'goals', label: 'Metas', icon: 'flag' },
  { id: 'notes', label: 'Notas', icon: 'sticky_note_2' },
]

/** Ícones que a pessoa pode escolher para um item do menu (todos mapeados em app/ds/lucide.tsx). */
export const SIDEBAR_ICON_CHOICES = ['search', 'inbox', 'today', 'event_upcoming', 'event', 'checklist', 'task_alt', 'account_balance_wallet', 'payments', 'savings', 'autorenew', 'flag', 'target', 'sticky_note_2', 'menu_book', 'folder', 'star', 'favorite', 'bolt', 'rocket_launch', 'emoji_events', 'lightbulb', 'bookmark', 'work', 'home', 'school', 'fitness_center', 'spa', 'psychology', 'science', 'code', 'brush', 'palette', 'music_note', 'movie', 'map', 'public', 'diamond', 'anchor', 'eco', 'coffee']

export function normalizeSidebar(raw: unknown, legacyHideInbox = false): SidebarConfig {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<SidebarConfig>
  const items: Record<string, SidebarEntry> = {}
  for (const item of SIDEBAR_ITEMS) {
    const entry = (value.items && typeof value.items === 'object' ? value.items[item.id] : undefined) as SidebarEntry | undefined
    const icon = typeof entry?.icon === 'string' && SIDEBAR_ICON_CHOICES.includes(entry.icon) ? entry.icon : undefined
    const hidden = typeof entry?.hidden === 'boolean' ? entry.hidden : item.id === 'inbox' ? legacyHideInbox : false
    if (icon || hidden) items[item.id] = { ...(icon ? { icon } : {}), ...(hidden ? { hidden } : {}) }
  }
  return { icons: value.icons !== false, items }
}

export const sidebarIconName = (config: SidebarConfig, id: string, fallback: string) => config.items[id]?.icon || fallback
export const sidebarHidden = (config: SidebarConfig, id: string) => Boolean(config.items[id]?.hidden)
