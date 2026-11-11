'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Icon } from '../../ds'
import type { AlertGroupId, AlertItem } from '../../../lib/v2/alerts'
import type { ReminderConfig } from '../../../lib/v2/reminders'
import type { MaiState } from '../../../lib/v2/state'
import styles from './ModernShell.module.css'

const GROUPS: { id: AlertGroupId; title: string; icon: string; color: string; flag: 'overdue' | 'reminder' | 'today' }[] = [
  { id: 'overdue', title: 'Vencidos', icon: 'warning', color: 'var(--ds-danger)', flag: 'overdue' },
  { id: 'soon', title: 'Próximos', icon: 'schedule', color: 'var(--ds-accent)', flag: 'today' },
  { id: 'reminder', title: 'Lembretes', icon: 'notifications', color: 'var(--ds-sky-fg)', flag: 'reminder' },
  { id: 'today', title: 'Para hoje', icon: 'today', color: 'var(--ds-muted)', flag: 'today' },
]
const KIND_ICON: Record<string, string> = { task: 'task_alt', finance: 'account_balance_wallet', goal: 'flag', event: 'event', habit: 'autorenew' }
const MAX = 8

type Props = {
  look: ReminderConfig['look']
  alerts: AlertItem[]
  today: string
  anchor: HTMLElement | null
  onOpen: (alert: AlertItem) => void
  onClose: () => void
  onDismiss: (ids: string[]) => void
  commit: (change: (current: MaiState) => MaiState) => void
  onSettings: () => void
}

const tomorrow = (day: string) => { const date = new Date(`${day}T12:00:00`); date.setDate(date.getDate() + 1); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }

/**
 * Painel de notificações (regra única em lib/v2/alerts.ts): abas por tipo, ações rápidas
 * (concluir, adiar para amanhã, dispensar), "Dispensar tudo" e atalho para as configurações.
 */
