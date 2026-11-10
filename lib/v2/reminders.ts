import { addDays, plannerItems } from './planner'
import { buildAlerts } from './alerts'
import type { MaiState } from './state'

/*
 * Motor único dos lembretes: o desktop (avisa enquanto o app está aberto) e o celular (agenda no sistema) leem daqui.
 * Config em `state.configs.reminders`; aparência (texto do aviso, sino, painel) em `look`.
 */
export type ReminderKind = 'task' | 'event' | 'finance' | 'goal' | 'habit'
export type ReminderConfig = {
  kinds: Record<ReminderKind, boolean>
  atTime: boolean
  lead: number
  digest: { on: boolean; time: string }
  quiet: { on: boolean; from: string; to: string }
  look: {
    appName: boolean
    project: boolean
    time: boolean
    silent: boolean
    bell: 'dot' | 'count' | 'none'
    panel: 'comfortable' | 'compact'
    groups: { overdue: boolean; reminder: boolean; today: boolean }
  }
}
export type Reminder = { id: string; at: number; title: string; body: string }

export const REMINDER_KINDS: { id: ReminderKind; label: string; hint: string }[] = [
  { id: 'task', label: 'Tarefas', hint: 'Com data e horário' },
  { id: 'event', label: 'Compromissos', hint: 'Da agenda' },
  { id: 'finance', label: 'Finanças', hint: 'Vencimentos com horário' },
  { id: 'goal', label: 'Metas', hint: 'Prazos com horário' },
  { id: 'habit', label: 'Hábitos', hint: 'Hábitos com horário' },
]
export const LEAD_OPTIONS = [0, 5, 10, 15, 30, 60, 120, 1440]
export const leadLabel = (minutes: number) => (minutes === 0 ? 'Nenhuma' : minutes < 60 ? `${minutes} min antes` : minutes === 1440 ? '1 dia antes' : `${minutes / 60} h antes`)

const time = (value: unknown, fallback: string) => (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback)
export function normalizeReminders(raw: unknown): ReminderConfig {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>
  const look = (v.look && typeof v.look === 'object' ? v.look : {}) as Record<string, any>
  const groups = (look.groups && typeof look.groups === 'object' ? look.groups : {}) as Record<string, unknown>
  const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)
  const kinds = (v.kinds && typeof v.kinds === 'object' ? v.kinds : {}) as Record<string, unknown>
  return {
    kinds: { task: flag(kinds.task, true), event: flag(kinds.event, true), finance: flag(kinds.finance, true), goal: flag(kinds.goal, true), habit: flag(kinds.habit, false) },
    atTime: flag(v.atTime, true),
    lead: LEAD_OPTIONS.includes(Number(v.lead)) ? Number(v.lead) : 0,
    digest: { on: flag(v.digest?.on, false), time: time(v.digest?.time, '08:00') },
    quiet: { on: flag(v.quiet?.on, false), from: time(v.quiet?.from, '22:00'), to: time(v.quiet?.to, '07:00') },
    look: {
      appName: flag(look.appName, true), project: flag(look.project, true), time: flag(look.time, true), silent: flag(look.silent, false),
      bell: look.bell === 'count' || look.bell === 'none' ? look.bell : 'dot',
      panel: look.panel === 'compact' ? 'compact' : 'comfortable',
      groups: { overdue: flag(groups.overdue, true), reminder: flag(groups.reminder, true), today: flag(groups.today, true) },
    },
  }
}

const OFFSETS: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 }
const offsetMs = (value: string) => {
  const match = /^(\d+)([mhd])$/.exec(value)
  return match ? Number(match[1]) * OFFSETS[match[2]] : 0
}
const minutesOf = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m }
export function inQuiet(config: ReminderConfig, at: number) {
  if (!config.quiet.on) return false
  const date = new Date(at)
  const now = date.getHours() * 60 + date.getMinutes()
  const from = minutesOf(config.quiet.from), to = minutesOf(config.quiet.to)
  return from === to ? false : from < to ? now >= from && now < to : now >= from || now < to
}
const offsetText = (ms: number) => { const min = Math.round(ms / 60_000); return min >= 1440 ? `${Math.round(min / 1440)} d` : min >= 60 ? `${Math.round(min / 60)} h` : `${min} min` }
export const reminderTitle = (config: ReminderConfig, text: string) => `${config.look.appName ? 'Bukid · ' : ''}${text}`

/** Lembretes com horário entre `from` e `to` (datas), já filtrados por tipo e silêncio. Cada item gera um aviso por antecedência. */
export function buildReminders(state: MaiState, today: string, from: string, to: string, config: ReminderConfig): Reminder[] {
  const out: Reminder[] = []
  for (const item of plannerItems(state, from, to)) {
    if (item.completed || !item.time || !item.date || !config.kinds[item.kind as ReminderKind]) continue
    const due = new Date(`${item.date}T${item.time}:00`).getTime()
    if (Number.isNaN(due)) continue
    const own = (Array.isArray(item.raw?.lembretes) ? (item.raw.lembretes as unknown[]) : []).map(String).map(offsetMs).filter(value => value > 0)
    const offsets = new Set<number>(own)
    if (config.atTime) offsets.add(0)
    if (!own.length && config.lead > 0) offsets.add(config.lead * 60_000)
    for (const offset of offsets) {
      const at = due - offset
      if (inQuiet(config, at)) continue
      const when = offset > 0 ? `começa em ${offsetText(offset)}` : config.look.time ? `às ${item.time}` : ''
      const body = [config.look.project ? item.subtitle : '', when].filter(Boolean).join(' · ')
      out.push({ id: `${item.id}|${offset}`, at, title: reminderTitle(config, item.title), body })
    }
  }
  if (config.digest.on) {
    for (let day = from; day <= to; day = addDays(day, 1)) {
      const at = new Date(`${day}T${config.digest.time}:00`).getTime()
      if (Number.isNaN(at) || inQuiet(config, at)) continue
      const pending = plannerItems(state, day, day).filter(item => !item.completed && item.kind !== 'habit' && config.kinds[item.kind as ReminderKind]).length
      const overdue = day === today ? buildAlerts(state, today, new Date(at)).filter(entry => entry.group === 'overdue').length : 0
      const body = [`${pending} ${pending === 1 ? 'item' : 'itens'} para hoje`, overdue ? `${overdue} vencido${overdue === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')
      out.push({ id: `digest|${day}`, at, title: reminderTitle(config, 'Resumo do dia'), body })
    }
  }
  return out.sort((a, b) => a.at - b.at)
}
