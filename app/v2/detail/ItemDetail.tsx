'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { MoneyInput } from '../MoneyInput'
import { createPortal } from 'react-dom'
import { addDays, habitOccursOn, habitStreak } from '../../../lib/v2/planner'
import type { MaiState } from '../../../lib/v2/state'
import { Icon } from '../../ds'
import type { InspectableItem } from '../ContextDrawer'
import { driveAssetUrl, googleDriveRpc } from '../DriveAsset'
import { FilePreviewOverlay } from '../FilePreviewOverlay'
import { FinanceContextDrawerV4 } from '../FinanceContextDrawerV4'
import { financeCardPaymentState } from '../FinanceTransactionCard'
import { resolveMaiIcon } from '../MaiIcons'
import { askChoice, askConfirm, notify } from '../shell/ConfirmDialog'
import { askUnsaved } from '../shell/unsaved'
import { useQuickMenu } from '../shell/QuickMenu'
import { compareSubtasks } from '../subtaskOrder'
import { QuickAdd } from '../shell/QuickAdd'
import { useTaskQuick } from '../shell/TaskQuick'
import { uploadAttachment } from './upload'
import { CommentsSection, type Comment } from './Comments'
import { UnitField } from '../habits/UnitField'
import { FrequencyEditor, cleanHabit } from '../habits/HabitsModern'
import { ColorField } from './ColorField'
import { DatePicker, Floating, OptionList, ProjectPicker, ReminderPicker, RepeatPicker, TimePicker, repeatLabel, reminderLabel, type PickerOption } from './Pickers'
import { CategoryChooser } from './CategoryChooser'
import { CategoryManager } from './CategoryManager'
import { eventCategories, withEventCategory, type EventCategory } from '../../../lib/v2/event-categories'
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

type DetailCtxValue = { dirty: boolean; setDirty: (key: string, value: boolean) => void; requestClose: () => void; saveAndClose: () => void; saving: boolean }
const DetailCtx = createContext<DetailCtxValue>({ dirty: false, setDirty: () => {}, requestClose: () => {}, saveAndClose: () => {}, saving: false })

/** Como uma propriedade aparece: botão (padrão), linha da coluna lateral ou só o ícone (celular). */
type PropVariant = 'chip' | 'row' | 'icon'
const PropVariantCtx = createContext<PropVariant>('chip')

function useIsPhone() {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)')
    const onChange = () => setPhone(query.matches)
    onChange()
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return phone
}

function DetailShell(props: Props & { item: InspectableItem }) {
  const { item, onClose } = props
  const flushers = useRef(new Set<() => void | Promise<void>>())
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const dirtyRef = useRef(false)
  dirtyRef.current = dirtyKeys.size > 0

  const setDirty = useCallback((key: string, value: boolean) => {
    setDirtyKeys(current => {
      if (current.has(key) === value) return current
      const next = new Set(current)
      if (value) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])

  const saveAndClose = useCallback(async () => {
    if (saving) return
    setSaving(true)
    for (const flush of flushers.current) await flush()
    onClose()
  }, [saving, onClose])

  /** Fechar (X, Esc, Cancelar): avisa se há alterações não salvas. Clicar fora salva sozinho. */
  const requestClose = useCallback(async () => {
    if (saving) return
    if (dirtyRef.current) {
      const answer = await askUnsaved()
      if (answer === 'stay') return
      if (answer === 'save') { await saveAndClose(); return }
    }
    onClose()
  }, [saving, saveAndClose, onClose])

  const close = useCallback(async () => { onClose() }, [onClose])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('[role="alertdialog"]')) void requestClose() }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [requestClose])

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
    <DetailCtx.Provider value={{ dirty: dirtyKeys.size > 0, setDirty, requestClose: () => void requestClose(), saveAndClose: () => void saveAndClose(), saving }}>
    <div className={styles.layer} onClick={event => { if (event.target !== event.currentTarget) return; if (dirtyRef.current) void saveAndClose(); else onClose() }}>
      <section className={styles.panel} data-kind={item.kind} role="dialog" aria-modal="true" aria-label={KIND[item.kind]?.label || 'Detalhes'}>
        <div className={styles.handle} aria-hidden="true" />
        {body}
      </section>
    </div>
    </DetailCtx.Provider>,
    document.body,
  )
}

type DetailProps = Props & { item: InspectableItem; register: (flush: () => void | Promise<void>) => () => void; close: () => Promise<void> }

/* ------------------------------------------------------------ Peças comuns */

/* Janela de item (padrão global): conteúdo à esquerda, propriedades à direita, rodapé com os botões à direita.
 * Todo tipo de item (tarefa, compromisso, hábito, lançamento, meta, nota) monta o corpo por aqui. */
function ItemLayout({ side, children }: { side?: ReactNode; children: ReactNode }) {
  const phone = useIsPhone()
  return (
    <div className={styles.taskMain}>
      <div className={styles.taskContent}>
        {phone && side ? <PropVariantCtx.Provider value="icon"><div className={styles.iconProps}>{side}</div></PropVariantCtx.Provider> : null}
        {children}
      </div>
      {!phone && side ? (
        <PropVariantCtx.Provider value="row">
          <aside className={styles.taskSide} aria-label="Propriedades">{side}</aside>
        </PropVariantCtx.Provider>
      ) : null}
    </div>
  )
}

function Header({ kind, crumbs, hideKind }: { kind: string; crumbs?: ReactNode; onClose?: () => void; hideKind?: boolean }) {
  const { requestClose } = useContext(DetailCtx)
  return (
    <header className={styles.header}>
      <span className={styles.kind}>
        {hideKind ? null : <><Icon name={KIND[kind]?.icon || 'info'} size={15} className={styles.kindIcon} /><span>{KIND[kind]?.label}</span></>}
        {crumbs}
      </span>
      <button type="button" className={styles.iconButton} onClick={requestClose} aria-label="Fechar"><Icon name="close" size={18} filled={false} /></button>
    </header>
  )
}

