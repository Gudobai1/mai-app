'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { MaiState } from '../../../lib/v2/state'
import { Icon } from '../../ds'
import type { Row } from '../app-types'
import type { InspectableItem } from '../ContextDrawer'
import { Floating, OptionList, type PickerOption } from '../detail/Pickers'
import { askConfirm } from '../shell/ConfirmDialog'
import quick from '../shell/QuickAdd.module.css'
import { useAutosaveDraft } from '../useAutosaveDraft'
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
const COLORS = ['#1E6FD9', '#058527', '#D1453B', '#A970FF', '#EB8909', '#0E7C8F', '#C2549B', '#6B7280']
const FREQUENCIES: PickerOption[] = [
  { value: 'diariamente', label: 'Todos os dias', icon: 'today' },
  { value: 'semanal:1,2,3,4,5', label: 'Dias úteis', icon: 'work' },
  { value: 'semanal:0,6', label: 'Fins de semana', icon: 'weekend' },
]

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
  return { id: uid('hab'), nome: '', descricao: '', meta: 1, unidade: '', hora: '', cor_hex: COLORS[0], dias_semana: [0, 1, 2, 3, 4, 5, 6], repeticao: 'diariamente', data_inicio: today, ocultar_agenda: false, ativo: true, criado_em: new Date().toISOString(), anexos: [], _persisted: false }
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
  return { ...rest, id: rest.id || uid('hab'), nome: String(rest.nome || '').trim(), meta: Math.max(1, Number(rest.meta || 1)), dias_semana: days, repeticao: repeat, data_inicio: dateKey(rest.data_inicio) || today, cor_hex: rest.cor_hex || COLORS[0], anexos: rows(rest.anexos), ativo: true, criado_em: rest.criado_em || new Date().toISOString() }
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
    if (entryOf(habit, day)) { clearEntry(habit, day); return }
    if (target(habit) > 1 || habit.unidade) { setValueFor({ habit, day }); return }
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
        <div className={styles.weekNav}>
          <button type="button" className={styles.navButton} onClick={() => setAnchor(moveDate(weekStart, -7))} aria-label="Semana anterior"><Icon name="chevron_left" size={20} filled={false} /></button>
          <button type="button" className={styles.weekLabel} onClick={() => setAnchor(today)} title="Voltar para a semana atual">
            {currentWeek ? 'Esta semana' : `${longDate(week[0])} – ${longDate(week[6])}`}
          </button>
          <button type="button" className={styles.navButton} onClick={() => setAnchor(moveDate(weekStart, 7))} aria-label="Próxima semana"><Icon name="chevron_right" size={20} filled={false} /></button>
        </div>
      </div>

      <section className={styles.block} aria-label="Hábitos">
        <div className={styles.head}>
          <span className={styles.headTitle}>Hábitos</span>
          <span className={styles.headCount}>{visible.length}</span>
          <div className={styles.headDays} aria-hidden="true">
            {week.map(day => (
              <span key={day} data-today={day === today || undefined}>
                <small>{INITIALS[new Date(`${day}T12:00:00`).getDay()]}</small>
                <b>{Number(day.slice(8))}</b>
              </span>
            ))}
          </div>
          <span className={styles.headStreak} />
        </div>

        {visible.length ? (
          <div role="list">
            {visible.map(habit => {
              const color = String(habit.cor_hex || COLORS[0])
              const streak = streakOf(habit)
              const detailText = [target(habit) > 1 || habit.unidade ? `${amountOf(habit, today)} de ${target(habit)}${habit.unidade ? ` ${habit.unidade}` : ''}` : '', String(habit.descricao || '').trim()].filter(Boolean).join(' · ')
              return (
                <div key={String(habit.id)} role="listitem" className={styles.row} style={{ '--hc': color } as CSSProperties}>
                  <button type="button" className={styles.body} onClick={() => setDetailId(String(habit.id))}>
                    <span className={styles.title}>{String(habit.nome)}</span>
                    <span className={styles.desc}>{detailText || frequencyLabel(habit)}</span>
                  </button>
                  <div className={styles.dots}>
                    {week.map(day => {
                      const level = levelOf(habit, day)
                      const ok = eligible(habit, day) && day <= today
                      return (
                        <button
                          key={day}
                          type="button"
                          className={styles.dot}
                          data-level={level || undefined}
                          data-today={day === today || undefined}
                          data-off={!eligible(habit, day) || undefined}
                          disabled={!ok}
                          style={level === 'part' ? ({ '--p': progressOf(habit, day) } as CSSProperties) : undefined}
                          onClick={() => toggleDay(habit, day)}
                          aria-label={`${String(habit.nome)} em ${longDate(day)}`}
                          title={level === 'fail' ? 'Falha' : level === 'part' ? `${progressOf(habit, day)}%` : !eligible(habit, day) ? 'Fora da frequência' : longDate(day)}
                        >
                          {level === 'fail' ? <Icon name="close" size={12} weight={600} /> : null}
                        </button>
                      )
                    })}
                  </div>
                  <span className={styles.streak} data-on={streak > 0 || undefined} title={`Sequência de ${streak} ${streak === 1 ? 'dia' : 'dias'}`}>
                    <Icon name="local_fire_department" size={16} />{streak}
                  </span>
                  <QuickEdit habit={habit} today={today} commit={commit} />
                </div>
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

      {valueFor ? (
        <ValueDialog
          habit={valueFor.habit}
          day={valueFor.day}
          initial={amountOf(valueFor.habit, valueFor.day) || target(valueFor.habit)}
          onClose={() => setValueFor(null)}
          onSave={amount => { writeEntry(valueFor.habit, valueFor.day, amount); setValueFor(null) }}
          onFail={() => { writeEntry(valueFor.habit, valueFor.day, 0, true); setValueFor(null) }}
        />
      ) : null}

      {detail ? (
        <HabitDetail
          habit={detail}
          today={today}
          stats={stats(detail)}
          levelOf={levelOf}
          progressOf={progressOf}
          entries={entries.filter(item => String(item.habito_id) === String(detail.id))}
          onToggle={day => toggleDay(detail, day)}
          onClose={() => setDetailId('')}
          commit={commit}
        />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------ Adicionar */

function HabitComposer({ today, onCancel, onSave }: { today: string; onCancel: () => void; onSave: (habit: Row) => void }) {
  const [draft, setDraft] = useState<Row>(() => blankHabit(today))
  const [picker, setPicker] = useState<'' | 'freq' | 'color'>('')
  const freqRef = useRef<HTMLButtonElement | null>(null)
  const colorRef = useRef<HTMLButtonElement | null>(null)
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
            <label><span>Meta</span><input type="number" min="1" step="1" value={Number(draft.meta || 1)} onChange={event => setDraft({ ...draft, meta: Number(event.target.value) })} /></label>
            <label><span>Unidade</span><input value={String(draft.unidade || '')} placeholder="copos, páginas…" onChange={event => setDraft({ ...draft, unidade: event.target.value })} /></label>
            <label><span>Horário</span><input type="time" value={String(draft.hora || '')} onChange={event => setDraft({ ...draft, hora: event.target.value })} /></label>
          </div>
          <div className={quick.chips}>
            <button ref={freqRef} type="button" className={quick.chip} data-set onClick={() => setPicker('freq')}>
              <Icon name="repeat" size={16} filled={false} />{frequencyLabel(draft)}
            </button>
            <button ref={colorRef} type="button" className={quick.chip} data-set style={{ '--chip-color': String(draft.cor_hex) } as CSSProperties} onClick={() => setPicker('color')}>
              <span className={styles.swatch} style={{ background: String(draft.cor_hex) }} />Cor
            </button>
          </div>
        </div>
        <div className={quick.footer}>
          <button type="button" className={quick.ghost} onClick={onCancel}>Cancelar</button>
          <button type="button" className={quick.primary} disabled={!String(draft.nome || '').trim()} onClick={submit}>Adicionar hábito</button>
        </div>
      </div>
      {picker === 'freq' ? (
        <Floating anchor={freqRef} title="Frequência" width={240} onClose={() => setPicker('')}>
          <OptionList options={FREQUENCIES} value={String(draft.repeticao)} onSelect={value => { setDraft({ ...draft, repeticao: value, dias_semana: value === 'diariamente' ? [0, 1, 2, 3, 4, 5, 6] : nums(value.slice(8).split(',')) }); setPicker('') }} />
        </Floating>
      ) : null}
      {picker === 'color' ? (
        <Floating anchor={colorRef} title="Cor" width={220} onClose={() => setPicker('')}>
          <div className={styles.swatches}>
            {COLORS.map(color => <button key={color} type="button" className={styles.swatchButton} data-active={draft.cor_hex === color || undefined} style={{ background: color }} aria-label={color} onClick={() => { setDraft({ ...draft, cor_hex: color }); setPicker('') }} />)}
          </div>
        </Floating>
      ) : null}
    </div>
  )
}

/* --------------------------------------------------------------- Registro */

function ValueDialog({ habit, day, initial, onClose, onSave, onFail }: { habit: Row; day: string; initial: number; onClose: () => void; onSave: (amount: number) => void; onFail: () => void }) {
  const [value, setValue] = useState(String(initial))
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const amount = Number(String(value).replace(',', '.'))
  return (
    <div className={styles.layer} onMouseDown={onClose}>
      <section className={`${styles.panel} ${styles.small}`} role="dialog" aria-modal="true" aria-label={`Registrar ${String(habit.nome)}`} onMouseDown={event => event.stopPropagation()}>
        <header className={styles.panelHead}>
          <div><strong>{String(habit.nome)}</strong><small>{longDate(day)}</small></div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar"><Icon name="close" size={20} filled={false} /></button>
        </header>
        <div className={styles.valueBody}>
          <label className={styles.field}>
            <span>Quantidade{habit.unidade ? ` (${String(habit.unidade)})` : ''}</span>
            <input autoFocus type="number" step="0.1" min="0" value={value} onChange={event => setValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && Number.isFinite(amount) && amount >= 0) onSave(amount) }} />
          </label>
          <p className={styles.hint}>Meta do dia: <strong>{Number(habit.meta || 1)} {String(habit.unidade || '')}</strong></p>
        </div>
        <footer className={styles.panelFoot}>
          <button type="button" className={styles.textPrimary} disabled={!Number.isFinite(amount) || amount < 0} onClick={() => onSave(amount)}>Salvar</button>
          <button type="button" className={styles.textButton} onClick={onClose}>Cancelar</button>
          <button type="button" className={styles.textDanger} onClick={onFail}>Marcar falha</button>
        </footer>
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
  const color = String(habit.cor_hex || COLORS[0])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useAutosaveDraft({
    value: tab === 'edit' ? draft : null,
    identity: String(habit.id),
    enabled: tab === 'edit',
    save: snapshot => {
      if (!String(snapshot.nome || '').trim()) return
      const next = cleanHabit(snapshot, today)
      commit(current => ({ ...current, habits: rows(current.habits).map(item => String(item.id) === String(next.id) ? next : item) }))
    },
  })

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
  const shiftMonth = (amount: number) => { const next = new Date(year, monthNumber - 1 + amount, 1); setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`) }
  const monthTitle = new Date(year, monthNumber - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const mode = String(draft.repeticao || 'diariamente').startsWith('intervalo:') ? 'interval' : String(draft.repeticao || '').startsWith('semanal:') && !['semanal:1,2,3,4,5', 'semanal:0,6'].includes(String(draft.repeticao)) ? 'days' : 'daily'
  const draftDays = nums(draft.dias_semana)
  const draftEvery = Math.max(1, Number(String(draft.repeticao || '').match(/^intervalo:(\d+)$/)?.[1] || 2))

  const cellStyle = (day: string): CSSProperties | undefined => {
    const level = levelOf(habit, day)
    if (level === 'full') return { background: color }
    if (level === 'part') return { background: `color-mix(in srgb, ${color} ${Math.max(25, progressOf(habit, day))}%, transparent)` }
    return undefined
  }

  return (
    <div className={styles.layer} onMouseDown={onClose}>
      <section className={styles.panel} role="dialog" aria-modal="true" aria-label={String(habit.nome)} onMouseDown={event => event.stopPropagation()} style={{ '--hc': color } as CSSProperties}>
        <header className={styles.panelHead}>
          <div><strong style={{ color }}>{String(habit.nome)}</strong><small>{frequencyLabel(habit)}</small></div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar"><Icon name="close" size={20} filled={false} /></button>
        </header>
        <div className={styles.panelTabs} role="tablist">
          <button type="button" role="tab" data-active={tab === 'summary' || undefined} aria-selected={tab === 'summary'} onClick={() => setTab('summary')}>Resumo</button>
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
                  <button key={day} type="button" className={styles.dot} data-level={level || undefined} data-today={day === today || undefined} data-off={!eligible(habit, day) || undefined} disabled={!eligible(habit, day) || day > today} style={level === 'part' ? ({ '--p': progressOf(habit, day) } as CSSProperties) : undefined} onClick={() => onToggle(day)} aria-label={longDate(day)}>
                    <span className={styles.dayNumber}>{index + 1}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className={styles.panelBody}>
            <label className={styles.field}><span>Nome</span><input value={String(draft.nome || '')} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></label>
            <label className={styles.field}><span>Descrição</span><input value={String(draft.descricao || '')} placeholder="Opcional" onChange={event => setDraft({ ...draft, descricao: event.target.value })} /></label>
            <div className={styles.fieldRow}>
              <label className={styles.field}><span>Meta</span><input type="number" min="1" step="0.1" value={Number(draft.meta || 1)} onChange={event => setDraft({ ...draft, meta: Number(event.target.value) })} /></label>
              <label className={styles.field}><span>Unidade</span><input value={String(draft.unidade || '')} placeholder="copos, km, páginas…" onChange={event => setDraft({ ...draft, unidade: event.target.value })} /></label>
              <label className={styles.field}><span>Horário</span><input type="time" value={String(draft.hora || '')} onChange={event => setDraft({ ...draft, hora: event.target.value })} /></label>
            </div>

            <div className={styles.field}>
              <span>Cor</span>
              <div className={styles.swatches}>
                {COLORS.map(item => <button key={item} type="button" className={styles.swatchButton} data-active={draft.cor_hex === item || undefined} style={{ background: item }} aria-label={item} onClick={() => setDraft({ ...draft, cor_hex: item })} />)}
              </div>
            </div>

            <div className={styles.field}>
              <span>Frequência</span>
              <div className={styles.modes}>
                <button type="button" data-active={mode === 'daily' || undefined} onClick={() => setDraft({ ...draft, repeticao: 'diariamente', dias_semana: [0, 1, 2, 3, 4, 5, 6] })}>Todos os dias</button>
                <button type="button" data-active={mode === 'days' || undefined} onClick={() => { const selected = draftDays.length && draftDays.length < 7 ? draftDays : [1, 2, 3, 4, 5]; setDraft({ ...draft, repeticao: `semanal:${selected.join(',')}`, dias_semana: selected }) }}>Dias da semana</button>
                <button type="button" data-active={mode === 'interval' || undefined} onClick={() => setDraft({ ...draft, repeticao: `intervalo:${draftEvery}`, dias_semana: [], data_inicio: dateKey(draft.data_inicio) || today })}>A cada X dias</button>
              </div>
              {mode === 'days' ? (
                <div className={styles.weekdays}>
                  {INITIALS.map((label, day) => {
                    const on = draftDays.includes(day)
                    return <button key={`${label}-${day}`} type="button" data-active={on || undefined} aria-label={WEEKDAYS[day]} onClick={() => { const next = on ? draftDays.filter(item => item !== day) : [...draftDays, day].sort((a, b) => a - b); setDraft({ ...draft, dias_semana: next, repeticao: `semanal:${next.join(',')}` }) }}>{label}</button>
                  })}
                </div>
              ) : null}
              {mode === 'interval' ? (
                <div className={styles.fieldRow}>
                  <label className={styles.field}><span>Repetir a cada (dias)</span><input type="number" min="1" max="365" value={draftEvery} onChange={event => setDraft({ ...draft, repeticao: `intervalo:${Math.max(1, Number(event.target.value) || 1)}` })} /></label>
                  <label className={styles.field}><span>Começando em</span><input type="date" value={dateKey(draft.data_inicio) || today} onChange={event => setDraft({ ...draft, data_inicio: event.target.value })} /></label>
                </div>
              ) : null}
            </div>

            <label className={styles.check}>
              <input type="checkbox" checked={draft.ocultar_agenda !== true} onChange={event => setDraft({ ...draft, ocultar_agenda: !event.target.checked })} />
              <span>Mostrar em Hoje e na Agenda</span>
            </label>

            <footer className={styles.editFoot}>
              <button type="button" className={styles.textDanger} onClick={remove}>Excluir hábito</button>
              <span className={styles.saved}>Alterações salvas automaticamente</span>
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

  useAutosaveDraft({
    value: open ? draft : null,
    identity: String(habit.id),
    enabled: open,
    save: snapshot => {
      if (!String(snapshot.nome || '').trim()) return
      const next = cleanHabit({ ...snapshot, _persisted: true }, today)
      commit(current => ({ ...current, habits: rows(current.habits).map(item => String(item.id) === String(next.id) ? next : item) }))
    },
  })

  return (
    <>
      <button ref={anchor} type="button" className={styles.quickButton} aria-label={`Editar ${String(habit.nome)} rapidamente`} title="Edição rápida" onClick={() => { setDraft(habit); setOpen(true) }}>
        <Icon name="edit" size={17} filled={false} />
      </button>
      {open ? (
        <Floating anchor={anchor} title="Edição rápida" width={290} onClose={() => setOpen(false)}>
          <div className={styles.quick}>
            <label className={styles.field}><span>Nome</span><input autoFocus value={String(draft.nome || '')} onChange={event => setDraft({ ...draft, nome: event.target.value })} onKeyDown={event => { if (event.key === 'Enter') setOpen(false) }} /></label>
            <div className={styles.fieldRow}>
              <label className={styles.field}><span>Meta</span><input type="number" min="1" step="0.1" value={Number(draft.meta || 1)} onChange={event => setDraft({ ...draft, meta: Number(event.target.value) })} /></label>
              <label className={styles.field}><span>Unidade</span><input value={String(draft.unidade || '')} placeholder="copos…" onChange={event => setDraft({ ...draft, unidade: event.target.value })} /></label>
            </div>
            <div className={styles.swatches}>
              {COLORS.map(item => <button key={item} type="button" className={styles.swatchButton} data-active={draft.cor_hex === item || undefined} style={{ background: item }} aria-label={item} onClick={() => setDraft({ ...draft, cor_hex: item })} />)}
            </div>
            <OptionList options={FREQUENCIES} value={String(draft.repeticao)} onSelect={value => setDraft({ ...draft, repeticao: value, dias_semana: value === 'diariamente' ? [0, 1, 2, 3, 4, 5, 6] : nums(value.slice(8).split(',')) })} />
          </div>
        </Floating>
      ) : null}
    </>
  )
}
