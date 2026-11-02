'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { addDays } from '../../../lib/v2/planner'
import { Icon } from '../../ds'
import styles from './Pickers.module.css'

/*
 * Seletores do próprio MAI: lista de opções, calendário e horário.
 * Computador: caixinha ao lado do campo. Celular: folha que sobe de baixo.
 */

export type PickerOption = { value: string; label: string; icon?: string; color?: string; image?: string; hint?: string }

function isMobile() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches
}

export function Floating({ anchor, title, onClose, children, width = 280 }: { anchor: RefObject<HTMLElement | null>; title: string; onClose: () => void; children: ReactNode; width?: number }) {
  const panel = useRef<HTMLDivElement | null>(null)
  const [mobile] = useState(isMobile)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (mobile || !anchor.current || !panel.current) return
    const rect = anchor.current.getBoundingClientRect()
    const box = panel.current.getBoundingClientRect()
    const margin = 10
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - box.width - margin))
    const below = rect.bottom + 6
    const top = below + box.height + margin <= window.innerHeight ? below : Math.max(margin, rect.top - box.height - 6)
    setPosition({ left, top })
  }, [mobile, anchor])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      className={styles.layer}
      data-sheet={mobile || undefined}
      onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) onClose() }}
      onPointerDown={event => event.stopPropagation()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-label={title}
        className={styles.panel}
        style={mobile ? undefined : { width, ...(position ? { left: position.left, top: position.top } : { visibility: 'hidden', left: 0, top: 0 }) }}
      >
        {mobile ? <div className={styles.handle} aria-hidden="true" /> : null}
        {mobile ? <div className={styles.sheetTitle}>{title}</div> : null}
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function OptionList({ options, value, onSelect }: { options: PickerOption[]; value: string; onSelect: (value: string) => void }) {
  const list = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[data-selected]')?.scrollIntoView({ block: 'nearest' })
  }, [])
  return (
    <div ref={list} className={styles.options} role="listbox">
      {options.map(option => (
        <button key={option.value} type="button" role="option" aria-selected={option.value === value} data-selected={option.value === value || undefined} className={styles.option} onClick={() => onSelect(option.value)}>
          {option.image
            ? <img className={styles.optionImage} src={option.image} alt="" />
            : option.icon ? <Icon name={option.icon} size={18} className={styles.optionIcon} style={option.color ? { color: option.color } : undefined} />
            : option.color ? <span className={styles.optionDot} style={{ background: option.color }} /> : null}
          <span className={styles.optionText}>{option.label}{option.hint ? <small>{option.hint}</small> : null}</span>
          {option.value === value ? <Icon name="check" size={18} className={styles.optionCheck} /> : null}
        </button>
      ))}
    </div>
  )
}

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

export function DatePicker({ value, today, onSelect, allowEmpty = true }: { value: string; today: string; onSelect: (value: string) => void; allowEmpty?: boolean }) {
  const [month, setMonth] = useState(() => (value || today).slice(0, 7))
  const cells = useMemo(() => {
    const first = new Date(`${month}-01T12:00:00`)
    const start = addDays(`${month}-01`, -first.getDay())
    return Array.from({ length: 42 }, (_, index) => addDays(start, index))
  }, [month])
  const shift = (amount: number) => {
    const date = new Date(`${month}-01T12:00:00`)
    date.setMonth(date.getMonth() + amount)
    setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
  }
  const label = new Date(`${month}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const quick = [
    { label: 'Hoje', icon: 'today', value: today },
    { label: 'Amanhã', icon: 'wb_sunny', value: addDays(today, 1) },
  ]

  return (
    <div className={styles.date}>
      <div className={styles.quick}>
        {quick.map(item => (
          <button key={item.label} type="button" className={styles.quickChip} data-active={value === item.value || undefined} onClick={() => onSelect(item.value)}>
            <Icon name={item.icon} size={16} />{item.label}
          </button>
        ))}
        {allowEmpty ? <button type="button" className={styles.quickChip} data-active={!value || undefined} onClick={() => onSelect('')}><Icon name="event_busy" size={16} />Sem data</button> : null}
      </div>
      <div className={styles.monthHead}>
        <strong>{label.charAt(0).toLocaleUpperCase('pt-BR') + label.slice(1)}</strong>
        <span>
          <button type="button" className={styles.navButton} onClick={() => shift(-1)} aria-label="Mês anterior"><Icon name="chevron_left" size={20} filled={false} /></button>
          <button type="button" className={styles.navButton} onClick={() => shift(1)} aria-label="Próximo mês"><Icon name="chevron_right" size={20} filled={false} /></button>
        </span>
      </div>
      <div className={styles.grid}>
        {WEEKDAYS.map((day, index) => <span key={index} className={styles.weekday}>{day}</span>)}
        {cells.map(key => (
          <button
            key={key}
            type="button"
            className={styles.day}
            data-out={key.slice(0, 7) !== month || undefined}
            data-today={key === today || undefined}
            data-selected={key === value || undefined}
            onClick={() => onSelect(key)}
            aria-label={new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}
          >
            {Number(key.slice(8))}
          </button>
        ))}
      </div>
    </div>
  )
}

const SUGGESTED_TIMES = ['08:00', '09:00', '12:00', '14:00', '18:00', '20:00']

export function TimePicker({ value, onSelect, allowEmpty = true, emptyLabel = 'Sem horário' }: { value: string; onSelect: (value: string) => void; allowEmpty?: boolean; emptyLabel?: string }) {
  const [custom, setCustom] = useState(value || '')
  const valid = /^\d{2}:\d{2}$/.test(custom)
  return (
    <div className={styles.time}>
      {allowEmpty ? (
        <button type="button" className={styles.timeNone} data-selected={!value || undefined} onClick={() => onSelect('')}>
          <Icon name="schedule" size={18} className={styles.optionIcon} />
          <span className={styles.optionText}>{emptyLabel}</span>
          {!value ? <Icon name="check" size={18} className={styles.optionCheck} /> : null}
        </button>
      ) : null}
      <div className={styles.timeGrid}>
        {SUGGESTED_TIMES.map(time => (
          <button key={time} type="button" className={styles.timeCell} data-selected={time === value || undefined} onClick={() => onSelect(time)}>{time}</button>
        ))}
      </div>
      <form
        className={styles.timeCustom}
        onSubmit={event => { event.preventDefault(); if (valid) onSelect(custom) }}
      >
        <input
          type="time"
          className={styles.timeInput}
          value={custom}
          step={300}
          aria-label="Outro horário"
          onChange={event => setCustom(event.target.value)}
        />
        <button type="submit" className={styles.timeOk} disabled={!valid}>Definir</button>
      </form>
    </div>
  )
}
