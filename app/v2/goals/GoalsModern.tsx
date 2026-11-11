'use client'

import { Fragment, type DragEvent, useEffect, useRef, useState } from 'react'
import { Icon, SectionAdder, useDragScroll } from '../../ds'
import { GOAL_STATUS, goalAmountText, goalCategories, goalColor, goalDone, goalDue, goalDueInfo, goalPaused, goalPct, goalType, GOAL_TYPES, toggleGoalInState, withSteps, sortGoals, type GoalSort } from '../../../lib/v2/goals'
import { addDays } from '../../../lib/v2/planner'
import { showCompleted } from '../../../lib/v2/show-completed'
import type { MaiState } from '../../../lib/v2/state'
import type { InspectableItem } from '../ContextDrawer'
import { GoalCard } from './GoalCard'
import { GoalsReport } from './GoalsReport'
import styles from './GoalsModern.module.css'

type Row = Record<string, any>
type Commit = (change: (current: MaiState) => MaiState) => void
const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : [])
const uid = () => `meta-${crypto.randomUUID()}`
const record = (value: unknown): Record<string, any> => (value && typeof value === 'object' ? (value as Record<string, any>) : {})

type Props = { state: MaiState; today: string; commit: Commit; createRequest?: string; inspect: (item: InspectableItem) => void }

/**
 * Metas — padrão do app: blocos só com linhas, `GoalCard` único, ajustes (concluídos, situação, ordem) no botão de ajustes do cabeçalho,
 * popup global (`ItemDetail`) para ver/editar. Não há painel nem gaveta própria do módulo.
 */
