import { dateKey, LegacyTask, MaiState } from './state'

export type PlannerKind = 'task' | 'event' | 'habit' | 'finance' | 'goal'
export type PlannerItem = {
  id: string
  sourceId: string
  kind: PlannerKind
  date: string
  time: string
  title: string
  subtitle: string
  color: string
  completed: boolean
  recurring: boolean
  raw: Record<string, any>
}

const rows = (value: unknown) => Array.isArray(value) ? value as Record<string, any>[] : []

export function addDays(key: string, amount: number) {
  const date = new Date(`${key}T12:00:00`)
  date.setDate(date.getDate() + amount)
  return dateKey(date)
}

export function daysBetween(start: string, end: string) {
  const result: string[] = []
  let cursor = start
  while (cursor <= end && result.length < 1800) {
    result.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return result
}

function diffDays(start: string, end: string) {
  return Math.round((new Date(`${end}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / 86_400_000)
}

export function occursOn(item: Record<string, any>, day: string, dateField = 'data_vencimento') {
  const base = String(item[dateField] || item.data_inicio || '').slice(0, 10)
  if (!base || day < base) return false
  const rule = String(item.repeticao || '')
  if (!rule) return day === base
  const difference = diffDays(base, day)
  if (rule === 'diariamente' || rule === 'diaria' || rule === 'daily') return true
  if (rule === 'semanalmente' || rule === 'semanal' || rule === 'weekly') return difference % 7 === 0
  if (rule === 'mensalmente' || rule === 'mensal' || rule === 'monthly') return day.slice(8) === base.slice(8)
  if (rule === 'anualmente' || rule === 'anual' || rule === 'yearly') return day.slice(5) === base.slice(5)
  if (rule.startsWith('intervalo:')) return difference % Math.max(1, Number(rule.split(':')[1]) || 1) === 0
  if (rule.startsWith('semanal:')) return rule.split(':')[1].split(',').map(Number).includes(new Date(`${day}T12:00:00`).getDay())
  if (rule.startsWith('RRULE:')) {
    const frequency = rule.match(/FREQ=([^;]+)/)?.[1]
    const interval = Math.max(1, Number(rule.match(/INTERVAL=(\d+)/)?.[1]) || 1)
    if (frequency === 'DAILY') return difference % interval === 0
    if (frequency === 'WEEKLY') return Math.floor(difference / 7) % interval === 0
    if (frequency === 'MONTHLY') return day.slice(8) === base.slice(8)
    if (frequency === 'YEARLY') return day.slice(5) === base.slice(5)
  }
  return day === base
}

function eventOccursOn(event: Record<string, any>, day: string) {
  const start = String(event.data_inicio || '').slice(0, 10)
  const end = String(event.data_fim || event.data_termino || event.end || '').slice(0, 10)
  if (!event.repeticao && start && end && end >= start) return day >= start && day <= end
  return occursOn(event, day, 'data_inicio')
}

function eventCompleted(state: MaiState, event: Record<string, any>, day: string) {
  const key = `${event.id}|${day}|${event.hora_inicio || ''}`
  return rows(state.eventCompletions).some(entry => entry.chave === key || (String(entry.evento_id) === String(event.id) && String(entry.data).slice(0, 10) === day && entry.concluida !== false))
}

function fixedForDay(state: MaiState, day: string): Record<string, any>[] {
  const month = day.slice(0, 7)
  return rows(state.finance.fixed).flatMap(fixed => {
    if (fixed.ativo === false || (fixed.mes_inicio && month < String(fixed.mes_inicio).slice(0, 7)) || (fixed.mes_fim && month > String(fixed.mes_fim).slice(0, 7))) return []
    const target = Math.min(Number(fixed.dia_mes || 1), new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0).getDate())
    if (Number(day.slice(8)) !== target) return []
    const occurrence = rows(state.finance.fixedOccurrences).find(item => String(item.fixo_id) === String(fixed.id) && String(item.competencia).slice(0, 7) === month)
    if (occurrence?.ignorado === true) return []
    return [{ ...fixed, ...occurrence, id: `fixed:${fixed.id}:${month}`, fixo_id: fixed.id, data: occurrence?.data_override || day, valor: occurrence?.valor_override === '' || occurrence?.valor_override == null ? fixed.valor : occurrence.valor_override, status: occurrence?.status || 'pendente', recorrente: true }]
  })
}

export function plannerItems(state: MaiState, start: string, end: string): PlannerItem[] {
  const days = daysBetween(start, end)
  const projects = new Map(rows(state.projects).map(project => [String(project.id), project]))
  const result: PlannerItem[] = []

  for (const task of state.tasks) {
    if (task.ocultar_agenda) continue
    const source = task as LegacyTask & Record<string, any>
    for (const day of days) {
      if (!occursOn(source, day)) continue
      if (task.concluida && !task.repeticao) continue
      const project = projects.get(String(task.projeto_id || 'entrada'))
      result.push({
        id: `task:${task.id}:${day}`,
        sourceId: task.id,
        kind: 'task',
        date: day,
        time: String(task.data_vencimento || '').includes('T') ? String(task.data_vencimento).slice(11, 16) : '',
        title: task.titulo,
        subtitle: String(project?.nome || project?.name || (task.projeto_id === 'entrada' ? 'Entrada' : 'Tarefa')),
        color: ['#c85b52', '#c28a3d', '#7c9274', '#b8beb7'][Math.max(0, Math.min(3, Number(task.prioridade || 4) - 1))],
        completed: task.concluida === true,
        recurring: Boolean(task.repeticao),
        raw: source,
      })
    }
  }

  for (const event of rows(state.events)) {
    const eventStart = String(event.data_inicio || '').slice(0, 10)
    const eventEnd = String(event.data_fim || event.data_termino || event.end || '').slice(0, 10)
    for (const day of days) {
      if (!eventOccursOn(event, day)) continue
      const spanning = !event.repeticao && eventStart && eventEnd && eventEnd > eventStart
      result.push({
        id: `event:${event.id}:${day}`,
        sourceId: String(event.id),
        kind: 'event',
        date: day,
        time: spanning && day > eventStart ? '' : String(event.hora_inicio || ''),
        title: String(event.titulo || 'Compromisso'),
        subtitle: spanning && day > eventStart && day <= eventEnd ? 'Em andamento' : event.tipo === 'google' || event.tipo === 'gcalendar' ? 'Google Agenda' : String(event.categoria || 'Compromisso'),
        color: String(event.categoria_cor || event.calendarColor || event.cor || '#6f8168'),
        completed: eventCompleted(state, event, day),
        recurring: Boolean(event.repeticao),
        raw: event,
      })
    }
  }

  for (const habit of rows(state.habits).filter(item => item.ativo !== false && item.ocultar_agenda !== true)) {
    for (const day of days) {
      if (habit.data_inicio && day < String(habit.data_inicio).slice(0, 10)) continue
      if (Array.isArray(habit.dias_semana) && habit.dias_semana.length && !habit.dias_semana.map(Number).includes(new Date(`${day}T12:00:00`).getDay())) continue
      const entry = rows(state.habitEntries).find(item => String(item.habito_id) === String(habit.id) && String(item.data).slice(0, 10) === day)
      result.push({ id: `habit:${habit.id}:${day}`, sourceId: String(habit.id), kind: 'habit', date: day, time: String(habit.hora || ''), title: String(habit.nome || 'Rotina'), subtitle: `${entry ? 'Concluída' : 'Rotina'}${habit.unidade ? ` · ${habit.meta || 1} ${habit.unidade}` : ''}`, color: String(habit.cor_hex || habit.cor || '#6f8a67'), completed: Boolean(entry), recurring: true, raw: habit })
    }
  }

  const finance: Record<string, any>[] = [...rows(state.finance.transactions), ...days.flatMap(day => fixedForDay(state, day))]
  for (const item of finance) {
    const day = String(item.data || '').slice(0, 10)
    if (!day || day < start || day > end) continue
    const paid = ['pago', 'paga', 'quitado', 'quitada', 'concluido', 'concluida'].includes(String(item.status || '').toLowerCase())
    result.push({ id: `finance:${item.id}:${day}`, sourceId: String(item.id), kind: 'finance', date: day, time: '', title: String(item.titulo || 'Lançamento'), subtitle: `${item.tipo === 'receita' ? 'Receita' : 'Despesa'} · ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(item.valor || 0))}`, color: item.tipo === 'receita' ? '#4f8a66' : '#b75b55', completed: paid, recurring: item.recorrente === true, raw: item })
  }

  for (const goal of rows(state.goals)) {
    const day = String(goal.prazo || goal.data_fim || '').slice(0, 10)
    if (!day || day < start || day > end || String(goal.status).toLowerCase().includes('conclu')) continue
    result.push({ id: `goal:${goal.id}:${day}`, sourceId: String(goal.id), kind: 'goal', date: day, time: '', title: String(goal.titulo || goal.nome || 'Meta'), subtitle: 'Prazo da meta', color: String(goal.cor || '#8a6f98'), completed: false, recurring: false, raw: goal })
  }

  return result.sort((a, b) => `${a.date} ${a.time || '99:99'} ${a.title}`.localeCompare(`${b.date} ${b.time || '99:99'} ${b.title}`, 'pt-BR'))
}
