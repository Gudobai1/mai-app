import type { MaiState } from '../../../lib/v2/state'
import type { AppView } from '../app-types'

export type NavItem = { id: AppView; label: string; icon: string }
export type NavGroup = { label: string; items: NavItem[] }

/**
 * Navegação do menu, em blocos separados por um respiro (sem títulos):
 * Hoje · Em breve · Concluídos / Tarefas · Finanças / Hábitos · Metas / Notas · Arquivos.
 * "Em breve" é o módulo de agenda; Bem-estar fica dentro de Hábitos.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: '',
    items: [
      { id: 'today', label: 'Hoje', icon: 'today' },
      { id: 'upcoming', label: 'Em breve', icon: 'event_upcoming' },
      { id: 'completed', label: 'Concluídos', icon: 'task_alt' },
    ],
  },
  {
    label: '',
    items: [
      { id: 'tasks', label: 'Tarefas', icon: 'checklist' },
      { id: 'finance', label: 'Finanças', icon: 'account_balance_wallet' },
    ],
  },
  {
    label: '',
    items: [
      { id: 'habits', label: 'Hábitos', icon: 'autorenew' },
      { id: 'goals', label: 'Metas', icon: 'flag' },
    ],
  },
  {
    label: '',
    items: [
      { id: 'notes', label: 'Notas', icon: 'sticky_note_2' },
      { id: 'files', label: 'Arquivos', icon: 'folder' },
    ],
  },
]

/** Telas que não têm item próprio no menu e acendem o de outra. */
export const NAV_ALIAS: Partial<Record<AppView, AppView>> = { health: 'habits', agenda: 'upcoming' }

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
