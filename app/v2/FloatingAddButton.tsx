'use client'

import type { AppView } from './app-types'

const actionFor = (view: AppView) => {
  if (view === 'today' || view === 'inbox' || view.startsWith('project:')) return { type:'task', label:'Tarefa' }
  if (view === 'upcoming') return { type:'event', label:'Compromisso' }
  if (view === 'habits') return { type:'habits', label:'Rotina' }
  if (view === 'goals') return { type:'goals', label:'Meta' }
  if (view === 'notes') return { type:'notes', label:'Nota' }
  if (view === 'finance') return { type:'finance', label:'Lançamento' }
  if (view === 'health') return { type:'health', label:'Registro' }
  return { type:'files', label:'Arquivo' }
}

type Props = { view: AppView; onAdd: (type:string) => void }

export function FloatingAddButton({ view, onAdd }: Props) {
  const action = actionFor(view)
  return <button className="mai-floating-add" onClick={() => onAdd(action.type)} aria-label={`Adicionar ${action.label.toLocaleLowerCase('pt-BR')}`}><span>＋</span><strong>{action.label}</strong></button>
}
