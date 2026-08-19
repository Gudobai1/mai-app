import type { SecondaryView } from './UnifiedAreas'

export type AppView = 'today' | 'inbox' | 'upcoming' | 'agenda' | SecondaryView | `project:${string}`
export type Row = Record<string, any>
export type TodayBlock = 'flow' | 'goals' | 'notes' | 'health' | 'finance'