export function GoalsModern({ state, today, commit, createRequest, inspect }: Props) {
  const goals = rows(state.goals).map(goal => withSteps(goal, state.tasks))
  const [adding, setAdding] = useState<string | null>(null)
    const [renaming, setRenaming] = useState<string | null>(null)
  const categories = goalCategories(state.configs)
  const grab = useDragScroll()
  const showDone = showCompleted(state, 'goals')
  const control = record(record(state.configs.moduleControls).goals)
  const filter = record(record(state.configs.moduleFilters).goals)
  const sort = String(control.sort || 'date') as GoalSort
  const group = String(control.group || 'status')
  const view = String(state.configs.goalsView || 'list')
  const board = view === 'board'
  const status = String(filter.status || 'all')
  const typeFilter = String(filter.type || 'all')
  const priority = String(filter.priority || 'all')

  useEffect(() => { if (createRequest?.startsWith('goals:')) setAdding('__first') }, [createRequest])

  const open = (goal: Row) => inspect({ kind: 'goal', sourceId: String(goal.id), title: String(goal.titulo || 'Meta'), date: goalDue(goal), raw: goal })
  const toggle = (goal: Row) => commit(current => toggleGoalInState(current, String(goal.id), !goalDone(goal)))
  const add = (titulo: string, categoria = '') => {
    const goal = { id: uid(), titulo, tipo: 'percentual', status: GOAL_STATUS.active, prazo: '', progresso_atual: 0, progresso_total: 100, descricao: '', prioridade: 4, anexos: [], concluida: false, ...(categoria ? { categoria } : {}) }
    commit(current => ({ ...current, goals: [goal, ...rows(current.goals)] }))
  }
  const setCategories = (change: (list: { id: string; nome: string }[]) => { id: string; nome: string }[], clearId?: string) => commit(current => ({
    ...current,
    configs: { ...current.configs, goalCategories: change(goalCategories(current.configs)) },
    goals: clearId ? rows(current.goals).map(goal => String(goal.categoria || '') === clearId ? { ...goal, categoria: '' } : goal) : current.goals,
  }))
  const addCategory = (nome: string, index = Infinity) => setCategories(list => { const at = Math.max(0, Math.min(index, list.length)); return [...list.slice(0, at), { id: `cat-${crypto.randomUUID()}`, nome }, ...list.slice(at)] })
  const renameCategory = (id: string, nome: string) => { const clean = nome.trim(); if (clean) setCategories(list => list.map(item => item.id === id ? { ...item, nome: clean } : item)); setRenaming(null) }
  const moveCategory = (id: string, to: number) => setCategories(list => {
    const from = list.findIndex(item => item.id === id)
    const at = Math.max(0, Math.min(to, list.length - 1))
    if (from < 0 || from === at) return list
    const next = [...list]
    const [item] = next.splice(from, 1)
    next.splice(at, 0, item)
    return next
  })
  const [dragCat, setDragCat] = useState('')
  const [overCat, setOverCat] = useState('')
  const dropProps = (block: { category?: string }) => block.category && byCategory ? {
    onDragOver: (event: DragEvent) => { if (dragCat && dragCat !== block.category) { event.preventDefault(); setOverCat(block.category || '') } },
    onDragLeave: () => setOverCat(''),
    onDrop: (event: DragEvent) => { event.preventDefault(); if (dragCat && block.category) moveCategory(dragCat, categories.findIndex(item => item.id === block.category)); setDragCat(''); setOverCat('') },
    'data-drop-over': overCat === block.category || undefined,
  } : {}
  const removeCategory = (id: string) => setCategories(list => list.filter(item => item.id !== id), id)

  const visible = goals.filter(goal =>
    (showDone || !goalDone(goal))
    && (status === 'all' || (status === 'paused' ? goalPaused(goal) : !goalPaused(goal)))
    && (typeFilter === 'all' || goalType(goal) === typeFilter)
    && (priority === 'all' || Number(goal.prioridade || 4) === Number(priority)))

  type Block = { id: string; title: string; list: Row[]; always?: boolean; category?: string }
  const periodOf = (goal: Row) => {
    const due = goalDue(goal)
    return !due ? 'none' : due < today ? 'late' : due === today ? 'today' : due <= addDays(today, 7) ? 'week' : 'later'
  }
  const byCategory = !board && group === 'category'
  const knownCategory = (goal: Row) => categories.some(category => category.id === String(goal.categoria || ''))
  const blocks: Block[] = byCategory
    ? [
        ...categories.map(category => ({ id: category.id, title: category.nome, category: category.id, always: true, list: sortGoals(visible.filter(goal => String(goal.categoria || '') === category.id), sort) })),
        { id: 'none', title: categories.length ? 'Sem categoria' : 'Metas', category: '', always: !categories.length, list: sortGoals(visible.filter(goal => !knownCategory(goal)), sort) },
      ]
    : board
    ? [
        { id: 'active', title: 'Em andamento', list: sortGoals(visible.filter(goal => !goalPaused(goal) && !goalDone(goal)), sort), always: true },
        { id: 'paused', title: 'Pausadas', list: sortGoals(visible.filter(goal => goalPaused(goal) && !goalDone(goal)), sort), always: true },
        ...(showDone ? [{ id: 'done', title: 'Concluídas', list: sortGoals(visible.filter(goalDone), sort), always: true }] : []),
      ]
    : group === 'type'
      ? GOAL_TYPES.map(type => ({ id: type.value, title: type.label, list: sortGoals(visible.filter(goal => goalType(goal) === type.value), sort) }))
      : group === 'due'
        ? [['late', 'Atrasadas'], ['today', 'Hoje'], ['week', 'Próximos 7 dias'], ['later', 'Mais adiante'], ['none', 'Sem prazo']].map(([id, title]) => ({ id, title, list: sortGoals(visible.filter(goal => periodOf(goal) === id), sort) }))
        : [
            { id: 'active', title: 'Em andamento', list: sortGoals(visible.filter(goal => !goalPaused(goal)), sort), always: true },
            { id: 'paused', title: 'Pausadas', list: sortGoals(visible.filter(goalPaused), sort) },
          ]
  const shown = blocks.filter(block => block.always || block.list.length)
  const adder = byCategory ? undefined : (shown.find(block => block.id === 'active') || shown[0])

  const card = (goal: Row) => {
    const done = goalDone(goal)
    const info = goalDueInfo(goalDue(goal), today, done)
    return (
      <GoalCard
        key={String(goal.id)}
        title={String(goal.titulo || 'Meta')}
        due={info.label}
        tone={info.tone}
        amount={goalAmountText(goal)}
        pct={goalPct(goal)}
        done={done}
        paused={goalPaused(goal)}
        color={goalColor(goal)}
        ariaLabel={done ? `Reabrir ${String(goal.titulo || 'meta')}` : `Concluir ${String(goal.titulo || 'meta')}`}
        onToggle={() => toggle(goal)}
        onOpen={() => open(goal)}
      />
    )
  }
  const adderRow = (block: Block) => (adding === block.id || (adding === '__first' && (block === adder || (byCategory && block === shown[0])))) ? <Composer onAdd={title => add(title, block.category || '')} onClose={() => setAdding(null)} /> : (
    <button type="button" className={styles.addRow} onClick={() => setAdding(block.id)}>
      <Icon name="add" size={20} filled={false} /><span>Adicionar meta</span>
    </button>
  )
  const blockHead = (block: Block) => (
    <div className={styles.head}>
      {byCategory && block.category ? (
        renaming === block.id
          ? <input className={styles.headInput} defaultValue={block.title} autoFocus aria-label="Nome da categoria" onBlur={event => renameCategory(block.id, event.target.value)} onKeyDown={event => { if (event.key === 'Enter') renameCategory(block.id, (event.target as HTMLInputElement).value); if (event.key === 'Escape') setRenaming(null) }} />
          : <button type="button" className={styles.headTitleButton} onClick={() => setRenaming(block.id)} title="Renomear categoria">{block.title}</button>
      ) : <span className={styles.headTitle}>{block.title}</span>}
      <span className={styles.headCount}>{block.list.length}</span>
      {byCategory && block.category ? (
        <span className={styles.headTools}>
          <button type="button" className={styles.headTool} draggable onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', block.category || ''); setDragCat(block.category || '') }} onDragEnd={() => { setDragCat(''); setOverCat('') }} aria-label={`Arrastar categoria ${block.title}`} title="Arrastar para reordenar"><Icon name="drag_indicator" size={16} filled={false} /></button>
          <button type="button" className={styles.headTool} disabled={categories.findIndex(item => item.id === block.category) <= 0} onClick={() => moveCategory(block.category || '', categories.findIndex(item => item.id === block.category) - 1)} aria-label={board ? 'Mover para a esquerda' : 'Mover para cima'} title={board ? 'Mover para a esquerda' : 'Mover para cima'}><Icon name={board ? 'chevron_left' : 'arrow_upward'} size={16} filled={false} /></button>
          <button type="button" className={styles.headTool} disabled={categories.findIndex(item => item.id === block.category) >= categories.length - 1} onClick={() => moveCategory(block.category || '', categories.findIndex(item => item.id === block.category) + 1)} aria-label={board ? 'Mover para a direita' : 'Mover para baixo'} title={board ? 'Mover para a direita' : 'Mover para baixo'}><Icon name={board ? 'chevron_right' : 'arrow_downward'} size={16} filled={false} /></button>
        </span>
      ) : null}
      {byCategory && block.category ? <button type="button" className={styles.headRemove} data-after-tools onClick={() => removeCategory(block.id)} aria-label={`Excluir categoria ${block.title}`} title="Excluir categoria (as metas ficam sem categoria)"><Icon name="close" size={16} filled={false} /></button> : null}
    </div>
  )
  /* Nova categoria no ponto exato: antes do bloco i (categorias reais), "Sem categoria" fica por último. */
  const catIndex = (index: number) => Math.min(index, categories.length)
  const categoryAdder = (index: number, orientation: 'horizontal' | 'vertical' = 'horizontal') => byCategory ? <SectionAdder orientation={orientation} label="Adicionar categoria" placeholder="Nomear esta categoria" onAdd={nome => addCategory(nome, catIndex(index))} /> : null
  const emptyText = goals.length ? 'Nenhuma meta neste filtro.' : 'Nenhuma meta criada ainda.'

  if (view === 'report') return <GoalsReport goals={goals} categories={categories} today={today} onOpen={open} />

  if (board) {
    return (
      <div className={styles.page}>
        <div className={styles.board} data-grab {...grab}>
          {categoryAdder(0, 'vertical')}
          {shown.map((block, index) => (
            <Fragment key={block.id}>
              {index > 0 ? categoryAdder(index, 'vertical') : null}
              <section className={styles.column} aria-label={block.title} {...dropProps(block)}>
                {blockHead(block)}
                {block.list.length ? <div role="list">{block.list.map(card)}</div> : <div className={styles.empty}>{emptyText}</div>}
                {block === adder ? adderRow(block) : null}
              </section>
            </Fragment>
          ))}
          {categoryAdder(categories.length, 'vertical')}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {categoryAdder(0)}
      {shown.map((block, index) => (
        <Fragment key={block.id}>
          {index > 0 ? categoryAdder(index) : null}
          <section className={styles.block} aria-label={block.title} {...dropProps(block)}>
            {blockHead(block)}
            {block.list.length ? <div role="list">{block.list.map(card)}</div> : <div className={styles.empty}>{emptyText}</div>}
            {block === adder || byCategory ? adderRow(block) : null}
          </section>
        </Fragment>
      ))}
      {categoryAdder(categories.length)}
      {!shown.length ? <div className={styles.empty}>{emptyText}</div> : null}
    </div>
  )
}

/** Linha de criação rápida: Enter cria e continua; Esc fecha. Prazo, prioridade e metas ficam no popup. */
function Composer({ onAdd, onClose, placeholder = 'Nome da meta', label = 'Adicionar' }: { onAdd: (title: string) => void; onClose: () => void; placeholder?: string; label?: string }) {
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement | null>(null)
  useEffect(() => { input.current?.focus() }, [])
  const submit = () => { const title = value.trim(); if (!title) return; onAdd(title); setValue('') }
  return (
    <div className={styles.composer}>
      <input ref={input} className={styles.composerInput} value={value} placeholder={placeholder} aria-label={placeholder} onChange={event => setValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); submit() } if (event.key === 'Escape') onClose() }} />
      <button type="button" className={styles.composerButton} data-primary onClick={submit} disabled={!value.trim()}>{label} <Icon name="add" size={18} filled={false} /></button>
      <button type="button" className={styles.composerButton} onClick={onClose}>Cancelar</button>
    </div>
  )
}
