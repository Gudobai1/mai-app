'use client'

import { useMemo, type CSSProperties, type HTMLAttributes } from 'react'
import { eventColor, type PlannerItem } from '../../../lib/v2/planner'
import { Icon } from '../../ds'
import styles from './AgendaStrip.module.css'

/**
 * Agenda do dia, igual no celular e no computador: itens de "Dia todo" em
 * cartão e, embaixo, uma linha por compromisso com horário.
 */

type Props = {
  items: PlannerItem[]
  /** Minutos desde 00:00 se o dia mostrado é hoje; null nos outros dias. */
  nowMinutes: number | null
  isPassed: (item: PlannerItem) => boolean
  onOpen: (item: PlannerItem) => void
  bind: (item: PlannerItem) => HTMLAttributes<HTMLElement>
}

const minutesOf = (time: string) => {
  const [hour, minute] = String(time || '').split(':').map(Number)
  return Number.isFinite(hour) ? hour * 60 + (Number.isFinite(minute) ? minute : 0) : NaN
}
const hm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

const duration = (minutes: number) => {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} min`
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

const isGoogle = (item: PlannerItem) => item.raw.tipo === 'google' || item.raw.tipo === 'gcalendar'
const sourceOf = (item: PlannerItem) => String(item.raw.calendario_nome || (isGoogle(item) ? 'Google Agenda' : item.raw.categoria || 'MAI'))

export function AgendaStrip({ items, nowMinutes, isPassed, onOpen, bind }: Props) {
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

  return (
    <div className={styles.strip}>
      {allDay.map(item => (
        <button key={item.id} type="button" className={styles.allDay} style={{ '--ev': eventColor(item.raw) } as CSSProperties} onClick={() => onOpen(item)} {...bind(item)}>
          <span className={styles.allDayTag}>{item.subtitle === 'Em andamento' ? 'Contínuo' : 'Dia todo'}</span>
          <strong>{item.title}</strong>
          <small>{sourceOf(item)}</small>
        </button>
      ))}

      {timed.length ? (
        <div className={styles.list} role="list">
          {timed.map(({ item, start, end, hasEnd }) => (
            <button
              key={item.id}
              type="button"
              role="listitem"
              className={styles.row}
              data-passed={isPassed(item) || undefined}
              data-now={(nowMinutes !== null && nowMinutes >= start && nowMinutes < end) || undefined}
              style={{ '--ev': eventColor(item.raw) } as CSSProperties}
              onClick={() => onOpen(item)}
              {...bind(item)}
            >
              <span className={styles.rowDot} aria-hidden="true" />
              <span className={styles.rowTime}>{hm(start)}</span>
              <strong>{item.title}</strong>
              {item.recurring ? <Icon name="repeat" size={12} /> : null}
              <small>{hasEnd ? `${duration(end - start)} · ` : ''}{sourceOf(item)}</small>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
