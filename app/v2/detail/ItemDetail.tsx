'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { addDays } from '../../../lib/v2/planner'
import type { MaiState } from '../../../lib/v2/state'
import { Icon } from '../../ds'
import type { InspectableItem } from '../ContextDrawer'
import { driveAssetUrl, googleDriveRpc } from '../DriveAsset'
import { FilePreviewOverlay } from '../FilePreviewOverlay'
import { FinanceContextDrawerV4 } from '../FinanceContextDrawerV4'
import { financeCardPaymentState } from '../FinanceTransactionCard'
import { resolveMaiIcon } from '../MaiIcons'
import styles from './ItemDetail.module.css'

/*
 * MAI — detalhes de um item, feito do zero.
 * Computador: janela no centro. Celular: folha que sobe de baixo.
 * Nada recebe foco sozinho: o teclado só abre quando você toca num campo.
 */

type Row = Record<string, any>
type Commit = (change: (current: MaiState) => MaiState) => void
type Props = {
  item: InspectableItem | null
  state: MaiState
  today: string
  commit: Commit
  googleRpc: (method: string, args?: unknown[]) => Promise<any>
  refreshEvents?: () => Promise<void> | void
  onClose: () => void
}

const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : [])
const dateKey = (value: unknown) => String(value || '').slice(0, 10)
const timeKey = (value: unknown) => (String(value || '').includes('T') ? String(value).slice(11, 16) : '')
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const failedEntry = (entry?: Row) => entry?.falhou === true || String(entry?.status || '').toLowerCase() === 'falha'
const isGoogle = (event: Row) => event.tipo === 'google' || event.tipo === 'gcalendar' || String(event.id || '').includes('::')

const PRIORITIES = [
  { value: '1', label: 'Alta', color: 'var(--ds-rose-fg)' },
  { value: '2', label: 'Média', color: 'var(--ds-peach-fg)' },
  { value: '3', label: 'Baixa', color: 'var(--ds-sky-fg)' },
  { value: '4', label: 'Sem prioridade', color: 'var(--ds-muted)' },
]

const REPEATS = [
  { value: '', label: 'Não repete' },
  { value: 'diariamente', label: 'Todos os dias' },
  { value: 'semanal:1,2,3,4,5', label: 'Dias úteis' },
  { value: 'semanalmente', label: 'Toda semana' },
  { value: 'mensalmente', label: 'Todo mês' },
  { value: 'anualmente', label: 'Todo ano' },
]

const KIND: Record<string, { label: string; icon: string }> = {
  task: { label: 'Tarefa', icon: 'checklist' },
  event: { label: 'Compromisso', icon: 'event' },
  habit: { label: 'Hábito', icon: 'autorenew' },
  finance: { label: 'Lançamento', icon: 'account_balance_wallet' },
  goal: { label: 'Meta', icon: 'flag' },
  note: { label: 'Nota', icon: 'sticky_note_2' },
}

function friendlyDate(key: string, today: string) {
  if (!key) return 'Sem data'
  if (key === today) return 'Hoje'
  if (key === addDays(today, 1)) return 'Amanhã'
  if (key === addDays(today, -1)) return 'Ontem'
  const date = new Date(`${key}T12:00:00`)
  const sameYear = key.slice(0, 4) === today.slice(0, 4)
  return date.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }).replace(/\./g, '')
}

/* ------------------------------------------------------------------ Moldura */

export function ItemDetail(props: Props) {
  const { item } = props
  if (!item) return null
  // Lançamentos fixos (regras que se repetem por mês) continuam no editor de Finanças.
  if (item.kind === 'finance' && (item.raw.fixo_id || item.raw.recorrente === true)) {
    return <FinanceContextDrawerV4 item={item} state={props.state} today={props.today} commit={props.commit} onClose={props.onClose} />
  }
  return <DetailShell key={`${item.kind}:${item.sourceId}`} {...props} item={item} />
}

function DetailShell(props: Props & { item: InspectableItem }) {
  const { item, onClose } = props
  const flushers = useRef(new Set<() => void | Promise<void>>())
  const [closing, setClosing] = useState(false)

  const close = useCallback(async () => {
    if (closing) return
    setClosing(true)
    for (const flush of flushers.current) await flush()
    onClose()
  }, [closing, onClose])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') void close() }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [close])

  const register = useCallback((flush: () => void | Promise<void>) => {
    flushers.current.add(flush)
    return () => { flushers.current.delete(flush) }
  }, [])

  const body = (() => {
    const shared = { ...props, register, close }
    if (item.kind === 'task') return <TaskDetail {...shared} />
    if (item.kind === 'event') return <EventDetail {...shared} />
    if (item.kind === 'habit') return <HabitDetail {...shared} />
    if (item.kind === 'finance') return <FinanceDetail {...shared} />
    if (item.kind === 'goal') return <GoalDetail {...shared} />
    return <NoteDetail {...shared} />
  })()

  // Fora da casca do app, para nenhuma regra antiga de CSS alcançar o popup.
  return createPortal(
    <div className={styles.layer} onClick={event => { if (event.target === event.currentTarget) void close() }}>
      <section className={styles.panel} role="dialog" aria-modal="true" aria-label={KIND[item.kind]?.label || 'Detalhes'}>
        <div className={styles.handle} aria-hidden="true" />
        {body}
      </section>
    </div>,
    document.body,
  )
}

type DetailProps = Props & { item: InspectableItem; register: (flush: () => void | Promise<void>) => () => void; close: () => Promise<void> }

/* ------------------------------------------------------------ Peças comuns */

function Header({ kind, crumbs, onClose }: { kind: string; crumbs?: ReactNode; onClose: () => void }) {
  return (
    <header className={styles.header}>
      <span className={styles.kind}>
        <Icon name={KIND[kind]?.icon || 'info'} size={15} className={styles.kindIcon} />
        <span>{KIND[kind]?.label}</span>
        {crumbs}
      </span>
      <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Fechar"><Icon name="close" size={18} filled={false} /></button>
    </header>
  )
}

