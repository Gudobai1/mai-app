import type { MaiState } from '../../../lib/v2/state'
import type { AppView } from '../app-types'

export type NavItem = { id: AppView; label: string; icon: string }
export type NavGroup = { label: string; items: NavItem[] }

/** Navegação agrupada do visual Moderno: Planejar, Evoluir e Guardar. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Planejar',
    items: [
      { id: 'today', label: 'Hoje', icon: 'today' },
      { id: 'upcoming', label: 'Em breve', icon: 'event_upcoming' },
      { id: 'tasks', label: 'Tarefas', icon: 'checklist' },
      { id: 'completed', label: 'Concluídos', icon: 'task_alt' },
    ],
  },
  {
    label: 'Evoluir',
    items: [
      { id: 'habits', label: 'Hábitos', icon: 'autorenew' },
      { id: 'goals', label: 'Metas', icon: 'flag' },
      { id: 'health', label: 'Bem-estar', icon: 'favorite' },
    ],
  },
  {
    label: 'Guardar',
    items: [
      { id: 'notes', label: 'Notas', icon: 'sticky_note_2' },
      { id: 'finance', label: 'Finanças', icon: 'account_balance_wallet' },
      { id: 'files', label: 'Arquivos', icon: 'folder' },
    ],
  },
]

/** Tarefas abertas que vencem hoje ou já venceram (só tarefas principais). */
export function todayCounts(state: MaiState, today: string) {
  let due = 0
  let overdue = 0
  for (const task of state.tasks || []) {
    if (task.concluida === true || task.parent_id) continue
    const day = String(task.data_vencimento || '').slice(0, 10)
    if (!day || day > today) continue
    due += 1
    if (day < today) overdue += 1
  }
  return { due, overdue }
}
