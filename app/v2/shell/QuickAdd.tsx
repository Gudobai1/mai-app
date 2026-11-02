'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { MaiState } from '../../../lib/v2/state'
import { Icon } from '../../ds'
import type { Row } from '../app-types'
import { driveAssetUrl } from '../DriveAsset'
import { DatePicker, Floating, OptionList, ProjectPicker, ReminderPicker, RepeatPicker, TimePicker, repeatLabel as repeatText, reminderLabel, type PickerOption } from '../detail/Pickers'
import { CategoryChooser } from '../detail/CategoryChooser'
import { CategoryManager } from '../detail/CategoryManager'
import { eventCategories, withEventCategory, type EventCategory } from '../../../lib/v2/event-categories'
import { fold, parseNatural, replaceRange, type NlKind } from '../../../lib/v2/nlp'
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
  defaultSection?: string
  commit: (change: (current: MaiState) => MaiState) => void
  onFinance: () => void
  onClose: () => void
  /** Abre o formulário no próprio lugar (dentro da lista), sem janela. */
  inline?: boolean
  /** Cria a tarefa como subtarefa desta. */
  parentId?: string
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

type Picker = '' | 'ftype' | 'account' | 'date' | 'time' | 'reminder' | 'priority' | 'project' | 'repeat' | 'start' | 'end' | 'category'