function Footer({ status, onDelete, deleteLabel = 'Excluir' }: { status: ReactNode; onDelete?: () => void; deleteLabel?: string }) {
  return (
    <footer className={styles.footer}>
      <span className={styles.status}>{status}</span>
      {onDelete ? <button type="button" className={styles.delete} onClick={onDelete}><Icon name="delete" size={17} filled={false} />{deleteLabel}</button> : null}
    </footer>
  )
}

const savedStatus = <><Icon name="cloud_done" size={15} className={styles.okIcon} />Salvo automaticamente</>

/** Campo de texto que cresce com o conteúdo. */
function GrowText({ value, onChange, placeholder, className, multiline = true }: { value: string; onChange: (value: string) => void; placeholder: string; className: string; multiline?: boolean }) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${element.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={1}
      className={className}
      value={value}
      placeholder={placeholder}
      onChange={event => onChange(multiline ? event.target.value : event.target.value.replace(/\n/g, ' '))}
      onKeyDown={event => { if (!multiline && event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } }}
    />
  )
}

/** Rascunho local com gravação automática (texto espera um instante). */
function useAutosave(initial: Row, save: (draft: Row) => void, register: DetailProps['register'], delay = 350) {
  const [draft, setDraft] = useState<Row>(initial)
  const pending = useRef<Row | null>(null)
  const timer = useRef<number | null>(null)
  const saveRef = useRef(save)
  saveRef.current = save

  const flush = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
    if (pending.current) { saveRef.current(pending.current); pending.current = null }
  }, [])

  useEffect(() => register(flush), [register, flush])
  useEffect(() => () => flush(), [flush])

  const update = useCallback((patch: Row, immediate = false) => {
    setDraft(current => {
      const next = { ...current, ...patch }
      pending.current = next
      return next
    })
    if (timer.current) window.clearTimeout(timer.current)
    if (immediate) window.setTimeout(flush, 0)
    else timer.current = window.setTimeout(flush, delay)
  }, [delay, flush])

  return { draft, update, setDraft }
}

type Option = { value: string; label: string }

/**
 * Propriedade: no computador é um botãozinho; no celular, uma linha com
 * rótulo e valor. O controle nativo fica por cima, invisível, para abrir
 * o seletor do próprio aparelho.
 */
function Prop({ icon, color, label, display, children, muted }: { icon: ReactNode; color?: string; label: string; display: ReactNode; children?: ReactNode; muted?: boolean }) {
  return (
    <div className={styles.prop} data-muted={muted || undefined} style={color ? ({ '--prop-color': color } as CSSProperties) : undefined}>
      <span className={styles.propIcon}>{typeof icon === 'string' ? <Icon name={icon} size={17} /> : icon}</span>
      <span className={styles.propLabel}>{label}</span>
      <span className={styles.propValue}>{display}</span>
      {children}
    </div>
  )
}

function SelectProp({ icon, color, label, value, options, onChange, display }: { icon: ReactNode; color?: string; label: string; value: string; options: Option[]; onChange: (value: string) => void; display?: ReactNode }) {
  const current = options.find(option => option.value === value)
  return (
    <Prop icon={icon} color={color} label={label} display={display ?? current?.label ?? '—'}>
      <select className={styles.native} aria-label={label} value={value} onChange={event => onChange(event.target.value)}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </Prop>
  )
}

function PickerProp({ type, icon, color, label, value, display, onChange, muted }: { type: 'date' | 'time'; icon: string; color?: string; label: string; value: string; display: ReactNode; onChange: (value: string) => void; muted?: boolean }) {
  return (
    <Prop icon={icon} color={color} label={label} display={display} muted={muted}>
      <input
        className={styles.native}
        type={type}
        aria-label={label}
        value={value}
        onClick={event => { try { (event.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.() } catch {} }}
        onChange={event => onChange(event.target.value)}
      />
    </Prop>
  )
}

function Attachments({ files, onChange }: { files: Row[]; onChange: (files: Row[]) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<Row | null>(null)
  const name = (file: Row) => String(file.nome || file.name || 'Arquivo')
  const driveId = (file: Row) => String(file.idDrive || file.driveId || file.id || '')

  async function upload(file?: File) {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const response = await googleDriveRpc('salvarAnexoDrive', [dataUrl, file.name, file.type])
      const saved = response?.item || response || {}
      onChange([...files, { idDrive: saved.id, nome: saved.name || saved.nome || file.name, tipo: saved.tipo || saved.mimeType || file.type, tamanho: Number(saved.tamanho || saved.size || file.size || 0), url: saved.url || saved.webViewLink || '', criado_em: new Date().toISOString() }])
    } catch (uploadError: any) {
      setError(uploadError?.message || 'Não foi possível anexar o arquivo.')
    } finally {
      setBusy(false)
    }
  }

  function remove(index: number) {
    const file = files[index]
    onChange(files.filter((_, position) => position !== index))
    const id = driveId(file)
    if (id) void googleDriveRpc('trashDriveItem', [id]).catch(() => null)
  }

  const iconFor = (file: Row) => {
    const type = String(file.tipo || file.mimeType || '')
    if (type.includes('pdf')) return 'picture_as_pdf'
    if (type.startsWith('image')) return 'image'
    if (type.includes('sheet') || type.includes('excel')) return 'table_chart'
    return 'description'
  }

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}><h3>Arquivos</h3>{files.length ? <span>{files.length}</span> : null}</div>
      <div className={styles.files}>
        {files.map((file, index) => (
          <span key={`${driveId(file) || name(file)}-${index}`} className={styles.file}>
            <button type="button" className={styles.fileOpen} onClick={() => setPreview(file)}><Icon name={iconFor(file)} size={18} className={styles.fileIcon} /><span>{name(file)}</span></button>
            <button type="button" className={styles.fileRemove} onClick={() => remove(index)} aria-label={`Remover ${name(file)}`}><Icon name="close" size={15} filled={false} /></button>
          </span>
        ))}
        <label className={styles.attach} data-busy={busy || undefined}>
          <Icon name="attach_file" size={18} filled={false} />
          <span>{busy ? 'Enviando…' : 'Anexar'}</span>
          <input hidden type="file" disabled={busy} onChange={event => { void upload(event.target.files?.[0]); event.currentTarget.value = '' }} />
        </label>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      <FilePreviewOverlay file={preview} onClose={() => setPreview(null)} />
    </section>
  )
}

