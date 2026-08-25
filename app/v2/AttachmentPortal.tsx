'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import { ItemAttachments } from './ItemAttachments'

type Row = Record<string, any>
type Commit = (change: (current: MaiState) => MaiState) => void
type Rpc = (method: string, args?: unknown[]) => Promise<any>

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const attachmentMap = (state: MaiState) => {
  const raw = (state.configs as Row).itemAttachments
  return raw && typeof raw === 'object' ? raw as Record<string, Row[]> : {}
}

function keyFor(item: InspectableItem) {
  return `${item.kind}:${item.sourceId}`
}

function sourceAttachments(state: MaiState, item: InspectableItem): Row[] {
  const mapped = rows(attachmentMap(state)[keyFor(item)])
  if (mapped.length) return mapped
  if (item.kind === 'task') return rows(state.tasks.find(task => String(task.id) === item.sourceId)?.anexos)
  if (item.kind === 'habit') return rows(rows(state.habits).find(row => String(row.id) === item.sourceId)?.anexos)
  if (item.kind === 'goal') return rows(rows(state.goals).find(row => String(row.id) === item.sourceId)?.anexos)
  if (item.kind === 'note') return rows(rows(state.notes).find(row => String(row.id) === item.sourceId)?.anexos)
  if (item.kind === 'finance') {
    const finance = state.finance || {}
    return rows(rows(finance.transactions).find(row => String(row.id) === item.sourceId)?.anexos || rows(finance.fixed).find(row => String(row.id) === String(item.raw.fixo_id || item.sourceId))?.anexos)
  }
  return rows(rows(state.events).find(row => String(row.id) === item.sourceId)?.anexos || item.raw.anexos)
}

function writeAttachments(current: MaiState, item: InspectableItem, attachments: Row[]): MaiState {
  const configs = current.configs as Row
  const map = attachmentMap(current)
  const nextConfigs = { ...current.configs, itemAttachments: { ...map, [keyFor(item)]: attachments } }

  if (item.kind === 'task') return { ...current, configs: nextConfigs, tasks: current.tasks.map(task => String(task.id) === item.sourceId ? { ...task, anexos: attachments } : task) }
  if (item.kind === 'habit') return { ...current, configs: nextConfigs, habits: rows(current.habits).map(row => String(row.id) === item.sourceId ? { ...row, anexos: attachments } : row) }
  if (item.kind === 'goal') return { ...current, configs: nextConfigs, goals: rows(current.goals).map(row => String(row.id) === item.sourceId ? { ...row, anexos: attachments } : row) }
  if (item.kind === 'note') return { ...current, configs: nextConfigs, notes: rows(current.notes).map(row => String(row.id) === item.sourceId ? { ...row, anexos: attachments } : row) }
  if (item.kind === 'finance') {
    const finance = current.finance || {}
    if (item.raw.fixo_id || item.raw.recorrente === true) {
      const target = String(item.raw.fixo_id || item.sourceId)
      return { ...current, configs: nextConfigs, finance: { ...finance, fixed: rows(finance.fixed).map(row => String(row.id) === target ? { ...row, anexos: attachments } : row) } }
    }
    return { ...current, configs: nextConfigs, finance: { ...finance, transactions: rows(finance.transactions).map(row => String(row.id) === item.sourceId ? { ...row, anexos: attachments } : row) } }
  }
  return { ...current, configs: nextConfigs, events: rows(current.events).map(row => String(row.id) === item.sourceId ? { ...row, anexos: attachments } : row) }
}

export function AttachmentPortal({ item, state, commit, googleRpc }: { item: InspectableItem | null; state: MaiState; commit: Commit; googleRpc: Rpc }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const attachments = useMemo(() => item ? sourceAttachments(state, item) : [], [state, item?.kind, item?.sourceId])

  useEffect(() => {
    if (!item) { setHost(null); return }
    let active = true
    const mount = () => {
      if (!active) return
      const section = document.querySelector<HTMLElement>(item.kind === 'task' ? '.mai-task-v4-files' : '.mai-context-v3-files')
      if (!section) return
      section.dataset.maiAttachmentsBridged = 'true'
      let nextHost = section.querySelector<HTMLElement>('.mai-attachment-portal-host')
      if (!nextHost) {
        nextHost = document.createElement('div')
        nextHost.className = 'mai-attachment-portal-host'
        section.appendChild(nextHost)
      }
      setHost(nextHost)
    }
    mount()
    const observer = new MutationObserver(mount)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      active = false
      observer.disconnect()
      setHost(null)
    }
  }, [item?.kind, item?.sourceId])

  if (!item || !host) return null
  return createPortal(<ItemAttachments attachments={attachments} googleRpc={googleRpc} onChange={next => commit(current => writeAttachments(current, item, next))} compact />, host)
}