function Footer({ status, onDelete, deleteLabel = 'Excluir', readOnly }: { status?: ReactNode; onDelete?: () => void; deleteLabel?: string; readOnly?: boolean }) {
  const { dirty, requestClose, saveAndClose, saving } = useContext(DetailCtx)
  if (readOnly) {
    return (
      <footer className={styles.footer}>
        <span className={styles.status}>{status}</span>
        <button type="button" className={styles.footerCancel} onClick={requestClose}>Fechar</button>
      </footer>
    )
  }
  return (
    <footer className={styles.footer}>
      {onDelete ? <button type="button" className={styles.delete} onClick={onDelete} disabled={saving}><Icon name="delete" size={17} filled={false} />{deleteLabel}</button> : null}
      <span className={styles.status}>{status}</span>
      <button type="button" className={styles.footerCancel} onClick={requestClose} disabled={saving}>Cancelar</button>
      <button type="button" className={styles.footerSave} onClick={saveAndClose} disabled={!dirty || saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
    </footer>
  )
}

const savedStatus = null

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

/** Rascunho local: nada é gravado até o botão Salvar (ou "Salvar" no aviso ao fechar). */
function useDraft(initial: Row, save: (draft: Row) => void, register: DetailProps['register'], _delay = 0) {
  void _delay
  const ctx = useContext(DetailCtx)
  const [draft, setDraft] = useState<Row>(initial)
  const initialSnapshot = useRef(JSON.stringify(initial))
  const draftRef = useRef(draft)
  draftRef.current = draft
  const saveRef = useRef(save)
  saveRef.current = save
  const key = useRef(`d-${Math.random().toString(36).slice(2)}`)
  const dirty = JSON.stringify(draft) !== initialSnapshot.current
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  const flush = useCallback(() => {
    if (!dirtyRef.current) return
    saveRef.current(draftRef.current)
    initialSnapshot.current = JSON.stringify(draftRef.current)
  }, [])

  const setShellDirty = ctx.setDirty
  useEffect(() => register(flush), [register, flush])
  useEffect(() => { setShellDirty(key.current, dirty) }, [dirty, setShellDirty])
  useEffect(() => { const id = key.current; return () => setShellDirty(id, false) }, [setShellDirty])

  const update = useCallback((patch: Row, _immediate = false) => {
    void _immediate
    setDraft(current => ({ ...current, ...patch }))
  }, [])

  return { draft, update, setDraft, dirty, save: flush }
}

type Option = PickerOption

/**
 * Propriedade: no computador é um botãozinho; no celular, uma linha com
 * rótulo e valor. Ao tocar, abre o seletor do próprio MAI.
 */
function Prop({ icon, color, label, display, muted, onOpen, buttonRef, open }: { icon: ReactNode; color?: string; label: string; display: ReactNode; muted?: boolean; onOpen?: () => void; buttonRef?: RefObject<HTMLButtonElement | null>; open?: boolean }) {
  const variant = useContext(PropVariantCtx)
  const iconNode = typeof icon === 'string' ? <Icon name={icon} size={variant === 'icon' ? 20 : 17} /> : icon
  const style = color ? ({ '--prop-color': color } as CSSProperties) : undefined
  if (variant === 'icon') {
    const text = typeof display === 'string' ? display : ''
    return (
      <button ref={buttonRef} type="button" className={styles.iconProp} data-text={(!muted && text) || undefined} data-muted={muted || undefined} data-open={open || undefined} style={style} onClick={onOpen} aria-haspopup="dialog" aria-expanded={open} aria-label={text ? `${label}: ${text}` : label} title={text ? `${label}: ${text}` : label}>
        <span className={styles.iconProp_icon}>{iconNode}</span>
        {!muted && text ? <span className={styles.iconProp_text}>{text}</span> : null}
      </button>
    )
  }
  if (variant === 'row') {
    const inner = <>
      <span className={styles.sideLabel}>{label}</span>
      <span className={styles.sideValue} data-muted={muted || undefined} style={style}><span className={styles.sideIcon}>{iconNode}</span><span className={styles.sideText}>{display}</span></span>
    </>
    if (!onOpen) return <div className={styles.sideRow}>{inner}</div>
    return <button ref={buttonRef} type="button" className={`${styles.sideRow} ${styles.sideRowButton}`} data-open={open || undefined} onClick={onOpen} aria-haspopup="dialog" aria-expanded={open}>{inner}</button>
  }
  const content = <>
    <span className={styles.propIcon}>{iconNode}</span>
    <span className={styles.propLabel}>{label}</span>
    <span className={styles.propValue}>{display}</span>
    {onOpen ? <Icon name="expand_more" size={18} filled={false} className={styles.propChevron} /> : null}
  </>
  if (!onOpen) return <div className={styles.prop} data-muted={muted || undefined} style={style}>{content}</div>
  return (
    <button ref={buttonRef} type="button" className={`${styles.prop} ${styles.propButton}`} data-muted={muted || undefined} data-open={open || undefined} style={style} onClick={onOpen} aria-haspopup="dialog" aria-expanded={open}>
      {content}
    </button>
  )
}

function SelectProp({ icon, color, label, value, options, onChange, display, muted }: { icon: ReactNode; color?: string; label: string; value: string; options: Option[]; onChange: (value: string) => void; display?: ReactNode; muted?: boolean }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement | null>(null)
  const current = options.find(option => option.value === value)
  return (
    <>
      <Prop icon={icon} color={color} label={label} display={display ?? current?.label ?? '—'} muted={muted} onOpen={() => setOpen(true)} buttonRef={anchor} open={open} />
      {open ? (
        <Floating anchor={anchor} title={label} onClose={() => setOpen(false)}>
          <OptionList options={options} value={value} onSelect={next => { setOpen(false); if (next !== value) onChange(next) }} />
        </Floating>
      ) : null}
    </>
  )
}

function CategoryProp({ categories, value, display, onPick, onCreate, state, commit }: { categories: EventCategory[]; value: string; display: ReactNode; onPick: (category: EventCategory | null) => void; onCreate: (category: EventCategory) => void; state: MaiState; commit: Commit }) {
  const [open, setOpen] = useState(false)
  const [managing, setManaging] = useState(false)
  const anchor = useRef<HTMLButtonElement | null>(null)
  const current = categories.find(item => item.nome === value)
  return (
    <>
      <Prop icon="sell" color={current?.cor || 'var(--ds-sky-fg)'} label="Categoria" display={display} onOpen={() => setOpen(true)} buttonRef={anchor} open={open} />
      {open ? (
        <Floating anchor={anchor} title="Categoria" width={270} onClose={() => setOpen(false)}>
          <CategoryChooser
            categories={categories}
            value={value}
            onSelect={category => { setOpen(false); if ((category?.nome || '') !== value) onPick(category) }}
            onCreate={category => { onCreate(category); setOpen(false); onPick(category) }}
            onManage={() => { setOpen(false); setManaging(true) }}
          />
        </Floating>
      ) : null}
      {managing ? <CategoryManager state={state} commit={commit} onClose={() => setManaging(false)} /> : null}
    </>
  )
}

function PickerProp({ type, icon, color, label, value, display, onChange, muted, today = '', allowEmpty = true, emptyLabel }: { type: 'date' | 'time' | 'repeat' | 'reminder'; icon: string; color?: string; label: string; value: string; display: ReactNode; onChange: (value: string) => void; muted?: boolean; today?: string; allowEmpty?: boolean; emptyLabel?: string }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement | null>(null)
  const pick = (next: string) => { setOpen(false); if (next !== value) onChange(next) }
  return (
    <>
      <Prop icon={icon} color={color} label={label} display={display} muted={muted} onOpen={() => setOpen(true)} buttonRef={anchor} open={open} />
      {open ? (
        <Floating anchor={anchor} title={label} onClose={() => setOpen(false)} width={type === 'date' ? 300 : type === 'time' ? 260 : 280}>
          {type === 'date'
            ? <DatePicker value={value} today={today} onSelect={pick} allowEmpty={allowEmpty} />
            : type === 'time'
              ? <TimePicker value={value} onSelect={pick} allowEmpty={allowEmpty} emptyLabel={emptyLabel} />
              : type === 'repeat'
                ? <RepeatPicker value={value} onSelect={pick} />
                : <ReminderPicker value={value} onSelect={pick} />}
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
      onChange([...files, await uploadAttachment(file)])
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

function Round({ checked, late, onToggle, label, tone, color }: { checked: boolean; late?: boolean; onToggle: () => void; label: string; tone?: 'success'; color?: string }) {
  return (
    <button type="button" className={styles.round} data-checked={checked || undefined} data-late={late || undefined} data-tone={tone} data-priority={color && !checked ? '' : undefined} style={color && !checked ? ({ '--check-color': color } as CSSProperties) : undefined} onClick={onToggle} aria-pressed={checked} aria-label={label}>
      <Icon name="check" size={13} />
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

function ProjectProp({ icon, display, projects, projectId, section, imageOf, onPick }: { icon: ReactNode; display: string; projects: Row[]; projectId: string; section: string; imageOf: (project: Row) => string | undefined; onPick: (projectId: string, section: string) => void }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement | null>(null)
  return (
    <>
      <Prop icon={icon} label="Projeto" display={display} onOpen={() => setOpen(true)} buttonRef={anchor} open={open} />
      {open ? (
        <Floating anchor={anchor} title="Projeto" width={280} onClose={() => setOpen(false)}>
          <ProjectPicker projects={projects} projectId={projectId} section={section} imageOf={imageOf} onSelect={(id, name) => { setOpen(false); onPick(id, name) }} />
        </Floating>
      ) : null}
    </>
  )
}

function TaskBody({ task, state, today, commit, register, close, openTask }: { task: Row; state: MaiState; today: string; commit: Commit; register: DetailProps['register']; close: () => Promise<void>; openTask: (id: string) => void }) {
  const id = String(task.id)
  const save = useCallback((draft: Row) => {
    const due = draft._data ? `${draft._data}${draft._hora ? `T${draft._hora}` : ''}` : ''
    const { _data, _hora, ...clean } = draft
    commit(current => ({ ...current, tasks: current.tasks.map(row => String(row.id) === id ? { ...row, ...clean, titulo: String(clean.titulo || '').trim() || 'Tarefa', data_vencimento: due } : row) }))
  }, [commit, id])
  const { draft, update, dirty, save: saveDraft } = useDraft({
    titulo: String(task.titulo || ''),
    descricao: String(task.descricao || ''),
    _data: dateKey(task.data_vencimento),
    _hora: timeKey(task.data_vencimento),
    projeto_id: String(task.projeto_id || 'entrada'),
    secao: String(task.secao || ''),
    prioridade: Number(task.prioridade || 4),
    repeticao: String(task.repeticao || ''),
    lembretes: (Array.isArray(task.lembretes) ? task.lembretes : []).map(String),
    comentarios: rows(task.comentarios),
    anexos: rows(task.anexos),
  }, save, register)

  const phone = useIsPhone()
  const projects = rows(state.projects).filter(project => project.ativo !== false)
  const project = projects.find(row => String(row.id) === draft.projeto_id)
  const sections = rows(project?.secoes).map(String)
  const priority = PRIORITIES.find(option => Number(option.value) === Number(draft.prioridade)) || PRIORITIES[3]
  const children = state.tasks.filter(row => String(row.parent_id || '') === id) as Row[]
  const doneChildren = children.filter(row => row.concluida).length
  const late = Boolean(draft._data) && draft._data < today && !task.concluida
  const [composing, setComposing] = useState(false)
  const [showDone, setShowDone] = useState(true)
  const sortedChildren = [...children].filter(row => showDone || !row.concluida).sort(compareSubtasks)

  const crumbs: Row[] = []
  let parentId = String(task.parent_id || '')
  while (parentId && crumbs.length < 6) {
    const parent = state.tasks.find(row => String(row.id) === parentId) as Row | undefined
    if (!parent) break
    crumbs.unshift(parent)
    parentId = String(parent.parent_id || '')
  }

  async function goTo(taskId: string) {
    if (dirty) {
      const answer = await askUnsaved('tarefa')
      if (answer === 'stay') return
      if (answer === 'save') saveDraft()
    }
    openTask(taskId)
  }

  const subQuick = useQuickMenu()
  const subTaskQuick = useTaskQuick({ state, today, commit, onOpen: row => void goTo(String(row.id)) })
  const toggle = (taskId: string) => commit(current => ({ ...current, tasks: current.tasks.map(row => String(row.id) === taskId ? { ...row, concluida: !row.concluida, concluida_em: !row.concluida ? new Date().toISOString() : '' } : row) }))


  async function remove() {
    const title = `“${draft.titulo || 'Tarefa'}”`
    const parent = String(task.parent_id || '')
    let removeIds = new Set<string>([id])
    if (children.length) {
      const answer = await askChoice({
        title: 'Excluir também as subtarefas?',
        message: `${title} tem ${children.length} ${children.length === 1 ? 'subtarefa' : 'subtarefas'}. Quer excluir tudo junto? Não dá para desfazer.`,
        confirmLabel: 'Excluir tudo',
        extraLabel: 'Só esta',
        cancelLabel: 'Cancelar',
        tone: 'danger',
      })
      if (answer === 'cancel') return
      if (answer === 'confirm') {
        removeIds = new Set([id])
        let grew = true
        while (grew) {
          grew = false
          for (const row of state.tasks as Row[]) {
            if (!removeIds.has(String(row.id)) && removeIds.has(String(row.parent_id || ''))) { removeIds.add(String(row.id)); grew = true }
          }
        }
      }
    } else if (!(await askConfirm({ title: 'Excluir tarefa?', message: `${title} será excluída. Não dá para desfazer.` }))) return
    commit(current => ({ ...current, tasks: current.tasks.filter(row => !removeIds.has(String(row.id))).map(row => String(row.parent_id || '') === id ? { ...row, parent_id: parent } : row) }))
    void close()
  }

  const projectIcon = project?.imagem_url
    ? <img className={styles.projectImg} src={driveAssetUrl(project.imagem_url)} alt="" />
    : <span className={styles.projectDot} style={{ background: String(project?.cor || 'var(--ds-line-strong)') }} />

  const reminder = draft.lembretes[0] || ''
  const projectDisplay = `${String(project?.nome || 'Entrada')}${draft.secao ? ` › ${draft.secao}` : ''}`
  const pickProject = (projectId: string, secao: string) => update({ projeto_id: projectId, secao }, true)
  const propsList = (
    <>
      <ProjectProp icon={projectIcon} display={projectDisplay} projects={projects} projectId={draft.projeto_id} section={draft.secao} imageOf={row => row.imagem_url ? driveAssetUrl(row.imagem_url) : undefined} onPick={pickProject} />
      <PickerProp today={today} type="date" icon="calendar_today" color={draft._data ? (late ? 'var(--ds-danger)' : 'var(--ds-warn)') : 'var(--ds-muted)'} label="Data" value={draft._data} muted={!draft._data} display={friendlyDate(draft._data, today)} onChange={_data => update({ _data, _hora: _data ? draft._hora : '' }, true)} />
      <SelectProp icon="flag" color={priority.color} label="Prioridade" value={String(draft.prioridade)} onChange={value => update({ prioridade: Number(value) }, true)} options={PRIORITIES} display={priority.label} muted={Number(draft.prioridade) === 4} />
      <PickerProp type="time" icon="schedule" color="var(--ds-lilac-fg)" label="Horário" value={draft._hora} display={draft._hora || 'Sem horário'} muted={!draft._hora} onChange={_hora => update(_hora && !draft._data ? { _hora, _data: today } : { _hora }, true)} />
      <PickerProp type="repeat" icon="repeat" color="var(--ds-mint-fg)" label="Repetir" value={draft.repeticao} display={repeatLabel(draft.repeticao)} muted={!draft.repeticao} onChange={repeticao => update({ repeticao }, true)} />
      <PickerProp type="reminder" icon="notifications" color="var(--ds-sky-fg)" label="Lembrete" value={reminder} display={reminderLabel(reminder)} muted={!reminder} onChange={value => update({ lembretes: value ? [value] : [] }, true)} />
    </>
  )

  return (
    <>
      <Header kind="task" hideKind onClose={() => void close()} crumbs={<>
        <span className={styles.crumb}>
          {project?.imagem_url
            ? <img className={styles.crumbImg} src={driveAssetUrl(project.imagem_url)} alt="" />
            : <Icon name={project ? String(project.icone || 'folder') : 'inbox'} size={15} filled={false} className={styles.crumbIcon} style={project?.cor ? { color: String(project.cor) } : undefined} />}
          {String(project?.nome || 'Entrada')}{draft.secao ? <><i>›</i>{draft.secao}</> : null}
        </span>
        {crumbs.map(crumb => <span key={String(crumb.id)} className={styles.crumb}><i>›</i><button type="button" onClick={() => openTask(String(crumb.id))}>{String(crumb.titulo || 'Tarefa')}</button></span>)}
      </>} />
      <div className={styles.taskMain}>
        <div className={styles.taskContent}>
          <div className={styles.titleRow}>
            <Round checked={Boolean(task.concluida)} late={late} onToggle={() => toggle(id)} label={task.concluida ? 'Reabrir tarefa' : 'Concluir tarefa'} />
            <div className={styles.titleBody}>
              <GrowText className={`${styles.title} ${task.concluida ? styles.titleDone : ''}`} value={draft.titulo} placeholder="Nome da tarefa" multiline={false} onChange={titulo => update({ titulo })} />
              <GrowText className={styles.description} value={draft.descricao} placeholder="Adicionar descrição" onChange={descricao => update({ descricao })} />
            </div>
          </div>

          {phone ? <PropVariantCtx.Provider value="icon"><div className={styles.iconProps}>{propsList}</div></PropVariantCtx.Provider> : null}

          <section className={styles.section}>
            <div className={styles.subHead}>
              <h3>Subtarefas</h3>
              {children.length ? <span className={styles.subCount}>{doneChildren}/{children.length}</span> : null}
              <span className={styles.subHeadGrow} />
              {doneChildren ? <button type="button" className={styles.subDoneToggle} onClick={() => setShowDone(value => !value)}>{showDone ? 'Ocultar concluídas' : `Mostrar concluídas (${doneChildren})`}</button> : null}
            </div>
            <div className={styles.list}>
              {sortedChildren.map(child => <SubtaskCard key={String(child.id)} task={child} state={state} today={today} bind={subQuick.bind(() => subTaskQuick.menu(child))} onToggle={() => toggle(String(child.id))} onOpen={() => void goTo(String(child.id))} />)}
              {composing ? (
                <QuickAdd inline kinds={['task']} initial="task" parentId={id} state={state} today={today} defaultProjectId={String(draft.projeto_id || 'entrada')} defaultSection={String(draft.secao || '')} commit={commit} onFinance={() => undefined} onClose={() => setComposing(false)} />
              ) : (
                <div className={styles.subAddRow}>
                  <button type="button" className={styles.subAdd} onClick={() => setComposing(true)}>
                    <Icon name="add" size={17} filled={false} />Adicionar subtarefa
                  </button>
                </div>
              )}
            </div>
          </section>

          {draft.anexos.length ? <Attachments files={draft.anexos} onChange={anexos => update({ anexos }, true)} /> : null}

          <div className={styles.commentsSlot}>
            <CommentsSection comments={draft.comentarios as Comment[]} onChange={comentarios => update({ comentarios }, true)} />
          </div>
        </div>

        {!phone ? (
          <PropVariantCtx.Provider value="row">
            <aside className={styles.taskSide} aria-label="Propriedades">{propsList}</aside>
          </PropVariantCtx.Provider>
        ) : null}
      </div>
      <Footer status={savedStatus} onDelete={() => void remove()} />
      {subQuick.element}
      {subTaskQuick.element}
    </>
  )
}

/** Subtarefa compacta, dentro do cartão: só marcar, ler e abrir. Data e prioridade são escolhidas ao criar. */
function SubtaskCard({ task, state, today, bind, onToggle, onOpen }: { task: Row; state: MaiState; today: string; bind?: Record<string, unknown>; commit?: Commit; onToggle: () => void; onOpen: () => void }) {
  const id = String(task.id)
  const due = dateKey(task.data_vencimento)
  const time = timeKey(task.data_vencimento)
  const done = Boolean(task.concluida)
  const late = Boolean(due) && due < today && !done
  const children = state.tasks.filter(row => String(row.parent_id || '') === id) as Row[]
  const priorityColor = ({ 1: 'var(--ds-rose-fg)', 2: 'var(--ds-peach-fg)', 3: 'var(--ds-sky-fg)' } as Record<number, string>)[Number(task.prioridade || 4)]
  const desc = String(task.descricao || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  const info = [due ? `${friendlyDate(due, today)}${time ? ` · ${time}` : ''}` : '', task.repeticao ? repeatLabel(String(task.repeticao)) : '', children.length ? `${children.filter(row => row.concluida).length}/${children.length}` : ''].filter(Boolean).join(' · ')

  return (
    <div className={styles.subCard} data-done={done || undefined} {...bind}>
      <Round checked={done} late={late} color={priorityColor} onToggle={onToggle} label={`${done ? 'Reabrir' : 'Concluir'} ${String(task.titulo || 'subtarefa')}`} />
      <button type="button" className={styles.subMain} onClick={onOpen}>
        <span className={styles.subTitle}>{String(task.titulo || 'Subtarefa')}</span>
        {desc ? <span className={styles.subDescLine}>{desc}</span> : null}
        {info ? <span className={styles.subInfo} data-late={late || undefined}>{info}</span> : null}
      </button>
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

  const { draft, update: rawUpdate } = useDraft({
    titulo: String(source.titulo || item.title || ''),
    descricao: String(source.descricao || ''),
    data_inicio: dateKey(source.data_inicio) || day,
    hora_inicio: String(source.hora_inicio || '').slice(0, 5),
    hora_fim: String(source.hora_fim || '').slice(0, 5),
    dia_inteiro: source.dia_inteiro === true,
    repeticao: String(source.repeticao || ''),
    anexos: rows(source.anexos),
    ...(google ? {} : { categoria: String(source.categoria || ''), categoria_cor: String(source.categoria_cor || source.cor || ''), cor: String(source.cor || source.categoria_cor || '') }),
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

  const calendarName = google ? String(source.calendario_nome || 'Google Agenda') : String(draft.categoria || source.categoria || 'Bukid')
  const color = String(source.calendarColor || source.cor || 'var(--ds-accent)')
  const googleCategory = String(source.categoria || source.calendario_nome || 'Google Agenda')
  const timeRange = draft.dia_inteiro ? 'Dia todo' : `${draft.hora_inicio || '--:--'}${draft.hora_fim ? ` – ${draft.hora_fim}` : ''}`

  // Compromisso do Google Agenda: só leitura. Nome, categoria e o atalho para abrir no Google.
  if (google) {
    return (
      <>
        <Header kind="event" crumbs={<span className={styles.crumb}><i>·</i>{calendarName}</span>} />
        <div className={styles.scroll}>
          <div className={styles.titleRow}>
            <span className={styles.tile} style={{ background: color.startsWith('#') ? color : undefined }}><Icon name="event" size={17} /></span>
            <div className={styles.titleBody}>
              <h2 className={styles.title} style={{ margin: 0 }}>{String(source.titulo || item.title || 'Compromisso')}</h2>
            </div>
          </div>
          <div className={styles.props}>
            <Prop icon="sell" color="var(--ds-sky-fg)" label="Categoria" display={googleCategory} />
          </div>
          <div className={styles.actions}>
            {source.url ? (
              <a className={styles.actionRow} href={String(source.url)} target="_blank" rel="noreferrer">
                <Icon name="open_in_new" size={20} filled={false} /><span>Abrir no Google Agenda</span>
              </a>
            ) : <p className={styles.description} style={{ margin: 0 }}>Este compromisso vem do Google Agenda e só pode ser editado lá.</p>}
          </div>
        </div>
        <Footer readOnly />
      </>
    )
  }

  return (
    <>
      <Header kind="event" onClose={() => void close()} crumbs={<span className={styles.crumb}><i>·</i>{calendarName}</span>} />
      <ItemLayout side={<>
          <PickerProp today={today} type="date" icon="calendar_today" color="var(--ds-accent)" label="Data" allowEmpty={false} value={draft.data_inicio} display={friendlyDate(draft.data_inicio, today)} onChange={data_inicio => data_inicio && update({ data_inicio }, true)} />
          <SelectProp icon="wb_sunny" color="var(--ds-peach-fg)" label="Dia todo" value={draft.dia_inteiro ? 'sim' : 'nao'} onChange={value => update({ dia_inteiro: value === 'sim' }, true)} options={[{ value: 'nao', label: 'Com horário' }, { value: 'sim', label: 'Dia todo' }]} display={draft.dia_inteiro ? 'Dia todo' : 'Com horário'} />
          {!draft.dia_inteiro ? <PickerProp type="time" icon="schedule" color="var(--ds-lilac-fg)" label="Início" allowEmpty={false} value={draft.hora_inicio} display={draft.hora_inicio || '--:--'} onChange={hora_inicio => update({ hora_inicio }, true)} /> : null}
          {!draft.dia_inteiro ? <PickerProp type="time" icon="schedule" color="var(--ds-lilac-fg)" label="Fim" emptyLabel="Sem horário de fim" value={draft.hora_fim} display={draft.hora_fim || 'Sem fim'} muted={!draft.hora_fim} onChange={hora_fim => update({ hora_fim }, true)} /> : null}
          {google
            ? <Prop icon="calendar_month" color="var(--ds-sky-fg)" label="Calendário" display={calendarName} />
            : <CategoryProp categories={eventCategories(state)} value={String(draft.categoria || '')} display={calendarName} onPick={category => update({ categoria: category?.nome || '', categoria_cor: category?.cor || '', cor: category?.cor || '' }, true)} onCreate={category => commit(current => withEventCategory(current, category))} state={state} commit={commit} />}
          {!google ? <SelectProp icon="repeat" color="var(--ds-mint-fg)" label="Repetir" value={draft.repeticao} onChange={repeticao => update({ repeticao }, true)} options={REPEATS.some(option => option.value === draft.repeticao) ? REPEATS : [...REPEATS, { value: draft.repeticao, label: 'Personalizado' }]} /> : null}
      </>}>
        <div className={styles.titleRow}>
          <span className={styles.tile} style={{ background: color.startsWith('#') ? color : undefined }}><Icon name="event" size={17} /></span>
          <div className={styles.titleBody}>
            <GrowText className={styles.title} value={draft.titulo} placeholder="Nome do compromisso" multiline={false} onChange={titulo => update({ titulo })} />
            <GrowText className={styles.description} value={draft.descricao} placeholder="Adicionar descrição" onChange={descricao => update({ descricao })} />
          </div>
        </div>


        <div className={styles.actions}>
          {google && source.url ? (
            <a className={styles.actionRow} href={String(source.url)} target="_blank" rel="noreferrer">
              <Icon name="open_in_new" size={20} filled={false} /><span>Abrir no Google Agenda</span>
            </a>
          ) : null}
        </div>

        <Attachments files={draft.anexos} onChange={anexos => update({ anexos }, true)} />
        {message ? <p className={styles.error}>{message}</p> : null}
      </ItemLayout>
      <Footer status={busy ? 'Salvando no Google…' : google ? (dirty ? <><Icon name="cloud_upload" size={15} />Será salvo no Google ao fechar</> : <><Icon name="cloud_done" size={15} className={styles.okIcon} />Sincronizado com o Google</>) : savedStatus} onDelete={() => void remove()} />
    </>
  )
}

/* ----------------------------------------------------------------- Hábito */

function HabitDetail({ item, state, today, commit, register, close }: DetailProps) {
  const habit = rows(state.habits).find(row => String(row.id) === item.sourceId) || item.raw
  const day = item.date && item.date <= today ? item.date : today
  const save = useCallback((draft: Row) => {
    const next = cleanHabit({ ...habit, ...draft, _persisted: true }, today)
    commit(current => ({ ...current, habits: rows(current.habits).map(row => String(row.id) === item.sourceId ? { ...next, nome: String(next.nome || '').trim() || 'Hábito' } : row) }))
  }, [commit, item.sourceId, habit, today])
  const { draft, update } = useDraft({
    nome: String(habit.nome || ''),
    descricao: String(habit.descricao || ''),
    meta: Number(habit.meta || 1),
    unidade: String(habit.unidade || ''),
    hora: String(habit.hora || ''),
    cor_hex: String(habit.cor_hex || ''),
    repeticao: String(habit.repeticao || 'diariamente'),
    dias_semana: Array.isArray(habit.dias_semana) ? habit.dias_semana : [0, 1, 2, 3, 4, 5, 6],
    data_inicio: String(habit.data_inicio || '').slice(0, 10),
    ocultar_agenda: habit.ocultar_agenda === true,
    anexos: rows(habit.anexos),
  }, save, register)

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

  /* Calendário do mês (navegável): um círculo por dia, borda na cor do hábito; toque alterna vazio → feito → falhou.
   * Tudo dentro da grade: valor do dia (hábitos com meta) e, no cabeçalho, o resumo do mês em texto. */
  const color = String(habit.cor_hex || 'var(--ds-accent)')
  const [month, setMonth] = useState(`${day.slice(0, 7)}-01`)
  const monthStart = month
  const lead = new Date(`${monthStart}T12:00:00`).getDay()
  const monthDays = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
  const monthTitle = new Date(`${monthStart}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: monthDays }, (_, index) => `${monthStart.slice(0, 8)}${String(index + 1).padStart(2, '0')}`)]
  const shiftMonth = (amount: number) => { const next = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + amount, 1, 12); setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`) }
  const monthKeys = cells.filter((key): key is string => Boolean(key))
  const expected = monthKeys.filter(key => key <= today && habitOccursOn(habit, key))
  const doneCount = expected.filter(key => { const row = entryOn(key); return !failedEntry(row) && Number(row?.valor || 0) >= target }).length
  const failCount = expected.filter(key => failedEntry(entryOn(key))).length
  const rate = expected.length ? Math.round((doneCount / expected.length) * 100) : 0
  const streakNow = habitStreak(state, habit, today)
  const summary = [`${doneCount} de ${expected.length} dias`, `${rate}%`, failCount ? `${failCount} ${failCount === 1 ? 'falha' : 'falhas'}` : '', `sequência ${streakNow}`].filter(Boolean).join(' · ')
  const unitShort = String(draft.unidade || '').trim().slice(0, 4)
  function cycleDay(key: string) {
    const row = entryOn(key)
    const next = !row ? { valor: target, falhou: false } : failedEntry(row) ? null : Number(row.valor || 0) >= target ? { valor: 0, falhou: true } : { valor: target, falhou: false }
    commit(current => {
      const all = rows(current.habitEntries)
      const existing = all.find(item2 => String(item2.habito_id) === item.sourceId && dateKey(item2.data) === key)
      const others = all.filter(item2 => !(String(item2.habito_id) === item.sourceId && dateKey(item2.data) === key))
      if (!next) return { ...current, habitEntries: others }
      return { ...current, habitEntries: [...others, { id: existing?.id || uid('hr'), habito_id: item.sourceId, data: key, valor: next.valor, falhou: next.falhou, status: next.falhou ? 'falha' : '', criado_em: existing?.criado_em || new Date().toISOString() }] }
    })
  }

  async function remove() {
    if (!(await askConfirm({ title: 'Arquivar hábito?', message: `“${draft.nome || 'Hábito'}” sai da sua rotina. O histórico fica guardado.`, confirmLabel: 'Arquivar', icon: 'archive' }))) return
    commit(current => ({ ...current, habits: rows(current.habits).map(row => String(row.id) === item.sourceId ? { ...row, ativo: false } : row) }))
    void close()
  }

  return (
    <>
      <Header kind="habit" onClose={() => void close()} crumbs={<span className={styles.crumb}><i>·</i>{friendlyDate(day, today)}</span>} />
      <ItemLayout side={<>
          <Prop icon="edit" color="var(--ds-text-2)" label="Nome" display={<input className={styles.inlineInput} type="text" value={draft.nome} placeholder="Nome do hábito" onChange={event => update({ nome: event.target.value })} />} />
          <Prop icon="notes" color="var(--ds-text-2)" label="Descrição" display={<input className={styles.inlineInput} type="text" value={draft.descricao} placeholder="Adicionar descrição" onChange={event => update({ descricao: event.target.value })} />} />
          <Prop icon="target" color="var(--ds-accent)" label="Meta por dia" display={<input className={styles.inlineInput} type="number" inputMode="numeric" min={1} value={draft.meta} onChange={event => update({ meta: Math.max(1, Number(event.target.value) || 1) })} />} />
          <Prop icon="straighten" color="var(--ds-text-2)" label="Unidade" display={<UnitField className={styles.inlineInput} value={String(draft.unidade || '')} onChange={unidade => update({ unidade })} />} />
          <Prop icon="schedule" color="var(--ds-text-2)" label="Horário" display={<input className={styles.inlineInput} type="time" value={String(draft.hora || '')} onChange={event => update({ hora: event.target.value })} />} />
          <Prop icon="palette" color={String(draft.cor_hex || 'var(--ds-accent)')} label="Cor" display={<ColorField value={draft.cor_hex} onChange={cor_hex => update({ cor_hex })} />} />
          <Prop icon={draft.ocultar_agenda ? 'visibility_off' : 'visibility'} color="var(--ds-text-2)" label="Hoje e Agenda" display={draft.ocultar_agenda ? 'Oculto de Hoje e da Agenda' : 'Aparece em Hoje e na Agenda'} onOpen={() => update({ ocultar_agenda: !draft.ocultar_agenda })} />
          <div className={styles.sideBlock}><FrequencyEditor draft={draft} setDraft={next => update(next)} today={today} /></div>
      </>}>
        <div className={styles.monthCal} style={{ '--hc': color } as CSSProperties}>
          <div className={styles.monthBar}>
            <button type="button" className={styles.monthNav} onClick={() => shiftMonth(-1)} aria-label="Mês anterior"><Icon name="chevron_left" size={20} filled={false} /></button>
            <h3 className={styles.monthTitle}>{monthTitle}</h3>
            <button type="button" className={styles.monthNav} onClick={() => shiftMonth(1)} aria-label="Próximo mês"><Icon name="chevron_right" size={20} filled={false} /></button>
          </div>
          <p className={styles.monthSummary}>{summary}</p>
          <div className={styles.monthGrid} role="grid" aria-label={monthTitle}>
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((letter, index) => <span key={index} className={styles.monthHead}>{letter}</span>)}
            {cells.map((key, index) => {
              if (!key) return <span key={`b${index}`} />
              const row = entryOn(key)
              const level = failedEntry(row) ? 'fail' : Number(row?.valor || 0) >= target ? 'full' : Number(row?.valor || 0) > 0 ? 'part' : ''
              const off = key > today || !habitOccursOn(habit, key)
              return (
                <button key={key} type="button" className={styles.monthDay} data-today={key === today || undefined} data-off={off || undefined} disabled={off} aria-label={friendlyDate(key, today)} onClick={() => cycleDay(key)}>
                  <small>{Number(key.slice(8))}</small>
                  <i data-level={level || undefined}>{level === 'full' || level === 'part' ? <Icon name="check" size={13} weight={600} filled={false} /> : level === 'fail' ? <Icon name="close" size={13} weight={600} filled={false} /> : null}</i>
                  {quantitative ? <em>{level === 'fail' || !row ? '' : `${Number(row.valor || 0)}${unitShort ? ` ${unitShort}` : ''}`}</em> : null}
                </button>
              )
            })}
          </div>
        </div>
        <Attachments files={draft.anexos} onChange={anexos => update({ anexos }, true)} />
      </ItemLayout>
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
  const { draft, update } = useDraft({
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
      <ItemLayout side={<>
          <PickerProp today={today} type="date" icon="calendar_today" color="var(--ds-accent)" label="Vencimento" allowEmpty={false} value={draft.data} display={<span className={late ? styles.late : undefined}>{friendlyDate(draft.data, today)}</span>} onChange={data => data && update({ data, dia_mes: Number(data.slice(8)) }, true)} />
          <SelectProp icon={income ? 'south_west' : 'north_east'} color={income ? 'var(--ds-success)' : 'var(--ds-danger)'} label="Tipo" value={draft.tipo} onChange={tipo => update({ tipo }, true)} options={[{ value: 'despesa', label: 'Despesa' }, { value: 'receita', label: 'Receita' }]} />
          <SelectProp icon="sell" color="var(--ds-peach-fg)" label="Categoria" value={draft.categoria} onChange={categoria => update({ categoria }, true)} options={categoryOptions} />
          <SelectProp icon="account_balance" color="var(--ds-text-2)" label={income ? 'Receber em' : 'Pagar com'} value={draft.conta_id} onChange={conta_id => update({ conta_id }, true)} options={accountOptions} />
      </>}>
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
              <MoneyInput value={Number(draft.valor) || 0} onChange={value => update({ valor: value })} ariaLabel="Valor" />
            </label>
          </div>
          <button type="button" className={styles.payButton} data-paid={paid || undefined} onClick={togglePaid}>
            <Icon name={paid ? 'undo' : 'check'} size={18} />{paid ? 'Desfazer' : income ? 'Recebido' : 'Pagar'}
          </button>
        </div>


        <Attachments files={draft.anexos} onChange={anexos => update({ anexos }, true)} />
      </ItemLayout>
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
  const { draft, update } = useDraft({
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
      <ItemLayout side={<>
          <PickerProp today={today} type="date" icon="event" color="var(--ds-accent)" label="Prazo" value={draft.prazo} display={friendlyDate(draft.prazo, today)} onChange={prazo => update({ prazo }, true)} />
          <Prop icon="trending_up" color="var(--ds-lilac-fg)" label="Progresso atual" display={<input className={styles.inlineInput} type="number" inputMode="decimal" min={0} value={draft.progresso_atual} onChange={event => update({ progresso_atual: Number(event.target.value || 0) })} aria-label="Progresso atual" />} />
          <Prop icon="flag" color="var(--ds-lilac-fg)" label="Total" display={<input className={styles.inlineInput} type="number" inputMode="decimal" min={1} value={draft.progresso_total} onChange={event => update({ progresso_total: Math.max(1, Number(event.target.value || 1)) })} aria-label="Total" />} />
      </>}>
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

      </ItemLayout>
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
  const { draft, update } = useDraft({ titulo: String(note.titulo || ''), conteudo: String(note.conteudo || '') }, save, register, 500)
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
      <ItemLayout>
        <GrowText className={styles.title} value={draft.titulo} placeholder="Título" multiline={false} onChange={titulo => update({ titulo })} />
        <div
          ref={editor}
          className={styles.noteBody}
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Escreva aqui…"
          onInput={event => update({ conteudo: event.currentTarget.innerHTML })}
        />
      </ItemLayout>
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
