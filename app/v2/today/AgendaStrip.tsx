'use client'

import { useLayoutEffect, useMemo, useRef, type CSSProperties, type HTMLAttributes } from 'react'
import { eventColor, type PlannerItem } from '../../../lib/v2/planner'
import { Icon } from '../../ds'
import styles from './AgendaStrip.module.css'

/**
 * Agenda do dia: faixa "Dia todo" no topo, linha do tempo horizontal que
 * rola e, embaixo, a lista simples dos compromissos com horário.
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
const HOUR_WIDTH = 76

const isGoogle = (item: PlannerItem) => item.raw.tipo === 'google' || item.raw.tipo === 'gcalendar'
const sourceOf = (item: PlannerItem) => String(item.raw.calendario_nome || (isGoogle(item) ? 'Google Agenda' : item.raw.categoria || 'MAI'))
const contextOf = (item: PlannerItem) => [sourceOf(item), String(item.raw.local || '').trim()].filter(Boolean).join(' · ')

export function AgendaStrip({ items, nowMinutes, isPassed, onOpen, bind }: Props) {
  const allDay = items.filter(item => item.raw.dia_inteiro === true || !item.time || item.subtitle === 'Em andamento')
  const timed = useMemo(
    () => items
      .filter(item => !allDay.includes(item))
      .map(item => {
        const start = minutesOf(item.time)
        const rawEnd = minutesOf(String(item.raw.hora_fim || ''))
        const end = Number.isFinite(rawEnd) && rawEnd > start ? rawEnd : start + 60
        return { item, start, end }
      })
      .filter(entry => Number.isFinite(entry.start))
      .sort((a, b) => a.start - b.start || a.end - b.end),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  )

  const startHour = Math.max(0, Math.min(6, Math.floor((timed[0]?.start ?? 360) / 60) - 1))
  const endHour = Math.min(24, Math.max(22, Math.ceil((timed[timed.length - 1]?.end ?? 1320) / 60) + 1))
  const left = (minutes: number) => ((minutes / 60) - startHour) * HOUR_WIDTH

  // Compromissos que se sobrepõem ficam em fileiras separadas.
  const lanes: number[] = []
  const placed = timed.map(entry => {
    let lane = lanes.findIndex(last => last <= entry.start)
    if (lane < 0) { lane = lanes.length; lanes.push(entry.end) } else lanes[lane] = entry.end
    return { ...entry, lane }
  })
  const laneCount = Math.max(1, lanes.length)

  const scroller = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const box = scroller.current
    if (!box) return
    const focus = nowMinutes ?? timed[0]?.start
    if (focus === undefined) return
    box.scrollLeft = Math.max(0, left(focus) - box.clientWidth * 0.4)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timed.length, startHour])

  const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index)

  return (
    <div className={styles.strip}>
      {allDay.map(item => (
        <button key={item.id} type="button" className={styles.allDay} style={{ '--ev': eventColor(item.raw) } as CSSProperties} onClick={() => onOpen(item)} {...bind(item)}>
          <span className={styles.allDayTag}>{item.subtitle === 'Em andamento' ? 'Contínuo' : 'Dia todo'}</span>
          <span className={styles.allDayBody}>
            <strong>{item.title}</strong>
            <small>{contextOf(item)}</small>
          </span>
        </button>
      ))}

      {placed.length ? (
        <>
          <div ref={scroller} className={styles.scroller} aria-label="Linha do tempo do dia">
            <div className={styles.track} style={{ width: (endHour - startHour) * HOUR_WIDTH, height: 22 + laneCount * 54 }}>
              {hours.map(hour => (
                <span key={hour} className={styles.tick} style={{ left: (hour - startHour) * HOUR_WIDTH }}><i>{String(hour).padStart(2, '0')}h</i></span>
              ))}
              {placed.map(({ item, start, end, lane }) => (
                <button
                  key={item.id}
                  type="button"
                  className={styles.block}
                  data-passed={isPassed(item) || undefined}
                  style={{ '--ev': eventColor(item.raw), left: left(start) + 2, width: Math.max(44, ((end - start) / 60) * HOUR_WIDTH - 4), top: 22 + lane * 54 } as CSSProperties}
                  onClick={() => onOpen(item)}
                  {...bind(item)}
                >
                  <strong>{item.title}</strong>
                  <small>{hm(start)}–{hm(end)}</small>
                </button>
              ))}
              {nowMinutes !== null && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60 ? <span className={styles.now} style={{ left: left(nowMinutes) }} aria-hidden="true" /> : null}
            </div>
          </div>

          <div className={styles.list} role="list">
            {placed.map(({ item, start }) => (
              <button key={item.id} type="button" role="listitem" className={styles.row} data-passed={isPassed(item) || undefined} style={{ '--ev': eventColor(item.raw) } as CSSProperties} onClick={() => onOpen(item)} {...bind(item)}>
                <span className={styles.rowTime}>{hm(start)}</span>
                <span className={styles.rowBar} aria-hidden="true" />
                <span className={styles.rowBody}>
                  <strong>{item.title}</strong>
                  <small>
                    {isGoogle(item) ? <b className={styles.g} aria-label="Google Agenda">G</b> : null}
                    <span>{contextOf(item)}</span>
                    {item.recurring ? <Icon name="repeat" size={12} /> : null}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
