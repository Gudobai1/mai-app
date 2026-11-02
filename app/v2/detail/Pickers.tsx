'use client'

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { addDays } from '../../../lib/v2/planner'
import { Icon } from '../../ds'
import styles from './Pickers.module.css'

/*
 * Seletores do próprio MAI: lista de opções, calendário e horário.
 * Computador: caixinha ao lado do campo. Celular: folha que sobe de baixo.
 */

export type PickerOption = { value: string; label: string; icon?: string; color?: string; image?: string; hint?: string; depth?: number }

function isMobile() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches
}

/*
 * Os seletores só valem depois de "Definir": escolher uma opção apenas marca;
 * "Cancelar" (ou Esc / clicar fora) fecha sem mudar nada.
 */
type Stage = { set: (apply: () => void) => void }
const StageCtx = createContext<Stage | null>(null)

/** Marca a escolha dentro de um Floating; fora dele, vale na hora. */
function useStaged<T>(value: T, onSelect: (value: T) => void): [T, (value: T) => void] {
  const stage = useContext(StageCtx)
  const [pending, setPending] = useState<{ value: T } | null>(null)
  const choose = (next: T) => {
    if (!stage) { onSelect(next); return }
    setPending({ value: next })
    stage.set(() => onSelect(next))
  }
  return [pending ? pending.value : value, choose]
}