function Round({ checked, late, onToggle, label, tone }: { checked: boolean; late?: boolean; onToggle: () => void; label: string; tone?: 'success' }) {
  return (
    <button type="button" className={styles.round} data-checked={checked || undefined} data-late={late || undefined} data-tone={tone} onClick={onToggle} aria-pressed={checked} aria-label={label}>
      {checked ? <Icon name="check" size={16} /> : null}
    </button>
  )
}

/* ---------------------------------------------------------------- Tarefa */

function TaskDetail({ item, state, today, commit, register, close }: DetailProps) {
  const [activeId, setActiveId] = useState(item.sourceId)
  const task = state.tasks.find(row => String(row.id) === activeId) as Row | undefined
  if (!task) return <Missing kind="task" onClose={close} />
  return <TaskBody key={activeId} task={task} state={state} today={today} commit={commit} register={register} close={close} openTask={setActiveId} />
}

function TaskBody({ task, state, today, commit, register, close, openTask }: { task: Row; state: MaiState; today: string; commit: Commit; register: DetailProps['register']; close: () => Promise<void>; openTask: (id: string) => void }) {
  const id = String(task.id)
  const save = useCallback((draft: Row) => {
    const due = draft._data ? `${draft._data}${draft._hora ? `T${draft._hora}` : ''}` : ''
    const { _data, _hora, ...clean } = draft
    commit(current => ({ ...current, tasks: current.tasks.map(row => String(row.id) === id ? { ...row, ...clean, titulo: String(clean.titulo || '').trim() || 'Tarefa', data_vencimento: due } : row) }))
  }, [commit, id])
  const { draft, update } = useAutosave({
    titulo: String(task.titulo || ''),
    descricao: String(task.descricao || ''),
    _data: dateKey(task.data_vencimento),
    _hora: timeKey(task.data_vencimento),
    projeto_id: String(task.projeto_id || 'entrada'),
    secao: String(task.secao || ''),
    prioridade: Number(task.prioridade || 4),
    repeticao: String(task.repeticao || ''),
    anexos: rows(task.anexos),
  }, save, register)

  const projects = rows(state.projects).filter(project => project.ativo !== false)
  const project = projects.find(row => String(row.id) === draft.projeto_id)
  const sections = rows(project?.secoes).map(String)
  const priority = PRIORITIES.find(option => Number(option.value) === Number(draft.prioridade)) || PRIORITIES[3]
  const children = state.tasks.filter(row => String(row.parent_id || '') === id) as Row[]
  const doneChildren = children.filter(row => row.concluida).length
  const late = Boolean(draft._data) && draft._data < today && !task.concluida
  const [subtask, setSubtask] = useState('')

  const crumbs: Row[] = []
  let parentId = String(task.parent_id || '')
  while (parentId && crumbs.length < 6) {
    const parent = state.tasks.find(row => String(row.id) === parentId) as Row | undefined
    if (!parent) break
    crumbs.unshift(parent)
    parentId = String(parent.parent_id || '')
  }

  const toggle = (taskId: string) => commit(current => ({ ...current, tasks: current.tasks.map(row => String(row.id) === taskId ? { ...row, concluida: !row.concluida, concluida_em: !row.concluida ? new Date().toISOString() : '' } : row) }))

  function addSubtask() {
    const title = subtask.trim()
    if (!title) return
    commit(current => ({ ...current, tasks: [...current.tasks, { id: uid('t'), titulo: title, descricao: '', data_vencimento: '', prioridade: 4, concluida: false, projeto_id: draft.projeto_id || 'entrada', parent_id: id, secao: draft.secao || '', criado_em: new Date().toISOString(), ordem: Date.now(), anexos: [], subtarefas: [], lembretes: [], etiquetas: [], repeticao: '', notas: [] }] }))
    setSubtask('')
  }

  function remove() {
    if (!confirm(`Excluir "${draft.titulo || 'tarefa'}"?`)) return
    const parent = String(task.parent_id || '')
    commit(current => ({ ...current, tasks: current.tasks.filter(row => String(row.id) !== id).map(row => String(row.parent_id || '') === id ? { ...row, parent_id: parent } : row) }))
    void close()
  }

  const projectIcon = project?.imagem_url
    ? <img className={styles.projectImg} src={driveAssetUrl(project.imagem_url)} alt="" />
    : <span className={styles.projectDot} style={{ background: String(project?.cor || 'var(--ds-line-strong)') }} />

  return (
    <>
      <Header kind="task" onClose={() => void close()} crumbs={<>
        {crumbs.map(crumb => <span key={String(crumb.id)} className={styles.crumb}><i>›</i><button type="button" onClick={() => openTask(String(crumb.id))}>{String(crumb.titulo || 'Tarefa')}</button></span>)}
        {!crumbs.length ? <span className={styles.crumb}><i>›</i>{String(project?.nome || 'Entrada')}{draft.secao ? <><i>›</i>{draft.secao}</> : null}</span> : null}
      </>} />
      <div className={styles.scroll}>
        <div className={styles.titleRow}>
          <Round checked={Boolean(task.concluida)} late={late} onToggle={() => toggle(id)} label={task.concluida ? 'Reabrir tarefa' : 'Concluir tarefa'} />
          <div className={styles.titleBody}>
            <GrowText className={`${styles.title} ${task.concluida ? styles.titleDone : ''}`} value={draft.titulo} placeholder="Nome da tarefa" multiline={false} onChange={titulo => update({ titulo })} />
            <GrowText className={styles.description} value={draft.descricao} placeholder="Adicionar descrição" onChange={descricao => update({ descricao })} />
          </div>
        </div>

        <div className={styles.props}>
          <PickerProp type="date" icon="calendar_today" color="var(--ds-accent)" label="Data" value={draft._data} display={<span className={late ? styles.late : undefined}>{friendlyDate(draft._data, today)}</span>} onChange={_data => update({ _data, _hora: _data ? draft._hora : '' }, true)} />
          {draft._data ? <PickerProp type="time" icon="schedule" color="var(--ds-lilac-fg)" label="Horário" value={draft._hora} display={draft._hora || 'Sem horário'} muted={!draft._hora} onChange={_hora => update({ _hora }, true)} /> : null}
          <SelectProp icon={projectIcon} label="Projeto" value={draft.projeto_id} onChange={projeto_id => update({ projeto_id, secao: '' }, true)} options={[{ value: 'entrada', label: 'Entrada' }, ...projects.map(row => ({ value: String(row.id), label: String(row.nome || 'Projeto') }))]} />
          {sections.length ? <SelectProp icon="view_agenda" color="var(--ds-text-2)" label="Seção" value={draft.secao} onChange={secao => update({ secao }, true)} options={[{ value: '', label: 'Sem seção' }, ...sections.map(name => ({ value: name, label: name }))]} /> : null}
          <SelectProp icon="flag" color={priority.color} label="Prioridade" value={String(draft.prioridade)} onChange={value => update({ prioridade: Number(value) }, true)} options={PRIORITIES} />
          <SelectProp icon="repeat" color="var(--ds-mint-fg)" label="Repetir" value={draft.repeticao} onChange={repeticao => update({ repeticao }, true)} options={REPEATS.some(option => option.value === draft.repeticao) ? REPEATS : [...REPEATS, { value: draft.repeticao, label: 'Personalizado' }]} />
        </div>

        <section className={styles.section}>
          <div className={styles.sectionHead}><h3>Subtarefas</h3>{children.length ? <span>{doneChildren} de {children.length}</span> : null}</div>
          {children.length ? <div className={styles.bar}><span style={{ width: `${(doneChildren / children.length) * 100}%` }} /></div> : null}
          <div className={styles.list}>
            {children.map(child => (
              <div key={String(child.id)} className={styles.listRow} data-done={child.concluida || undefined}>
                <Round checked={Boolean(child.concluida)} onToggle={() => toggle(String(child.id))} label={`Concluir ${String(child.titulo || 'subtarefa')}`} />
                <button type="button" className={styles.listText} onClick={() => openTask(String(child.id))}>{String(child.titulo || 'Subtarefa')}</button>
                <Icon name="chevron_right" size={18} className={styles.listChevron} />
              </div>
            ))}
            <div className={styles.addRow}>
              <Icon name="add" size={18} filled={false} />
              <input value={subtask} placeholder="Adicionar subtarefa" enterKeyHint="done" onChange={event => setSubtask(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addSubtask() } }} />
              {subtask.trim() ? <button type="button" onClick={addSubtask}>Adicionar</button> : null}
            </div>
          </div>
        </section>

        <Attachments files={draft.anexos} onChange={anexos => update({ anexos }, true)} />
      </div>
      <Footer status={savedStatus} onDelete={remove} />
    </>
  )
}

