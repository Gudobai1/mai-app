'use client'

import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import { UpcomingCompact } from './UpcomingCompact'

type Row = Record<string, any>
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []

export function UpcomingV4({state,today,commit,inspect}:{state:MaiState;today:string;commit:(change:(current:MaiState)=>MaiState)=>void;inspect:(item:InspectableItem)=>void}){
  const targets = new Map(rows(state.habits).map(habit => [String(habit.id), Math.max(1, Number(habit.meta || 1))]))
  const agendaState: MaiState = {
    ...state,
    habitEntries: rows(state.habitEntries).map(entry => {
      const value = Number(entry.valor || 0)
      if (value <= 0) return entry
      return { ...entry, valor: Math.max(value, targets.get(String(entry.habito_id)) || 1) }
    }),
  }
  return <div className="mai-v4-upcoming-wrap"><UpcomingCompact state={agendaState} today={today} inspect={inspect} commit={commit}/></div>
}
