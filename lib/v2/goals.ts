/** Regras de metas — uma vez só, usadas por Metas, Hoje, Em breve e pelo popup (docs/PADROES.md, seção 6). */
type Row = Record<string, any>

export const GOAL_STATUS = { active: 'Em Andamento', paused: 'Pausada', done: 'Concluída' } as const

/** Tipos de meta: o tipo define como o progresso é medido e mostrado. */
export type GoalType = 'percentual' | 'valor' | 'quantidade' | 'passos'
export const GOAL_TYPES: { value: GoalType; label: string; icon: string }[] = [
  { value: 'percentual', label: 'Porcentagem', icon: 'percent' },
  { value: 'valor', label: 'Valor (R$)', icon: 'payments' },
  { value: 'quantidade', label: 'Quantidade', icon: 'numbers' },
  { value: 'passos', label: 'Passos', icon: 'checklist' },
]

const norm = (value: unknown) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR')
const rowsOf = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : [])

export const goalDue = (goal: Row) => String(goal.prazo || goal.data || goal.data_limite || goal.deadline || '').slice(0, 10)
export const goalPaused = (goal: Row) => norm(goal.status).includes('paus')
export const goalDone = (goal: Row) => goal.concluida === true || norm(goal.status).includes('conclu')
export const goalColor = (goal: Row) => String(goal.cor_hex || goal.cor || '') || 'var(--ds-lilac-fg)'

/** Metas antigas (sem tipo): total 100 sem unidade = porcentagem; as demais = quantidade. */
export function goalType(goal: Row): GoalType {
  const saved = String(goal.tipo || '')
  if (saved === 'percentual' || saved === 'valor' || saved === 'quantidade' || saved === 'passos') return saved
  return Number(goal.progresso_total || 100) === 100 && !String(goal.unidade || '').trim() ? 'percentual' : 'quantidade'
}

export const goalSteps = (goal: Row) => rowsOf(goal.passos)
export function goalCurrent(goal: Row) {
  if (goalType(goal) === 'passos') return goalSteps(goal).filter(step => step.feito === true).length
  return Math.max(0, Number(goal.progresso_atual || 0))
}
export function goalTotal(goal: Row) {
  if (goalType(goal) === 'passos') return Math.max(1, goalSteps(goal).length)
  return Math.max(1, Number(goal.progresso_total || 100))
}
export const goalPct = (goal: Row) => Math.max(0, Math.min(100, Math.round((goalCurrent(goal) / goalTotal(goal)) * 100)))

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 2 })
const plain = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
export const formatGoalAmount = (goal: Row, value: number) => (goalType(goal) === 'valor' ? money.format(value) : plain.format(value))

/** Texto de detalhe à direita: "R$ 400 de R$ 1.000", "3 de 5 passos", "3 de 10 livros". Vazio na porcentagem (a % já aparece). */
export function goalAmountText(goal: Row) {
  const type = goalType(goal)
  if (type === 'percentual') return ''
  const current = goalCurrent(goal)
  const total = goalTotal(goal)
  if (type === 'valor') return `${money.format(current)} de ${money.format(total)}`
  if (type === 'passos') return `${current} de ${total} ${total === 1 ? 'passo' : 'passos'}`
  const unit = String(goal.unidade || '').trim()
  return `${plain.format(current)} de ${plain.format(total)}${unit ? ` ${unit}` : ''}`
}

/** Tamanho do toque nos botões de + e − de cada tipo. */
export function goalStep(goal: Row) {
  const type = goalType(goal)
  if (type === 'percentual') return 5
  if (type === 'valor') { const total = goalTotal(goal); return total >= 5000 ? 500 : total >= 1000 ? 100 : total >= 200 ? 50 : total >= 50 ? 10 : 1 }
  return 1
}

/** Cor do marcador de prioridade (mesma escala das tarefas). */
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

/** Conclui ou reabre de forma única (cartão, popup e menu), respeitando o tipo da meta. */
export function setGoalDone(goal: Row, done: boolean): Row {
  const type = goalType(goal)
  if (done) {
    const steps = goalSteps(goal).map(step => ({ ...step, feito: true }))
    return { ...goal, concluida: true, status: GOAL_STATUS.done, ...(type === 'passos' ? { passos: steps } : { progresso_atual: goalTotal(goal) }) }
  }
  const steps = goalSteps(goal)
  const reopened = type === 'passos' && steps.length && steps.every(step => step.feito === true) ? steps.map((step, index) => (index === steps.length - 1 ? { ...step, feito: false } : step)) : steps
  return { ...goal, concluida: false, status: GOAL_STATUS.active, ...(type === 'passos' ? { passos: reopened } : {}) }
}

/** Antes de salvar: deriva o progresso dos passos e conclui sozinha quando chega ao alvo. */
export function normalizeGoal(goal: Row): Row {
  const type = goalType(goal)
  const base: Row = type === 'passos' ? { ...goal, progresso_atual: goalCurrent(goal), progresso_total: goalTotal(goal) } : { ...goal, progresso_atual: goalCurrent(goal), progresso_total: goalTotal(goal) }
  const reached = goalCurrent(base) >= goalTotal(base) && (type !== 'passos' || goalSteps(base).length > 0)
  if (goalDone(base) || (reached && !goalPaused(base))) return { ...base, concluida: true, status: GOAL_STATUS.done }
  return { ...base, concluida: false }
}

