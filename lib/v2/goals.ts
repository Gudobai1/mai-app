/** Regras de metas — uma vez só, usadas por Metas, Hoje e pelo popup (docs/PADROES.md, seção 6). */
type Row = Record<string, any>

export const GOAL_STATUS = { active: 'Em Andamento', paused: 'Pausada', done: 'Concluída' } as const

const norm = (value: unknown) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR')

export const goalDue = (goal: Row) => String(goal.prazo || goal.data || goal.data_limite || goal.deadline || '').slice(0, 10)
export const goalTotal = (goal: Row) => Math.max(1, Number(goal.progresso_total || 100))
export const goalCurrent = (goal: Row) => Math.max(0, Number(goal.progresso_atual || 0))
export const goalPct = (goal: Row) => Math.max(0, Math.min(100, Math.round((goalCurrent(goal) / goalTotal(goal)) * 100)))
export const goalPaused = (goal: Row) => norm(goal.status).includes('paus')
export const goalDone = (goal: Row) => goal.concluida === true || norm(goal.status).includes('conclu')

/** Cor do marcador pela prioridade (mesma escala das tarefas). */
export function goalPriorityColor(goal: Row) {
  const level = Number(goal.prioridade || 4)
  return level === 1 ? 'var(--ds-danger)' : level === 2 ? 'var(--ds-warning, #D99A00)' : level === 3 ? 'var(--ds-accent-blue, #246FE0)' : 'var(--ds-line-strong)'
}

/** Prazo em texto curto e a cor semântica das datas (hoje amarelo, atrasada vermelho, futura verde). */
export function goalDueInfo(key: string, today: string, done = false): { label: string; tone: 'none' | 'done' | 'late' | 'today' | 'future' } {
  if (!key) return { label: 'Sem prazo', tone: 'none' }
  const diff = Math.round((new Date(`${key}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86_400_000)
  const label = diff === 0 ? 'Hoje' : diff === 1 ? 'Amanhã' : diff === -1 ? 'Ontem'
    : new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', ...(key.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) }).replace('.', '')
  return { label, tone: done ? 'done' : diff < 0 ? 'late' : diff === 0 ? 'today' : 'future' }
}

export type GoalSort = 'date' | 'priority' | 'progress' | 'name'

/** Ordem: abertas antes das concluídas; depois o critério escolhido. */
export function sortGoals(goals: Row[], sort: GoalSort) {
  const byName = (a: Row, b: Row) => String(a.titulo || '').localeCompare(String(b.titulo || ''), 'pt-BR')
  return [...goals].sort((a, b) => {
    const done = Number(goalDone(a)) - Number(goalDone(b))
    if (done) return done
    if (sort === 'priority') return Number(a.prioridade || 4) - Number(b.prioridade || 4) || byName(a, b)
    if (sort === 'progress') return goalPct(b) - goalPct(a) || byName(a, b)
    if (sort === 'name') return byName(a, b)
    const da = goalDue(a) || '9999-12-31'
    const db = goalDue(b) || '9999-12-31'
    return da.localeCompare(db) || byName(a, b)
  })
}

/** Aplica a marcação de concluída de forma única (cartão, popup e menu). */
export function setGoalDone(goal: Row, done: boolean): Row {
  return done
    ? { ...goal, concluida: true, status: GOAL_STATUS.done, progresso_atual: goalTotal(goal) }
    : { ...goal, concluida: false, status: GOAL_STATUS.active }
}