export function Floating({ anchor, title, onClose, children, width = 280 }: { anchor: RefObject<HTMLElement | null>; title: string; onClose: () => void; children: ReactNode; width?: number }) {
  const panel = useRef<HTMLDivElement | null>(null)
  const [mobile] = useState(isMobile)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const applyRef = useRef<(() => void) | null>(null)
  const [staged, setStaged] = useState(false)
  const stage = useMemo<Stage>(() => ({ set: apply => { applyRef.current = apply; setStaged(true) } }), [])

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
        <StageCtx.Provider value={stage}>{children}</StageCtx.Provider>
        <div className={styles.pickerFooter}>
          <button type="button" className={styles.pickerCancel} onClick={onClose}>Cancelar</button>
          <button type="button" className={styles.pickerOk} disabled={!staged} onClick={() => { const apply = applyRef.current; if (apply) apply() }}>Definir</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function OptionList({ options, value: current, onSelect: select }: { options: PickerOption[]; value: string; onSelect: (value: string) => void }) {
  const [value, onSelect] = useStaged(current, select)
  const list = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[data-selected]')?.scrollIntoView({ block: 'nearest' })
  }, [])
  return (
    <div ref={list} className={styles.options} role="listbox">
      {options.map(option => (
        <button key={option.value} type="button" role="option" aria-selected={option.value === value} data-selected={option.value === value || undefined} className={styles.option} style={option.depth ? { paddingLeft: 10 + option.depth * 18 } : undefined} onClick={() => onSelect(option.value)}>
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

export function DatePicker({ value: current, today, onSelect: select, allowEmpty = true }: { value: string; today: string; onSelect: (value: string) => void; allowEmpty?: boolean }) {
  const [value, onSelect] = useStaged(current, select)
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

const WHEEL_ROW = 36
const pad2 = (n: number) => String(n).padStart(2, '0')

/** Uma coluna de rolagem (como no iPhone): o número do meio é o escolhido. */
function Wheel({ count, value, onChange, label }: { count: number; value: number; onChange: (value: number) => void; label: string }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useLayoutEffect(() => { if (ref.current) ref.current.scrollTop = value * WHEEL_ROW }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => window.clearTimeout(timer.current), [])
  // Mouse: cada rolada anda um número só.
  const current = useRef(value)
  current.current = value
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let last = 0
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const now = Date.now()
      if (now - last < 70) return
      const direction = Math.sign(event.deltaY)
      if (!direction) return
      last = now
      const next = Math.max(0, Math.min(count - 1, current.current + direction))
      if (next === current.current) return
      current.current = next
      onChange(next)
      el.scrollTo({ top: next * WHEEL_ROW, behavior: 'smooth' })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [count, onChange])
  const settle = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      if (!ref.current) return
      const next = Math.max(0, Math.min(count - 1, Math.round(ref.current.scrollTop / WHEEL_ROW)))
      if (next !== value) onChange(next)
    }, 90)
  }
  return (
    <div ref={ref} className={styles.wheel} role="listbox" aria-label={label} onScroll={settle}>
      {Array.from({ length: count }, (_, index) => (
        <button
          key={index}
          type="button"
          role="option"
          aria-selected={index === value}
          tabIndex={index === value ? 0 : -1}
          className={styles.wheelItem}
          data-selected={index === value || undefined}
          onClick={() => { onChange(index); ref.current?.scrollTo({ top: index * WHEEL_ROW, behavior: 'smooth' }) }}
        >{pad2(index)}</button>
      ))}
    </div>
  )
}

export function TimePicker({ value, onSelect, allowEmpty = true, emptyLabel = 'Sem horário' }: { value: string; onSelect: (value: string) => void; allowEmpty?: boolean; emptyLabel?: string }) {
  const stage = useContext(StageCtx)
  const parsed = /^(\d{2}):(\d{2})$/.exec(value || '')
  const [hour, setHour] = useState(parsed ? Number(parsed[1]) : 9)
  const [minute, setMinute] = useState(parsed ? Number(parsed[2]) : 0)
  const [cleared, setCleared] = useState(false)
  const result = cleared ? '' : `${pad2(hour)}:${pad2(minute)}`
  // O horário das colunas já fica marcado: é só tocar em Definir.
  useEffect(() => { if (stage) stage.set(() => onSelect(result)) }, [result]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={styles.time}>
      <div className={styles.wheels}>
        <div className={styles.wheelBand} aria-hidden="true" />
        <Wheel count={24} value={hour} onChange={next => { setCleared(false); setHour(next) }} label="Horas" />
        <span className={styles.wheelColon} aria-hidden="true">:</span>
        <Wheel count={60} value={minute} onChange={next => { setCleared(false); setMinute(next) }} label="Minutos" />
      </div>
      <div className={styles.timeActions}>
        {allowEmpty ? <button type="button" className={styles.timeClear} data-active={cleared || undefined} onClick={() => (stage ? setCleared(true) : onSelect(''))}>{emptyLabel}</button> : <span />}
        {stage ? null : <button type="button" className={styles.timeOk} onClick={() => onSelect(result)}>Definir</button>}
      </div>
    </div>
  )
}

/* ------------------------------------------------- Repetir e lembrete (com personalizado) */

const WEEK_NAMES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const REPEAT_PRESETS = [
  { value: '', label: 'Não repete' },
  { value: 'diariamente', label: 'Todos os dias' },
  { value: 'semanal:1,2,3,4,5', label: 'Dias úteis' },
  { value: 'semanalmente', label: 'Toda semana' },
  { value: 'mensalmente', label: 'Todo mês' },
  { value: 'anualmente', label: 'Todo ano' },
]

export function repeatLabel(value: string) {
  const preset = REPEAT_PRESETS.find(item => item.value === value)
  if (preset) return preset.label
  if (value.startsWith('intervalo:')) {
    const days = Math.max(1, Number(value.split(':')[1]) || 1)
    if (days % 7 === 0) return days === 7 ? 'Toda semana' : `A cada ${days / 7} semanas`
    return days === 1 ? 'Todos os dias' : `A cada ${days} dias`
  }
  if (value.startsWith('semanal:')) {
    const days = value.split(':')[1].split(',').map(Number).filter(day => day >= 0 && day <= 6)
    if (days.length === 1) return `Toda ${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][days[0]]}`
    return days.length ? days.map(day => WEEK_NAMES[day]).join(', ') : 'Personalizado'
  }
  return value ? 'Personalizado' : 'Não repete'
}

const REMINDER_PRESETS = [
  { value: '', label: 'Nenhum' },
  { value: '10m', label: '10 min antes' },
  { value: '30m', label: '30 min antes' },
  { value: '1h', label: '1 hora antes' },
  { value: '1d', label: '1 dia antes' },
]

export const REMINDER_OPTIONS = REMINDER_PRESETS

export function reminderLabel(value: string) {
  const preset = REMINDER_PRESETS.find(item => item.value === value)
  if (preset) return preset.label
  const match = /^(\d+)([mhd])$/.exec(value)
  if (!match) return value ? 'Personalizado' : 'Nenhum'
  const amount = Number(match[1])
  if (match[2] === 'm') return `${amount} min antes`
  if (match[2] === 'h') return `${amount} ${amount === 1 ? 'hora' : 'horas'} antes`
  return `${amount} ${amount === 1 ? 'dia' : 'dias'} antes`
}

function CustomRow({ onClick, active }: { onClick: () => void; active: boolean }) {
  return (
    <button type="button" className={styles.option} data-selected={active || undefined} onClick={onClick}>
      <Icon name="tune" size={18} className={styles.optionIcon} />
      <span className={styles.optionText}>Personalizado…</span>
      {active ? <Icon name="check" size={18} className={styles.optionCheck} /> : <Icon name="chevron_right" size={18} filled={false} className={styles.optionCheck} />}
    </button>
  )
}

export function RepeatPicker({ value, onSelect }: { value: string; onSelect: (value: string) => void }) {
  const isCustom = Boolean(value) && !REPEAT_PRESETS.some(item => item.value === value)
  const [custom, setCustom] = useState(false)
  const intervalDays = value.startsWith('intervalo:') ? Math.max(1, Number(value.split(':')[1]) || 1) : 1
  const [mode, setMode] = useState<'interval' | 'weekdays'>(value.startsWith('semanal:') && isCustom ? 'weekdays' : 'interval')
  const [unit, setUnit] = useState<'dias' | 'semanas'>(intervalDays % 7 === 0 ? 'semanas' : 'dias')
  const [amount, setAmount] = useState(String(unit === 'semanas' ? intervalDays / 7 : intervalDays))
  const [days, setDays] = useState<number[]>(value.startsWith('semanal:') ? value.split(':')[1].split(',').map(Number).filter(day => day >= 0 && day <= 6) : [1])

  if (!custom) {
    return (
      <div className={styles.options} role="listbox">
        <OptionList options={REPEAT_PRESETS} value={isCustom ? '__custom__' : value} onSelect={onSelect} />
        <CustomRow active={isCustom} onClick={() => setCustom(true)} />
      </div>
    )
  }

  const count = Math.max(1, Math.min(365, Math.floor(Number(amount)) || 1))
  const encoded = mode === 'weekdays' ? (days.length ? `semanal:${[...days].sort((a, b) => a - b).join(',')}` : '') : `intervalo:${count * (unit === 'semanas' ? 7 : 1)}`
  return <RepeatCustom encoded={encoded} onSelect={onSelect} count={count} mode={mode} setMode={setMode} amount={amount} setAmount={setAmount} unit={unit} setUnit={setUnit} days={days} setDays={setDays} back={() => setCustom(false)} />
}

function RepeatCustom({ encoded, onSelect, count, mode, setMode, amount, setAmount, unit, setUnit, days, setDays, back }: { encoded: string; onSelect: (value: string) => void; count: number; mode: 'interval' | 'weekdays'; setMode: (mode: 'interval' | 'weekdays') => void; amount: string; setAmount: (value: string) => void; unit: 'dias' | 'semanas'; setUnit: (unit: 'dias' | 'semanas') => void; days: number[]; setDays: (update: (current: number[]) => number[]) => void; back: () => void }) {
  const stage = useContext(StageCtx)
  useEffect(() => { if (stage && encoded) stage.set(() => onSelect(encoded)) }, [encoded]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={styles.custom}>
      <div className={styles.segment} role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'interval'} data-active={mode === 'interval' || undefined} onClick={() => setMode('interval')}>A cada</button>
        <button type="button" role="tab" aria-selected={mode === 'weekdays'} data-active={mode === 'weekdays' || undefined} onClick={() => setMode('weekdays')}>Dias da semana</button>
      </div>
      {mode === 'interval' ? (
        <div className={styles.customRow}>
          <input className={styles.customInput} type="number" inputMode="numeric" min={1} max={365} value={amount} aria-label="Quantidade" onChange={event => setAmount(event.target.value)} />
          <select className={styles.customSelect} value={unit} aria-label="Unidade" onChange={event => setUnit(event.target.value as 'dias' | 'semanas')}>
            <option value="dias">{count === 1 ? 'dia' : 'dias'}</option>
            <option value="semanas">{count === 1 ? 'semana' : 'semanas'}</option>
          </select>
        </div>
      ) : (
        <div className={styles.weekdays}>
          {WEEKDAYS.map((label, index) => (
            <button key={index} type="button" aria-pressed={days.includes(index)} aria-label={WEEK_NAMES[index]} data-active={days.includes(index) || undefined} onClick={() => setDays(current => current.includes(index) ? current.filter(day => day !== index) : [...current, index])}>{label}</button>
          ))}
        </div>
      )}
      <div className={styles.customActions}>
        <button type="button" className={styles.customBack} onClick={back}>Voltar</button>
        {stage ? null : <button type="button" className={styles.customOk} disabled={!encoded} onClick={() => onSelect(encoded)}>Definir</button>}
      </div>
    </div>
  )
}

