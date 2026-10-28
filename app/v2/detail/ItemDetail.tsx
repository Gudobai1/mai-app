'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
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
import { askConfirm, notify } from '../shell/ConfirmDialog'
import { DatePicker, Floating, OptionList, TimePicker, type PickerOption } from './Pickers'
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
  { value: '1', label: 'Alta', icon: 'flag', color: 'var(--ds-rose-fg)' },
  { value: '2', label: 'Média', icon: 'flag', color: 'var(--ds-peach-fg)' },
  { value: '3', label: 'Baixa', icon: 'flag', color: 'var(--ds-sky-fg)' },
  { value: '4', label: 'Sem prioridade', icon: 'outlined_flag', color: 'var(--ds-muted)' },
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

type Option = PickerOption

/**
 * Propriedade: no computador é um botãozinho; no celular, uma linha com
 * rótulo e valor. Ao tocar, abre o seletor do próprio MAI.
 */
function Prop({ icon, color, label, display, muted, onOpen, buttonRef, open }: { icon: ReactNode; color?: string; label: string; display: ReactNode; muted?: boolean; onOpen?: () => void; buttonRef?: RefObject<HTMLButtonElement | null>; open?: boolean }) {
  const content = <>
    <span className={styles.propIcon}>{typeof icon === 'string' ? <Icon name={icon} size={17} /> : icon}</span>
    <span className={styles.propLabel}>{label}</span>
    <span className={styles.propValue}>{display}</span>
    {onOpen ? <Icon name="expand_more" size={18} filled={false} className={styles.propChevron} /> : null}
  </>
  const style = color ? ({ '--prop-color': color } as CSSProperties) : undefined
  if (!onOpen) return <div className={styles.prop} data-muted={muted || undefined} style={style}>{content}</div>
  return (
    <button ref={buttonRef} type="button" className={`${styles.prop} ${styles.propButton}`} data-muted={muted || undefined} data-open={open || undefined} style={style} onClick={onOpen} aria-haspopup="dialog" aria-expanded={open}>
      {content}
    </button>
  )
}

