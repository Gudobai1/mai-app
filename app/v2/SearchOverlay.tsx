'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { fold, parseNatural, type NlKind } from '../../lib/v2/nlp'
import type { MaiState } from '../../lib/v2/state'
import { Icon } from '../ds'
import type { Row } from './app-types'
import type { InspectableItem } from './ContextDrawer'
import styles from './SearchOverlay.module.css'
import { PRIORITY_COLOR } from '../ds/priority'

/*
 * Busca do MAI: uma janela no centro, aberta com Ctrl Espaço ou "/".
 * Entende a mesma linguagem de adicionar (hoje, esta semana, !alta, #Projeto):
 * o que for reconhecido vira filtro; o resto é a palavra procurada.
 */

type Kind = 'task' | 'event' | 'note' | 'finance' | 'habit' | 'goal' | 'project'
type Tab = 'all' | Kind
type Result = { key: string; kind: Kind; id: string; title: string; meta: string; icon: string; color: string; raw: Row; score: number; done?: boolean }

const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : [])
const plain = (value: unknown) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

const KINDS: Record<Kind, { label: string; plural: string; icon: string; color: string }> = {
  task: { label: 'Tarefa', plural: 'Tarefas', icon: 'check_circle', color: 'var(--ds-accent)' },
  event: { label: 'Compromisso', plural: 'Compromissos', icon: 'event', color: 'var(--ds-sky-fg)' },
  note: { label: 'Nota', plural: 'Notas', icon: 'description', color: 'var(--ds-mint-fg)' },
  finance: { label: 'Lançamento', plural: 'Finanças', icon: 'payments', color: 'var(--ds-peach-fg)' },
  habit: { label: 'Hábito', plural: 'Hábitos', icon: 'repeat', color: 'var(--ds-lilac-fg)' },
  goal: { label: 'Meta', plural: 'Metas', icon: 'flag', color: 'var(--ds-warn)' },
  project: { label: 'Projeto', plural: 'Projetos', icon: 'folder', color: 'var(--ds-text-2)' },
}
const PRIORITY_LABEL: Record<number, string> = { 1: 'Alta', 2: 'Média', 3: 'Baixa' }

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
function dayLabel(key: string, today: string) {
  if (!key) return ''
  const add = (days: number) => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  if (key === today) return 'hoje'
  if (key === add(1)) return 'amanhã'
  if (key === add(-1)) return 'ontem'
  return `${Number(key.slice(8))} ${MONTHS[Number(key.slice(5, 7)) - 1]}${key.slice(0, 4) !== today.slice(0, 4) ? ` ${key.slice(0, 4)}` : ''}`
}

/** Destaca no texto as palavras procuradas. */
function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>
  const folded = fold(text)
  const marks: Array<[number, number]> = []
  for (const word of words) {
    let from = 0
    for (;;) {
      const at = folded.indexOf(word, from)
      if (at < 0) break
      marks.push([at, at + word.length])
      from = at + word.length
    }
  }
  if (!marks.length) return <>{text}</>
  marks.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const mark of marks) {
    const last = merged[merged.length - 1]
    if (last && mark[0] <= last[1]) last[1] = Math.max(last[1], mark[1])
    else merged.push([...mark])
  }
  const parts: ReactNode[] = []
  let cursor = 0
  merged.forEach(([a, b], index) => {
    parts.push(text.slice(cursor, a))
    parts.push(<mark key={index}>{text.slice(a, b)}</mark>)
    cursor = b
  })
  parts.push(text.slice(cursor))
  return <>{parts}</>
}

type Props = {
  state: MaiState
  today: string
  query: string
  setQuery: (value: string) => void
  onClose: () => void
  inspect: (item: InspectableItem) => void
  navigate: (view: import('./app-types').AppView) => void
  openProject: (projectId: string) => void
  commit: (change: (current: MaiState) => MaiState) => void
}