export function QuickAdd({ kinds, initial, state, today, defaultProjectId, defaultDate, defaultSection, commit, onFinance, onClose, inline, parentId }: Props) {
  const [kind, setKind] = useState<QuickAddKind>(initial)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dateS, setDateS] = useState(defaultDate ?? '')
  const [priorityS, setPriorityS] = useState(4)
  const [projectS, setProjectS] = useState(defaultProjectId || 'entrada')
  const [sectionS, setSectionS] = useState(defaultSection || '')
  const [repeatS, setRepeatS] = useState('')
  const [taskTimeS, setTaskTimeS] = useState('')
  const [reminderS, setReminderS] = useState('')
  // Compromisso começa como dia inteiro; o horário é opcional.
  const [manageCategories, setManageCategories] = useState(false)
  const [allDayS, setAllDay] = useState(true)
  const [startS, setStartS] = useState('09:00')
  const [endS, setEndS] = useState('10:00')
  const [place, setPlace] = useState('')
  const [category, setCategory] = useState<EventCategory | null>(null)
  const [amountS, setAmountS] = useState('')
  const [finType, setFinType] = useState<'despesa' | 'receita'>('despesa')
  const [accountId, setAccountId] = useState('')
  const [picker, setPicker] = useState<Picker>('')
  const anchor = useRef<HTMLElement | null>(null)
  const open = (which: Picker) => (event: ReactMouseEvent<HTMLElement>) => { anchor.current = event.currentTarget; setPicker(which) }

  const projects = rows(state.projects).filter(item => item.ativo !== false)
  const accounts = rows((state.finance as Row | undefined)?.accounts)

  // Linguagem natural: o que for digitado no nome vira data, horário, prioridade etc.
  const [muted, setMuted] = useState<Set<NlKind>>(new Set())
  const [caret, setCaret] = useState(0)
  const [suggestIndex, setSuggestIndex] = useState(0)
  const nl = useMemo(() => parseNatural(title, { today, projects, ignore: muted, kinds: kind === 'task' ? ['date', 'time', 'priority', 'repeat', 'reminder', 'project'] : kind === 'event' ? ['date', 'time', 'end', 'repeat'] : ['date', 'amount'] }), [title, today, projects, muted, kind]) // eslint-disable-line react-hooks/exhaustive-deps
  const mute = (which: NlKind) => setMuted(current => (current.has(which) ? current : new Set(current).add(which)))
  const fromNl = (which: NlKind) => nl.tokens.some(token => token.kind === which)
  /** O ×: desfaz o que foi entendido (a palavra volta ao nome). */
  const undoNl = (which: NlKind) => (event: ReactMouseEvent) => { event.stopPropagation(); mute(which) }

  const dateBase = nl.date ?? dateS
  const setDate = (value: string) => { setDateS(value); mute('date') }
  const priority = nl.priority ?? priorityS
  const setPriority = (value: number) => { setPriorityS(value); mute('priority') }
  const projectId = nl.projectId ?? projectS
  const section = nl.projectId ? (nl.section || '') : sectionS
  const setProjectId = (value: string) => { setProjectS(value); mute('project') }
  const setSection = (value: string) => { setSectionS(value) }
  const repeat = nl.repeat ?? repeatS
  const setRepeat = (value: string) => { setRepeatS(value); mute('repeat') }
  const taskTime = kind === 'task' ? (nl.time ?? taskTimeS) : taskTimeS
  const setTaskTime = (value: string) => { setTaskTimeS(value); mute('time') }
  const date = dateBase || (kind === 'task' && taskTime ? today : '')
  const reminder = nl.reminder ?? reminderS
  const setReminder = (value: string) => { setReminderS(value); mute('reminder') }
  const allDay = allDayS && !(kind === 'event' && nl.time !== undefined)
  const start = kind === 'event' ? (nl.time ?? startS) : startS
  const setStart = (value: string) => { setStartS(value); mute('time') }
  const end = kind === 'event' ? (nl.end ?? endS) : endS
  const setEnd = (value: string) => { setEndS(value); mute('end') }
  const amount = nl.amount !== undefined ? String(nl.amount).replace('.', ',') : amountS
  const setAmount = (value: string) => { setAmountS(value); mute('amount') }
  const cleanTitle = nl.title.trim() || title.trim()
  const project = projects.find(item => String(item.id) === projectId)

  // Sugestões ao digitar #, ! ou @.
  const word = useMemo(() => {
    const upto = title.slice(0, caret)
    const startAt = Math.max(upto.lastIndexOf(' '), upto.lastIndexOf('\n')) + 1
    const text = upto.slice(startAt)
    return /^[#!@]/.test(text) ? { start: startAt, end: caret, text } : null
  }, [title, caret])
  const suggestions = useMemo(() => {
    if (!word || kind === 'finance') return []
    const query = fold(word.text.slice(1))
    if (word.text.startsWith('#') && kind === 'task') {
      const list: Array<{ label: string; insert: string; icon: string }> = []
      for (const item of projects) {
        const name = String(item.nome || '')
        const parent = projects.find(other => String(other.id) === String(item.parent_id || ''))
        const path = parent ? `${String(parent.nome)}/${name}` : name
        if (!query || fold(path).includes(query)) list.push({ label: path, insert: `#${path}`, icon: 'folder' })
        for (const sec of Array.isArray(item.secoes) ? item.secoes.map(String) : []) {
          if (query && !fold(`${path}/${sec}`).includes(query)) continue
          list.push({ label: `${path}/${sec}`, insert: `#${path}/${sec}`, icon: 'view_agenda' })
        }
      }
      return list.slice(0, 6)
    }
    if (word.text.startsWith('!') && kind === 'task') return ['alta', 'média', 'baixa'].filter(item => !query || fold(item).startsWith(query)).map(item => ({ label: item, insert: `!${item}`, icon: 'flag' }))
    if (word.text.startsWith('@') && kind === 'task') return ['10min', '30min', '1h', '1d'].filter(item => !query || item.startsWith(query)).map(item => ({ label: `${item} antes`, insert: `@${item}`, icon: 'notifications' }))
    return []
  }, [word, projects, kind])
  const applySuggestion = (index: number) => {
    const item = suggestions[index]
    if (!word || !item) return
    const next = replaceRange(title, word.start, word.end, `${item.insert} `)
    setTitle(next)
    setCaret(word.start + item.insert.length + 1)
    setSuggestIndex(0)
  }
  const titleKeys = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length) {
      if (event.key === 'ArrowDown') { event.preventDefault(); setSuggestIndex(index => (index + 1) % suggestions.length); return }
      if (event.key === 'ArrowUp') { event.preventDefault(); setSuggestIndex(index => (index - 1 + suggestions.length) % suggestions.length); return }
      if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); applySuggestion(suggestIndex); return }
    }
    if (event.key === 'Enter') { event.preventDefault(); submit() }
  }

  // Evento sem data usa o dia de hoje; tarefa pode ficar sem data.
  const eventDate = date || today

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const switchKind = (next: QuickAddKind) => {
    if (next === 'finance' && !inline) { onClose(); onFinance(); return }
    if (next === kind) return
    setKind(next)
    setPicker('')
    if (next === 'event' && !date) setDate(today)
  }

  const submit = () => {
    const name = cleanTitle
    if (!name) return
    if (kind === 'finance') {
      const value = Math.abs(Number(String(amount).replace(',', '.')) || 0)
      const entry: Row = {
        id: uid('fin'), titulo: name, observacao: '', valor: value, valor_pago: 0, tipo: finType, data: date || today, status: 'pendente',
        categoria: '', conta_id: accountId, cartao_id: '', anexos: [], pagamentos: [], ignorar_calculo: false, recorrencia: 'unico',
      }
      commit(current => ({ ...current, finance: { ...current.finance, transactions: [entry, ...rows(current.finance.transactions)] } }))
    } else if (kind === 'task') {
      const task: Row = {
        id: uid('t'), titulo: name, descricao: description.trim(), data_vencimento: date ? `${date}${taskTime ? `T${taskTime}` : ''}` : '', prioridade: priority, concluida: false,
        projeto_id: projectId, parent_id: parentId || '', secao: section, criado_em: new Date().toISOString(), ordem: Date.now(),
        notas: [], anexos: [], subtarefas: [], lembretes: reminder ? [reminder] : [], etiquetas: [], repeticao: repeat, ocultar_agenda: false,
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
  const repeatLabel = repeat ? repeatText(repeat) : 'Repetir'

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
          <div className={styles.titleWrap}>
            <div className={styles.titleMirror} aria-hidden="true">
              {(() => {
                const parts: Array<string | { text: string }> = []
                let cursor = 0
                for (const token of nl.tokens) {
                  parts.push(title.slice(cursor, token.start))
                  parts.push({ text: title.slice(token.start, token.end) })
                  cursor = token.end
                }
                parts.push(title.slice(cursor))
                return parts.map((part, index) => typeof part === 'string' ? <span key={index}>{part}</span> : <mark key={index}>{part.text}</mark>)
              })()}
            </div>
            <input
              autoFocus
              className={styles.title}
              value={title}
              placeholder={kind === 'task' ? (parentId ? 'Nome da subtarefa' : 'Nome da tarefa') : kind === 'finance' ? 'Nome do lançamento' : 'Nome do compromisso'}
              enterKeyHint="done"
              onChange={event => { setTitle(event.target.value); setCaret(event.target.selectionStart ?? event.target.value.length); setSuggestIndex(0) }}
              onSelect={event => setCaret(event.currentTarget.selectionStart ?? 0)}
              onKeyDown={titleKeys}
            />
            {suggestions.length ? (
              <div className={styles.suggest} role="listbox">
                {suggestions.map((item, index) => (
                  <button key={item.insert} type="button" role="option" aria-selected={index === suggestIndex} data-active={index === suggestIndex || undefined} onMouseDown={event => event.preventDefault()} onClick={() => applySuggestion(index)}>
                    <Icon name={item.icon} size={16} filled={false} />{item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <textarea className={styles.description} value={description} rows={inline ? 1 : 2} placeholder="Descrição" onChange={event => setDescription(event.target.value)} />
          {kind === 'finance' ? (
            <label className={styles.place}>
              <Icon name="payments" size={16} filled={false} />
              <input value={amount} inputMode="decimal" placeholder="Valor (R$)" onChange={event => setAmount(event.target.value)} />
            </label>
          ) : null}

          {kind === 'event' ? (
            <label className={styles.place}>
              <Icon name="location_on" size={16} filled={false} />
              <input value={place} placeholder="Local" onChange={event => setPlace(event.target.value)} />
            </label>
          ) : null}
        </div>

        <div className={styles.footer}>
          <div className={styles.chips}>
            <button type="button" className={styles.chip} data-set={date || undefined} data-late={(kind === 'task' && date && date < today) || undefined} style={{ '--chip-color': 'var(--ds-warn)' } as CSSProperties} onClick={open('date')}>
              <Icon name="event" size={16} filled={false} />{naturalDate(kind === 'event' ? eventDate : kind === 'finance' ? (date || today) : date, today)}{fromNl('date') ? <span className={styles.chipX} role="button" aria-label="Desfazer" title="Desfazer" onClick={undoNl('date')}>×</span> : null}
            </button>

            {kind === 'finance' ? (
              <>
                <button type="button" className={styles.chip} data-set style={{ '--chip-color': finType === 'receita' ? 'var(--ds-success)' : 'var(--ds-danger)' } as CSSProperties} onClick={open('ftype')}>
                  <Icon name={finType === 'receita' ? 'trending_up' : 'trending_down'} size={16} filled={false} />{finType === 'receita' ? 'Receita' : 'Despesa'}
                </button>
                {accounts.length ? (
                  <button type="button" className={styles.chip} data-set={accountId || undefined} onClick={open('account')}>
                    <Icon name="account_balance" size={16} filled={false} /><span>{String(accounts.find(item => String(item.id) === accountId)?.nome || 'Conta')}</span>
                  </button>
                ) : null}
              </>
            ) : kind === 'task' ? (
              <>
                <button type="button" className={styles.chip} data-set={taskTime || undefined} style={{ '--chip-color': 'var(--ds-lilac-fg)' } as CSSProperties} onClick={open('time')}>
                  <Icon name="schedule" size={16} filled={false} />{taskTime || 'Horário'}{fromNl('time') ? <span className={styles.chipX} role="button" aria-label="Desfazer" title="Desfazer" onClick={undoNl('time')}>×</span> : null}
                </button>
                <button type="button" className={styles.chip} data-set={priority < 4 || undefined} style={PRIORITY_COLOR[priority] ? ({ '--chip-color': PRIORITY_COLOR[priority] } as CSSProperties) : undefined} onClick={open('priority')}>
                  <Icon name="flag" size={16} filled={priority < 4} />{priority < 4 ? PRIORITIES[priority - 1].label : 'Prioridade'}{fromNl('priority') ? <span className={styles.chipX} role="button" aria-label="Desfazer" title="Desfazer" onClick={undoNl('priority')}>×</span> : null}
                </button>
                <button type="button" className={styles.chip} data-set={reminder || undefined} style={{ '--chip-color': 'var(--ds-sky-fg)' } as CSSProperties} onClick={open('reminder')}>
                  <Icon name="notifications" size={16} filled={false} />{reminder ? reminderLabel(reminder) : 'Lembrete'}{fromNl('reminder') ? <span className={styles.chipX} role="button" aria-label="Desfazer" title="Desfazer" onClick={undoNl('reminder')}>×</span> : null}
                </button>
                <button type="button" className={styles.chip} data-set={projectId !== 'entrada' || undefined} style={{ '--chip-color': String(project?.cor || 'var(--ds-text-2)') } as CSSProperties} onClick={open('project')}>
                  {project?.imagem_url ? <img className={styles.chipImg} src={driveAssetUrl(project.imagem_url)} alt="" /> : <Icon name={projectId === 'entrada' ? 'inbox' : String(project?.icone || 'folder')} size={16} filled={false} />}
                  <span>{projectId === 'entrada' ? 'Entrada' : String(project?.nome || 'Projeto')}{section ? ` › ${section}` : ''}</span>{fromNl('project') ? <span className={styles.chipX} role="button" aria-label="Desfazer" title="Desfazer" onClick={undoNl('project')}>×</span> : null}
                </button>
              </>
            ) : (
              <>
                <button type="button" className={styles.chip} data-set={category ? true : undefined} style={category ? ({ '--chip-color': category.cor } as CSSProperties) : undefined} onClick={open('category')}>
                  <Icon name="sell" size={16} filled={Boolean(category)} /><span>{category?.nome || 'Categoria'}</span>
                </button>
                <button type="button" className={styles.chip} data-set={allDay || undefined} onClick={() => setAllDay(!allDay)}>
                  <Icon name="wb_sunny" size={16} filled={false} />Dia inteiro
                </button>
                {allDay ? (
                  <button type="button" className={styles.chip} onClick={() => setAllDay(false)}><Icon name="schedule" size={16} filled={false} />Horário</button>
                ) : (
                  <>
                    <button type="button" className={styles.chip} data-set onClick={open('start')}><Icon name="schedule" size={16} filled={false} />{start || 'Início'}</button>
                    <button type="button" className={styles.chip} data-set onClick={open('end')}><Icon name="arrow_right_alt" size={16} filled={false} />{end || 'Fim'}</button>
                  </>
                )}
              </>
            )}

            {kind === 'finance' ? null : (
              <button type="button" className={styles.chip} data-set={repeat || undefined} style={{ '--chip-color': 'var(--ds-mint-fg)' } as CSSProperties} onClick={open('repeat')}>
                <Icon name="repeat" size={16} filled={false} />{repeatLabel}{fromNl('repeat') ? <span className={styles.chipX} role="button" aria-label="Desfazer" title="Desfazer" onClick={undoNl('repeat')}>×</span> : null}
              </button>
            )}
          </div>
          <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={onClose}>Cancelar</button>
          <button type="button" className={styles.primary} disabled={!cleanTitle} onClick={submit}>{kind === 'task' ? (parentId ? 'Adicionar subtarefa' : 'Adicionar tarefa') : kind === 'finance' ? 'Adicionar lançamento' : 'Adicionar compromisso'}</button>
          </div>
        </div>
      </div>

      {picker === 'date' ? (
        <Floating anchor={anchor} title="Data" width={300} onClose={() => setPicker('')}>
          <DatePicker value={kind === 'event' ? eventDate : kind === 'finance' ? (date || today) : date} today={today} allowEmpty={kind === 'task'} onSelect={value => done(() => setDate(value))} />
        </Floating>
      ) : null}
      {picker === 'ftype' ? (
        <Floating anchor={anchor} title="Tipo" width={220} onClose={() => setPicker('')}>
          <OptionList options={[{ value: 'despesa', label: 'Despesa', icon: 'trending_down', color: 'var(--ds-danger)' }, { value: 'receita', label: 'Receita', icon: 'trending_up', color: 'var(--ds-success)' }]} value={finType} onSelect={value => done(() => setFinType(value === 'receita' ? 'receita' : 'despesa'))} />
        </Floating>
      ) : null}
      {picker === 'account' ? (
        <Floating anchor={anchor} title="Conta" width={240} onClose={() => setPicker('')}>
          <OptionList options={[{ value: '', label: 'Sem conta', icon: 'horizontal_rule' }, ...accounts.map(item => ({ value: String(item.id), label: String(item.nome || 'Conta'), icon: 'account_balance' }))]} value={accountId} onSelect={value => done(() => setAccountId(value))} />
        </Floating>
      ) : null}
      {picker === 'priority' ? (
        <Floating anchor={anchor} title="Prioridade" onClose={() => setPicker('')}>
          <OptionList options={PRIORITIES} value={String(priority)} onSelect={value => done(() => setPriority(Number(value)))} />
        </Floating>
      ) : null}
      {picker === 'time' ? (
        <Floating anchor={anchor} title="Horário" width={260} onClose={() => setPicker('')}>
          <TimePicker value={taskTime} onSelect={value => done(() => { setTaskTime(value); if (value && !date) setDate(today) })} />
        </Floating>
      ) : null}
      {picker === 'reminder' ? (
        <Floating anchor={anchor} title="Lembrete" width={280} onClose={() => setPicker('')}>
          <ReminderPicker value={reminder} onSelect={value => done(() => setReminder(value))} />
        </Floating>
      ) : null}
      {picker === 'project' ? (
        <Floating anchor={anchor} title="Projeto" width={280} onClose={() => setPicker('')}>
          <ProjectPicker projects={projects} projectId={projectId} section={section} imageOf={item => item.imagem_url ? driveAssetUrl(item.imagem_url) : undefined} onSelect={(id, name) => done(() => { setProjectId(id); setSection(name) })} />
        </Floating>
      ) : null}
      {manageCategories ? <CategoryManager state={state} commit={commit} onClose={() => setManageCategories(false)} /> : null}
      {picker === 'category' ? (
        <Floating anchor={anchor} title="Categoria" width={270} onClose={() => setPicker('')}>
          <CategoryChooser
            categories={eventCategories(state)}
            value={category?.nome || ''}
            onSelect={value => done(() => setCategory(value))}
            onCreate={value => { commit(current => withEventCategory(current, value)); done(() => setCategory(value)) }}
            onManage={() => { setPicker(''); setManageCategories(true) }}
          />
        </Floating>
      ) : null}
      {picker === 'repeat' ? (
        <Floating anchor={anchor} title="Repetição" width={280} onClose={() => setPicker('')}>
          <RepeatPicker value={repeat} onSelect={value => done(() => setRepeat(value))} />
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