/* ----------------------------------------------------------- Compromisso */

function EventDetail({ item, state, today, commit, googleRpc, refreshEvents, register, close }: DetailProps) {
  const source = (rows(state.events).find(row => String(row.id) === item.sourceId) || item.raw) as Row
  const google = isGoogle(source)
  const day = item.date || dateKey(source.data_inicio) || today
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const saveLocal = useCallback((draft: Row) => {
    if (google) return
    commit(current => ({ ...current, events: rows(current.events).map(row => String(row.id) === item.sourceId ? { ...row, ...draft, titulo: String(draft.titulo || '').trim() || 'Compromisso' } : row) }))
  }, [commit, google, item.sourceId])

  const { draft, update: rawUpdate } = useAutosave({
    titulo: String(source.titulo || item.title || ''),
    descricao: String(source.descricao || ''),
    data_inicio: dateKey(source.data_inicio) || day,
    hora_inicio: String(source.hora_inicio || '').slice(0, 5),
    hora_fim: String(source.hora_fim || '').slice(0, 5),
    dia_inteiro: source.dia_inteiro === true,
    repeticao: String(source.repeticao || ''),
    anexos: rows(source.anexos),
  }, saveLocal, register)

  const update = (patch: Row, immediate = false) => { rawUpdate(patch, immediate); if (google) setDirty(true) }

  // Google: envia uma vez, ao fechar.
  const draftRef = useRef(draft)
  draftRef.current = draft
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => register(async () => {
    if (!google || !dirtyRef.current) return
    setBusy(true)
    try {
      await googleRpc('salvarEventoAgenda', [{ ...source, ...draftRef.current, titulo: String(draftRef.current.titulo || '').trim() || 'Compromisso', hora_fim: draftRef.current.dia_inteiro ? '' : draftRef.current.hora_fim }])
      await refreshEvents?.()
    } catch (error: any) {
      alert(error?.message || 'Não foi possível salvar no Google Agenda.')
    } finally { setBusy(false) }
  }), [register, google, googleRpc, refreshEvents, source])

  const key = `${item.sourceId}|${day}|${String(source.hora_inicio || item.time || '')}`
  const completions = rows(state.eventCompletions)
  const done = completions.some(entry => entry.chave === key || (String(entry.evento_id) === item.sourceId && dateKey(entry.data) === day && entry.concluida !== false))
  const toggleDone = () => commit(current => {
    const list = rows(current.eventCompletions)
    return { ...current, eventCompletions: done ? list.filter(entry => !(entry.chave === key || (String(entry.evento_id) === item.sourceId && dateKey(entry.data) === day))) : [...list, { chave: key, evento_id: item.sourceId, data: day, hora: draft.hora_inicio, concluida: true, atualizado_em: new Date().toISOString() }] }
  })

  async function remove() {
    if (!confirm(`Excluir "${draft.titulo || 'compromisso'}"?`)) return
    if (google) {
      setBusy(true)
      try { await googleRpc('excluirEventoAgenda', [source.id]); await refreshEvents?.() }
      catch (error: any) { setMessage(error?.message || 'Não foi possível excluir no Google Agenda.'); setBusy(false); return }
      setDirty(false)
    } else {
      commit(current => ({ ...current, events: rows(current.events).filter(row => String(row.id) !== item.sourceId), eventCompletions: rows(current.eventCompletions).filter(entry => String(entry.evento_id) !== item.sourceId) }))
    }
    void close()
  }

  const calendarName = google ? String(source.calendario_nome || 'Google Agenda') : String(source.categoria || 'MAI')
  const color = String(source.calendarColor || source.cor || 'var(--ds-accent)')
  const timeRange = draft.dia_inteiro ? 'Dia todo' : `${draft.hora_inicio || '--:--'}${draft.hora_fim ? ` – ${draft.hora_fim}` : ''}`

  return (
    <>
      <Header kind="event" onClose={() => void close()} crumbs={<span className={styles.crumb}><i>·</i>{calendarName}</span>} />
      <div className={styles.scroll}>
        <div className={styles.titleRow}>
          <span className={styles.tile} style={{ background: color.startsWith('#') ? color : undefined }}><Icon name="event" size={17} /></span>
          <div className={styles.titleBody}>
            <GrowText className={`${styles.title} ${done ? styles.titleDone : ''}`} value={draft.titulo} placeholder="Nome do compromisso" multiline={false} onChange={titulo => update({ titulo })} />
            <GrowText className={styles.description} value={draft.descricao} placeholder="Adicionar descrição" onChange={descricao => update({ descricao })} />
          </div>
        </div>

        <div className={styles.props}>
          <PickerProp type="date" icon="calendar_today" color="var(--ds-accent)" label="Data" value={draft.data_inicio} display={friendlyDate(draft.data_inicio, today)} onChange={data_inicio => data_inicio && update({ data_inicio }, true)} />
          <SelectProp icon="wb_sunny" color="var(--ds-peach-fg)" label="Dia todo" value={draft.dia_inteiro ? 'sim' : 'nao'} onChange={value => update({ dia_inteiro: value === 'sim' }, true)} options={[{ value: 'nao', label: 'Com horário' }, { value: 'sim', label: 'Dia todo' }]} display={draft.dia_inteiro ? 'Dia todo' : 'Com horário'} />
          {!draft.dia_inteiro ? <PickerProp type="time" icon="schedule" color="var(--ds-lilac-fg)" label="Início" value={draft.hora_inicio} display={draft.hora_inicio || '--:--'} onChange={hora_inicio => update({ hora_inicio }, true)} /> : null}
          {!draft.dia_inteiro ? <PickerProp type="time" icon="schedule" color="var(--ds-lilac-fg)" label="Fim" value={draft.hora_fim} display={draft.hora_fim || 'Sem fim'} muted={!draft.hora_fim} onChange={hora_fim => update({ hora_fim }, true)} /> : null}
          <Prop icon={google ? 'calendar_month' : 'event_note'} color="var(--ds-sky-fg)" label="Calendário" display={calendarName} />
          {!google ? <SelectProp icon="repeat" color="var(--ds-mint-fg)" label="Repetir" value={draft.repeticao} onChange={repeticao => update({ repeticao }, true)} options={REPEATS.some(option => option.value === draft.repeticao) ? REPEATS : [...REPEATS, { value: draft.repeticao, label: 'Personalizado' }]} /> : null}
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.actionRow} data-on={done || undefined} onClick={toggleDone}>
            <Icon name={done ? 'check_circle' : 'radio_button_unchecked'} size={20} filled={done} />
            <span>{done ? 'Concluído' : 'Marcar como concluído'}</span>
            <small>{friendlyDate(day, today)}</small>
          </button>
          {google && source.url ? (
            <a className={styles.actionRow} href={String(source.url)} target="_blank" rel="noreferrer">
              <Icon name="open_in_new" size={20} filled={false} /><span>Abrir no Google Agenda</span>
            </a>
          ) : null}
        </div>

        <Attachments files={draft.anexos} onChange={anexos => update({ anexos }, true)} />
        {message ? <p className={styles.error}>{message}</p> : null}
      </div>
      <Footer status={busy ? 'Salvando no Google…' : google ? (dirty ? <><Icon name="cloud_upload" size={15} />Será salvo no Google ao fechar</> : <><Icon name="cloud_done" size={15} className={styles.okIcon} />Sincronizado com o Google</>) : savedStatus} onDelete={() => void remove()} />
    </>
  )
}

