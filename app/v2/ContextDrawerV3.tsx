'use client'

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import { MaiIcon } from './MaiIcons'

type Row = Record<string, any>
type Props = {
  item: InspectableItem | null
  state: MaiState
  today: string
  commit: (change: (current: MaiState) => MaiState) => void
  googleRpc: (method: string, args?: unknown[]) => Promise<any>
  refreshEvents?: () => Promise<void> | void
  onClose: () => void
}

type PopoverProps = {
  id: string
  icon: string
  label: string
  summary?: string
  hasValue?: boolean
  open: string
  setOpen: (id: string) => void
  children: ReactNode
}

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const dateOnly = (value: unknown) => String(value || '').slice(0, 10)
const timeOnly = (value: unknown) => String(value || '').includes('T') ? String(value).slice(11, 16) : String(value || '').slice(0, 5)
const priorityColor = (value: unknown) => Number(value || 4) === 1 ? '#c85b52' : Number(value || 4) === 2 ? '#c28a3d' : Number(value || 4) === 3 ? '#7c9274' : '#b8beb7'

function addDays(key: string, amount: number) {
  const value = new Date(`${key}T12:00:00`)
  value.setDate(value.getDate() + amount)
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

function formatDate(value: string) {
  if (!value) return 'Sem data'
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function durationMinutes(start: string, end: string) {
  if (!start || !end) return 60
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const difference = (eh * 60 + em) - (sh * 60 + sm)
  return difference > 0 ? difference : 60
}

function endFromDuration(start: string, duration: number) {
  if (!start) return ''
  const [hour, minute] = start.split(':').map(Number)
  const total = hour * 60 + minute + Math.max(5, duration || 60)
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function DescriptionEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value
  }, [value])
  return <div className="mai-context-v3-description-editor">
    <div ref={ref} className="mai-context-v3-description-surface" contentEditable suppressContentEditableWarning data-placeholder="Adicionar descrição…" onInput={event => onChange(event.currentTarget.innerHTML)} />
  </div>
}

function IconPopover({ id, icon, label, summary = '', hasValue = false, open, setOpen, children }: PopoverProps) {
  const active = open === id
  return <div className="mai-context-v3-tool" data-open={active || undefined}>
    <button type="button" className="mai-context-v3-tool-button" data-has-value={hasValue || undefined} aria-label={`${label}${summary ? `: ${summary}` : ''}`} title={`${label}${summary ? ` · ${summary}` : ''}`} onClick={() => setOpen(active ? '' : id)}>
      <span className="material-symbols-rounded" aria-hidden="true">{icon}</span>
    </button>
    {active ? <div className="mai-context-v3-popover" role="dialog" aria-label={label} onMouseDown={event => event.stopPropagation()}>
      <header><span className="material-symbols-rounded">{icon}</span><div><strong>{label}</strong>{summary ? <small>{summary}</small> : null}</div></header>
      <div className="mai-context-v3-popover-body">{children}</div>
    </div> : null}
  </div>
}

function OptionList({ options, value, onChange, close }: { options: { value: string | number; label: string; icon?: string }[]; value: string | number; onChange: (value: string) => void; close: () => void }) {
  return <div className="mai-context-v3-option-list">{options.map(option => <button type="button" key={String(option.value)} data-selected={String(option.value) === String(value) || undefined} onClick={() => { onChange(String(option.value)); close() }}>
    {option.icon ? <span className="material-symbols-rounded">{option.icon}</span> : null}<span>{option.label}</span>{String(option.value) === String(value) ? <span className="material-symbols-rounded">check</span> : null}
  </button>)}</div>
}

