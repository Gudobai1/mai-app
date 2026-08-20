'use client'

import type { AppView } from './app-types'

const actionFor = (view: AppView) => {
  if (view === 'today' || view === 'upcoming' || view === 'inbox' || view.startsWith('project:')) return { type: 'context', label: 'Adicionar' }
  if (view === 'habits') return { type: 'habits', label: 'Nova rotina' }
  if (view === 'goals') return { type: 'goals', label: 'Nova meta' }
  if (view === 'notes') return { type: 'notes', label: 'Nova nota' }
  if (view === 'finance') return { type: 'finance', label: 'Novo lançamento' }
  if (view === 'health') return { type: 'health', label: 'Novo registro' }
  return { type: 'files', label: 'Novo arquivo' }
}

type Props = { view: AppView; onAdd: (type: string) => void }

export function FloatingAddButton({ view, onAdd }: Props) {
  const action = actionFor(view)
  return <button className="mai-floating-add mai-v3-floating-add" onClick={() => onAdd(action.type)} aria-label={action.label} title={action.label}><span>＋</span></button>
}