/* ----------------------------------------------------------------- Hábito */

function HabitDetail({ item, state, today, commit, register, close }: DetailProps) {
  const habit = rows(state.habits).find(row => String(row.id) === item.sourceId) || item.raw
  const day = item.date && item.date <= today ? item.date : today
  const save = useCallback((draft: Row) => {
    commit(current => ({ ...current, habits: rows(current.habits).map(row => String(row.id) === item.sourceId ? { ...row, ...draft, nome: String(draft.nome || '').trim() || 'Hábito', meta: Math.max(1, Number(draft.meta || 1)) } : row) }))
  }, [commit, item.sourceId])
  const { draft, update } = useAutosave({ nome: String(habit.nome || ''), descricao: String(habit.descricao || ''), meta: Number(habit.meta || 1), unidade: String(habit.unidade || '') }, save, register)

  const target = Math.max(1, Number(draft.meta || 1))
  const quantitative = target > 1 || Boolean(draft.unidade)
  const entries = rows(state.habitEntries).filter(entry => String(entry.habito_id) === item.sourceId)
  const entryOn = (key: string) => entries.find(entry => dateKey(entry.data) === key)
  const entry = entryOn(day)
  const failed = failedEntry(entry)
  const value = failed ? 0 : Number(entry?.valor || 0)
  const done = !failed && value >= target

  function setEntry(next: { valor: number; falhou: boolean } | null) {
    commit(current => {
      const all = rows(current.habitEntries)
      const existing = all.find(row => String(row.habito_id) === item.sourceId && dateKey(row.data) === day)
      const others = all.filter(row => !(String(row.habito_id) === item.sourceId && dateKey(row.data) === day))
      if (!next) return { ...current, habitEntries: others }
      return { ...current, habitEntries: [...others, { id: existing?.id || uid('hr'), habito_id: item.sourceId, data: day, valor: next.valor, falhou: next.falhou, status: next.falhou ? 'falha' : '', criado_em: existing?.criado_em || new Date().toISOString() }] }
    })
  }

  const week = Array.from({ length: 7 }, (_, index) => addDays(day, index - 6)).map(key => {
    const row = entryOn(key)
    const state = failedEntry(row) ? 'fail' : Number(row?.valor || 0) >= target ? 'done' : Number(row?.valor || 0) > 0 ? 'part' : 'none'
    return { key, state, letter: new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'narrow' }).toUpperCase() }
  })

  function remove() {
    if (!confirm(`Arquivar o hábito "${draft.nome || 'hábito'}"?`)) return
    commit(current => ({ ...current, habits: rows(current.habits).map(row => String(row.id) === item.sourceId ? { ...row, ativo: false } : row) }))
    void close()
  }

  return (
    <>
      <Header kind="habit" onClose={() => void close()} crumbs={<span className={styles.crumb}><i>·</i>{friendlyDate(day, today)}</span>} />
      <div className={styles.scroll}>
        <div className={styles.titleRow}>
          <span className={styles.tile} data-tone={done ? 'success' : failed ? 'danger' : undefined}><Icon name={done ? 'check' : failed ? 'close' : resolveMaiIcon(String(habit.icone || 'repeat'))} size={18} /></span>
          <div className={styles.titleBody}>
            <GrowText className={styles.title} value={draft.nome} placeholder="Nome do hábito" multiline={false} onChange={nome => update({ nome })} />
            <GrowText className={styles.description} value={draft.descricao} placeholder="Adicionar descrição" onChange={descricao => update({ descricao })} />
          </div>
        </div>

        <div className={styles.habitCard}>
          <div className={styles.habitStatus}>
            <span>{failed ? 'Não feito' : done ? 'Feito' : quantitative ? `${value} de ${target}${draft.unidade ? ` ${draft.unidade}` : ''}` : 'Pendente'}</span>
            {quantitative && !failed ? <div className={styles.bar}><span style={{ width: `${Math.min(100, (value / target) * 100)}%` }} /></div> : null}
          </div>
          <div className={styles.habitButtons}>
            {quantitative ? <>
              <button type="button" className={styles.stepper} onClick={() => setEntry(value > 1 ? { valor: value - 1, falhou: false } : null)} aria-label="Menos 1" disabled={value <= 0}><Icon name="remove" size={18} filled={false} /></button>
              <button type="button" className={styles.stepper} onClick={() => setEntry({ valor: value + 1, falhou: false })} aria-label="Mais 1"><Icon name="add" size={18} filled={false} /></button>
            </> : null}
            <button type="button" className={styles.pill} data-active={done || undefined} data-tone="success" onClick={() => setEntry(done ? null : { valor: target, falhou: false })}><Icon name="check" size={17} />{done ? 'Feito' : 'Concluir'}</button>
            <button type="button" className={styles.pill} data-active={failed || undefined} data-tone="danger" onClick={() => setEntry(failed ? null : { valor: 0, falhou: true })}><Icon name="close" size={17} />Falhou</button>
          </div>
        </div>

        <div className={styles.week}>
          {week.map(dayInfo => <span key={dayInfo.key} className={styles.weekDay} data-state={dayInfo.state} data-today={dayInfo.key === day || undefined}><small>{dayInfo.letter}</small><i /></span>)}
        </div>

        <div className={styles.props}>
          <Prop icon="target" color="var(--ds-accent)" label="Meta por dia" display={<input className={styles.inlineInput} type="number" inputMode="numeric" min={1} value={draft.meta} onChange={event => update({ meta: Math.max(1, Number(event.target.value || 1)) })} aria-label="Meta por dia" />} />
          <Prop icon="straighten" color="var(--ds-text-2)" label="Unidade" display={<input className={styles.inlineInput} value={draft.unidade} placeholder="vezes" onChange={event => update({ unidade: event.target.value })} aria-label="Unidade" />} />
        </div>
      </div>
      <Footer status={savedStatus} onDelete={remove} deleteLabel="Arquivar" />
    </>
  )
}