/* ---------------------------------------------------- Passos = tarefas independentes */

/** Cada passo é uma tarefa de verdade (igual às do módulo Tarefas), ligada à meta pelo campo `meta_id`. */
export const goalStepTasks = (goal: Row, tasks: unknown) => rowsOf(tasks).filter(task => String(task.meta_id || '') === String(goal.id)).sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))

/** Meta de passos com o progresso lido das tarefas ligadas (concluir uma tarefa em qualquer lugar atualiza a meta). Outros tipos voltam iguais. */
export function withSteps(goal: Row, tasks: unknown): Row {
  if (goalType(goal) !== 'passos') return goal
  const linked = goalStepTasks(goal, tasks)
  if (!linked.length) return goal
  const passos = linked.map(task => ({ id: task.id, titulo: task.titulo, feito: Boolean(task.concluida) }))
  if (goalPaused(goal)) return { ...goal, passos }
  const all = passos.every(step => step.feito)
  return all ? { ...goal, passos, concluida: true, status: GOAL_STATUS.done } : { ...goal, passos, concluida: false, status: goalDone(goal) ? GOAL_STATUS.active : goal.status }
}

/** Conclui ou reabre a meta no estado inteiro: nos passos, conclui (ou reabre o último) as tarefas ligadas. */
export function toggleGoalInState<T extends { goals: unknown[]; tasks: unknown[] }>(state: T, goalId: string, done: boolean): T {
  const goals = rowsOf(state.goals)
  const goal = goals.find(row => String(row.id) === goalId)
  if (!goal) return state
  let tasks = rowsOf(state.tasks)
  if (goalType(goal) === 'passos') {
    const linked = goalStepTasks(goal, tasks)
    const targets = done ? linked.filter(task => !task.concluida) : linked.length && linked.every(task => task.concluida) ? [linked[linked.length - 1]] : []
    const ids = new Set(targets.map(task => String(task.id)))
    if (ids.size) tasks = tasks.map(task => (ids.has(String(task.id)) ? { ...task, concluida: done, concluida_em: done ? new Date().toISOString() : '' } : task))
  }
  return { ...state, tasks, goals: goals.map(row => (String(row.id) === goalId ? setGoalDone(row, done) : row)) } as T
}

/* ------------------------------------------------------------------ Categorias e relatório */

export type GoalCategory = { id: string; nome: string }

/** Categorias criadas pela pessoa (ficam em `configs.goalCategories`); cada meta guarda o id em `categoria`. */
export function goalCategories(configs: unknown): GoalCategory[] {
  const raw = (configs as { goalCategories?: unknown } | null | undefined)?.goalCategories
  return Array.isArray(raw)
    ? (raw as Row[]).filter(item => item && item.id && String(item.nome || '').trim()).map(item => ({ id: String(item.id), nome: String(item.nome) }))
    : []
}

export type GoalReport = {
  total: number
  done: number
  active: number
  paused: number
  late: number
  avgPct: number
  byCategory: { id: string; nome: string; total: number; done: number; avgPct: number }[]
  byMonth: { key: string; label: string; total: number; done: number }[]
  atRisk: Row[]
}

/** Números do relatório: situação geral, por categoria, por mês de prazo e metas em risco. */
export function goalReport(goals: Row[], categories: GoalCategory[], today: string): GoalReport {
  const open = goals.filter(goal => !goalDone(goal))
  const avg = (list: Row[]) => (list.length ? Math.round(list.reduce((sum, goal) => sum + goalPct(goal), 0) / list.length) : 0)
  const groups: { id: string; nome: string; list: Row[] }[] = [
    ...categories.map(category => ({ id: category.id, nome: category.nome, list: goals.filter(goal => String(goal.categoria || '') === category.id) })),
    { id: '', nome: 'Sem categoria', list: goals.filter(goal => !categories.some(category => category.id === String(goal.categoria || ''))) },
  ]
  const months = new Map<string, { total: number; done: number }>()
  for (const goal of goals) {
    const due = goalDue(goal)
    if (!due) continue
    const key = due.slice(0, 7)
    const entry = months.get(key) || { total: 0, done: 0 }
    entry.total += 1
    if (goalDone(goal)) entry.done += 1
    months.set(key, entry)
  }
  const soon = (() => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10) })()
  return {
    total: goals.length,
    done: goals.length - open.length,
    active: open.filter(goal => !goalPaused(goal)).length,
    paused: open.filter(goalPaused).length,
    late: open.filter(goal => { const due = goalDue(goal); return due && due < today }).length,
    avgPct: avg(goals),
    byCategory: groups.filter(group => group.list.length || group.id).map(group => ({ id: group.id, nome: group.nome, total: group.list.length, done: group.list.filter(goalDone).length, avgPct: avg(group.list) })),
    byMonth: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ key, label: new Date(`${key}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: key.slice(0, 4) !== today.slice(0, 4) ? '2-digit' : undefined }).replace('.', ''), ...value })),
    atRisk: open.filter(goal => { const due = goalDue(goal); return due && due <= soon && goalPct(goal) < 80 }).sort((a, b) => goalDue(a).localeCompare(goalDue(b))).slice(0, 8),
  }
}