export function ReminderPicker({ value, onSelect }: { value: string; onSelect: (value: string) => void }) {
  const isCustom = Boolean(value) && !REMINDER_PRESETS.some(item => item.value === value)
  const [custom, setCustom] = useState(false)
  const parsed = /^(\d+)([mhd])$/.exec(value)
  const [amount, setAmount] = useState(parsed ? parsed[1] : '1')
  const [unit, setUnit] = useState<'m' | 'h' | 'd'>((parsed?.[2] as 'm' | 'h' | 'd') || 'h')

  if (!custom) {
    return (
      <div className={styles.options} role="listbox">
        <OptionList options={REMINDER_PRESETS} value={isCustom ? '__custom__' : value} onSelect={onSelect} />
        <CustomRow active={isCustom} onClick={() => setCustom(true)} />
      </div>
    )
  }

  const count = Math.max(1, Math.min(999, Math.floor(Number(amount)) || 1))
  return <ReminderCustom count={count} unit={unit} setUnit={setUnit} amount={amount} setAmount={setAmount} onSelect={onSelect} back={() => setCustom(false)} />
}

function ReminderCustom({ count, unit, setUnit, amount, setAmount, onSelect, back }: { count: number; unit: 'm' | 'h' | 'd'; setUnit: (unit: 'm' | 'h' | 'd') => void; amount: string; setAmount: (value: string) => void; onSelect: (value: string) => void; back: () => void }) {
  const stage = useContext(StageCtx)
  useEffect(() => { if (stage) stage.set(() => onSelect(`${count}${unit}`)) }, [count, unit]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={styles.custom}>
      <div className={styles.customRow}>
        <input className={styles.customInput} type="number" inputMode="numeric" min={1} max={999} value={amount} aria-label="Quantidade" onChange={event => setAmount(event.target.value)} />
        <select className={styles.customSelect} value={unit} aria-label="Unidade" onChange={event => setUnit(event.target.value as 'm' | 'h' | 'd')}>
          <option value="m">{count === 1 ? 'minuto' : 'minutos'}</option>
          <option value="h">{count === 1 ? 'hora' : 'horas'}</option>
          <option value="d">{count === 1 ? 'dia' : 'dias'}</option>
        </select>
        <span className={styles.customHint}>antes</span>
      </div>
      <div className={styles.customActions}>
        <button type="button" className={styles.customBack} onClick={back}>Voltar</button>
        {stage ? null : <button type="button" className={styles.customOk} onClick={() => onSelect(`${count}${unit}`)}>Definir</button>}
      </div>
    </div>
  )
}