/* --------------------------------------------------------------- Finanças */

function FinanceDetail({ item, state, today, commit, register, close }: DetailProps) {
  const finance = state.finance || ({} as Row)
  const tx = rows(finance.transactions).find(row => String(row.id) === item.sourceId) || item.raw
  const titleField = tx.titulo ? 'titulo' : tx.descricao ? 'descricao' : 'titulo'
  const save = useCallback((draft: Row) => {
    commit(current => ({ ...current, finance: { ...current.finance, transactions: rows(current.finance.transactions).map(row => String(row.id) === item.sourceId ? { ...row, ...draft, valor: Math.max(0, Number(draft.valor || 0)) } : row) } }))
  }, [commit, item.sourceId])
  const { draft, update } = useAutosave({
    [titleField]: String(tx[titleField] || ''),
    observacao: String(tx.observacao || ''),
    data: dateKey(tx.data),
    valor: Number(tx.valor || 0),
    tipo: String(tx.tipo || 'despesa').toLocaleLowerCase('pt-BR') === 'receita' ? 'receita' : 'despesa',
    categoria: String(tx.categoria || ''),
    conta_id: String(tx.conta_id || ''),
    anexos: rows(tx.anexos),
  }, save, register)

  const payment = financeCardPaymentState({ ...tx, valor: draft.valor })
  const income = draft.tipo === 'receita'
  const paid = payment.status === 'pago'
  const late = !paid && draft.data && draft.data < today

  function togglePaid() {
    commit(current => ({
      ...current,
      finance: {
        ...current.finance,
        transactions: rows(current.finance.transactions).map(row => {
          if (String(row.id) !== item.sourceId) return row
          const state = financeCardPaymentState(row)
          if (state.status === 'pago') return { ...row, status: 'pendente', valor_pago: 0, pagamentos: [] }
          if (state.total <= 0) return row
          const pagamentos = state.remaining > 0 ? [...rows(row.pagamentos), { id: uid('pay'), data: today, valor: state.remaining }] : rows(row.pagamentos)
          return { ...row, status: 'pago', valor_pago: state.total, pagamentos }
        }),
      },
    }))
  }

  function remove() {
    if (!confirm('Excluir este lançamento?')) return
    commit(current => ({ ...current, finance: { ...current.finance, transactions: rows(current.finance.transactions).filter(row => String(row.id) !== item.sourceId) } }))
    void close()
  }

  const categories = rows(finance.categories)
  const accounts = rows(finance.accounts)
  const cards = rows(finance.cards)
  const accountOptions = [{ value: '', label: 'Sem conta' }, ...accounts.map(row => ({ value: String(row.id), label: String(row.nome || 'Conta') })), ...cards.map(row => ({ value: `card|${String(row.id)}`, label: `${String(row.nome || 'Cartão')} (cartão)` }))]
  if (draft.conta_id && !accountOptions.some(option => option.value === draft.conta_id)) accountOptions.push({ value: draft.conta_id, label: 'Conta atual' })
  const categoryOptions = [{ value: '', label: 'Sem categoria' }, ...categories.map(row => ({ value: String(row.nome), label: String(row.nome) }))]
  if (draft.categoria && !categoryOptions.some(option => option.value === draft.categoria)) categoryOptions.push({ value: draft.categoria, label: draft.categoria })

  return (
    <>
      <Header kind="finance" onClose={() => void close()} crumbs={<span className={styles.crumb}><i>·</i>{income ? 'A receber' : 'A pagar'}</span>} />
      <div className={styles.scroll}>
        <div className={styles.titleRow}>
          <Round checked={paid} late={Boolean(late)} tone="success" onToggle={togglePaid} label={paid ? 'Marcar como pendente' : income ? 'Marcar como recebido' : 'Marcar como pago'} />
          <div className={styles.titleBody}>
            <GrowText className={`${styles.title} ${paid ? styles.titleDone : ''}`} value={draft[titleField]} placeholder="Nome do lançamento" multiline={false} onChange={value => update({ [titleField]: value })} />
            <GrowText className={styles.description} value={draft.observacao} placeholder="Adicionar observação" onChange={observacao => update({ observacao })} />
          </div>
        </div>

        <div className={styles.moneyCard}>
          <div>
            <small>{payment.status === 'parcial' ? `Falta ${money.format(payment.remaining)}` : 'Valor'}</small>
            <label className={styles.moneyValue} data-income={income || undefined}>
              <span>{income ? '+' : '-'}R$</span>
              <input type="number" inputMode="decimal" step="0.01" min={0} value={draft.valor} onChange={event => update({ valor: Number(event.target.value || 0) })} aria-label="Valor" />
            </label>
          </div>
          <button type="button" className={styles.payButton} data-paid={paid || undefined} onClick={togglePaid}>
            <Icon name={paid ? 'undo' : 'check'} size={18} />{paid ? 'Desfazer' : income ? 'Recebido' : 'Pagar'}
          </button>
        </div>

        <div className={styles.props}>
          <PickerProp type="date" icon="calendar_today" color="var(--ds-accent)" label="Vencimento" value={draft.data} display={<span className={late ? styles.late : undefined}>{friendlyDate(draft.data, today)}</span>} onChange={data => data && update({ data, dia_mes: Number(data.slice(8)) }, true)} />
          <SelectProp icon={income ? 'south_west' : 'north_east'} color={income ? 'var(--ds-success)' : 'var(--ds-danger)'} label="Tipo" value={draft.tipo} onChange={tipo => update({ tipo }, true)} options={[{ value: 'despesa', label: 'Despesa' }, { value: 'receita', label: 'Receita' }]} />
          <SelectProp icon="sell" color="var(--ds-peach-fg)" label="Categoria" value={draft.categoria} onChange={categoria => update({ categoria }, true)} options={categoryOptions} />
          <SelectProp icon="account_balance" color="var(--ds-text-2)" label={income ? 'Receber em' : 'Pagar com'} value={draft.conta_id} onChange={conta_id => update({ conta_id }, true)} options={accountOptions} />
        </div>

        <Attachments files={draft.anexos} onChange={anexos => update({ anexos }, true)} />
      </div>
      <Footer status={savedStatus} onDelete={remove} />
    </>
  )
}

