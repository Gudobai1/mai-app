'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes } from 'react'
import { eventColor, type PlannerItem } from '../../../lib/v2/planner'
import { Icon } from '../../ds'
import styles from './AgendaStrip.module.css'

/**
 * Agenda do dia (24h). Celular: faixa fina horizontal + lista simples.
 * Computador: linha do tempo vertical com eixo de horas.
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
const HOUR_HEIGHT = 56 // computador: linha do tempo vertical, 24h
const pct = (minutes: number) => `${(minutes / 1440) * 100}%`
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

  // Compromissos que se sobrepõem ficam lado a lado (cada grupo tem suas colunas).
  const placed = useMemo(() => {
    const result: { item: PlannerItem; start: number; end: number; lane: number; lanes: number }[] = []
    let group: typeof result = []
    let groupEnd = -1
    let laneEnds: number[] = []
    const flush = () => { group.forEach(entry => { entry.lanes = Math.max(1, laneEnds.length) }); group = []; laneEnds = [] }
    for (const entry of timed) {
      if (group.length && entry.start >= groupEnd) flush()
      let lane = laneEnds.findIndex(last => last <= entry.start)
      if (lane < 0) { lane = laneEnds.length; laneEnds.push(entry.end) } else laneEnds[lane] = entry.end
      groupEnd = Math.max(groupEnd, entry.end)
      const placedEntry = { ...entry, lane, lanes: 1 }
      group.push(placedEntry)
      result.push(placedEntry)
    }
    flush()
    return result
  }, [timed])
  const laneCount = Math.max(1, ...placed.map(entry => entry.lane + 1))

  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)')
    const sync = () => setMobile(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  const scroller = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const box = scroller.current
    if (!box || mobile) return
    const focus = nowMinutes ?? timed[0]?.start
    if (focus === undefined) return
    box.scrollTop = Math.max(0, (focus / 60) * HOUR_HEIGHT - HOUR_HEIGHT * 1.5)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timed.length, mobile])

  const hours = Array.from({ length: 24 }, (_, index) => index)

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

      {placed.length && mobile ? (
        <>
          <div className={styles.thin} style={{ height: 12 + laneCount * 14 }} aria-label="Dia inteiro, 24 horas">
            {placed.map(({ item, start, end, lane }) => (
              <button
                key={item.id}
                type="button"
                className={styles.thinBlock}
                data-passed={isPassed(item) || undefined}
                style={{ '--ev': eventColor(item.raw), left: pct(start), width: `max(6px, ${((end - start) / 1440) * 100}%)`, top: 6 + lane * 14, height: laneCount > 1 ? 12 : 14 } as CSSProperties}
                onClick={() => onOpen(item)}
                aria-label={`${item.title}, ${hm(start)} às ${hm(end)}`}
                {...bind(item)}
              />
            ))}
            {nowMinutes !== null ? (
              <span className={styles.thinNow} style={{ left: pct(nowMinutes) }} aria-hidden="true"><i>{hm(Math.floor(nowMinutes))}</i></span>
            ) : null}
          </div>

          <div className={styles.list} role="list">
            {placed.map(({ item, start }) => (
              <button key={item.id} type="button" role="listitem" className={styles.row} data-passed={isPassed(item) || undefined} style={{ '--ev': eventColor(item.raw) } as CSSProperties} onClick={() => onOpen(item)} {...bind(item)}>
                <span className={styles.rowTime}>{hm(start)}</span>
                <span className={styles.rowDot} aria-hidden="true" />
                <strong>{item.title}</strong>
                {item.recurring ? <Icon name="repeat" size={12} /> : null}
                <small>{sourceOf(item)}</small>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {placed.length && !mobile ? (
        <div ref={scroller} className={styles.vertical} aria-label="Linha do tempo do dia">
          <div className={styles.vTrack} style={{ height: 24 * HOUR_HEIGHT }}>
            {hours.map(hour => (
              <span key={hour} className={styles.vHour} style={{ top: hour * HOUR_HEIGHT }}><i>{String(hour).padStart(2, '0')}:00</i></span>
            ))}
            {placed.map(({ item, start, end, lane, lanes }) => (
              <button
                key={item.id}
                type="button"
                className={styles.vBlock}
                data-passed={isPassed(item) || undefined}
                style={{
                  '--ev': eventColor(item.raw),
                  top: (start / 60) * HOUR_HEIGHT + 1,
                  height: Math.max(26, ((end - start) / 60) * HOUR_HEIGHT - 2),
                  left: `calc(var(--gutter) + (100% - var(--gutter)) * ${lane / lanes})`,
                  width: `calc((100% - var(--gutter)) / ${lanes} - 4px)`,
                } as CSSProperties}
                onClick={() => onOpen(item)}
                {...bind(item)}
              >
                <strong>{item.title}</strong>
                <small>
                  {isGoogle(item) ? <b className={styles.g} aria-label="Google Agenda">G</b> : null}
                  <span>{hm(start)}–{hm(end)} · {contextOf(item)}</span>
                  {item.recurring ? <Icon name="repeat" size={12} /> : null}
                </small>
              </button>
            ))}
            {nowMinutes !== null ? <span className={styles.vNow} style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }} aria-hidden="true" /> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
