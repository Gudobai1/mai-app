import { addDays, plannerItems, type PlannerItem } from './planner'
import type { MaiState } from './state'

/**
 * Identifica a "série" de um item repetido (compromisso ou tarefa).
 * - MAI: o próprio id quando tem repetição.
 * - Google (singleEvents): cada ocorrência vem separada, com id "<serie>_<data>".
 * Compromissos do Google sem esse padrão são agrupados por calendário + título + horário
 * (só viram série se aparecerem mais de uma vez).
 */
function seriesKey(item: PlannerItem): { key: string; weak: boolean } | null {
  const raw = item.raw as Record<string, unknown>
  if (item.kind === 'task') return raw.repeticao ? { key: `task:${item.sourceId}`, weak: false } : null
  if (item.kind !== 'event') return null
  const google = raw.tipo === 'google' || raw.tipo === 'gcalendar'
  if (!google) return raw.repeticao ? { key: `local:${item.sourceId}`, weak: false } : null
  const explicit = String(raw.recurring_event_id || '')
  const gid = String(raw.google_event_id || '')
  const base = explicit || (/_\d{8}(T\d{6}Z?)?$/.test(gid) ? gid.replace(/_\d{8}(T\d{6}Z?)?$/, '') : '')
  if (base) return { key: `g:${String(raw.calendario_id || '')}:${base}`, weak: false }
  return { key: `w:${String(raw.calendario_id || '')}:${String(raw.titulo || '').toLowerCase()}:${String(raw.hora_inicio || '')}`, weak: true }
}

/** Ids das ocorrências a esconder: todas, menos a primeira de cada série de hoje em diante. */
export function hiddenOccurrenceIds(state: MaiState, today: string): Set<string> {
  const groups = new Map<string, { ids: string[]; weak: boolean }>()
  const items = plannerItems(state, today, addDays(today, 400)).sort((a, b) => a.date.localeCompare(b.date))
  for (const item of items) {
    const info = seriesKey(item)
    if (!info) continue
    const group = groups.get(info.key) || { ids: [], weak: info.weak }
    group.ids.push(item.id)
    groups.set(info.key, group)
  }
  const hidden = new Set<string>()
  for (const group of groups.values()) {
    if (group.ids.length < 2) continue
    group.ids.slice(1).forEach(id => hidden.add(id))
  }
  return hidden
}
