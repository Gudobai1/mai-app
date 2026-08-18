'use client'

import type { MaiState } from '../../lib/v2/state'
import type { SecondaryView } from './V2Areas'
import { AgendaView as BaseAgendaView } from './AgendaViewBase'
import { AgendaParityExtras } from './AgendaParityExtras'

type Row = Record<string, any>

type Props = {
  state: MaiState
  today: string
  connected: boolean | null
  commit: (change: (current: MaiState) => MaiState) => void
  googleRpc: (method: string, args?: unknown[]) => Promise<any>
  refreshEvents: (start?: string, end?: string) => Promise<void>
  openTask: (id: string) => void
  openArea: (view: SecondaryView) => void
  createRequest?: number
}

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []

export function AgendaView(props: Props) {
  const rpc = async (method: string, args: unknown[] = []) => {
    if (method === 'getListaCalendarios' && !props.connected) return []
    if (method === 'salvarEventoAgenda') {
      const draft = (args[0] || {}) as Row
      const isLocal = draft.tipo === 'local' || String(draft.id || '').startsWith('local-event-') || !props.connected
      if (isLocal) {
        const next = { ...draft, id: draft.id || `local-event-${crypto.randomUUID()}`, tipo: 'local', titulo: String(draft.titulo || '').trim() }
        props.commit(current => ({ ...current, events: rows(current.events).some(item => String(item.id) === String(next.id)) ? rows(current.events).map(item => String(item.id) === String(next.id) ? next : item) : [...rows(current.events), next] }))
        return { ok: true, id: next.id }
      }
    }
    if (method === 'excluirEventoAgenda') {
      const eventId = String(args[0] || '')
      if (eventId.startsWith('local-event-')) {
        props.commit(current => ({ ...current, events: rows(current.events).filter(item => String(item.id) !== eventId), eventCompletions: rows(current.eventCompletions).filter(item => String(item.evento_id) !== eventId) }))
        return { ok: true }
      }
    }
    return props.googleRpc(method, args)
  }

  const refresh = async (start?: string, end?: string) => {
    if (!props.connected) return
    return props.refreshEvents(start, end)
  }

  return <div style={{ position: 'relative', minHeight: '100%' }}>
    <BaseAgendaView {...props} connected={true} googleRpc={rpc} refreshEvents={refresh} />
    <AgendaParityExtras state={props.state} today={props.today} connected={props.connected} commit={props.commit} googleRpc={props.googleRpc} />
  </div>
}
