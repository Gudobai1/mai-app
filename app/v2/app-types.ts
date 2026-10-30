export type SecondaryView = 'habits' | 'goals' | 'notes' | 'finance' | 'files'

export type AppView = 'home' | 'tasks' | 'today' | 'inbox' | 'upcoming' | 'completed' | 'agenda' | SecondaryView | `project:${string}`
export type TaskModuleScope = 'today' | 'upcoming' | 'entrada' | 'late' | 'nodate' | 'all' | `project:${string}`
export type Row = Record<string, any>
export type TodayBlock = 'habits' | 'goals' | 'notes' | 'finance'
