import { addDays, plannerItems, type PlannerItem } from './planner'
import type { MaiState } from './state'

/**
 * Identifica a "série" de um evento repetido.
 * - Eventos do MAI com repetição: o próprio id.
 * - Google (singleEvents): cada ocorrência vem separada, com id "<serie>_<data>".
 */
export function eventSeriesKey(item: Pick<PlannerItem, 'raw' | 'sourceId' | 'kind'>): string {
  if (item.kind !== 'event') return ''
  const raw = item.raw as Record<string, unknown>
  const google = raw.tipo === 'google' || raw.tipo === 'gcalendar'
  if (!google) return raw.repeticao ? `local:${item.sourceId}` : ''
  const explicit = String(raw.recurring_event_id || '')
  const gid = String(raw.google_event_id || '')
  const base = explicit || (/_\d{8}(T\d{6}Z?)?$/.test(gid) ? gid.replace(/_\d{8}(T\d{6}Z?)?$/, '') : '')
  return base ? `g:${String(raw.calendario_id || '')}:${base}` : ''
}

/** Ids das ocorrências a manter quando só a próxima de cada série deve aparecer. */
export function nextOccurrenceIds(state: MaiState, today: string): Set<string> {
  const seen = new Set<string>()
  const keep = new Set<string>()
  const items = plannerItems(state, today, addDays(today, 400)).filter(item => eventSeriesKey(item)).sort((a, b) => a.date.localeCompare(b.date))
  for (const item of items) {
    const key = eventSeriesKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    keep.add(item.id)
  }
  return keep
}

/** Remove as ocorrências que não são a próxima da série (eventos sem série passam direto). */
export function onlyNextOccurrences<T extends PlannerItem>(items: T[], keep: Set<string>): T[] {
  return items.filter(item => !eventSeriesKey(item) || keep.has(item.id))
}