/* ------------------------------------------------------------------- Meta */

function GoalDetail({ item, state, today, commit, register, close }: DetailProps) {
  const goal = rows(state.goals).find(row => String(row.id) === item.sourceId) || item.raw
  const save = useCallback((draft: Row) => {
    commit(current => ({ ...current, goals: rows(current.goals).map(row => String(row.id) === item.sourceId ? { ...row, ...draft, progresso_atual: Math.max(0, Number(draft.progresso_atual || 0)), progresso_total: Math.max(1, Number(draft.progresso_total || 100)) } : row) }))
  }, [commit, item.sourceId])
  const { draft, update } = useAutosave({
    titulo: String(goal.titulo || ''),
    descricao: String(goal.descricao || ''),
    prazo: dateKey(goal.prazo || goal.data || goal.data_limite || goal.deadline),
    progresso_atual: Number(goal.progresso_atual || 0),
    progresso_total: Math.max(1, Number(goal.progresso_total || 100)),
  }, save, register)
  const pct = Math.max(0, Math.min(100, Math.round((Number(draft.progresso_atual) / Math.max(1, Number(draft.progresso_total))) * 100)))
  const step = (amount: number) => update({ progresso_atual: Math.max(0, Math.min(Number(draft.progresso_total), Number(draft.progresso_atual) + amount)) }, true)

  function remove() {
    if (!confirm(`Excluir a meta "${draft.titulo || 'meta'}"?`)) return
    commit(current => ({ ...current, goals: rows(current.goals).filter(row => String(row.id) !== item.sourceId) }))
    void close()
  }

  return (
    <>
      <Header kind="goal" onClose={() => void close()} />
      <div className={styles.scroll}>
        <div className={styles.titleRow}>
          <span className={styles.tile} data-tone="lilac"><Icon name="flag" size={17} /></span>
          <div className={styles.titleBody}>
            <GrowText className={styles.title} value={draft.titulo} placeholder="Nome da meta" multiline={false} onChange={titulo => update({ titulo })} />
            <GrowText className={styles.description} value={draft.descricao} placeholder="Adicionar descrição" onChange={descricao => update({ descricao })} />
          </div>
        </div>

        <div className={styles.habitCard}>
          <div className={styles.habitStatus}>
            <span>{pct}% · {draft.progresso_atual} de {draft.progresso_total}</span>
            <div className={styles.bar} data-tone="lilac"><span style={{ width: `${pct}%` }} /></div>
          </div>
          <div className={styles.habitButtons}>
            <button type="button" className={styles.stepper} onClick={() => step(-1)} aria-label="Menos 1"><Icon name="remove" size={18} filled={false} /></button>
            <button type="button" className={styles.stepper} onClick={() => step(1)} aria-label="Mais 1"><Icon name="add" size={18} filled={false} /></button>
          </div>
        </div>

        <div className={styles.props}>
          <PickerProp type="date" icon="event" color="var(--ds-accent)" label="Prazo" value={draft.prazo} display={friendlyDate(draft.prazo, today)} onChange={prazo => update({ prazo }, true)} />
          <Prop icon="trending_up" color="var(--ds-lilac-fg)" label="Progresso atual" display={<input className={styles.inlineInput} type="number" inputMode="decimal" min={0} value={draft.progresso_atual} onChange={event => update({ progresso_atual: Number(event.target.value || 0) })} aria-label="Progresso atual" />} />
          <Prop icon="flag" color="var(--ds-lilac-fg)" label="Total" display={<input className={styles.inlineInput} type="number" inputMode="decimal" min={1} value={draft.progresso_total} onChange={event => update({ progresso_total: Math.max(1, Number(event.target.value || 1)) })} aria-label="Total" />} />
        </div>
      </div>
      <Footer status={savedStatus} onDelete={remove} />
    </>
  )
}