function SelectProp({ icon, color, label, value, options, onChange, display }: { icon: ReactNode; color?: string; label: string; value: string; options: Option[]; onChange: (value: string) => void; display?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement | null>(null)
  const current = options.find(option => option.value === value)
  return (
    <>
      <Prop icon={icon} color={color} label={label} display={display ?? current?.label ?? '—'} onOpen={() => setOpen(true)} buttonRef={anchor} open={open} />
      {open ? (
        <Floating anchor={anchor} title={label} onClose={() => setOpen(false)}>
          <OptionList options={options} value={value} onSelect={next => { setOpen(false); if (next !== value) onChange(next) }} />
        </Floating>
      ) : null}
    </>
  )
}

function PickerProp({ type, icon, color, label, value, display, onChange, muted, today = '', allowEmpty = true, emptyLabel }: { type: 'date' | 'time'; icon: string; color?: string; label: string; value: string; display: ReactNode; onChange: (value: string) => void; muted?: boolean; today?: string; allowEmpty?: boolean; emptyLabel?: string }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement | null>(null)
  const pick = (next: string) => { setOpen(false); if (next !== value) onChange(next) }
  return (
    <>
      <Prop icon={icon} color={color} label={label} display={display} muted={muted} onOpen={() => setOpen(true)} buttonRef={anchor} open={open} />
      {open ? (
        <Floating anchor={anchor} title={label} onClose={() => setOpen(false)} width={type === 'date' ? 300 : 260}>
          {type === 'date'
            ? <DatePicker value={value} today={today} onSelect={pick} allowEmpty={allowEmpty} />
            : <TimePicker value={value} onSelect={pick} allowEmpty={allowEmpty} emptyLabel={emptyLabel} />}
        </Floating>
      ) : null}
    </>
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
  const [composing, setComposing] = useState(false)
  const sortedChildren = [...children].sort((a, b) => Number(Boolean(a.concluida)) - Number(Boolean(b.concluida)) || Number(a.ordem || 0) - Number(b.ordem || 0))

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

  async function remove() {
    if (!(await askConfirm({ title: 'Excluir tarefa?', message: `“${draft.titulo || 'Tarefa'}” será excluída${children.length ? ' e as subtarefas sobem um nível' : ''}. Não dá para desfazer.` }))) return
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
          <PickerProp today={today} type="date" icon="calendar_today" color="var(--ds-accent)" label="Data" value={draft._data} display={<span className={late ? styles.late : undefined}>{friendlyDate(draft._data, today)}</span>} onChange={_data => update({ _data, _hora: _data ? draft._hora : '' }, true)} />
          {draft._data ? <PickerProp type="time" icon="schedule" color="var(--ds-lilac-fg)" label="Horário" value={draft._hora} display={draft._hora || 'Sem horário'} muted={!draft._hora} onChange={_hora => update({ _hora }, true)} /> : null}
          <SelectProp icon={projectIcon} label="Projeto" value={draft.projeto_id} onChange={projeto_id => update({ projeto_id, secao: '' }, true)} options={[{ value: 'entrada', label: 'Entrada', icon: 'inbox' }, ...projects.map(row => ({ value: String(row.id), label: String(row.nome || 'Projeto'), image: row.imagem_url ? driveAssetUrl(row.imagem_url) : undefined, color: String(row.cor || 'var(--ds-line-strong)') }))]} />
          {sections.length ? <SelectProp icon="view_agenda" color="var(--ds-text-2)" label="Seção" value={draft.secao} onChange={secao => update({ secao }, true)} options={[{ value: '', label: 'Sem seção' }, ...sections.map(name => ({ value: name, label: name }))]} /> : null}
          <SelectProp icon="flag" color={priority.color} label="Prioridade" value={String(draft.prioridade)} onChange={value => update({ prioridade: Number(value) }, true)} options={PRIORITIES} />
          <SelectProp icon="repeat" color="var(--ds-mint-fg)" label="Repetir" value={draft.repeticao} onChange={repeticao => update({ repeticao }, true)} options={REPEATS.some(option => option.value === draft.repeticao) ? REPEATS : [...REPEATS, { value: draft.repeticao, label: 'Personalizado' }]} />
        </div>

        <section className={styles.section}>
          <div className={styles.sectionHead}><h3>Subtarefas</h3>{children.length ? <span>{doneChildren} de {children.length}</span> : null}</div>
          {children.length ? <div className={styles.bar}><span style={{ width: `${(doneChildren / children.length) * 100}%` }} /></div> : null}
          <div className={styles.list}>
            {sortedChildren.map(child => <SubtaskCard key={String(child.id)} task={child} state={state} today={today} commit={commit} onToggle={() => toggle(String(child.id))} onOpen={() => openTask(String(child.id))} />)}
            {composing ? (
              <div className={styles.composer}>
                <input
                  autoFocus
                  value={subtask}
                  placeholder="Nome da subtarefa"
                  enterKeyHint="send"
                  onChange={event => setSubtask(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') { event.preventDefault(); addSubtask() }
                    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setComposing(false); setSubtask('') }
                  }}
                />
                <div className={styles.composerActions}>
                  <span className={styles.composerHint}>Enter adiciona e continua</span>
                  <button type="button" className={styles.composerCancel} onClick={() => { setComposing(false); setSubtask('') }}>Cancelar</button>
                  <button type="button" className={styles.composerAdd} disabled={!subtask.trim()} onClick={addSubtask}>Adicionar</button>
                </div>
              </div>
            ) : (
              <button type="button" className={styles.addButton} onClick={() => setComposing(true)}>
                <span className={styles.addIcon}><Icon name="add" size={18} /></span>
                Adicionar subtarefa
              </button>
            )}
          </div>
        </section>

        <Attachments files={draft.anexos} onChange={anexos => update({ anexos }, true)} />
      </div>
      <Footer status={savedStatus} onDelete={() => void remove()} />
    </>
  )
}

/** Cartão de subtarefa: sempre mostra o contexto e deixa mudar data e prioridade ali mesmo. */
function SubtaskCard({ task, state, today, commit, onToggle, onOpen }: { task: Row; state: MaiState; today: string; commit: Commit; onToggle: () => void; onOpen: () => void }) {
  const id = String(task.id)
  const [picker, setPicker] = useState<'' | 'date' | 'priority'>('')
  const dateRef = useRef<HTMLButtonElement | null>(null)
  const priorityRef = useRef<HTMLButtonElement | null>(null)
  const due = dateKey(task.data_vencimento)
  const time = timeKey(task.data_vencimento)
  const done = Boolean(task.concluida)
  const late = Boolean(due) && due < today && !done
  const priority = PRIORITIES.find(option => Number(option.value) === Number(task.prioridade || 4)) || PRIORITIES[3]
  const children = state.tasks.filter(row => String(row.parent_id || '') === id) as Row[]
  const files = rows(task.anexos).length
  const desc = String(task.descricao || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
  const doneAt = dateKey(task.concluida_em)
  const patch = (values: Row) => commit(current => ({ ...current, tasks: current.tasks.map(row => String(row.id) === id ? { ...row, ...values } : row) }))

  return (
    <div className={styles.subCard} data-done={done || undefined}>
      <Round checked={done} late={late} onToggle={onToggle} label={`${done ? 'Reabrir' : 'Concluir'} ${String(task.titulo || 'subtarefa')}`} />
      <div className={styles.subBody}>
        <button type="button" className={styles.subMain} onClick={onOpen}>
          <span className={styles.subTitle}>{String(task.titulo || 'Subtarefa')}</span>
          {desc ? <span className={styles.subDesc}>{desc}</span> : null}
        </button>
        <div className={styles.subMeta}>
          {done ? (
            <span className={styles.subInfo}><Icon name="task_alt" size={14} />{doneAt ? `Concluída ${friendlyDate(doneAt, today).toLocaleLowerCase('pt-BR')}` : 'Concluída'}</span>
          ) : (
            <>
              <button ref={dateRef} type="button" className={styles.subChip} data-empty={!due || undefined} data-late={late || undefined} onClick={() => setPicker('date')}>
                <Icon name="calendar_today" size={14} />{due ? `${friendlyDate(due, today)}${time ? ` · ${time}` : ''}` : 'Sem data'}
              </button>
              <button ref={priorityRef} type="button" className={styles.subChip} data-empty={Number(priority.value) === 4 || undefined} onClick={() => setPicker('priority')}>
                <Icon name={priority.icon} size={14} style={{ color: priority.color }} />{Number(priority.value) === 4 ? 'Prioridade' : priority.label}
              </button>
            </>
          )}
          {task.repeticao ? <span className={styles.subInfo}><Icon name="repeat" size={14} />{(REPEATS.find(option => option.value === task.repeticao) || { label: 'Repete' }).label}</span> : null}
          {children.length ? <span className={styles.subInfo}><Icon name="account_tree" size={14} />{children.filter(row => row.concluida).length}/{children.length}</span> : null}
          {files ? <span className={styles.subInfo}><Icon name="attach_file" size={14} />{files}</span> : null}
        </div>
      </div>
      <button type="button" className={styles.subOpen} onClick={onOpen} aria-label={`Abrir ${String(task.titulo || 'subtarefa')}`}><Icon name="chevron_right" size={20} filled={false} /></button>
      {picker === 'date' ? (
        <Floating anchor={dateRef} title="Data da subtarefa" width={300} onClose={() => setPicker('')}>
          <DatePicker value={due} today={today} onSelect={value => { setPicker(''); patch({ data_vencimento: value ? `${value}${time ? `T${time}` : ''}` : '' }) }} />
        </Floating>
      ) : null}
      {picker === 'priority' ? (
        <Floating anchor={priorityRef} title="Prioridade" onClose={() => setPicker('')}>
          <OptionList options={PRIORITIES} value={priority.value} onSelect={value => { setPicker(''); patch({ prioridade: Number(value) }) }} />
        </Floating>
      ) : null}
    </div>
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
      await notify('Não foi possível salvar no Google Agenda', error?.message || 'Tente de novo em instantes.')
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
    if (!(await askConfirm({ title: 'Excluir compromisso?', message: `“${draft.titulo || 'Compromisso'}” será excluído${google ? ' também do Google Agenda' : ''}. Não dá para desfazer.` }))) return
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
          <PickerProp today={today} type="date" icon="calendar_today" color="var(--ds-accent)" label="Data" allowEmpty={false} value={draft.data_inicio} display={friendlyDate(draft.data_inicio, today)} onChange={data_inicio => data_inicio && update({ data_inicio }, true)} />
          <SelectProp icon="wb_sunny" color="var(--ds-peach-fg)" label="Dia todo" value={draft.dia_inteiro ? 'sim' : 'nao'} onChange={value => update({ dia_inteiro: value === 'sim' }, true)} options={[{ value: 'nao', label: 'Com horário' }, { value: 'sim', label: 'Dia todo' }]} display={draft.dia_inteiro ? 'Dia todo' : 'Com horário'} />
          {!draft.dia_inteiro ? <PickerProp type="time" icon="schedule" color="var(--ds-lilac-fg)" label="Início" allowEmpty={false} value={draft.hora_inicio} display={draft.hora_inicio || '--:--'} onChange={hora_inicio => update({ hora_inicio }, true)} /> : null}
          {!draft.dia_inteiro ? <PickerProp type="time" icon="schedule" color="var(--ds-lilac-fg)" label="Fim" emptyLabel="Sem horário de fim" value={draft.hora_fim} display={draft.hora_fim || 'Sem fim'} muted={!draft.hora_fim} onChange={hora_fim => update({ hora_fim }, true)} /> : null}
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

  async function remove() {
    if (!(await askConfirm({ title: 'Arquivar hábito?', message: `“${draft.nome || 'Hábito'}” sai da sua rotina. O histórico fica guardado.`, confirmLabel: 'Arquivar', icon: 'archive' }))) return
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
      <Footer status={savedStatus} onDelete={() => void remove()} deleteLabel="Arquivar" />
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

  async function remove() {
    if (!(await askConfirm({ title: 'Excluir lançamento?', message: `“${String(draft[titleField] || 'Lançamento')}” será excluído. Não dá para desfazer.` }))) return
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
          <PickerProp today={today} type="date" icon="calendar_today" color="var(--ds-accent)" label="Vencimento" allowEmpty={false} value={draft.data} display={<span className={late ? styles.late : undefined}>{friendlyDate(draft.data, today)}</span>} onChange={data => data && update({ data, dia_mes: Number(data.slice(8)) }, true)} />
          <SelectProp icon={income ? 'south_west' : 'north_east'} color={income ? 'var(--ds-success)' : 'var(--ds-danger)'} label="Tipo" value={draft.tipo} onChange={tipo => update({ tipo }, true)} options={[{ value: 'despesa', label: 'Despesa' }, { value: 'receita', label: 'Receita' }]} />
          <SelectProp icon="sell" color="var(--ds-peach-fg)" label="Categoria" value={draft.categoria} onChange={categoria => update({ categoria }, true)} options={categoryOptions} />
          <SelectProp icon="account_balance" color="var(--ds-text-2)" label={income ? 'Receber em' : 'Pagar com'} value={draft.conta_id} onChange={conta_id => update({ conta_id }, true)} options={accountOptions} />
        </div>

        <Attachments files={draft.anexos} onChange={anexos => update({ anexos }, true)} />
      </div>
      <Footer status={savedStatus} onDelete={() => void remove()} />
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

  async function remove() {
    if (!(await askConfirm({ title: 'Excluir meta?', message: `“${draft.titulo || 'Meta'}” será excluída. Não dá para desfazer.` }))) return
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
          <PickerProp today={today} type="date" icon="event" color="var(--ds-accent)" label="Prazo" value={draft.prazo} display={friendlyDate(draft.prazo, today)} onChange={prazo => update({ prazo }, true)} />
          <Prop icon="trending_up" color="var(--ds-lilac-fg)" label="Progresso atual" display={<input className={styles.inlineInput} type="number" inputMode="decimal" min={0} value={draft.progresso_atual} onChange={event => update({ progresso_atual: Number(event.target.value || 0) })} aria-label="Progresso atual" />} />
          <Prop icon="flag" color="var(--ds-lilac-fg)" label="Total" display={<input className={styles.inlineInput} type="number" inputMode="decimal" min={1} value={draft.progresso_total} onChange={event => update({ progresso_total: Math.max(1, Number(event.target.value || 1)) })} aria-label="Total" />} />
        </div>
      </div>
      <Footer status={savedStatus} onDelete={() => void remove()} />
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

  async function remove() {
    if (!(await askConfirm({ title: 'Excluir nota?', message: `“${draft.titulo || 'Sem título'}” será excluída.` }))) return
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
      <Footer status={savedStatus} onDelete={() => void remove()} />
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
