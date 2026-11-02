'use client'

import { useMemo, useState, type CSSProperties, type HTMLAttributes } from 'react'
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

export function AgendaStrip({ items, nowMinutes, onOpen, bind }: Props) {
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

  const [folded, setFolded] = useState(false)

  /* Todos os compromissos no mesmo bloco "Eventos": barrinha na cor, título e quando. */
  const entries = [
    ...allDay.map(item => ({ item, when: item.subtitle === 'Em andamento' ? 'Em andamento' : 'Dia todo', now: false })),
    ...timed.map(({ item, start, end, hasEnd }) => ({
      item,
      when: `${hm(start)}${hasEnd ? ` – ${hm(end)}` : ''}`,
      now: nowMinutes !== null && nowMinutes >= start && nowMinutes < end,
    })),
  ]

  if (!entries.length) return null
  return (
    <div className={styles.events} role="group" aria-label="Eventos">
      {folded ? (
        <button type="button" className={styles.eventsHead} onClick={() => setFolded(false)} aria-expanded="false">
          <strong>Eventos</strong><small>{entries.length}</small><Icon name="expand_more" size={18} filled={false} />
        </button>
      ) : (
        <>
          <button type="button" className={styles.fold} onClick={() => setFolded(true)} aria-label="Recolher eventos" aria-expanded="true"><Icon name="expand_less" size={18} filled={false} /></button>
          <div role="list" className={styles.extList}>
            {entries.map(({ item, when, now }) => (
              <button key={item.id} type="button" role="listitem" className={styles.ext} data-now={now || undefined} style={{ '--ev': eventColor(item.raw) } as CSSProperties} onClick={() => onOpen(item)} {...bind(item)}>
                <i aria-hidden="true" />
                <span className={styles.extTitle}>{item.title}{item.recurring ? <Icon name="repeat" size={12} /> : null}</span>
                <small className={styles.extWhen}>{when}</small>
                <small className={styles.extSource}>{sourceOf(item)}</small>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
