'use client'

import { DragEvent, FormEvent, useEffect, useMemo, useState } from 'react'
import { addDays, PlannerItem, plannerItems } from '../../lib/v2/planner'
import { MaiState, nextRepeat } from '../../lib/v2/state'
import styles from './mai-v2.module.css'
import type { SecondaryView } from './V2Areas'

type Row = Record<string, any>
type Mode = 'day' | 'week' | 'month' | 'year'
type Calendar = { id: string; nome: string; cor: string; primary?: boolean; acesso?: string }

type Props = {
  state: MaiState
  today: string
  connected: boolean | null
  commit: (change: (current: MaiState) => MaiState) => void
  googleRpc: (method: string, args?: unknown[]) => Promise<any>
  refreshEvents: (start?: string, end?: string) => Promise<void>
  openTask: (id: string) => void
  openArea: (view: SecondaryView) => void
  createRequest?: number
}

const labels: Record<PlannerItem['kind'], string> = { task: 'Tarefa', event: 'Compromisso', habit: 'Rotina', finance: 'Finanças', goal: 'Meta' }

function firstOfMonth(day: string) { return `${day.slice(0, 7)}-01` }
function endOfMonth(day: string) { const date = new Date(`${firstOfMonth(day)}T12:00:00`); date.setMonth(date.getMonth() + 1); date.setDate(0); return date.toISOString().slice(0, 10) }
function startOfWeek(day: string) { const date = new Date(`${day}T12:00:00`); date.setDate(date.getDate() - date.getDay()); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function format(day: string, options: Intl.DateTimeFormatOptions) { return new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', options) }

function rangeFor(anchor: string, mode: Mode) {
  if (mode === 'day') return { start: anchor, end: anchor }
  if (mode === 'week') { const start = startOfWeek(anchor); return { start, end: addDays(start, 6) } }
  if (mode === 'year') return { start: `${anchor.slice(0, 4)}-01-01`, end: `${anchor.slice(0, 4)}-12-31` }
  const first = firstOfMonth(anchor)
  return { start: startOfWeek(first), end: addDays(startOfWeek(addDays(endOfMonth(anchor), 6)), 6) }
}

function moveAnchor(anchor: string, mode: Mode, amount: number) {
  const date = new Date(`${anchor}T12:00:00`)
  if (mode === 'day') date.setDate(date.getDate() + amount)
  else if (mode === 'week') date.setDate(date.getDate() + amount * 7)
  else if (mode === 'month') date.setMonth(date.getMonth() + amount)
  else date.setFullYear(date.getFullYear() + amount)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function editorSeed(day: string, calendarId = 'primary'): Row {
  return { titulo: '', descricao: '', data_inicio: day, hora_inicio: '09:00', hora_fim: '10:00', dia_inteiro: false, repeticao: '', calendario_id: calendarId }
}

export function AgendaView({ state, today, connected, commit, googleRpc, refreshEvents, openTask, openArea, createRequest }: Props) {
  const initialMode = ['day', 'week', 'month', 'year'].includes(String(state.configs.upcomingView)) ? state.configs.upcomingView as Mode : 'month'
  const [mode, setMode] = useState<Mode>(initialMode)
  const [anchor, setAnchor] = useState(today)
  const [selectedDay, setSelectedDay] = useState(today)
  const [filters, setFilters] = useState<Record<PlannerItem['kind'], boolean>>({ task: true, event: true, habit: true, finance: true, goal: true })
  const [draft, setDraft] = useState<Row | null>(null)
  const [calendars, setCalendars] = useState<Calendar[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const range = useMemo(() => rangeFor(anchor || today, mode), [anchor, mode, today])
  const allItems = useMemo(() => plannerItems(state, range.start, range.end), [state, range.start, range.end])
  const visible = allItems.filter(item => filters[item.kind])

  useEffect(() => { if (!anchor && today) { setAnchor(today); setSelectedDay(today) } }, [anchor, today])
  useEffect(() => {
    if (!connected) return
    googleRpc('getListaCalendarios').then((value: Calendar[]) => setCalendars(Array.isArray(value) ? value : [])).catch(() => setCalendars([]))
  }, [connected])
  useEffect(() => { if (connected && range.start && range.end) void refreshEvents(range.start, range.end) }, [connected, range.start, range.end])
  useEffect(() => { if (createRequest) openEvent(undefined, selectedDay || today) }, [createRequest])

  function chooseMode(next: Mode) {
    setMode(next)
    commit(current => ({ ...current, configs: { ...current.configs, upcomingView: next } }))
  }

  function itemsFor(day: string) { return visible.filter(item => item.date === day) }

  function openEvent(event?: Row, day = selectedDay) {
    if (!connected) { setMessage('Conecte sua conta Google para criar compromissos.'); return }
    setMessage('')
    setDraft(event ? { ...event } : editorSeed(day, String(state.configs.calendarios?.[0] || calendars.find(calendar => calendar.primary)?.id || 'primary')))
  }

  async function saveEvent(event: FormEvent) {
    event.preventDefault()
    if (!draft?.titulo?.trim()) return
    setBusy(true); setMessage('')
    try {
      await googleRpc('salvarEventoAgenda', [{ ...draft, titulo: String(draft.titulo).trim() }])
      await refreshEvents()
      setDraft(null)
    } catch (error: any) { setMessage(error?.message || 'Não foi possível salvar o compromisso.') }
    finally { setBusy(false) }
  }

  async function deleteEvent() {
    if (!draft?.id || !confirm('Excluir este compromisso do Google Agenda?')) return
    setBusy(true); setMessage('')
    try { await googleRpc('excluirEventoAgenda', [draft.id]); await refreshEvents(); setDraft(null) }
    catch (error: any) { setMessage(error?.message || 'Não foi possível excluir o compromisso.') }
    finally { setBusy(false) }
  }

  function toggle(item: PlannerItem) {
    if (item.kind === 'task') {
      commit(current => ({ ...current, tasks: current.tasks.map(task => {
        if (task.id !== item.sourceId) return task
        if (!task.concluida && task.repeticao && task.data_vencimento) return { ...task, data_vencimento: nextRepeat(task.data_vencimento, task.repeticao), concluida: false, subtarefas: (Array.isArray(task.subtarefas) ? task.subtarefas : []).map((sub: any) => ({ ...sub, concluida: false })) }
        return { ...task, concluida: !task.concluida, concluida_em: !task.concluida ? new Date().toISOString() : '' }
      }) }))
      return
    }
    if (item.kind === 'habit') {
      commit(current => {
        const entries = Array.isArray(current.habitEntries) ? current.habitEntries as Row[] : []
        const exists = entries.some(entry => String(entry.habito_id) === item.sourceId && String(entry.data).slice(0, 10) === item.date)
        return { ...current, habitEntries: exists ? entries.filter(entry => !(String(entry.habito_id) === item.sourceId && String(entry.data).slice(0, 10) === item.date)) : [...entries, { id: `reg-${crypto.randomUUID()}`, habito_id: item.sourceId, data: item.date, valor: Number(item.raw.meta || 1), criado_em: new Date().toISOString() }] }
      })
      return
    }
    if (item.kind === 'event') {
      const key = `${item.sourceId}|${item.date}|${item.time || ''}`
      commit(current => {
        const completions = Array.isArray(current.eventCompletions) ? current.eventCompletions as Row[] : []
        const exists = completions.some(entry => entry.chave === key)
        return { ...current, eventCompletions: exists ? completions.filter(entry => entry.chave !== key) : [...completions, { chave: key, evento_id: item.sourceId, data: item.date, hora: item.time, concluida: true, atualizado_em: new Date().toISOString() }] }
      })
      return
    }
    if (item.kind === 'finance') {
      if (item.raw.fixo_id) {
        const month = item.date.slice(0, 7); const key = `${item.raw.fixo_id}|${month}`
        commit(current => {
          const list = Array.isArray(current.finance.fixedOccurrences) ? current.finance.fixedOccurrences as Row[] : []
          const next = { chave: key, fixo_id: item.raw.fixo_id, competencia: month, status: item.completed ? 'pendente' : 'pago', atualizado_em: new Date().toISOString() }
          return { ...current, finance: { ...current.finance, fixedOccurrences: list.some(entry => entry.chave === key) ? list.map(entry => entry.chave === key ? { ...entry, ...next } : entry) : [...list, next] } }
        })
      } else commit(current => ({ ...current, finance: { ...current.finance, transactions: (current.finance.transactions as Row[]).map(entry => String(entry.id) === item.sourceId ? { ...entry, status: item.completed ? 'pendente' : 'pago' } : entry) } }))
    }
  }

  function activate(item: PlannerItem) {
    if (item.kind === 'task') openTask(item.sourceId)
    else if (item.kind === 'event') openEvent(item.raw, item.date)
    else if (item.kind === 'habit') openArea('habits')
    else if (item.kind === 'finance') openArea('finance')
    else openArea('goals')
  }

  function startDrag(event: DragEvent, item: PlannerItem) { event.dataTransfer.setData('application/mai-planner', JSON.stringify({ kind: item.kind, id: item.sourceId, raw: item.raw })) }
  async function drop(event: DragEvent, day: string) {
    event.preventDefault()
    try {
      const payload = JSON.parse(event.dataTransfer.getData('application/mai-planner'))
      if (payload.kind === 'task') {
        commit(current => ({ ...current, tasks: current.tasks.map(task => task.id === payload.id ? { ...task, data_vencimento: String(task.data_vencimento || '').includes('T') ? `${day}T${String(task.data_vencimento).slice(11, 16)}` : day } : task) }))
      } else if (payload.kind === 'event') {
        setBusy(true)
        await googleRpc('salvarEventoAgenda', [{ ...payload.raw, data_inicio: day }])
        await refreshEvents()
      }
    } catch { setMessage('Não foi possível mover o item.') }
    finally { setBusy(false) }
  }

  function ItemRow({ item, compact = false }: { item: PlannerItem; compact?: boolean }) {
    return <div className={styles.agendaItem} data-kind={item.kind} data-completed={item.completed} draggable={item.kind === 'task' || item.kind === 'event'} onDragStart={event => startDrag(event, item)}>
      <button className={styles.agendaCheck} style={{ borderColor: item.color, background: item.completed ? item.color : '' }} onClick={() => toggle(item)} aria-label={item.completed ? 'Desmarcar' : 'Concluir'}>{item.completed ? '✓' : ''}</button>
      <button className={styles.agendaItemBody} onClick={() => activate(item)}><strong>{item.title}</strong>{!compact && <small>{item.time ? `${item.time} · ` : ''}{item.subtitle}{item.recurring ? ' · recorrente' : ''}</small>}</button>
      {item.time && compact && <time>{item.time}</time>}
    </div>
  }

  const monthDays = Array.from({ length: Math.max(1, Math.round((new Date(`${range.end}T12:00:00`).getTime() - new Date(`${range.start}T12:00:00`).getTime()) / 86_400_000) + 1) }, (_, index) => addDays(range.start, index))
  const selectedItems = itemsFor(selectedDay)
  const title = mode === 'day' ? format(anchor, { weekday: 'long', day: 'numeric', month: 'long' }) : mode === 'week' ? `${format(range.start, { day: 'numeric', month: 'short' })} – ${format(range.end, { day: 'numeric', month: 'short' })}` : mode === 'year' ? anchor.slice(0, 4) : format(anchor, { month: 'long', year: 'numeric' })

  return <div className={styles.agendaWorkspace}>
    <div className={styles.agendaToolbar}>
      <div className={styles.agendaPeriod}><button onClick={() => setAnchor(moveAnchor(anchor, mode, -1))}>‹</button><button onClick={() => { setAnchor(today); setSelectedDay(today) }}>Hoje</button><button onClick={() => setAnchor(moveAnchor(anchor, mode, 1))}>›</button><strong>{title}</strong></div>
      <div className={styles.agendaModes}>{(['day', 'week', 'month', 'year'] as Mode[]).map(value => <button key={value} data-active={mode === value} onClick={() => chooseMode(value)}>{value === 'day' ? 'Dia' : value === 'week' ? 'Semana' : value === 'month' ? 'Mês' : 'Ano'}</button>)}</div>
      <button className={styles.agendaAdd} onClick={() => openEvent(undefined, selectedDay)}>＋ Compromisso</button>
    </div>
    <div className={styles.agendaFilters}>{(Object.keys(filters) as PlannerItem['kind'][]).map(kind => <label key={kind}><input type="checkbox" checked={filters[kind]} onChange={event => setFilters(current => ({ ...current, [kind]: event.target.checked }))} /><span>{labels[kind]}</span></label>)}</div>
    {message && <div className={styles.inlineMessage}>{message}</div>}

    {mode === 'day' && <section className={styles.agendaDayList}>{itemsFor(anchor).map(item => <ItemRow key={item.id} item={item} />)}{!itemsFor(anchor).length && <p>Nenhum item neste dia.</p>}</section>}

    {mode === 'week' && <div className={styles.agendaWeek}>{monthDays.map(day => <section key={day} data-today={day === today} onDragOver={event => event.preventDefault()} onDrop={event => void drop(event, day)}><button onClick={() => setSelectedDay(day)}><span>{format(day, { weekday: 'short' })}</span><strong>{day.slice(8)}</strong></button>{itemsFor(day).map(item => <ItemRow key={item.id} item={item} compact />)}</section>)}</div>}

    {mode === 'month' && <><div className={styles.agendaWeekdays}>{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => <span key={day}>{day}</span>)}</div><div className={styles.agendaMonth}>{monthDays.map(day => { const items = itemsFor(day); return <button key={day} data-outside={day.slice(0, 7) !== anchor.slice(0, 7)} data-today={day === today} data-selected={day === selectedDay} onClick={() => setSelectedDay(day)} onDoubleClick={() => openEvent(undefined, day)} onDragOver={event => event.preventDefault()} onDrop={event => void drop(event, day)}><strong>{day.slice(8)}</strong><span>{items.slice(0, 3).map(item => <i key={item.id} style={{ background: item.color }} title={item.title}>{item.title}</i>)}</span>{items.length > 3 && <small>+{items.length - 3}</small>}</button> })}</div><section className={styles.agendaSelection}><header><strong>{format(selectedDay, { weekday: 'long', day: 'numeric', month: 'long' })}</strong><button onClick={() => openEvent(undefined, selectedDay)}>＋</button></header>{selectedItems.map(item => <ItemRow key={item.id} item={item} />)}{!selectedItems.length && <p>Nenhum item neste dia.</p>}</section></>}

    {mode === 'year' && <div className={styles.agendaYear}>{Array.from({ length: 12 }, (_, month) => { const key = `${anchor.slice(0, 4)}-${String(month + 1).padStart(2, '0')}-01`; const end = endOfMonth(key); const count = visible.filter(item => item.date >= key && item.date <= end).length; return <button key={key} onClick={() => { setAnchor(key); setSelectedDay(key); chooseMode('month') }}><strong>{format(key, { month: 'long' })}</strong><span>{count ? `${count} ${count === 1 ? 'item' : 'itens'}` : 'Livre'}</span></button> })}</div>}

    {draft && <div className={styles.modalLayer} onMouseDown={() => !busy && setDraft(null)}><form className={styles.eventEditor} onSubmit={saveEvent} onMouseDown={event => event.stopPropagation()}>
      <header><div><h2>{draft.id ? 'Editar compromisso' : 'Novo compromisso'}</h2><p>Salvo diretamente no Google Agenda</p></div><button type="button" onClick={() => setDraft(null)}>×</button></header>
      <label className={styles.eventTitle}><input autoFocus value={draft.titulo || ''} onChange={event => setDraft({ ...draft, titulo: event.target.value })} placeholder="Título do compromisso" /></label>
      <div className={styles.eventGrid}><label><span>Data</span><input type="date" value={String(draft.data_inicio || '').slice(0, 10)} onChange={event => setDraft({ ...draft, data_inicio: event.target.value })} /></label><label><span>Calendário</span><select value={draft.calendario_id || 'primary'} onChange={event => setDraft({ ...draft, calendario_id: event.target.value })}>{calendars.map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.nome}</option>)}{!calendars.length && <option value="primary">Calendário principal</option>}</select></label><label className={styles.eventAllDay}><input type="checkbox" checked={draft.dia_inteiro === true} onChange={event => setDraft({ ...draft, dia_inteiro: event.target.checked })} /><span>Dia inteiro</span></label>{!draft.dia_inteiro && <><label><span>Início</span><input type="time" value={draft.hora_inicio || ''} onChange={event => setDraft({ ...draft, hora_inicio: event.target.value })} /></label><label><span>Fim</span><input type="time" value={draft.hora_fim || ''} onChange={event => setDraft({ ...draft, hora_fim: event.target.value })} /></label></>}<label><span>Repetição</span><select value={draft.repeticao || ''} onChange={event => setDraft({ ...draft, repeticao: event.target.value })}><option value="">Não repetir</option><option value="RRULE:FREQ=DAILY">Todos os dias</option><option value="RRULE:FREQ=WEEKLY">Toda semana</option><option value="RRULE:FREQ=MONTHLY">Todo mês</option><option value="RRULE:FREQ=YEARLY">Todo ano</option></select></label><label className={styles.eventDescription}><span>Descrição</span><textarea rows={4} value={draft.descricao || ''} onChange={event => setDraft({ ...draft, descricao: event.target.value })} /></label></div>
      {message && <p className={styles.editorError}>{message}</p>}
      <footer>{draft.id ? <button type="button" className={styles.dangerButton} onClick={deleteEvent} disabled={busy}>Excluir</button> : <span />}<div><button type="button" onClick={() => setDraft(null)} disabled={busy}>Cancelar</button><button disabled={busy || !draft.titulo?.trim()}>{busy ? 'Salvando…' : 'Salvar'}</button></div></footer>
    </form></div>}
  </div>
}