/* ------------------------------------------------------------------- Nota */

function NoteDetail({ item, state, today, commit, register, close }: DetailProps) {
  const note = rows(state.notes).find(row => String(row.id) === item.sourceId) || item.raw
  const save = useCallback((draft: Row) => {
    commit(current => ({ ...current, notes: rows(current.notes).map(row => String(row.id) === item.sourceId ? { ...row, ...draft, updated_at: new Date().toISOString() } : row) }))
  }, [commit, item.sourceId])
  const { draft, update } = useAutosave({ titulo: String(note.titulo || ''), conteudo: String(note.conteudo || '') }, save, register, 500)
  const editor = useRef<HTMLDivElement | null>(null)
  useEffect(() => { if (editor.current) editor.current.innerHTML = String(note.conteudo || '') }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function remove() {
    if (!confirm(`Excluir a nota "${draft.titulo || 'sem título'}"?`)) return
    commit(current => ({ ...current, notes: rows(current.notes).map(row => String(row.id) === item.sourceId ? { ...row, ativo: false } : row) }))
    void close()
  }

  const updated = dateKey(note.updated_at || note.data || note.criado_em)

  return (
    <>
      <Header kind="note" onClose={() => void close()} crumbs={updated ? <span className={styles.crumb}><i>·</i>{friendlyDate(updated, today)}</span> : null} />
      <div className={styles.scroll}>
        <GrowText className={styles.title} value={draft.titulo} placeholder="Título" multiline={false} onChange={titulo => update({ titulo })} />
        <div
          ref={editor}
          className={styles.noteBody}
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Escreva aqui…"
          onInput={event => update({ conteudo: event.currentTarget.innerHTML })}
        />
      </div>
      <Footer status={savedStatus} onDelete={remove} />
    </>
  )
}

function Missing({ kind, onClose }: { kind: string; onClose: () => Promise<void> }) {
  return (
    <>
      <Header kind={kind} onClose={() => void onClose()} />
      <div className={styles.scroll}><p className={styles.empty}>Este item não existe mais.</p></div>
    </>
  )
}
