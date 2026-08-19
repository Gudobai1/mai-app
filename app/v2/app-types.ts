import type { SecondaryView } from './UnifiedAreas'

export type AppView = 'today' | 'inbox' | 'upcoming' | SecondaryView | `project:${string}`
export type Row = Record<string, any>
export type TodayBlock = 'habits' | 'goals' | 'notes' | 'health' | 'finance'
