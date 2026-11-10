'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { MaiState } from '../../../lib/v2/state'
import { Icon } from '../../ds'
import { DotRing } from './DotRing'
import { HabitCard } from './HabitCard'
import { UnitField } from './UnitField'
import { abbreviateUnit } from '../../../lib/v2/units'
import type { Row } from '../app-types'
import type { InspectableItem } from '../ContextDrawer'
import { DEFAULT_COLOR } from '../../../lib/v2/palette'
import { ColorField } from '../detail/ColorField'
import { Floating, WheelPicker } from '../detail/Pickers'
import { ItemAttachments } from '../ItemAttachments'
import { askConfirm } from '../shell/ConfirmDialog'
import quick from '../shell/QuickAdd.module.css'
import { useManualDraft } from '../useManualDraft'
import { DraftButtons } from '../shell/DraftFooter'
import styles from './HabitsModern.module.css'

/*
 * Hábitos — padrão visual do app (conceito Todoist 6).
 * Lista com a semana (domingo a sábado) em círculos de pizza, sequência
 * colorida, formulário que abre no próprio lugar e detalhe em janela central.
 */

type Commit = (change: (current: MaiState) => MaiState) => void
type Filter = 'all' | 'today' | 'pending' | 'done'

const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : [])
const nums = (value: unknown): number[] => (Array.isArray(value) ? value.map(Number).filter(item => Number.isInteger(item) && item >= 0 && item <= 6) : [])
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const dateKey = (value: unknown) => {
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  return String(value || '').slice(0, 10)
}
const moveDate = (key: string, amount: number) => { const date = new Date(`${key}T12:00:00`); date.setDate(date.getDate() + amount); return dateKey(date) }
const diffDays = (start: string, end: string) => Math.round((new Date(`${end}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / 86_400_000)
const percent = (value: number, total: number) => (total > 0 ? Math.max(0, Math.min(100, Math.round((value / total) * 100))) : 0)
const failed = (entry?: Row) => entry?.falhou === true || String(entry?.status || '').toLowerCase() === 'falha'
const longDate = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '')
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const INITIALS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

function interval(habit: Row) {
  const match = String(habit.repeticao || '').match(/^intervalo:(\d+)$/)
  return match ? Math.max(1, Number(match[1]) || 1) : 0
}

function activeDays(habit: Row) {
  const rule = String(habit.repeticao || '')
  if (rule.startsWith('semanal:')) return nums(rule.slice(8).split(','))
  return nums(habit.dias_semana)
}

function eligible(habit: Row, day: string) {
  const start = dateKey(habit.data_inicio || habit.criado_em)
  if (start && day < start) return false
  const every = interval(habit)
  if (every) return !start || diffDays(start, day) % every === 0
  if (String(habit.repeticao || '') === 'diariamente') return true
  const days = activeDays(habit)
  return !days.length || days.includes(new Date(`${day}T12:00:00`).getDay())
}

function frequencyLabel(habit: Row) {
  const every = interval(habit)
  if (every) return `A cada ${every} ${every === 1 ? 'dia' : 'dias'}`
  const days = activeDays(habit)
  if (!days.length || days.length === 7) return 'Todos os dias'
  if (days.join(',') === '1,2,3,4,5') return 'Dias úteis'
  if (days.join(',') === '0,6') return 'Fins de semana'
  return days.map(day => WEEKDAYS[day]).join(', ')
}

function blankHabit(today: string): Row {
  return { id: uid('hab'), nome: '', descricao: '', meta: 1, unidade: '', hora: '', cor_hex: DEFAULT_COLOR, dias_semana: [0, 1, 2, 3, 4, 5, 6], repeticao: 'diariamente', data_inicio: today, ocultar_agenda: false, ativo: true, criado_em: new Date().toISOString(), anexos: [], _persisted: false }
}

function cleanHabit(snapshot: Row, today: string): Row {
  let repeat = String(snapshot.repeticao || 'diariamente')
  let days = nums(snapshot.dias_semana)
  if (repeat === 'diariamente') days = [0, 1, 2, 3, 4, 5, 6]
  if (repeat.startsWith('semanal:')) {
    days = [...new Set(nums(repeat.slice(8).split(',')))].sort((a, b) => a - b)
    if (!days.length) days = [new Date(`${today}T12:00:00`).getDay()]
    repeat = `semanal:${days.join(',')}`
  }
  if (repeat.startsWith('intervalo:')) {
    repeat = `intervalo:${Math.max(1, Number(repeat.split(':')[1]) || 1)}`
    days = []
  }
  const { _persisted: _ignored, ...rest } = snapshot
  return { ...rest, id: rest.id || uid('hab'), nome: String(rest.nome || '').trim(), meta: Math.max(1, Number(rest.meta || 1)), dias_semana: days, repeticao: repeat, data_inicio: dateKey(rest.data_inicio) || today, cor_hex: rest.cor_hex || DEFAULT_COLOR, icone: rest.icone || 'star', anexos: rows(rest.anexos), ativo: true, criado_em: rest.criado_em || new Date().toISOString() }
}

type Props = {
  state: MaiState
  today: string
  commit: Commit
  createRequest?: string
  inspect?: (item: InspectableItem) => void
}

export function HabitsModern({ state, today, commit, createRequest }: Props) {
  const habits = rows(state.habits).filter(item => item.ativo !== false)
  const entries = rows(state.habitEntries)
  const [anchor, setAnchor] = useState(today)
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState(false)
  const [detailId, setDetailId] = useState('')
  const [valueFor, setValueFor] = useState<{ habit: Row; day: string } | null>(null)

  useEffect(() => { if (createRequest?.startsWith('habits:')) setAdding(true) }, [createRequest])

  const weekStart = useMemo(() => moveDate(anchor, -new Date(`${anchor}T12:00:00`).getDay()), [anchor])
  const week = useMemo(() => Array.from({ length: 7 }, (_, index) => moveDate(weekStart, index)), [weekStart])
  const currentWeek = moveDate(today, -new Date(`${today}T12:00:00`).getDay()) === weekStart

  const byKey = useMemo(() => new Map(entries.map(item => [`${item.habito_id}|${dateKey(item.data)}`, item])), [entries])
  const entryOf = (habit: Row, day: string) => byKey.get(`${habit.id}|${day}`)
  const target = (habit: Row) => Math.max(1, Number(habit.meta || 1))
  const amountOf = (habit: Row, day: string) => { const entry = entryOf(habit, day); return !entry || failed(entry) ? 0 : Number(entry.valor || 0) }
  const levelOf = (habit: Row, day: string): '' | 'full' | 'part' | 'fail' => {
    const entry = entryOf(habit, day)
    if (!entry) return ''
    if (failed(entry)) return 'fail'
    const value = Number(entry.valor || 0)
    if (value >= target(habit)) return 'full'
    return value > 0 ? 'part' : ''
  }
  const progressOf = (habit: Row, day: string) => Math.min(100, Math.round((amountOf(habit, day) / target(habit)) * 100))

  const streakOf = (habit: Row) => {
    let count = 0
    let cursor = today
    if (!['full', 'part'].includes(levelOf(habit, cursor))) cursor = moveDate(cursor, -1)
    for (let step = 0; step < 800; step += 1) {
      if (!eligible(habit, cursor)) { cursor = moveDate(cursor, -1); continue }
      if (!['full', 'part'].includes(levelOf(habit, cursor))) break
      count += 1
      cursor = moveDate(cursor, -1)
    }
    return count
  }

  const stats = (habit: Row) => {
    const days = Array.from({ length: 365 }, (_, index) => moveDate(today, index - 364)).filter(key => eligible(habit, key))
    let best = 0
    let run = 0
    days.forEach(key => { run = ['full', 'part'].includes(levelOf(habit, key)) ? run + 1 : 0; best = Math.max(best, run) })
    const last30 = days.slice(-30)
    return { best, current: streakOf(habit), rate: percent(last30.filter(key => levelOf(habit, key) === 'full').length, last30.length) }
  }

  const writeEntry = (habit: Row, day: string, amount: number, didFail = false) => commit(current => {
    const rest = rows(current.habitEntries).filter(item => !(String(item.habito_id) === String(habit.id) && dateKey(item.data) === day))
    const previous = rows(current.habitEntries).find(item => String(item.habito_id) === String(habit.id) && dateKey(item.data) === day)
    return { ...current, habitEntries: [...rest, { id: previous?.id || uid('hr'), habito_id: habit.id, data: day, valor: didFail ? 0 : amount, falhou: didFail, status: didFail ? 'falha' : '', criado_em: previous?.criado_em || new Date().toISOString() }] }
  })

  const clearEntry = (habit: Row, day: string) => commit(current => ({ ...current, habitEntries: rows(current.habitEntries).filter(item => !(String(item.habito_id) === String(habit.id) && dateKey(item.data) === day)) }))

  const toggleDay = (habit: Row, day: string) => {
    if (!eligible(habit, day) || day > today) return
    if (target(habit) > 1 || habit.unidade) { setValueFor({ habit, day }); return }
    if (entryOf(habit, day)) { clearEntry(habit, day); return }
    writeEntry(habit, day, 1)
  }

  const visible = habits.filter(habit => {
    const due = eligible(habit, today)
    const level = levelOf(habit, today)
    if (filter === 'today') return due
    if (filter === 'pending') return due && level !== 'full'
    if (filter === 'done') return level === 'full'
    return true
  })

  const counts = {
    all: habits.length,
    today: habits.filter(habit => eligible(habit, today)).length,
    pending: habits.filter(habit => eligible(habit, today) && levelOf(habit, today) !== 'full').length,
    done: habits.filter(habit => levelOf(habit, today) === 'full').length,
  }

  const detail = habits.find(habit => String(habit.id) === detailId)

  return (
    <div className={styles.page}>
      <div className={styles.bar}>
        <div className={styles.tabs} role="tablist">
          {([
            { id: 'all', label: 'Todos', icon: 'select_all' },
            { id: 'today', label: 'Hoje', icon: 'today' },
            { id: 'pending', label: 'Pendentes', icon: 'pending_actions' },
            { id: 'done', label: 'Concluídos', icon: 'task_alt' },
          ] as { id: Filter; label: string; icon: string }[]).map(tab => (
            <button key={tab.id} type="button" role="tab" className={styles.tab} data-active={filter === tab.id || undefined} aria-selected={filter === tab.id} onClick={() => setFilter(tab.id)}>
              <Icon name={tab.icon} size={17} filled={false} />
              <span>{tab.label}</span>
              {counts[tab.id] ? <small>{counts[tab.id]}</small> : null}
            </button>
          ))}
        </div>
      </div>

      <section className={styles.block} aria-label="Hábitos">
        <div className={styles.head}>
          <span className={styles.headTitle}>Hábitos</span>
          <span className={styles.headCount}>{visible.length}</span>
        </div>

        {visible.length ? (
          <div role="list">
            {visible.map(habit => {
              const color = String(habit.cor_hex || DEFAULT_COLOR)
              const streak = streakOf(habit)
              const detailText = [target(habit) > 1 || habit.unidade ? `${amountOf(habit, today)} de ${target(habit)}${habit.unidade ? ` ${habit.unidade}` : ''}` : '', String(habit.descricao || '').trim()].filter(Boolean).join(' · ')
              return (
                <HabitCard
                  key={String(habit.id)}
                  color={color}
                  title={String(habit.nome)}
                  description={detailText || frequencyLabel(habit)}
                  streak={streak}
                  level={levelOf(habit, today)}
                  pct={progressOf(habit, today)}
                  value={amountOf(habit, today)}
                  unit={abbreviateUnit(habit.unidade)}
                  plain={!(target(habit) > 1 || habit.unidade)}
                  today
                  disabled={!eligible(habit, today)}
                  ariaLabel={`${String(habit.nome)} em ${longDate(today)}`}
                  onToggle={() => toggleDay(habit, today)}
                  onOpen={() => setDetailId(String(habit.id))}
                  onContextMenu={event => { event.preventDefault(); if (eligible(habit, today)) setValueFor({ habit, day: today }) }}
                  trailing={<QuickEdit habit={habit} today={today} commit={commit} />}
                />
              )
            })}
          </div>
        ) : (
          <div className={styles.empty}>{habits.length ? 'Nenhum hábito neste filtro.' : 'Nenhum hábito criado ainda.'}</div>
        )}

        {adding ? (
          <HabitComposer today={today} onCancel={() => setAdding(false)} onSave={habit => { commit(current => ({ ...current, habits: [...rows(current.habits), habit] })); setAdding(false) }} />
        ) : (
          <button type="button" className={styles.addRow} onClick={() => setAdding(true)}>
            <Icon name="add" size={20} filled={false} /><span>Adicionar hábito</span>
          </button>
        )}
      </section>


      {detail ? (
        <HabitDetail
          habit={detail}
          today={today}
          stats={stats(detail)}
          levelOf={levelOf}
          progressOf={progressOf}
          entries={entries.filter(item => String(item.habito_id) === String(detail.id))}
          onToggle={day => setValueFor({ habit: detail, day })}
          onClose={() => setDetailId('')}
          commit={commit}
        />
      ) : null}

      {valueFor ? (
        <ValueDialog
          habit={valueFor.habit}
          day={valueFor.day}
          current={amountOf(valueFor.habit, valueFor.day)}
          hasEntry={Boolean(entryOf(valueFor.habit, valueFor.day))}
          onClear={() => { clearEntry(valueFor.habit, valueFor.day); setValueFor(null) }}
          onClose={() => setValueFor(null)}
          onSave={amount => { writeEntry(valueFor.habit, valueFor.day, amount); setValueFor(null) }}
          onFail={() => { writeEntry(valueFor.habit, valueFor.day, 0, true); setValueFor(null) }}
        />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------ Adicionar */

function HabitComposer({ today, onCancel, onSave }: { today: string; onCancel: () => void; onSave: (habit: Row) => void }) {
  const [draft, setDraft] = useState<Row>(() => blankHabit(today))
  const submit = () => { if (String(draft.nome || '').trim()) onSave(cleanHabit(draft, today)) }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className={quick.inlineWrap}>
      <div className={quick.inlinePanel}>
        <div className={quick.fields}>
          <input
            autoFocus
            className={quick.title}
            value={String(draft.nome || '')}
            placeholder="Nome do hábito"
            onChange={event => setDraft({ ...draft, nome: event.target.value })}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); submit() } }}
          />
          <div className={styles.composerFields}>
            <label className={styles.wideField}><span>Descrição</span><input value={String(draft.descricao || '')} placeholder="Opcional" onChange={event => setDraft({ ...draft, descricao: event.target.value })} /></label>
            <label><span>Meta</span><input type="number" min="1" step="1" value={Number(draft.meta || 1)} onChange={event => setDraft({ ...draft, meta: Number(event.target.value) })} /></label>
            <label><span>Unidade</span><UnitField value={String(draft.unidade || '')} onChange={unidade => setDraft({ ...draft, unidade })} /></label>
            <label><span>Horário</span><input type="time" value={String(draft.hora || '')} onChange={event => setDraft({ ...draft, hora: event.target.value })} /></label>
          </div>
          <FrequencyEditor draft={draft} setDraft={setDraft} today={today} />
          <div className={quick.chips}>
            <ColorField value={draft.cor_hex} className={quick.chip} onChange={color => setDraft({ ...draft, cor_hex: color })} />
          </div>
        </div>
        <div className={quick.footer}>
          <button type="button" className={quick.ghost} onClick={onCancel}>Cancelar</button>
          <button type="button" className={quick.primary} disabled={!String(draft.nome || '').trim()} onClick={submit}>Adicionar hábito</button>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- Registro */

export function ValueDialog({ habit, day, current, hasEntry, onClose, onSave, onFail, onClear }: { habit: Row; day: string; current: number; hasEntry: boolean; onClose: () => void; onSave: (amount: number) => void; onFail: () => void; onClear: () => void }) {
  const goal = Math.max(1, Number(habit.meta || 1))
  const quantitative = goal > 1 || Boolean(habit.unidade)
  // Pergunta quanto somar ao que já foi feito no dia, numa rolagem estilo iPhone.
  const step = goal <= 5 ? 0.5 : goal <= 50 ? 1 : goal <= 250 ? 5 : 10
  const [value, setValue] = useState(String(step <= 1 ? 1 : step))
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const add = Number(String(value).replace(',', '.'))
  const amount = current + add
  const remaining = Math.max(0, Math.round((goal - current) * 100) / 100)
  const baseOptions = Array.from({ length: Math.round((Math.max(goal * 2, 10)) / step) }, (_, i) => Math.round((i + 1) * step * 100) / 100)
  const options = remaining > 0 && !baseOptions.includes(remaining) ? [...baseOptions, remaining].sort((a, b) => a - b) : baseOptions
  const index = options.findIndex(item => item === add)
  return (
    <div className={styles.layer} onMouseDown={onClose}>
      <section className={`${styles.panel} ${styles.small}`} role="dialog" aria-modal="true" aria-label={`Registrar ${String(habit.nome)}`} onMouseDown={event => event.stopPropagation()}>
        <header className={styles.panelHead}>
          <div><strong>{String(habit.nome)}</strong><small>{longDate(day)}</small></div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar"><Icon name="close" size={20} filled={false} /></button>
        </header>
        {quantitative ? (
          <div className={styles.valueBody}>
            <div className={styles.valueProgress} aria-hidden="true">
              <i style={{ width: `${Math.min(100, (current / goal) * 100)}%` }} />
              <b style={{ left: `${Math.min(100, (current / goal) * 100)}%`, width: `${Math.max(0, Math.min(100 - Math.min(100, (current / goal) * 100), (Number.isFinite(add) ? add : 0) / goal * 100))}%` }} />
            </div>
            <p className={styles.valueSummary}><strong>{Math.round(current * 100) / 100}</strong> de {goal} {String(habit.unidade || '')} hoje</p>
            <p className={styles.valueAsk}>Quanto adicionar?</p>
            <WheelPicker labels={options.map(item => String(item))} index={Math.max(0, index)} onChange={next => setValue(String(options[next]))} label="Quanto adicionar" unit={String(habit.unidade || '')} />
            {remaining <= 0 ? <p className={styles.valueDone}>Meta do dia já atingida.</p> : null}
          </div>
        ) : null}
        <footer className={styles.panelFoot}>
          {quantitative && remaining > 0 ? <button type="button" className={styles.footComplete} onClick={() => onSave(goal)}><Icon name="check" size={16} filled={false} />Completar</button> : null}
          {quantitative
            ? <button type="button" className={styles.textPrimary} disabled={!Number.isFinite(add) || add <= 0} onClick={() => onSave(amount)}>Adicionar</button>
            : <button type="button" className={styles.textPrimary} onClick={() => onSave(goal)}>Concluir</button>}
        </footer>
        <div className={styles.footLinks}>
          <button type="button" onClick={onFail}>Marcar falha</button>
          {hasEntry ? <button type="button" onClick={onClear}>Limpar registro</button> : null}
        </div>
      </section>
    </div>
  )
}

/* ---------------------------------------------------------------- Detalhe */

function HabitDetail({ habit, today, stats, levelOf, progressOf, entries, onToggle, onClose, commit }: {
  habit: Row
  today: string
  stats: { best: number; current: number; rate: number }
  levelOf: (habit: Row, day: string) => '' | 'full' | 'part' | 'fail'
  progressOf: (habit: Row, day: string) => number
  entries: Row[]
  onToggle: (day: string) => void
  onClose: () => void
  commit: Commit
}) {
  const [tab, setTab] = useState<'summary' | 'edit'>('summary')
  const [month, setMonth] = useState(today.slice(0, 7))
  const [draft, setDraft] = useState<Row>(() => ({ ...habit, _persisted: true }))
  const color = String(habit.cor_hex || DEFAULT_COLOR)

  const { dirty, saveNow, requestClose } = useManualDraft({
    value: tab === 'edit' ? draft : null,
    identity: String(habit.id),
    enabled: tab === 'edit',
    what: 'hábito',
    save: snapshot => {
      if (!String(snapshot.nome || '').trim()) return
      const next = cleanHabit(snapshot, today)
      commit(current => ({ ...current, habits: rows(current.habits).map(item => String(item.id) === String(next.id) ? next : item) }))
    },
  })
  const closePanel = () => void requestClose(onClose)
  const savePanel = async () => { await saveNow(); onClose() }
  const closeRef = useRef(closePanel)
  closeRef.current = closePanel

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('[role="alertdialog"]')) closeRef.current() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const remove = async () => {
    if (!(await askConfirm({ title: 'Excluir hábito?', message: 'Todos os registros deste hábito também serão removidos.', confirmLabel: 'Excluir', tone: 'danger' }))) return
    commit(current => ({ ...current, habits: rows(current.habits).filter(item => String(item.id) !== String(habit.id)), habitEntries: rows(current.habitEntries).filter(item => String(item.habito_id) !== String(habit.id)) }))
    onClose()
  }

  const [year, monthNumber] = month.split('-').map(Number)
  const monthDays = new Date(year, monthNumber, 0).getDate()
  const monthStart = new Date(year, monthNumber - 1, 1).getDay()
  const monthKeys = Array.from({ length: monthDays }, (_, index) => `${year}-${String(monthNumber).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`)
  const due = monthKeys.filter(key => eligible(habit, key) && key <= today)
  const doneCount = due.filter(key => levelOf(habit, key) === 'full').length
  const heat = Array.from({ length: 126 }, (_, index) => moveDate(today, index - 125))
  const perWeekday = WEEKDAYS.map((label, weekday) => {
    const keys = Array.from({ length: 180 }, (_, index) => moveDate(today, index - 179)).filter(key => eligible(habit, key) && new Date(`${key}T12:00:00`).getDay() === weekday)
    return { label, rate: percent(keys.filter(key => levelOf(habit, key) === 'full').length, keys.length) }
  })
  const history = [...entries].sort((a, b) => dateKey(b.data).localeCompare(dateKey(a.data))).slice(0, 12)
  const cellStyle = (day: string): CSSProperties | undefined => {
    const level = levelOf(habit, day)
    if (level === 'full') return { background: color }
    if (level === 'part') return { background: `color-mix(in srgb, ${color} ${Math.max(25, progressOf(habit, day))}%, transparent)` }
    return undefined
  }
  const shiftMonth = (amount: number) => { const next = new Date(year, monthNumber - 1 + amount, 1); setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`) }
  const monthTitle = new Date(year, monthNumber - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })



  return (
    <div className={styles.layer} onMouseDown={closePanel}>
      <section className={styles.panel} role="dialog" aria-modal="true" aria-label={String(habit.nome)} onMouseDown={event => event.stopPropagation()} style={{ '--hc': color } as CSSProperties}>
        <header className={styles.panelHead}>
          <div><strong style={{ color }}>{String(habit.nome)}</strong><small>{frequencyLabel(habit)} · meta {Number(habit.meta || 1)} {String(habit.unidade || '')}{habit.hora ? ` · ${String(habit.hora)}` : ''}</small></div>
          <button type="button" className={styles.close} onClick={closePanel} aria-label="Fechar"><Icon name="close" size={20} filled={false} /></button>
        </header>
        <div className={styles.panelTabs} role="tablist">
          <button type="button" role="tab" data-active={tab === 'summary' || undefined} aria-selected={tab === 'summary'} onClick={() => void requestClose(() => setTab('summary'))}>Resumo</button>
          <button type="button" role="tab" data-active={tab === 'edit' || undefined} aria-selected={tab === 'edit'} onClick={() => { setDraft({ ...habit, _persisted: true }); setTab('edit') }}>Editar</button>
        </div>

        {tab === 'summary' ? (
          <div className={styles.panelBody}>
            <div className={styles.stats}>
              <div><strong>{stats.current}</strong><span>Sequência</span></div>
              <div><strong>{stats.best}</strong><span>Melhor</span></div>
              <div><strong>{stats.rate}%</strong><span>30 dias</span></div>
            </div>
            <div className={styles.monthHead}>
              <button type="button" className={styles.navButton} onClick={() => shiftMonth(-1)} aria-label="Mês anterior"><Icon name="chevron_left" size={20} filled={false} /></button>
              <div><strong>{monthTitle}</strong><small>{doneCount} de {due.length} {due.length === 1 ? 'dia' : 'dias'} concluídos</small></div>
              <button type="button" className={styles.navButton} onClick={() => shiftMonth(1)} aria-label="Próximo mês"><Icon name="chevron_right" size={20} filled={false} /></button>
            </div>
            <div className={styles.month}>
              {INITIALS.map((label, index) => <small key={`${label}-${index}`}>{label}</small>)}
              {Array.from({ length: monthStart }, (_, index) => <span key={`gap-${index}`} />)}
              {monthKeys.map((day, index) => {
                const level = levelOf(habit, day)
                return (
                  <button key={day} type="button" className={styles.dot} data-day="" data-level={level || undefined} data-today={day === today || undefined} data-off={!eligible(habit, day) || undefined} disabled={!eligible(habit, day) || day > today} style={level === 'part' ? ({ '--p': progressOf(habit, day) } as CSSProperties) : undefined} onClick={() => onToggle(day)} aria-label={longDate(day)}>
                    <DotRing pct={level === 'full' ? 100 : progressOf(habit, day)} label={String(index + 1)} empty={!level} today={day === today} />
                    <span className={styles.dayNumber}>{index + 1}</span>
                  </button>
                )
              })}
            </div>

            <h3 className={styles.section}>Últimas 18 semanas</h3>
            <div className={styles.heat}>
              {heat.map(day => (
                <button key={day} type="button" className={styles.heatCell} data-level={levelOf(habit, day) || undefined} data-off={!eligible(habit, day) || undefined} disabled={!eligible(habit, day) || day > today} style={cellStyle(day)} onClick={() => onToggle(day)} title={longDate(day)} aria-label={longDate(day)} />
              ))}
            </div>

            <h3 className={styles.section}>Desempenho por dia da semana</h3>
            <div className={styles.bars}>
              {perWeekday.map(item => (
                <div key={item.label}><span>{item.label}</span><i><b style={{ width: `${item.rate}%`, background: color }} /></i><strong>{item.rate}%</strong></div>
              ))}
            </div>

            {history.length ? (
              <>
                <h3 className={styles.section}>Histórico recente</h3>
                <div className={styles.history}>
                  {history.map(item => (
                    <div key={String(item.id)}><span>{longDate(dateKey(item.data))}</span><strong>{failed(item) ? 'Falha' : `${Number(item.valor || 0)} ${String(habit.unidade || '')}`}</strong></div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <div className={styles.panelBody}>
            <label className={styles.field}><span>Nome</span><input value={String(draft.nome || '')} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></label>
            <label className={styles.field}><span>Descrição</span><input value={String(draft.descricao || '')} placeholder="Opcional" onChange={event => setDraft({ ...draft, descricao: event.target.value })} /></label>
            <div className={styles.fieldRow}>
              <label className={styles.field}><span>Meta</span><input type="number" min="1" step="0.1" value={Number(draft.meta || 1)} onChange={event => setDraft({ ...draft, meta: Number(event.target.value) })} /></label>
              <label className={styles.field}><span>Unidade</span><UnitField value={String(draft.unidade || '')} onChange={unidade => setDraft({ ...draft, unidade })} /></label>
              <label className={styles.field}><span>Horário</span><input type="time" value={String(draft.hora || '')} onChange={event => setDraft({ ...draft, hora: event.target.value })} /></label>
            </div>

            <div className={styles.field}>
              <span>Cor</span>
              <ColorField value={draft.cor_hex} onChange={color => setDraft({ ...draft, cor_hex: color })} />
            </div>

            <FrequencyEditor draft={draft} setDraft={setDraft} today={today} />

            <ItemAttachments attachments={rows(draft.anexos)} onChange={anexos => setDraft({ ...draft, anexos })} />

            <label className={styles.check}>
              <input type="checkbox" checked={draft.ocultar_agenda !== true} onChange={event => setDraft({ ...draft, ocultar_agenda: !event.target.checked })} />
              <span>Mostrar em Hoje e na Agenda</span>
            </label>

            <footer className={styles.editFoot}>
              <button type="button" className={styles.textDanger} onClick={remove}>Excluir hábito</button>
              <span style={{ flex: 1 }} />
              <DraftButtons dirty={dirty} canSave={Boolean(String(draft.nome || '').trim())} onSave={() => void savePanel()} onCancel={closePanel} />
            </footer>
          </div>
        )}
      </section>
    </div>
  )
}

/* --------------------------------------------------------- Edição rápida */

function QuickEdit({ habit, today, commit }: { habit: Row; today: string; commit: Commit }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Row>(habit)
  const anchor = useRef<HTMLButtonElement | null>(null)

  const { dirty, saveNow, requestClose } = useManualDraft({
    value: open ? draft : null,
    identity: String(habit.id),
    enabled: open,
    what: 'hábito',
    save: snapshot => {
      if (!String(snapshot.nome || '').trim()) return
      const next = cleanHabit({ ...snapshot, _persisted: true }, today)
      commit(current => ({ ...current, habits: rows(current.habits).map(item => String(item.id) === String(next.id) ? next : item) }))
    },
  })
  const closeQuick = () => void requestClose(() => setOpen(false))
  const saveQuick = async () => { await saveNow(); setOpen(false) }

  return (
    <>
      <button ref={anchor} type="button" className={styles.quickButton} aria-label={`Editar ${String(habit.nome)} rapidamente`} title="Edição rápida" onClick={() => { setDraft(habit); setOpen(true) }}>
        <Icon name="edit" size={17} filled={false} />
      </button>
      {open ? (
        <Floating anchor={anchor} title="Edição rápida" width={290} onClose={closeQuick}>
          <div className={styles.quick}>
            <label className={styles.field}><span>Nome</span><input autoFocus value={String(draft.nome || '')} onChange={event => setDraft({ ...draft, nome: event.target.value })} onKeyDown={event => { if (event.key === 'Enter') void saveQuick() }} /></label>
            <div className={styles.fieldRow}>
              <label className={styles.field}><span>Meta</span><input type="number" min="1" step="0.1" value={Number(draft.meta || 1)} onChange={event => setDraft({ ...draft, meta: Number(event.target.value) })} /></label>
              <label className={styles.field}><span>Unidade</span><UnitField value={String(draft.unidade || '')} onChange={unidade => setDraft({ ...draft, unidade })} /></label>
            </div>
            <ColorField value={draft.cor_hex} onChange={color => setDraft({ ...draft, cor_hex: color })} />
            <FrequencyEditor draft={draft} setDraft={setDraft} today={today} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
              <DraftButtons dirty={dirty} canSave={Boolean(String(draft.nome || '').trim())} onSave={() => void saveQuick()} onCancel={closeQuick} />
            </div>
          </div>
        </Floating>
      ) : null}
    </>
  )
}

/* ----------------------------------------------------------- Frequência */

/* Todos os dias, dias da semana à escolha (D S T Q Q S S) ou a cada X dias. */
function FrequencyEditor({ draft, setDraft, today }: { draft: Row; setDraft: (next: Row) => void; today: string }) {
  const repeat = String(draft.repeticao || 'diariamente')
  const mode = repeat.startsWith('intervalo:') ? 'interval' : repeat.startsWith('semanal:') ? 'days' : 'daily'
  const days = mode === 'days' ? nums(repeat.slice(8).split(',')) : nums(draft.dias_semana)
  const every = Math.max(1, Number(repeat.match(/^intervalo:(\d+)$/)?.[1] || 2))
  const presets: { label: string; days: number[] }[] = [
    { label: 'Dias úteis', days: [1, 2, 3, 4, 5] },
    { label: 'Fins de semana', days: [0, 6] },
  ]
  const setDays = (next: number[]) => setDraft({ ...draft, dias_semana: next, repeticao: `semanal:${next.join(',')}` })
  return (
    <div className={styles.field}>
      <span>Frequência</span>
      <div className={styles.modes}>
        <button type="button" data-active={mode === 'daily' || undefined} onClick={() => setDraft({ ...draft, repeticao: 'diariamente', dias_semana: [0, 1, 2, 3, 4, 5, 6] })}>Todos os dias</button>
        <button type="button" data-active={mode === 'days' || undefined} onClick={() => setDays(days.length && days.length < 7 ? days : [1, 2, 3, 4, 5])}>Dias da semana</button>
        <button type="button" data-active={mode === 'interval' || undefined} onClick={() => setDraft({ ...draft, repeticao: `intervalo:${every}`, dias_semana: [], data_inicio: dateKey(draft.data_inicio) || today })}>A cada X dias</button>
      </div>
      {mode === 'days' ? (
        <>
          <div className={styles.weekdays}>
            {INITIALS.map((label, day) => {
              const on = days.includes(day)
              return <button key={`${label}-${day}`} type="button" data-active={on || undefined} aria-pressed={on} aria-label={WEEKDAYS[day]} title={WEEKDAYS[day]} onClick={() => { const next = on ? days.filter(item => item !== day) : [...days, day].sort((a, b) => a - b); if (next.length) setDays(next) }}>{label}</button>
            })}
          </div>
          <div className={styles.presets}>
            {presets.map(preset => <button key={preset.label} type="button" onClick={() => setDays(preset.days)}>{preset.label}</button>)}
          </div>
        </>
      ) : null}
      {mode === 'interval' ? (
        <div className={styles.fieldRow}>
          <label className={styles.field}><span>Repetir a cada (dias)</span><input type="number" min="1" max="365" value={every} onChange={event => setDraft({ ...draft, repeticao: `intervalo:${Math.max(1, Number(event.target.value) || 1)}` })} /></label>
          <label className={styles.field}><span>Começando em</span><input type="date" value={dateKey(draft.data_inicio) || today} onChange={event => setDraft({ ...draft, data_inicio: event.target.value })} /></label>
        </div>
      ) : null}
    </div>
  )
}