export function NotificationPanel({ look, alerts, today, anchor, onOpen, onClose, onDismiss, commit, onSettings }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<CSSProperties>({})
  const [tab, setTab] = useState<AlertGroupId | 'all'>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    const rect = anchor?.getBoundingClientRect()
    if (rect) setPos({ top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 200)), left: Math.max(8, Math.min(rect.left, window.innerWidth - 408)) })
    const close = (event: Event) => { if (!ref.current?.contains(event.target as Node) && !anchor?.contains(event.target as Node)) onClose() }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key) }
  }, [anchor, onClose])

  const shown = useMemo(() => GROUPS.filter(group => look.groups[group.flag]), [look.groups])
  const byGroup = (id: AlertGroupId) => alerts.filter(entry => entry.group === id)
  const visibleGroups = shown.filter(group => byGroup(group.id).length)
  const attention = byGroup('overdue').length + byGroup('reminder').filter(entry => !entry.note.startsWith('Lembra às')).length
  const activeTab = tab === 'all' || visibleGroups.some(group => group.id === tab) ? tab : 'all'
  const listed = visibleGroups.filter(group => activeTab === 'all' || group.id === activeTab)

  const patchTask = (entry: AlertItem, patch: Record<string, unknown>) => commit(current => ({ ...current, tasks: current.tasks.map(task => (String(task.id) === entry.item.sourceId ? ({ ...task, ...patch } as typeof task) : task)) }))
  const complete = (entry: AlertItem) => { patchTask(entry, { concluida: true, concluida_em: new Date().toISOString() }); onDismiss([entry.id]) }
  const postpone = (entry: AlertItem) => {
    const raw = String(entry.item.raw?.data_vencimento || '')
    patchTask(entry, { data_vencimento: `${tomorrow(today)}${raw.includes('T') ? raw.slice(10) : ''}` })
    onDismiss([entry.id])
  }

  const subtitle = attention ? `${attention} ${attention === 1 ? 'pede' : 'pedem'} atenção` : alerts.length ? 'Nada urgente agora' : 'Tudo em dia'

  return (
    <div ref={ref} className={styles.alertPanel} data-density={look.panel} style={pos} role="dialog" aria-label="Notificações">
      <header className={styles.alertTop}>
        <span className={styles.alertTitleBox}><strong>Notificações</strong><small data-urgent={attention ? true : undefined}>{subtitle}</small></span>
        {alerts.length ? <button type="button" className={styles.alertLink} onClick={() => onDismiss(alerts.map(entry => entry.id))}>Dispensar tudo</button> : null}
        <button type="button" className={styles.alertIconBtn} onClick={() => { onClose(); onSettings() }} aria-label="Configurar lembretes" title="Configurar lembretes"><Icon name="settings" size={18} filled={false} /></button>
      </header>

      {visibleGroups.length > 1 ? (
        <div className={styles.alertTabs} role="tablist" aria-label="Tipo de aviso">
          {([{ id: 'all', title: 'Tudo', count: visibleGroups.reduce((sum, group) => sum + byGroup(group.id).length, 0) }, ...visibleGroups.map(group => ({ id: group.id, title: group.title, count: byGroup(group.id).length }))] as { id: AlertGroupId | 'all'; title: string; count: number }[]).map(item => (
            <button key={item.id} type="button" role="tab" aria-selected={activeTab === item.id} data-active={activeTab === item.id || undefined} onClick={() => setTab(item.id)}>{item.title}<small>{item.count}</small></button>
          ))}
        </div>
      ) : null}

      <div className={styles.alertScroll}>
        {listed.length ? listed.map(group => {
          const list = byGroup(group.id)
          const open = expanded.has(group.id)
          return (
            <section key={group.id} className={styles.alertGroup} aria-label={group.title}>
              <div className={styles.alertGroupTitle}><Icon name={group.icon} size={15} filled={false} style={{ color: group.color }} />{group.title}<span>{list.length}</span></div>
              {(open ? list : list.slice(0, MAX)).map(entry => (
                <div key={entry.id} className={styles.alertItem}>
                  <button type="button" className={styles.alertRow} onClick={() => onOpen(entry)}>
                    <span className={styles.alertTile} style={{ color: entry.item.color || group.color }}><Icon name={KIND_ICON[entry.item.kind] || 'task_alt'} size={17} filled={false} /></span>
                    <span className={styles.alertText}>
                      <strong>{entry.item.title}</strong>
                      <small style={group.id === 'overdue' ? { color: 'var(--ds-danger)' } : undefined}>{entry.note}</small>
                      {entry.item.subtitle ? <small className={styles.alertSub}>{entry.item.subtitle}</small> : null}
                    </span>
                  </button>
                  <span className={styles.alertActions}>
                    {entry.item.kind === 'task' ? <button type="button" onClick={() => complete(entry)} aria-label="Concluir" title="Concluir"><Icon name="check" size={16} filled={false} /></button> : null}
                    {entry.item.kind === 'task' && entry.group !== 'soon' ? <button type="button" onClick={() => postpone(entry)} aria-label="Adiar para amanhã" title="Adiar para amanhã"><Icon name="event_upcoming" size={16} filled={false} /></button> : null}
                    <button type="button" onClick={() => onDismiss([entry.id])} aria-label="Dispensar" title="Dispensar"><Icon name="close" size={16} filled={false} /></button>
                  </span>
                </div>
              ))}
              {list.length > MAX && !open ? <button type="button" className={styles.alertMoreBtn} onClick={() => setExpanded(current => new Set(current).add(group.id))}>Ver mais {list.length - MAX}</button> : null}
            </section>
          )
        }) : (
          <div className={styles.alertEmpty}>
            <span className={styles.alertEmptyIcon}><Icon name="check_circle" size={26} filled={false} /></span>
            <strong>Tudo em dia</strong>
            <span>Nada vencido, nada com lembrete e nada urgente agora.</span>
          </div>
        )}
      </div>
    </div>
  )
}
