'use client'

import { useMemo, type CSSProperties, type HTMLAttributes } from 'react'
import { eventColor, type PlannerItem } from '../../../lib/v2/planner'
import { Icon } from '../../ds'
import styles from './AgendaStrip.module.css'

/**
 * Agenda do dia — mesmo cartão das tarefas: círculo na cor do calendário,
 * título, horário com ícone e, à direita, o calendário de origem com "#".
 * "Dia todo" e compromissos em andamento vêm primeiro.
 */

type Props = {
  items: PlannerItem[]
  /** Minutos desde 00:00 se o dia mostrado é hoje; null nos outros dias. */
  nowMinutes: number | null
  isPassed: (item: PlannerItem) => boolean
  onOpen: (item: PlannerItem) => void
  /** Marca o compromisso como concluído (círculo à esquerda). */
  onToggle?: (item: PlannerItem) => void
  bind: (item: PlannerItem) => HTMLAttributes<HTMLElement>
}

const minutesOf = (time: string) => {
  const [hour, minute] = String(time || '').split(':').map(Number)
  return Number.isFinite(hour) ? hour * 60 + (Number.isFinite(minute) ? minute : 0) : NaN
}
const hm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

const isGoogle = (item: PlannerItem) => item.raw.tipo === 'google' || item.raw.tipo === 'gcalendar'
const sourceOf = (item: PlannerItem) => String(item.raw.calendario_nome || (isGoogle(item) ? 'Google Agenda' : item.raw.categoria || 'MAI'))

export function AgendaStrip({ items, nowMinutes, onOpen, onToggle, bind }: Props) {
  const allDay = items.filter(item => item.raw.dia_inteiro === true || !item.time || item.subtitle === 'Em andamento')
  const timed = useMemo(
    () => items
      .filter(item => !allDay.includes(item))
      .map(item => {
        const start = minutesOf(item.time)
        const rawEnd = minutesOf(String(item.raw.hora_fim || ''))
        const hasEnd = Number.isFinite(rawEnd) && rawEnd > start
        const end = hasEnd ? rawEnd : start + 60
        return { item, start, end, hasEnd }
      })
      .filter(entry => Number.isFinite(entry.start))
      .sort((a, b) => a.start - b.start || a.end - b.end),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  )

  const row = (item: PlannerItem, when: string, icon: string, now: boolean) => (
    <div
      key={item.id}
      role="listitem"
      className={styles.row}
      data-now={now || undefined}
      style={{ '--ev': eventColor(item.raw) } as CSSProperties}
      {...bind(item)}
    >
      <button type="button" className={styles.ring} aria-label={`Concluir: ${item.title}`} onClick={() => onToggle?.(item)} />
      <button type="button" className={styles.body} onClick={() => onOpen(item)}>
        <span className={styles.title}>
          {item.title}
          {item.recurring ? <Icon name="repeat" size={12} /> : null}
        </span>
        <span className={styles.when}><Icon name={icon} size={13} filled={false} />{when}</span>
      </button>
      <span className={styles.source}>{sourceOf(item)}<b>#</b></span>
    </div>
  )

  return (
    <div className={styles.list} role="list">
      {allDay.map(item => row(item, item.subtitle === 'Em andamento' ? 'Em andamento' : 'Dia todo', item.subtitle === 'Em andamento' ? 'schedule' : 'calendar_today', false))}
      {timed.map(({ item, start, end, hasEnd }) => row(
        item,
        `${hm(start)}${hasEnd ? ` – ${hm(end)}` : ''}`,
        'schedule',
        nowMinutes !== null && nowMinutes >= start && nowMinutes < end,
      ))}
    </div>
  )
}
