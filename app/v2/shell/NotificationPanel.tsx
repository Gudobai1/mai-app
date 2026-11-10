'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Icon } from '../../ds'
import type { AlertGroupId, AlertItem } from '../../../lib/v2/alerts'
import type { ReminderConfig } from '../../../lib/v2/reminders'
import styles from './ModernShell.module.css'

const GROUPS: { id: AlertGroupId; title: string; icon: string; color: string }[] = [
  { id: 'overdue', title: 'Vencidos', icon: 'warning', color: 'var(--ds-danger)' },
  { id: 'reminder', title: 'Lembretes', icon: 'notifications', color: 'var(--ds-sky-fg)' },
  { id: 'today', title: 'Para hoje', icon: 'today', color: 'var(--ds-muted)' },
]
const KIND_ICON: Record<string, string> = { task: 'task_alt', finance: 'account_balance_wallet', goal: 'flag', event: 'event', habit: 'autorenew' }

type Props = { look: ReminderConfig['look']; alerts: AlertItem[]; anchor: HTMLElement | null; onOpen: (alert: AlertItem) => void; onClose: () => void }

/**
 * Painel do sino: vencidos, lembretes e o que falta hoje (regra única em lib/v2/alerts.ts).
 * Abre ao lado do sino; clicar numa linha abre o item no popup padrão.
 */
export function NotificationPanel({ look, alerts, anchor, onOpen, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<CSSProperties>({})

  useEffect(() => {
    const rect = anchor?.getBoundingClientRect()
    if (rect) setPos({ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - 368)) })
    const close = (event: Event) => { if (!ref.current?.contains(event.target as Node) && !anchor?.contains(event.target as Node)) onClose() }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key) }
  }, [anchor, onClose])

  return (
    <div ref={ref} className={styles.alertPanel} data-density={look.panel} style={pos} role="dialog" aria-label="Notificações">
      <div className={styles.alertHead}>Notificações</div>
      {alerts.some(entry => look.groups[entry.group]) ? GROUPS.map(group => {
        if (!look.groups[group.id]) return null
        const list = alerts.filter(entry => entry.group === group.id)
        if (!list.length) return null
        return (
          <section key={group.id} className={styles.alertGroup} aria-label={group.title}>
            <div className={styles.alertGroupTitle}><Icon name={group.icon} size={15} filled={false} style={{ color: group.color }} />{group.title}<span>{list.length}</span></div>
            {list.slice(0, 12).map(entry => (
              <button key={entry.id} type="button" className={styles.alertRow} onClick={() => onOpen(entry)}>
                <Icon name={KIND_ICON[entry.item.kind] || 'task_alt'} size={18} filled={false} style={{ color: entry.item.color || group.color }} />
                <span className={styles.alertText}>
                  <strong>{entry.item.title}</strong>
                  <small style={group.id === 'overdue' ? { color: 'var(--ds-danger)' } : undefined}>{entry.note}</small>
                </span>
              </button>
            ))}
            {list.length > 12 ? <div className={styles.alertMore}>+{list.length - 12} {list.length - 12 === 1 ? 'item' : 'itens'}</div> : null}
          </section>
        )
      }) : <div className={styles.alertEmpty}><Icon name="check_circle" size={22} filled={false} /><span>Tudo em dia. Nada vencido nem com lembrete.</span></div>}
    </div>
  )
}
