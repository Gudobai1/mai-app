import type { MaiState } from './state'
import { addDays, plannerItems, type PlannerItem } from './planner'

/**
 * Central de avisos (sino da barra lateral): uma regra só, usada pelo painel e pelo ponto do sino.
 * Vencidos = o que passou da data e não foi feito (tarefas, lançamentos, metas). Lembretes = itens com lembrete que já disparou
 * ou dispara ainda hoje. Hoje = o que falta fazer hoje.
 */
export type AlertGroupId = 'overdue' | 'reminder' | 'soon' | 'today'
export type AlertItem = { id: string; group: AlertGroupId; item: PlannerItem; note: string }

const OFFSETS: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 }
const toMs = (value: string) => {
  const match = /^(\d+)([mhd])$/.exec(value)
  return match ? Number(match[1]) * OFFSETS[match[2]] : 0
}
const at = (day: string, time: string) => new Date(`${day}T${time || '09:00'}:00`).getTime()
const label = (day: string, today: string) => {
  const diff = Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${day}T12:00:00`).getTime()) / 86_400_000)
  return diff === 0 ? 'hoje' : diff === 1 ? 'ontem' : diff > 1 ? `há ${diff} dias` : diff === -1 ? 'amanhã' : `em ${-diff} dias`
}

export function buildAlerts(state: MaiState, today: string, now: Date): AlertItem[] {
  const nowMs = now.getTime()
  const out: AlertItem[] = []
  const seen = new Set<string>()
  const push = (group: AlertGroupId, item: PlannerItem, note: string) => {
    const key = `${group}:${item.kind}:${item.sourceId}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ id: key, group, item, note })
  }

  // Vencidos: últimos 60 dias, só o que dá para fazer (não compromissos nem hábitos).
  for (const item of plannerItems(state, addDays(today, -60), addDays(today, -1))) {
    if (item.completed || (item.kind !== 'task' && item.kind !== 'finance' && item.kind !== 'goal')) continue
    push('overdue', item, `Venceu ${label(item.date, today)}${item.time ? ` às ${item.time}` : ''}`)
  }

  // Lembretes: com lembrete configurado, que já disparou (e o item ainda não passou de 12 h) ou dispara hoje.
  for (const item of plannerItems(state, addDays(today, -1), addDays(today, 1))) {
    if (item.completed) continue
    const list = Array.isArray(item.raw?.lembretes) ? (item.raw.lembretes as unknown[]).map(String).filter(Boolean) : []
    if (!list.length || !item.time) continue
    const due = at(item.date, item.time)
    for (const reminder of list) {
      const trigger = due - toMs(reminder)
      if (trigger <= nowMs && due >= nowMs - 12 * 3_600_000) {
        push('reminder', item, due < nowMs ? `Venceu às ${item.time}` : `Lembrete disparou · ${item.date === today ? 'hoje' : label(item.date, today)} às ${item.time}`)
        break
      }
      if (trigger > nowMs && new Date(trigger).toDateString() === now.toDateString()) {
        const hh = String(new Date(trigger).getHours()).padStart(2, '0')
        const mm = String(new Date(trigger).getMinutes()).padStart(2, '0')
        push('reminder', item, `Lembra às ${hh}:${mm} · vence às ${item.time}`)
        break
      }
    }
  }

  // Próximos: o que tem horário e começa nas próximas 4 horas (inclui compromissos e o que está acontecendo agora).
  for (const item of plannerItems(state, today, today)) {
    if (item.completed || item.kind === 'habit' || !item.time) continue
    const start = at(item.date, item.time)
    const diff = start - nowMs
    if (diff < -30 * 60_000 || diff > 4 * 3_600_000) continue
    const minutes = Math.round(diff / 60_000)
    push('soon', item, minutes <= 0 ? `Agora · ${item.time}` : minutes < 60 ? `Em ${minutes} min · ${item.time}` : `Em ${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''} · ${item.time}`)
  }

  // Hoje: o que falta fazer.
  for (const item of plannerItems(state, today, today)) {
    if (item.completed || item.kind === 'habit' || item.kind === 'event') continue
    push('today', item, item.time ? `Hoje às ${item.time}` : 'Hoje')
  }
  return out
}

/** Quantos avisos pedem atenção agora (vencidos + lembretes já disparados). */
export const alertCount = (alerts: AlertItem[]) => alerts.filter(entry => entry.group === 'overdue' || (entry.group === 'reminder' && !entry.note.startsWith('Lembra às'))).length


/* Avisos dispensados (só valem no dia; ficam neste navegador). */
const DISMISS_KEY = 'bukid-alerts-dismissed'
export function loadDismissed(today: string): Set<string> {
  try {
    const data = JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}') as { day?: string; ids?: string[] }
    return new Set(data.day === today && Array.isArray(data.ids) ? data.ids : [])
  } catch { return new Set() }
}
export function saveDismissed(today: string, ids: Set<string>) {
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify({ day: today, ids: [...ids] })) } catch { /* sem armazenamento */ }
}