export function SearchOverlay({ state, today, query, setQuery, onClose, inspect, openProject, commit }: Props) {
  const tab = 'all' as Tab
  const [active, setActive] = useState(0)
  const [muted, setMuted] = useState<Set<NlKind>>(new Set())
  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const projects = useMemo(() => rows(state.projects).filter(project => project.ativo !== false), [state.projects])
  const nl = useMemo(() => parseNatural(query, { today, projects, ignore: muted, kinds: ['date', 'priority', 'project', 'range'] }), [query, today, projects, muted])
  const words = useMemo(() => fold(nl.title).split(/\s+/).filter(Boolean), [nl.title])
  const hasFilter = Boolean(nl.date || nl.range || nl.priority || nl.projectId || nl.overdue)
  const projectName = (id: unknown) => {
    const project = projects.find(item => String(item.id) === String(id || ''))
    if (!project) return 'Entrada'
    const parent = projects.find(item => String(item.id) === String(project.parent_id || ''))
    return parent ? `${String(parent.nome)} › ${String(project.nome)}` : String(project.nome)
  }

  const results = useMemo(() => {
    if (!words.length && !hasFilter) return [] as Result[]
    const inProject = (id: string) => {
      if (!nl.projectId) return true
      let current = projects.find(item => String(item.id) === id)
      let guard = 0
      while (current && guard++ < 8) {
        if (String(current.id) === nl.projectId) return true
        current = projects.find(item => String(item.id) === String(current?.parent_id || ''))
      }
      return false
    }
    const dateOk = (key: string, done?: boolean) => {
      if (nl.date && key !== nl.date) return false
      if (nl.range && !(key && key >= nl.range.from && key <= nl.range.to)) return false
      if (nl.overdue && !(key && key < today && !done)) return false
      return true
    }
    const needsDate = Boolean(nl.date || nl.range || nl.overdue)
    const textOk = (...values: unknown[]) => {
      if (!words.length) return true
      const hay = fold(values.map(plain).join(' '))
      return words.every(word => hay.includes(word))
    }
    const score = (title: string) => {
      const t = fold(title)
      if (!words.length) return 0
      return (t.startsWith(words[0]) ? 3 : 0) + (words.every(word => t.includes(word)) ? 2 : 0)
    }
    const out: Result[] = []
    const push = (kind: Kind, id: unknown, title: string, meta: string, raw: Row, extra: Partial<Result> = {}) =>
      out.push({ key: `${kind}-${String(id)}`, kind, id: String(id), title, meta, icon: KINDS[kind].icon, color: KINDS[kind].color, raw, score: score(title), ...extra })

    for (const task of rows(state.tasks)) {
      const due = String(task.data_vencimento || '').slice(0, 10)
      if (!textOk(task.titulo, task.descricao) || !dateOk(due, Boolean(task.concluida))) continue
      if (nl.priority && Number(task.prioridade || 4) !== nl.priority) continue
      if (!inProject(String(task.projeto_id || 'entrada'))) continue
      const time = String(task.data_vencimento || '').includes('T') ? String(task.data_vencimento).slice(11, 16) : ''
      const priority = Number(task.prioridade || 4)
      const meta = [projectName(task.projeto_id) + (task.secao ? ` › ${String(task.secao)}` : ''), due ? `${dayLabel(due, today)}${time ? ` ${time}` : ''}` : 'sem data', PRIORITY_LABEL[priority] || ''].filter(Boolean).join(' · ')
      push('task', task.id, String(task.titulo || 'Tarefa'), meta, task, { done: Boolean(task.concluida), color: PRIORITY_COLOR[priority] || KINDS.task.color, score: score(String(task.titulo || '')) - (task.concluida ? 4 : 0) })
    }
    if (!nl.priority && !nl.projectId) {
      for (const event of rows(state.events)) {
        const day = String(event.data_inicio || '').slice(0, 10)
        if (!textOk(event.titulo, event.descricao, event.local) || !dateOk(day)) continue
        push('event', event.id, String(event.titulo || 'Compromisso'), [dayLabel(day, today), String(event.hora_inicio || '').slice(0, 5), String(event.calendario_nome || event.categoria || '')].filter(Boolean).join(' · '), event)
      }
      for (const entry of rows(state.finance?.transactions)) {
        const day = String(entry.data || '').slice(0, 10)
        if (!textOk(entry.titulo, entry.observacao, entry.categoria) || !dateOk(day)) continue
        push('finance', entry.id, String(entry.titulo || 'Lançamento'), [dayLabel(day, today), entry.tipo === 'receita' ? 'Receita' : 'Despesa', Number(entry.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })].filter(Boolean).join(' · '), entry)
      }
    }
    if (!hasFilter) {
      for (const note of rows(state.notes)) if (textOk(note.titulo, note.conteudo)) push('note', note.id, String(note.titulo || 'Nota'), plain(note.conteudo).slice(0, 80) || 'Nota', note)
      for (const habit of rows(state.habits)) if (textOk(habit.nome)) push('habit', habit.id, String(habit.nome), 'Hábito', habit)
      for (const goal of rows(state.goals)) if (textOk(goal.titulo, goal.descricao)) push('goal', goal.id, String(goal.titulo || 'Meta'), 'Meta', goal)
      for (const project of projects) if (textOk(project.nome)) push('project', project.id, String(project.nome), projectName(project.id) === String(project.nome) ? 'Projeto' : `Subprojeto de ${projectName(project.parent_id)}`, project)
    }
    return out.sort((a, b) => b.score - a.score)
  }, [words, hasFilter, nl, state, projects, today]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    if (tab !== 'all') return results.filter(result => result.kind === tab).slice(0, 50)
    // Em "Tudo", cada tipo mostra os melhores; escolher o tipo mostra o resto.
    const counts: Record<string, number> = {}
    return results.filter(result => { counts[result.kind] = (counts[result.kind] || 0) + 1; return counts[result.kind] <= 6 })
  }, [results, tab])

  const title = nl.title.trim()
  const canCreate = Boolean(title) && (tab === 'all' || tab === 'task')
  const total = visible.length + (canCreate ? 1 : 0)

  useEffect(() => { setActive(0) }, [query, tab])
  useEffect(() => { listRef.current?.querySelector('[data-active]')?.scrollIntoView({ block: 'nearest' }) }, [active])

  function close() {
    setQuery('')
    onClose()
  }

  function open(result: Result) {
    close()
    if (result.kind === 'project') { openProject(result.id); return }
    inspect({ kind: result.kind as InspectableItem['kind'], sourceId: result.id, title: result.title, date: String(result.raw.data_vencimento || result.raw.data_inicio || result.raw.data || result.raw.prazo || '').slice(0, 10), raw: result.raw })
  }

  function create() {
    if (!title) return
    const date = nl.date || ''
    const task: Row = {
      id: `t-${crypto.randomUUID()}`, titulo: title, descricao: '', data_vencimento: date, prioridade: nl.priority || 4, concluida: false,
      projeto_id: nl.projectId || 'entrada', parent_id: '', secao: nl.section || '', criado_em: new Date().toISOString(), ordem: Date.now(),
      notas: [], anexos: [], subtarefas: [], lembretes: [], etiquetas: [], repeticao: '', ocultar_agenda: false,
    }
    commit(current => ({ ...current, tasks: [...current.tasks, task as (typeof current.tasks)[number]] }))
    close()
  }

  function onKey(event: React.KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); close(); return }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => (total ? (index + 1) % total : 0)); return }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => (total ? (index - 1 + total) % total : 0)); return }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (active < visible.length) open(visible[active])
      else if (canCreate) create()
    }
  }

  const chipLabel = (kind: NlKind, value: string) => {
    if (kind === 'priority') return PRIORITY_LABEL[Number(value)] || 'Sem prioridade'
    if (kind === 'project') return projectName(value.split('|')[0])
    if (kind === 'range') return value === 'atrasadas' ? 'Atrasadas' : (query.slice(nl.tokens.find(token => token.kind === 'range')?.start, nl.tokens.find(token => token.kind === 'range')?.end) || 'Período')
    return dayLabel(value, today)
  }
  const chipIcon: Record<string, string> = { date: 'event', range: 'date_range', priority: 'flag', project: 'folder' }

  const createSummary = [nl.date ? dayLabel(nl.date, today) : '', nl.priority ? PRIORITY_LABEL[nl.priority] || '' : '', nl.projectId ? projectName(nl.projectId) : ''].filter(Boolean).join(', ')

  return (
    <div className={styles.layer} onMouseDown={close}>
      <section className={styles.panel} role="dialog" aria-label="Buscar" onMouseDown={event => event.stopPropagation()} onKeyDown={onKey}>
        <header className={styles.header}>
          <Icon name="search" size={20} filled={false} className={styles.searchIcon} />
          <input
            ref={inputRef}
            autoFocus
            className={styles.input}
            value={query}
            onChange={event => { setQuery(event.target.value); setMuted(new Set()) }}
            placeholder="Buscar ou criar…"
            aria-label="Buscar"
          />
          {nl.tokens.map(token => (
            <span key={`${token.kind}-${token.start}`} className={styles.filter}>
              <Icon name={chipIcon[token.kind] || 'event'} size={14} filled={false} />{chipLabel(token.kind, token.value)}
              <button type="button" aria-label="Remover filtro" onClick={() => setMuted(current => new Set(current).add(token.kind))}>×</button>
            </span>
          ))}
        </header>

        <div ref={listRef} className={styles.list}>
          {!words.length && !hasFilter ? (
            <p className={styles.tips}>Digite para buscar. Use hoje, !alta, #Projeto para filtrar.</p>
          ) : null}

          {(words.length || hasFilter) && !visible.length && !canCreate ? <p className={styles.empty}>Nada encontrado.</p> : null}

          {visible.map((result, index) => {
            const showHead = index === 0 || visible[index - 1].kind !== result.kind
            return (
              <div key={result.key}>
                {showHead && tab === 'all' ? <div className={styles.group}>{KINDS[result.kind].plural}</div> : null}
                <button type="button" className={styles.row} data-active={index === active || undefined} data-done={result.done || undefined} onMouseMove={() => setActive(index)} onClick={() => open(result)}>
                  <span className={styles.rowIcon} style={{ color: result.color }}><Icon name={result.icon} size={18} filled={false} /></span>
                  <span className={styles.rowText}>
                    <span className={styles.rowTitle}><Highlight text={result.title} words={words} /></span>
                    <span className={styles.rowMeta}>{result.meta}</span>
                  </span>
                </button>
              </div>
            )
          })}

          {canCreate ? (
            <button type="button" className={`${styles.row} ${styles.create}`} data-active={active === visible.length || undefined} onMouseMove={() => setActive(visible.length)} onClick={create}>
              <span className={styles.rowIcon}><Icon name="add" size={18} filled={false} /></span>
              <span className={styles.rowText}><span className={styles.rowTitle}>Criar tarefa “{title}”</span>{createSummary ? <span className={styles.rowMeta}>{createSummary}</span> : null}</span>
            </button>
          ) : null}
        </div>

      </section>
    </div>
  )
}