/* ------------------------------------------------ Projeto > subprojeto > seção (recolhíveis) */

type TreeProject = Record<string, any>

export function ProjectPicker({ projects, projectId: currentProject, section: currentSection, imageOf, onSelect: select }: { projects: TreeProject[]; projectId: string; section: string; imageOf?: (project: TreeProject) => string | undefined; onSelect: (projectId: string, section: string) => void }) {
  const [choice, choose] = useStaged<{ id: string; section: string }>({ id: currentProject, section: currentSection }, value => select(value.id, value.section))
  const projectId = choice.id
  const section = choice.section
  const onSelect = (id: string, name: string) => choose({ id, section: name })
  const ids = new Set(projects.map(project => String(project.id)))
  const childrenOf = (parent: string) => projects.filter(project => String(project.parent_id || '') === parent)
  const roots = projects.filter(project => !project.parent_id || !ids.has(String(project.parent_id)))
  const sectionsOf = (project: TreeProject): string[] => (Array.isArray(project.secoes) ? project.secoes.map(String) : [])

  // Abre sozinho o caminho até o projeto escolhido.
  const [open, setOpen] = useState<Set<string>>(() => {
    const start = new Set<string>()
    let current = projects.find(project => String(project.id) === projectId)
    let guard = 0
    while (current && guard++ < 8) {
      start.add(String(current.id))
      current = projects.find(project => String(project.id) === String(current?.parent_id || ''))
    }
    return start
  })
  const toggle = (id: string) => setOpen(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const row = (project: TreeProject, depth: number, seen: Set<string>): ReactNode => {
    const id = String(project.id)
    if (seen.has(id)) return null
    seen.add(id)
    const sections = sectionsOf(project)
    const children = childrenOf(id)
    const expandable = sections.length > 0 || children.length > 0
    const expanded = open.has(id)
    const image = imageOf?.(project)
    const selected = projectId === id && !section
    return (
      <div key={id} className={styles.treeGroup}>
        <div className={styles.treeRow} style={{ paddingLeft: 4 + depth * 16 }}>
          {expandable
            ? <button type="button" className={styles.treeChevron} data-open={expanded || undefined} aria-label={expanded ? 'Recolher' : 'Expandir'} aria-expanded={expanded} onClick={() => toggle(id)}><Icon name="chevron_right" size={18} filled={false} /></button>
            : <span className={styles.treeChevron} aria-hidden="true" />}
          <button type="button" className={styles.option} data-selected={selected || undefined} onClick={() => onSelect(id, '')}>
            {image ? <img className={styles.optionImage} src={image} alt="" /> : <span className={styles.optionDot} style={{ background: String(project.cor || 'var(--ds-line-strong)') }} />}
            <span className={styles.optionText}>{String(project.nome || 'Projeto')}</span>
            {selected ? <Icon name="check" size={18} className={styles.optionCheck} /> : null}
          </button>
        </div>
        {expanded ? (
          <>
            {sections.map(name => {
              const active = projectId === id && section === name
              return (
                <div key={`s:${name}`} className={styles.treeRow} style={{ paddingLeft: 4 + (depth + 1) * 16 + 28 }}>
                  <button type="button" className={styles.option} data-selected={active || undefined} onClick={() => onSelect(id, name)}>
                    <Icon name="view_agenda" size={16} className={styles.optionIcon} />
                    <span className={styles.optionText}>{name}</span>
                    {active ? <Icon name="check" size={18} className={styles.optionCheck} /> : null}
                  </button>
                </div>
              )
            })}
            {children.map(child => row(child, depth + 1, seen))}
          </>
        ) : null}
      </div>
    )
  }

  const seen = new Set<string>()
  return (
    <div className={styles.tree} role="tree">
      <div className={styles.treeRow} style={{ paddingLeft: 4 }}>
        <span className={styles.treeChevron} aria-hidden="true" />
        <button type="button" className={styles.option} data-selected={projectId === 'entrada' || undefined} onClick={() => onSelect('entrada', '')}>
          <Icon name="inbox" size={18} className={styles.optionIcon} />
          <span className={styles.optionText}>Entrada</span>
          {projectId === 'entrada' ? <Icon name="check" size={18} className={styles.optionCheck} /> : null}
        </button>
      </div>
      {roots.map(root => row(root, 0, seen))}
    </div>
  )
}