function CalendarPicker({ value, today, onChange, close }: { value: string; today: string; onChange: (value: string) => void; close: () => void }) {
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
  const monthLabel = first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const moveMonth = (amount: number) => {
    const next = new Date(first)
    next.setMonth(first.getMonth() + amount)
    setCursor(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
  }
  return <div className="mai-context-v3-calendar">
    <div className="mai-context-v3-calendar-nav"><button type="button" onClick={() => moveMonth(-1)} aria-label="Mês anterior">‹</button><strong>{monthLabel}</strong><button type="button" onClick={() => moveMonth(1)} aria-label="Próximo mês">›</button></div>
    <div className="mai-context-v3-calendar-week"><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span><span>D</span></div>
    <div className="mai-context-v3-calendar-grid">{cells.map(cell => <button type="button" key={cell.key} data-outside={!cell.inMonth || undefined} data-today={cell.key === today || undefined} data-selected={cell.key === value || undefined} onClick={() => { onChange(cell.key); close() }}>{cell.day}</button>)}</div>
    <div className="mai-context-v3-quick-row"><button type="button" onClick={() => { onChange(today); close() }}>Hoje</button><button type="button" onClick={() => { onChange(addDays(today, 1)); close() }}>Amanhã</button><button type="button" onClick={() => { onChange(''); close() }}>Sem data</button></div>
  </div>
}

function TimePicker({ value, onChange, close }: { value: string; onChange: (value: string) => void; close: () => void }) {
  const options = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`)
  return <div className="mai-context-v3-time-picker">
    <div className="mai-context-v3-time-grid">{options.map(option => <button type="button" key={option} data-selected={option === value || undefined} onClick={() => { onChange(option); close() }}>{option}</button>)}</div>
    <div className="mai-context-v3-custom-time"><span>Outro horário</span><input inputMode="numeric" placeholder="HH:MM" value={value} onChange={event => onChange(event.target.value.slice(0, 5))} /></div>
    <button type="button" className="mai-context-v3-clear" onClick={() => { onChange(''); close() }}>Sem horário</button>
  </div>
}

function NumberEditor({ value, onChange, suffix }: { value: number; onChange: (value: number) => void; suffix?: string }) {
  return <div className="mai-context-v3-inline-editor"><input type="number" step="0.1" value={value} onChange={event => onChange(Number(event.target.value))}/>{suffix ? <span>{suffix}</span> : null}</div>
}

function TextEditor({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <div className="mai-context-v3-inline-editor"><input value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)}/></div>
}

export function ContextDrawerV2({ item, state, today, commit, googleRpc, refreshEvents, onClose }: Props) {
  const [focusId, setFocusId] = useState('')
  const [draft, setDraft] = useState<Row>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [openTool, setOpenTool] = useState('')

  useEffect(() => { setFocusId(item?.kind === 'task' ? item.sourceId : ''); setMessage(''); setOpenTool('') }, [item?.kind, item?.sourceId])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && openTool) { event.stopPropagation(); setOpenTool('') } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openTool])

  const taskMap = useMemo(() => new Map(state.tasks.map(task => [String(task.id), task])), [state.tasks])
  const focusedTask = item?.kind === 'task' ? taskMap.get(focusId || item.sourceId) : undefined
  const active: InspectableItem = item?.kind === 'task' && focusedTask
    ? { kind: 'task', sourceId: String(focusedTask.id), title: focusedTask.titulo, date: dateOnly(focusedTask.data_vencimento), time: timeOnly(focusedTask.data_vencimento), raw: focusedTask as Row }
    : item || { kind: 'task', sourceId: '', title: '', raw: {} }

  useEffect(() => {
    if (!item) { setDraft({}); return }
    const next = { ...active.raw }
    if (active.kind === 'event') next._duracao = durationMinutes(String(next.hora_inicio || ''), String(next.hora_fim || ''))
    setDraft(next)
    setSubtaskTitle('')
    setMessage('')
    setOpenTool('')
  }, [item, active.kind, active.sourceId, active.date])

  const projects = useMemo(() => rows(state.projects).filter(project => project.ativo !== false), [state.projects])
  const directChildren = useMemo(() => active.kind === 'task' ? state.tasks.filter(task => String(task.parent_id || '') === active.sourceId).sort((a,b) => Number(a.ordem || 0)-Number(b.ordem || 0)) : [], [active.kind, active.sourceId, state.tasks])
  const habitEntry = useMemo(() => active.kind === 'habit' ? rows(state.habitEntries).find(entry => String(entry.habito_id) === active.sourceId && dateOnly(entry.data) === (active.date || today)) : undefined, [active.kind, active.sourceId, active.date, state.habitEntries, today])
  const breadcrumbs = useMemo(() => {
    if (active.kind !== 'task') return [] as { id: string; title: string }[]
    const chain: { id: string; title: string }[] = []
    const seen = new Set<string>()
    let cursor = taskMap.get(active.sourceId)
    while (cursor && !seen.has(String(cursor.id))) {
      seen.add(String(cursor.id))
      chain.unshift({ id: String(cursor.id), title: String(cursor.titulo || 'Tarefa') })
      cursor = cursor.parent_id ? taskMap.get(String(cursor.parent_id)) : undefined
    }
    return chain
  }, [active.kind, active.sourceId, taskMap])

  if (!item) return null

  const set = (patch: Row) => setDraft(current => ({ ...current, ...patch }))
  const attachments = rows(draft.anexos)
  const label = ({ task: 'Tarefa', event: 'Compromisso', habit: 'Hábito', finance: 'Lançamento', goal: 'Meta', note: 'Nota' } as const)[active.kind]
  const titleValue = active.kind === 'habit' ? String(draft.nome || '') : String(draft.titulo || '')
  const setTitle = (value: string) => active.kind === 'habit' ? set({ nome: value }) : set({ titulo: value })
  const closeTool = () => setOpenTool('')
  const projectName = String(projects.find(project => String(project.id) === String(draft.projeto_id))?.nome || 'Entrada')
  const priorityLabel = ({ 1: 'Alta', 2: 'Média', 3: 'Baixa', 4: 'Sem prioridade' } as Record<number, string>)[Number(draft.prioridade || 4)]
  const repeatLabel = ({ '': 'Não repetir', diariamente: 'Todos os dias', semanalmente: 'Toda semana', 'semanal:1,2,3,4,5': 'Dias úteis', mensalmente: 'Todo mês' } as Record<string,string>)[String(draft.repeticao || '')] || 'Personalizado'

  async function save(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    if (active.kind === 'task') {
      const day = dateOnly(draft.data_vencimento)
      const hour = String(draft._hora ?? timeOnly(draft.data_vencimento))
      const due = day ? `${day}${hour ? `T${hour}` : ''}` : ''
      commit(current => ({ ...current, tasks: current.tasks.map(task => task.id === active.sourceId ? { ...task, ...draft, titulo: String(draft.titulo || '').trim(), data_vencimento: due, prioridade: Number(draft.prioridade || 4), projeto_id: draft.projeto_id || 'entrada', anexos: attachments } : task) }))
    } else if (active.kind === 'event') {
      const duration = Math.max(5, Number(draft._duracao || 60))
      const next: Row = { ...draft, titulo: String(draft.titulo || '').trim(), data_inicio: dateOnly(draft.data_inicio) || active.date || today, hora_fim: draft.dia_inteiro ? '' : endFromDuration(String(draft.hora_inicio || ''), duration), anexos: attachments }
      delete next._duracao
      if (next.tipo === 'google' || next.tipo === 'gcalendar' || String(next.id || '').includes('::')) {
        setBusy(true)
        try { await googleRpc('salvarEventoAgenda', [next]); await refreshEvents?.() }
        catch (error: any) { setMessage(error?.message || 'Não foi possível salvar no Google Agenda.'); return }
        finally { setBusy(false) }
      } else commit(current => ({ ...current, events: rows(current.events).map(row => String(row.id) === active.sourceId ? next : row) }))
    } else if (active.kind === 'habit') {
      const value = Math.max(0, Number(draft._valor ?? habitEntry?.valor ?? 0))
      const day = active.date || today
      commit(current => {
        const entries = rows(current.habitEntries).filter(entry => !(String(entry.habito_id) === active.sourceId && dateOnly(entry.data) === day))
        return { ...current, habits: rows(current.habits).map(habit => String(habit.id) === active.sourceId ? { ...habit, ...draft, nome: String(draft.nome || habit.nome).trim(), meta: Number(draft.meta || 1), anexos: attachments } : habit), habitEntries: value > 0 ? [...entries, { id: habitEntry?.id || `hr-${crypto.randomUUID()}`, habito_id: active.sourceId, data: day, valor: value, criado_em: habitEntry?.criado_em || new Date().toISOString() }] : entries }
      })
    } else if (active.kind === 'finance') {
      if (active.raw.fixo_id || active.raw.recorrente === true) commit(current => ({ ...current, finance: { ...current.finance, fixed: rows(current.finance.fixed).map(rule => String(rule.id) === String(active.raw.fixo_id || active.sourceId) ? { ...rule, ...draft, titulo: draft.titulo || rule.titulo, valor: Number(draft.valor_real ?? draft.valor ?? rule.valor), anexos: attachments } : rule) } }))
      else commit(current => ({ ...current, finance: { ...current.finance, transactions: rows(current.finance.transactions).map(tx => String(tx.id) === active.sourceId ? { ...tx, ...draft, titulo: draft.titulo || tx.titulo, valor: Number(draft.valor || 0), data: dateOnly(draft.data) || tx.data, anexos: attachments } : tx) } }))
    } else if (active.kind === 'goal') {
      commit(current => ({ ...current, goals: rows(current.goals).map(goal => String(goal.id) === active.sourceId ? { ...goal, ...draft, titulo: draft.titulo || goal.titulo, prazo: dateOnly(draft.prazo), progresso_atual: Number(draft.progresso_atual || 0), progresso_total: Math.max(1, Number(draft.progresso_total || 100)), anexos: attachments } : goal) }))
    } else {
      commit(current => ({ ...current, notes: rows(current.notes).map(note => String(note.id) === active.sourceId ? { ...note, ...draft, titulo: draft.titulo || '', conteudo: draft.conteudo || '', anexos: attachments, data: new Date().toISOString() } : note) }))
    }
    onClose()
  }

  async function remove() {
    if (!confirm(`Excluir ${label.toLocaleLowerCase('pt-BR')}?`)) return
    if (active.kind === 'task') {
      const parentId = String(draft.parent_id || '')
      commit(current => ({ ...current, tasks: current.tasks.filter(task => task.id !== active.sourceId).map(task => String(task.parent_id || '') === active.sourceId ? { ...task, parent_id: parentId } : task) }))
    } else if (active.kind === 'note') commit(current => ({ ...current, notes: rows(current.notes).map(note => String(note.id) === active.sourceId ? { ...note, ativo: false } : note) }))
    else if (active.kind === 'goal') commit(current => ({ ...current, goals: rows(current.goals).filter(goal => String(goal.id) !== active.sourceId) }))
    else if (active.kind === 'habit') commit(current => ({ ...current, habits: rows(current.habits).map(habit => String(habit.id) === active.sourceId ? { ...habit, ativo: false } : habit) }))
    else if (active.kind === 'finance') {
      if (active.raw.fixo_id || active.raw.recorrente === true) commit(current => ({ ...current, finance: { ...current.finance, fixed: rows(current.finance.fixed).filter(rule => String(rule.id) !== String(active.raw.fixo_id || active.sourceId)) } }))
      else commit(current => ({ ...current, finance: { ...current.finance, transactions: rows(current.finance.transactions).filter(tx => String(tx.id) !== active.sourceId) } }))
    } else if (active.kind === 'event') {
      if (draft.tipo === 'google' || draft.tipo === 'gcalendar' || String(draft.id || '').includes('::')) { setBusy(true); try { await googleRpc('excluirEventoAgenda', [draft.id]); await refreshEvents?.() } finally { setBusy(false) } }
      else commit(current => ({ ...current, events: rows(current.events).filter(row => String(row.id) !== active.sourceId) }))
    }
    onClose()
  }

  function addSubtask() {
    const title = subtaskTitle.trim()
    if (!title || active.kind !== 'task') return
    const child = {
      id: `t-${crypto.randomUUID()}`,
      titulo: title,
      descricao: '',
      data_vencimento: '',
      prioridade: 4,
      concluida: false,
      projeto_id: draft.projeto_id || 'entrada',
      parent_id: active.sourceId,
      criado_em: new Date().toISOString(),
      ordem: Date.now(),
      notas: [], anexos: [], subtarefas: [], lembretes: [], etiquetas: [], repeticao: '', secao: '', ocultar_agenda: false,
    }
    commit(current => ({ ...current, tasks: [...current.tasks, child] }))
    setSubtaskTitle('')
  }

  function toggleSubtask(id: string) {
    commit(current => ({ ...current, tasks: current.tasks.map(task => task.id === id ? { ...task, concluida: !task.concluida, concluida_em: !task.concluida ? new Date().toISOString() : '' } : task) }))
  }

  const description = active.kind === 'finance' ? String(draft.observacao || '') : active.kind === 'note' ? String(draft.conteudo || '') : String(draft.descricao || '')
  const setDescription = (value: string) => active.kind === 'finance' ? set({ observacao: value }) : active.kind === 'note' ? set({ conteudo: value }) : set({ descricao: value })

  const taskTools = active.kind === 'task' ? <>
    <IconPopover id="task-date" icon="calendar_today" label="Data" summary={formatDate(dateOnly(draft.data_vencimento))} hasValue={Boolean(dateOnly(draft.data_vencimento))} open={openTool} setOpen={setOpenTool}><CalendarPicker value={dateOnly(draft.data_vencimento)} today={today} onChange={value => set({ data_vencimento: value, _hora: value ? draft._hora ?? timeOnly(draft.data_vencimento) : '' })} close={closeTool}/></IconPopover>
    <IconPopover id="task-time" icon="schedule" label="Horário" summary={String(draft._hora ?? timeOnly(draft.data_vencimento)) || 'Sem horário'} hasValue={Boolean(String(draft._hora ?? timeOnly(draft.data_vencimento)))} open={openTool} setOpen={setOpenTool}><TimePicker value={String(draft._hora ?? timeOnly(draft.data_vencimento))} onChange={value => set({ _hora: value })} close={closeTool}/></IconPopover>
    <IconPopover id="task-project" icon="folder" label="Projeto" summary={projectName} hasValue={String(draft.projeto_id || 'entrada') !== 'entrada'} open={openTool} setOpen={setOpenTool}><OptionList value={String(draft.projeto_id || 'entrada')} close={closeTool} onChange={value => set({ projeto_id: value })} options={[{ value:'entrada', label:'Entrada', icon:'inbox' }, ...projects.map(project => ({ value:String(project.id), label:String(project.nome || 'Projeto'), icon:'folder' }))]}/></IconPopover>
    <IconPopover id="task-priority" icon="flag" label="Prioridade" summary={priorityLabel} hasValue={Number(draft.prioridade || 4) !== 4} open={openTool} setOpen={setOpenTool}><OptionList value={Number(draft.prioridade || 4)} close={closeTool} onChange={value => set({ prioridade:Number(value) })} options={[{value:4,label:'Sem prioridade',icon:'flag'},{value:3,label:'Baixa',icon:'flag'},{value:2,label:'Média',icon:'flag'},{value:1,label:'Alta',icon:'flag'}]}/></IconPopover>
    <IconPopover id="task-repeat" icon="repeat" label="Repetir" summary={repeatLabel} hasValue={Boolean(draft.repeticao)} open={openTool} setOpen={setOpenTool}><OptionList value={String(draft.repeticao || '')} close={closeTool} onChange={value => set({ repeticao:value })} options={[{value:'',label:'Não repetir'},{value:'diariamente',label:'Todos os dias'},{value:'semanalmente',label:'Toda semana'},{value:'semanal:1,2,3,4,5',label:'Dias úteis'},{value:'mensalmente',label:'Todo mês'}]}/></IconPopover>
  </> : null

  const eventTools = active.kind === 'event' ? <>
    <IconPopover id="event-date" icon="calendar_today" label="Data" summary={formatDate(dateOnly(draft.data_inicio) || active.date || today)} hasValue open={openTool} setOpen={setOpenTool}><CalendarPicker value={dateOnly(draft.data_inicio) || active.date || today} today={today} onChange={value => set({ data_inicio:value })} close={closeTool}/></IconPopover>
    <IconPopover id="event-end" icon="event_busy" label="Termina" summary={formatDate(dateOnly(draft.data_fim))} hasValue={Boolean(dateOnly(draft.data_fim))} open={openTool} setOpen={setOpenTool}><CalendarPicker value={dateOnly(draft.data_fim)} today={today} onChange={value => set({ data_fim:value })} close={closeTool}/></IconPopover>
    <IconPopover id="event-time" icon="schedule" label="Horário" summary={draft.dia_inteiro ? 'Dia inteiro' : String(draft.hora_inicio || 'Sem horário')} hasValue={Boolean(draft.hora_inicio)} open={openTool} setOpen={setOpenTool}><TimePicker value={String(draft.hora_inicio || '')} onChange={value => set({ hora_inicio:value, dia_inteiro:false })} close={closeTool}/></IconPopover>
    <IconPopover id="event-duration" icon="timelapse" label="Duração" summary={`${Number(draft._duracao || 60)} min`} hasValue open={openTool} setOpen={setOpenTool}><OptionList value={Number(draft._duracao || 60)} close={closeTool} onChange={value => set({ _duracao:Number(value) })} options={[15,30,45,60,90,120].map(value => ({value,label:value < 60 ? `${value} min` : value === 60 ? '1 hora' : value === 90 ? '1 h 30' : '2 horas'}))}/></IconPopover>
    <IconPopover id="event-all-day" icon="today" label="Dia inteiro" summary={draft.dia_inteiro ? 'Ativado' : 'Desativado'} hasValue={draft.dia_inteiro === true} open={openTool} setOpen={setOpenTool}><OptionList value={draft.dia_inteiro ? 'yes':'no'} close={closeTool} onChange={value => set({ dia_inteiro:value === 'yes' })} options={[{value:'yes',label:'Dia inteiro',icon:'check_circle'},{value:'no',label:'Usar horário',icon:'schedule'}]}/></IconPopover>
    <IconPopover id="event-location" icon="location_on" label="Local" summary={String(draft.local || 'Sem local')} hasValue={Boolean(draft.local)} open={openTool} setOpen={setOpenTool}><TextEditor value={String(draft.local || '')} placeholder="Adicionar local" onChange={value => set({ local:value })}/></IconPopover>
    <IconPopover id="event-repeat" icon="repeat" label="Repetir" summary={repeatLabel} hasValue={Boolean(draft.repeticao)} open={openTool} setOpen={setOpenTool}><OptionList value={String(draft.repeticao || '')} close={closeTool} onChange={value => set({ repeticao:value })} options={[{value:'',label:'Não repetir'},{value:'diariamente',label:'Todos os dias'},{value:'semanalmente',label:'Toda semana'},{value:'mensalmente',label:'Todo mês'}]}/></IconPopover>
  </> : null

  const habitTools = active.kind === 'habit' ? <>
    <IconPopover id="habit-time" icon="schedule" label="Horário" summary={String(draft.hora || 'Sem horário')} hasValue={Boolean(draft.hora)} open={openTool} setOpen={setOpenTool}><TimePicker value={String(draft.hora || '')} onChange={value => set({ hora:value })} close={closeTool}/></IconPopover>
    <IconPopover id="habit-target" icon="target" label="Meta" summary={String(draft.meta ?? 1)} hasValue open={openTool} setOpen={setOpenTool}><NumberEditor value={Number(draft.meta ?? 1)} onChange={value => set({ meta:value })} suffix={String(draft.unidade || '')}/></IconPopover>
    <IconPopover id="habit-unit" icon="straighten" label="Unidade" summary={String(draft.unidade || 'Sem unidade')} hasValue={Boolean(draft.unidade)} open={openTool} setOpen={setOpenTool}><TextEditor value={String(draft.unidade || '')} placeholder="Ex.: copos, km, min" onChange={value => set({ unidade:value })}/></IconPopover>
    <IconPopover id="habit-done" icon="check_circle" label="Realizado" summary={String(draft._valor ?? habitEntry?.valor ?? 0)} hasValue={Number(draft._valor ?? habitEntry?.valor ?? 0) > 0} open={openTool} setOpen={setOpenTool}><NumberEditor value={Number(draft._valor ?? habitEntry?.valor ?? 0)} onChange={value => set({ _valor:value })} suffix={String(draft.unidade || '')}/></IconPopover>
  </> : null

  const financeTools = active.kind === 'finance' ? <>
    {!active.raw.fixo_id && active.raw.recorrente !== true ? <IconPopover id="finance-date" icon="calendar_today" label="Data" summary={formatDate(dateOnly(draft.data))} hasValue={Boolean(dateOnly(draft.data))} open={openTool} setOpen={setOpenTool}><CalendarPicker value={dateOnly(draft.data)} today={today} onChange={value => set({ data:value })} close={closeTool}/></IconPopover> : null}
    <IconPopover id="finance-value" icon="payments" label="Valor" summary={new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(draft.valor_real ?? draft.valor ?? 0))} hasValue open={openTool} setOpen={setOpenTool}><NumberEditor value={Number(draft.valor_real ?? draft.valor ?? 0)} onChange={value => set({ [draft.valor_real != null ? 'valor_real' : 'valor']:value })}/></IconPopover>
    <IconPopover id="finance-status" icon="task_alt" label="Status" summary={String(draft.status || 'pendente')} hasValue={String(draft.status || 'pendente') !== 'pendente'} open={openTool} setOpen={setOpenTool}><OptionList value={String(draft.status || 'pendente')} close={closeTool} onChange={value => set({ status:value })} options={[{value:'pendente',label:'Pendente'},{value:'parcial',label:'Parcial'},{value:'pago',label:'Pago'}]}/></IconPopover>
    <IconPopover id="finance-category" icon="sell" label="Categoria" summary={String(draft.categoria || 'Sem categoria')} hasValue={Boolean(draft.categoria)} open={openTool} setOpen={setOpenTool}><TextEditor value={String(draft.categoria || '')} placeholder="Adicionar categoria" onChange={value => set({ categoria:value })}/></IconPopover>
  </> : null

  const goalTools = active.kind === 'goal' ? <>
    <IconPopover id="goal-date" icon="calendar_today" label="Prazo" summary={formatDate(dateOnly(draft.prazo))} hasValue={Boolean(dateOnly(draft.prazo))} open={openTool} setOpen={setOpenTool}><CalendarPicker value={dateOnly(draft.prazo)} today={today} onChange={value => set({ prazo:value })} close={closeTool}/></IconPopover>
    <IconPopover id="goal-current" icon="trending_up" label="Atual" summary={String(draft.progresso_atual || 0)} hasValue={Number(draft.progresso_atual || 0) > 0} open={openTool} setOpen={setOpenTool}><NumberEditor value={Number(draft.progresso_atual || 0)} onChange={value => set({ progresso_atual:value })}/></IconPopover>
    <IconPopover id="goal-target" icon="target" label="Alvo" summary={String(draft.progresso_total || 100)} hasValue open={openTool} setOpen={setOpenTool}><NumberEditor value={Number(draft.progresso_total || 100)} onChange={value => set({ progresso_total:Math.max(1,value) })}/></IconPopover>
    <IconPopover id="goal-status" icon="task_alt" label="Status" summary={String(draft.status || 'Em Andamento')} hasValue={String(draft.status || 'Em Andamento') !== 'Em Andamento'} open={openTool} setOpen={setOpenTool}><OptionList value={String(draft.status || 'Em Andamento')} close={closeTool} onChange={value => set({ status:value })} options={[{value:'Em Andamento',label:'Em andamento'},{value:'Pausada',label:'Pausada'},{value:'Concluída',label:'Concluída'}]}/></IconPopover>
  </> : null

  return <div className="mai-context-layer mai-context-v3-layer" onMouseDown={() => { setOpenTool(''); onClose() }}>
    <aside className="mai-context-drawer mai-context-v3-drawer" data-kind={active.kind} onMouseDown={event => event.stopPropagation()}>
      <header className="mai-context-v3-top">
        <div className="mai-context-v3-path-wrap">{active.kind === 'task' && breadcrumbs.length > 1 ? <nav className="mai-context-v3-breadcrumbs" aria-label="Caminho da subtarefa">{breadcrumbs.map((crumb,index) => <span key={crumb.id}>{index ? <i>›</i> : null}<button type="button" data-current={index === breadcrumbs.length - 1} onClick={() => setFocusId(crumb.id)}>{crumb.title}</button></span>)}</nav> : <span className="mai-context-v3-kind">{label}</span>}</div>
        <button type="button" className="mai-context-v3-close" onClick={onClose} aria-label="Fechar"><MaiIcon name="close" size={17}/></button>
      </header>

      <form onSubmit={save} className="mai-context-v3-form">
        <div className="mai-context-v3-scroll" onMouseDown={() => openTool && setOpenTool('')}>
          <input className="mai-context-v3-title" autoFocus value={titleValue} onMouseDown={event => event.stopPropagation()} onChange={e => setTitle(e.target.value)} placeholder={`Nome ${label.toLocaleLowerCase('pt-BR')}`} />

          {(taskTools || eventTools || habitTools || financeTools || goalTools) ? <section className="mai-context-v3-toolbar" aria-label="Detalhes" onMouseDown={event => event.stopPropagation()}>{taskTools}{eventTools}{habitTools}{financeTools}{goalTools}</section> : null}

          <section className="mai-context-v3-section mai-context-v3-description">
            <header><span className="material-symbols-rounded">notes</span><strong>{active.kind === 'note' ? 'Conteúdo' : 'Descrição'}</strong></header>
            <DescriptionEditor value={description} onChange={setDescription}/>
          </section>

          {active.kind === 'task' ? <section className="mai-context-v3-section mai-context-v3-subtasks">
            <header><span className="material-symbols-rounded">account_tree</span><strong>Subtarefas</strong><small>{directChildren.filter(child => child.concluida).length}/{directChildren.length}</small></header>
            <div className="mai-context-v3-subtask-list">{directChildren.map(child => <div className="mai-context-v3-subtask" key={child.id}>
              <button type="button" className="mai-context-v3-subtask-check" data-done={child.concluida === true} style={!child.concluida ? { borderColor: priorityColor(child.prioridade) } : undefined} onClick={() => toggleSubtask(child.id)}>{child.concluida ? '✓' : ''}</button>
              <button type="button" className="mai-context-v3-subtask-main" onClick={() => setFocusId(child.id)}><strong>{child.titulo}</strong><small>{dateOnly(child.data_vencimento) ? `${formatDate(dateOnly(child.data_vencimento))} · tarefa com data` : 'Dentro desta tarefa'}</small></button>
              <MaiIcon name="chevron" size={13}/>
            </div>)}</div>
            <div className="mai-context-v3-subtask-add"><span className="material-symbols-rounded">add</span><input value={subtaskTitle} placeholder="Adicionar subtarefa" onChange={e => setSubtaskTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubtask() } }}/><button type="button" onClick={addSubtask}>Adicionar</button></div>
          </section> : null}

          <section className="mai-context-v3-section mai-context-v3-files">
            <header><span className="material-symbols-rounded">attach_file</span><strong>Arquivos</strong></header>
            {attachments.length ? <div>{attachments.map((file,index) => <div className="mai-context-v3-file" key={String(file.id || file.nome || file.name || index)}><span className="material-symbols-rounded">description</span><span>{String(file.nome || file.name || 'Arquivo')}</span></div>)}</div> : <small>Nenhum arquivo anexado.</small>}
          </section>

          {message ? <p className="mai-context-error">{message}</p> : null}
        </div>

        <footer className="mai-context-v3-footer">
          <button type="button" className="mai-context-v3-delete" onClick={() => void remove()} disabled={busy}><MaiIcon name="delete" size={15}/>Excluir</button>
          <div><button type="button" onClick={onClose}>Cancelar</button><button className="mai-context-v3-save" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button></div>
        </footer>
      </form>
    </aside>
  </div>
}
