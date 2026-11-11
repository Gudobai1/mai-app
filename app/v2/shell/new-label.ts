import type { AppView } from '../app-types'

/** Nome do botão "Novo" fixo da navegação, conforme o módulo aberto (regra única; ver docs/PADROES.md). */
export function newLabel(view: AppView): string {
  const text = String(view)
  if (text === 'habits') return 'Novo hábito'
  if (text === 'goals') return 'Nova meta'
  if (text === 'notes') return 'Nova nota'
  if (text === 'finance') return 'Novo lançamento'
  if (text === 'agenda') return 'Novo compromisso'
  if (text === 'completed') return 'Novo'
  return 'Nova tarefa'
}
