'use client'

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { MaiState } from '../../../lib/v2/state'
import { Icon } from '../../ds'
import type { Row } from '../app-types'
import { driveAssetUrl } from '../DriveAsset'
import { DatePicker, Floating, OptionList, TimePicker, type PickerOption } from '../detail/Pickers'
import { CategoryChooser } from '../detail/CategoryChooser'
import { eventCategories, withEventCategory, type EventCategory } from '../../../lib/v2/event-categories'
import styles from './QuickAdd.module.css'

/**
 * Adicionar rápido: o mesmo formulário em todo o app, com as opções de cada
 * tipo (tarefa, compromisso) e atalho para o lançamento financeiro.
 * Desktop: janela no centro. Celular: folha que sobe de baixo.
 */

export type QuickAddKind = 'task' | 'event' | 'finance'

type Props = {
  kinds: QuickAddKind[]
  initial: QuickAddKind
  state: MaiState
  today: string
  defaultProjectId?: string
  defaultDate?: string
  commit: (change: (current: MaiState) => MaiState) => void
  onFinance: () => void
  onClose: () => void
  /** Abre o formulário no próprio lugar (dentro da lista), sem janela. */
  inline?: boolean
}

const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : [])
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`

const KIND_LABEL: Record<QuickAddKind, { label: string; icon: string }> = {
  task: { label: 'Tarefa', icon: 'check_circle' },
  event: { label: 'Compromisso', icon: 'event' },
  finance: { label: 'Lançamento', icon: 'payments' },
}

const PRIORITIES: PickerOption[] = [
  { value: '1', label: 'Alta', icon: 'flag', color: 'var(--ds-rose-fg)' },
  { value: '2', label: 'Média', icon: 'flag', color: 'var(--ds-peach-fg)' },
  { value: '3', label: 'Baixa', icon: 'flag', color: 'var(--ds-sky-fg)' },
  { value: '4', label: 'Sem prioridade', icon: 'outlined_flag', color: 'var(--ds-muted)' },
]
const PRIORITY_COLOR: Record<number, string> = { 1: 'var(--ds-rose-fg)', 2: 'var(--ds-peach-fg)', 3: 'var(--ds-sky-fg)' }

const REPEATS: PickerOption[] = [
  { value: '', label: 'Não repetir', icon: 'block' },
  { value: 'diariamente', label: 'Todos os dias', icon: 'today' },
  { value: 'semanal:1,2,3,4,5', label: 'Dias úteis', icon: 'work' },
  { value: 'semanalmente', label: 'Toda semana', icon: 'date_range' },
  { value: 'mensalmente', label: 'Todo mês', icon: 'calendar_month' },
]

function addDays(key: string, amount: number) {
  const value = new Date(`${key}T12:00:00`)
  value.setDate(value.getDate() + amount)
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

function naturalDate(key: string, today: string) {
  if (!key) return 'Data'
  if (key === today) return 'Hoje'
  if (key === addDays(today, 1)) return 'Amanhã'
  if (key === addDays(today, -1)) return 'Ontem'
  const date = new Date(`${key}T12:00:00`)
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', ...(key.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) }).replace('.', '')
}

const plusHour = (time: string) => {
  const [h, m] = time.split(':').map(Number)
  if (!Number.isFinite(h)) return ''
  return `${String(Math.min(23, h + 1)).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`
}

type Picker = '' | 'date' | 'priority' | 'project' | 'section' | 'repeat' | 'start' | 'end' | 'category'

export function QuickAdd({ kinds, initial, state, today, defaultProjectId, defaultDate, commit, onFinance, onClose, inline }: Props) {
  const [kind, setKind] = useState<QuickAddKind>(initial)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(defaultDate ?? '')
  const [priority, setPriority] = useState(4)
  const [projectId, setProjectId] = useState(defaultProjectId || 'entrada')
  const [section, setSection] = useState('')
  const [repeat, setRepeat] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')
  const [place, setPlace] = useState('')
  const [category, setCategory] = useState<EventCategory | null>(null)
  const [picker, setPicker] = useState<Picker>('')
  const anchor = useRef<HTMLElement | null>(null)
  const open = (which: Picker) => (event: ReactMouseEvent<HTMLElement>) => { anchor.current = event.currentTarget; setPicker(which) }

  const projects = rows(state.projects).filter(item => item.ativo !== false)
  const project = projects.find(item => String(item.id) === projectId)
  const sections = project ? rows(project.secoes).map(String) : []

  // Evento sem data usa o dia de hoje; tarefa pode ficar sem data.
  const eventDate = date || today

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const switchKind = (next: QuickAddKind) => {
    if (next === 'finance') { onClose(); onFinance(); return }
    if (next === kind) return
    setKind(next)
    setPicker('')
    if (next === 'event' && !date) setDate(today)
  }

  const submit = () => {
    const name = title.trim()
    if (!name) return
    if (kind === 'task') {
      const task: Row = {
        id: uid('t'), titulo: name, descricao: description.trim(), data_vencimento: date, prioridade: priority, concluida: false,
        projeto_id: projectId, parent_id: '', secao: section, criado_em: new Date().toISOString(), ordem: Date.now(),
        notas: [], anexos: [], subtarefas: [], lembretes: [], etiquetas: [], repeticao: repeat, ocultar_agenda: false,
      }
      commit(current => ({ ...current, tasks: [...current.tasks, task as (typeof current.tasks)[number]] }))
    } else {
      const eventRow: Row = {
        id: uid('local-event'), tipo: 'local', titulo: name, descricao: description.trim(),
        data_inicio: eventDate, hora_inicio: allDay ? '' : start, hora_fim: allDay ? '' : end,
        dia_inteiro: allDay, local: place.trim(), categoria: category?.nome || '', categoria_cor: category?.cor || '#6f8168',
        categoria_icone: 'calendar', repeticao: repeat, lembretes: [], anexos: [], cor: category?.cor || '#6f8168',
      }
      commit(current => {
        const next = { ...current, events: [...rows(current.events), eventRow] }
        return category ? withEventCategory(next, category) : next
      })
    }
    onClose()
  }

  const done = (fn: () => void) => { fn(); setPicker('') }
  const repeatLabel = REPEATS.find(item => item.value === repeat)?.label || 'Repetir'

  const body = (
    <div className={inline ? styles.inlineWrap : styles.layer} onClick={inline ? undefined : event => { if (event.target === event.currentTarget) onClose() }}>
      <div className={inline ? styles.inlinePanel : styles.panel} role={inline ? 'group' : 'dialog'} aria-modal={inline ? undefined : 'true'} aria-label="Adicionar">
        {inline ? null : <div className={styles.handle} aria-hidden="true" />}
        {kinds.length > 1 ? (
          <div className={styles.kinds} role="tablist">
            {kinds.map(item => (
              <button key={item} type="button" role="tab" aria-selected={kind === item} data-active={kind === item || undefined} onClick={() => switchKind(item)}>
                <Icon name={KIND_LABEL[item].icon} size={16} filled={false} />{KIND_LABEL[item].label}
              </button>
            ))}
          </div>
        ) : null}

        <div className={styles.fields}>
          <input
            autoFocus
            className={styles.title}
            value={title}
            placeholder={kind === 'task' ? 'Nome da tarefa' : 'Nome do compromisso'}
            enterKeyHint="done"
            onChange={event => setTitle(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); submit() } }}
          />
          <textarea className={styles.description} value={description} rows={2} placeholder="Descrição" onChange={event => setDescription(event.target.value)} />

          <div className={styles.chips}>
            <button type="button" className={styles.chip} data-set={date || undefined} data-late={(kind === 'task' && date && date < today) || undefined} onClick={open('date')}>
              <Icon name="event" size={16} filled={false} />{naturalDate(kind === 'event' ? eventDate : date, today)}
            </button>

            {kind === 'task' ? (
              <>
                <button type="button" className={styles.chip} data-set={priority < 4 || undefined} style={PRIORITY_COLOR[priority] ? ({ '--chip-color': PRIORITY_COLOR[priority] } as CSSProperties) : undefined} onClick={open('priority')}>
                  <Icon name="flag" size={16} filled={priority < 4} />{priority < 4 ? PRIORITIES[priority - 1].label : 'Prioridade'}
                </button>
                <button type="button" className={styles.chip} onClick={open('project')}>
                  {project?.imagem_url ? <img className={styles.chipImg} src={driveAssetUrl(project.imagem_url)} alt="" /> : <Icon name={projectId === 'entrada' ? 'inbox' : String(project?.icone || 'folder')} size={16} filled={false} />}
                  <span>{projectId === 'entrada' ? 'Entrada' : String(project?.nome || 'Projeto')}</span>
                </button>
                {sections.length ? (
                  <button type="button" className={styles.chip} data-set={section || undefined} onClick={open('section')}>
                    <Icon name="view_agenda" size={16} filled={false} /><span>{section || 'Seção'}</span>
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <button type="button" className={styles.chip} data-set={category ? true : undefined} style={category ? ({ '--chip-color': category.cor } as CSSProperties) : undefined} onClick={open('category')}>
                  <Icon name="sell" size={16} filled={Boolean(category)} /><span>{category?.nome || 'Categoria'}</span>
                </button>
                <button type="button" className={styles.chip} data-set={allDay || undefined} onClick={() => setAllDay(value => !value)}>
                  <Icon name="wb_sunny" size={16} filled={false} />Dia inteiro
                </button>
                {!allDay ? (
                  <>
                    <button type="button" className={styles.chip} data-set onClick={open('start')}><Icon name="schedule" size={16} filled={false} />{start || 'Início'}</button>
                    <button type="button" className={styles.chip} data-set onClick={open('end')}><Icon name="arrow_right_alt" size={16} filled={false} />{end || 'Fim'}</button>
                  </>
                ) : null}
              </>
            )}

            <button type="button" className={styles.chip} data-set={repeat || undefined} onClick={open('repeat')}>
              <Icon name="repeat" size={16} filled={false} />{repeatLabel}
            </button>
          </div>

          {kind === 'event' ? (
            <label className={styles.place}>
              <Icon name="location_on" size={16} filled={false} />
              <input value={place} placeholder="Local" onChange={event => setPlace(event.target.value)} />
            </label>
          ) : null}
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.ghost} onClick={onClose}>Cancelar</button>
          <button type="button" className={styles.primary} disabled={!title.trim()} onClick={submit}>{kind === 'task' ? 'Adicionar tarefa' : 'Adicionar compromisso'}</button>
        </div>
      </div>

      {picker === 'date' ? (
        <Floating anchor={anchor} title="Data" width={300} onClose={() => setPicker('')}>
          <DatePicker value={kind === 'event' ? eventDate : date} today={today} allowEmpty={kind === 'task'} onSelect={value => done(() => setDate(value))} />
        </Floating>
      ) : null}
      {picker === 'priority' ? (
        <Floating anchor={anchor} title="Prioridade" onClose={() => setPicker('')}>
          <OptionList options={PRIORITIES} value={String(priority)} onSelect={value => done(() => setPriority(Number(value)))} />
        </Floating>
      ) : null}
      {picker === 'project' ? (
        <Floating anchor={anchor} title="Projeto" width={260} onClose={() => setPicker('')}>
          <OptionList
            options={[{ value: 'entrada', label: 'Entrada', icon: 'inbox' }, ...projects.map(item => ({ value: String(item.id), label: String(item.nome || 'Projeto'), image: item.imagem_url ? driveAssetUrl(item.imagem_url) : undefined, color: String(item.cor || 'var(--ds-line-strong)') }))]}
            value={projectId}
            onSelect={value => done(() => { setProjectId(value); setSection('') })}
          />
        </Floating>
      ) : null}
      {picker === 'section' ? (
        <Floating anchor={anchor} title="Seção" width={240} onClose={() => setPicker('')}>
          <OptionList options={[{ value: '', label: 'Sem seção', icon: 'horizontal_rule' }, ...sections.map(name => ({ value: name, label: name, icon: 'view_agenda' }))]} value={section} onSelect={value => done(() => setSection(value))} />
        </Floating>
      ) : null}
      {picker === 'category' ? (
        <Floating anchor={anchor} title="Categoria" width={270} onClose={() => setPicker('')}>
          <CategoryChooser
            categories={eventCategories(state)}
            value={category?.nome || ''}
            onSelect={value => done(() => setCategory(value))}
            onCreate={value => { commit(current => withEventCategory(current, value)); done(() => setCategory(value)) }}
          />
        </Floating>
      ) : null}
      {picker === 'repeat' ? (
        <Floating anchor={anchor} title="Repetição" width={240} onClose={() => setPicker('')}>
          <OptionList options={REPEATS} value={repeat} onSelect={value => done(() => setRepeat(value))} />
        </Floating>
      ) : null}
      {picker === 'start' ? (
        <Floating anchor={anchor} title="Início" width={220} onClose={() => setPicker('')}>
          <TimePicker value={start} allowEmpty={false} onSelect={value => done(() => { setStart(value); if (!end || end <= value) setEnd(plusHour(value)) })} />
        </Floating>
      ) : null}
      {picker === 'end' ? (
        <Floating anchor={anchor} title="Fim" width={220} onClose={() => setPicker('')}>
          <TimePicker value={end} allowEmpty={false} onSelect={value => done(() => setEnd(value))} />
        </Floating>
      ) : null}
    </div>
  )

  if (inline) return body
  return typeof document === 'undefined' ? null : createPortal(body, document.body)
}

/** Botão "+" fixo (computador). No celular, quem adiciona é o "+" da barra de baixo. */
export function AddFab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.fab} onClick={onClick} aria-label={label} title={label}>
      <Icon name="add" size={28} weight={500} />
    </button>
  )
}
