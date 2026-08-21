import type { SecondaryView } from './UnifiedAreas'

export type AppView = 'home' | 'tasks' | 'today' | 'inbox' | 'upcoming' | SecondaryView | `project:${string}`
export type TaskModuleScope = 'today' | 'upcoming' | 'entrada' | `project:${string}`
export type Row = Record<string, any>
export type TodayBlock = 'habits' | 'goals' | 'notes' | 'health' | 'finance'
