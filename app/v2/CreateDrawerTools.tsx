'use client'

import { CSSProperties, ReactNode, useState } from 'react'

type ToolProps = {
  id: string
  icon: string
  label: string
  summary: string
  color: string
  leading?: ReactNode
  open: string
  setOpen: (id: string) => void
  children: ReactNode
}

export function CreateTool({ id, icon, label, summary, color, leading, open, setOpen, children }: ToolProps) {
  const active = open === id
  const visual = leading ?? <span className="material-symbols-rounded" aria-hidden="true">{icon}</span>
  return <div className="mai-task-v4-tool" data-open={active || undefined} style={{ '--mai-tool-color': color } as CSSProperties}>
    <button type="button" className="mai-task-v4-tool-button" aria-label={`${label}: ${summary}`} title={`${label}: ${summary}`} onClick={() => setOpen(active ? '' : id)}>
      <span className="mai-task-v4-leading">{visual}</span><span className="mai-task-v4-tool-value">{summary || 'Não selecionado'}</span>
    </button>
    {active ? <div className="mai-task-v4-popover" role="dialog" aria-label={label} onMouseDown={event => event.stopPropagation()}>
      <header><span className="mai-task-v4-popover-leading">{visual}</span><div><strong>{label}</strong><small>{summary || 'Não selecionado'}</small></div></header>
      <div className="mai-task-v4-popover-body">{children}</div>
    </div> : null}
  </div>
}

export function CreateOptionList({ options, value, onChange, close }: { options: { value: string | number; label: string; icon?: string }[]; value: string | number; onChange: (value: string) => void; close: () => void }) {
  return <div className="mai-task-v4-option-list">{options.map(option => <button type="button" key={String(option.value)} data-selected={String(option.value) === String(value) || undefined} onClick={() => { onChange(String(option.value)); close() }}>
    {option.icon ? <span className="material-symbols-rounded">{option.icon}</span> : <span />}
    <span>{option.label}</span>{String(option.value) === String(value) ? <span className="material-symbols-rounded">check</span> : <span />}
  </button>)}</div>
}

export function CreateCalendarPicker({ value, today, onChange, close }: { value: string; today: string; onChange: (value: string) => void; close: () => void }) {
  const initial = value || today
  const [cursor, setCursor] = useState(initial.slice(0, 7))
  const first = new Date(`${cursor}-01T12:00:00`)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(first)
  start.setDate(first.getDate() - offset)
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return { key, day: date.getDate(), inMonth: key.slice(0, 7) === cursor }
  })
  function moveMonth(amount: number) {
    const next = new Date(first)
    next.setMonth(first.getMonth() + amount)
    setCursor(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
  }
  const moveDay = (amount:number) => { const d=new Date(`${today}T12:00:00`); d.setDate(d.getDate()+amount); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
  return <div className="mai-task-v4-calendar">
    <div className="mai-task-v4-calendar-nav"><button type="button" onClick={() => moveMonth(-1)}>‹</button><strong>{first.toLocaleDateString('pt-BR', { month:'long', year:'numeric' })}</strong><button type="button" onClick={() => moveMonth(1)}>›</button></div>
    <div className="mai-task-v4-calendar-week"><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span><span>D</span></div>
    <div className="mai-task-v4-calendar-grid">{cells.map(cell => <button type="button" key={cell.key} data-outside={!cell.inMonth || undefined} data-today={cell.key === today || undefined} data-selected={cell.key === value || undefined} onClick={() => { onChange(cell.key); close() }}>{cell.day}</button>)}</div>
    <div className="mai-task-v4-quick-row"><button type="button" onClick={() => { onChange(today); close() }}>Hoje</button><button type="button" onClick={() => { onChange(moveDay(1)); close() }}>Amanhã</button><button type="button" onClick={() => { onChange(''); close() }}>Sem data</button></div>
  </div>
}

export function CreateTimePicker({ value, onChange, close }: { value: string; onChange: (value: string) => void; close: () => void }) {
  const options = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`)
  return <div className="mai-task-v4-time-picker">
    <div className="mai-task-v4-time-grid">{options.map(option => <button type="button" key={option} data-selected={option === value || undefined} onClick={() => { onChange(option); close() }}>{option}</button>)}</div>
    <div className="mai-task-v4-time-custom"><span>Outro horário</span><input inputMode="numeric" placeholder="HH:MM" value={value} onChange={event => onChange(event.target.value.slice(0,5))}/></div>
    <button type="button" className="mai-task-v4-clear" onClick={() => { onChange(''); close() }}>Sem horário</button>
  </div>
}

export function CreateNumberEditor({ value, onChange, suffix }: { value: number; onChange: (value: number) => void; suffix?: string }) {
  return <div className="mai-task-v4-time-custom"><input type="number" step="any" value={value} onChange={event => onChange(Number(event.target.value))}/>{suffix ? <span>{suffix}</span> : null}</div>
}

export function CreateTextEditor({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="mai-task-v4-time-custom"><input value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)}/></div>
}

export function createNaturalDate(value: string, today: string) {
  if (!value) return 'Não selecionado'
  if (value === today) return 'Hoje'
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR',{day:'numeric',month:'short',year:'numeric'})
}
