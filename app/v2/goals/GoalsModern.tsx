'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon, useDragScroll } from '../../ds'
import { GOAL_STATUS, goalAmountText, goalColor, goalDone, goalDue, goalDueInfo, goalPaused, goalPct, goalType, GOAL_TYPES, toggleGoalInState, withSteps, sortGoals, type GoalSort } from '../../../lib/v2/goals'
import { addDays } from '../../../lib/v2/planner'
import { showCompleted } from '../../../lib/v2/show-completed'
import type { MaiState } from '../../../lib/v2/state'
import type { InspectableItem } from '../ContextDrawer'
import { GoalCard } from './GoalCard'
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
  const [adding, setAdding] = useState(false)
  const grab = useDragScroll()
  const showDone = showCompleted(state, 'goals')
  const control = record(record(state.configs.moduleControls).goals)
  const filter = record(record(state.configs.moduleFilters).goals)
  const sort = String(control.sort || 'date') as GoalSort
  const group = String(control.group || 'status')
  const board = state.configs.goalsView === 'board'
  const status = String(filter.status || 'all')
  const typeFilter = String(filter.type || 'all')
  const priority = String(filter.priority || 'all')

  useEffect(() => { if (createRequest?.startsWith('goals:')) setAdding(true) }, [createRequest])

  const open = (goal: Row) => inspect({ kind: 'goal', sourceId: String(goal.id), title: String(goal.titulo || 'Meta'), date: goalDue(goal), raw: goal })
  const toggle = (goal: Row) => commit(current => toggleGoalInState(current, String(goal.id), !goalDone(goal)))
  const add = (titulo: string) => {
    const goal = { id: uid(), titulo, tipo: 'percentual', status: GOAL_STATUS.active, prazo: '', progresso_atual: 0, progresso_total: 100, descricao: '', prioridade: 4, anexos: [], concluida: false }
    commit(current => ({ ...current, goals: [goal, ...rows(current.goals)] }))
  }

  const visible = goals.filter(goal =>
    (showDone || !goalDone(goal))
    && (status === 'all' || (status === 'paused' ? goalPaused(goal) : !goalPaused(goal)))
    && (typeFilter === 'all' || goalType(goal) === typeFilter)
    && (priority === 'all' || Number(goal.prioridade || 4) === Number(priority)))

  type Block = { id: string; title: string; list: Row[]; always?: boolean }
  const periodOf = (goal: Row) => {
    const due = goalDue(goal)
    return !due ? 'none' : due < today ? 'late' : due === today ? 'today' : due <= addDays(today, 7) ? 'week' : 'later'
  }
  const blocks: Block[] = board
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
  const adder = shown.find(block => block.id === 'active') || shown[0]

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
  const adderRow = adding ? <Composer onAdd={add} onClose={() => setAdding(false)} /> : (
    <button type="button" className={styles.addRow} onClick={() => setAdding(true)}>
      <Icon name="add" size={20} filled={false} /><span>Adicionar meta</span>
    </button>
  )
  const emptyText = goals.length ? 'Nenhuma meta neste filtro.' : 'Nenhuma meta criada ainda.'

  if (board) {
    return (
      <div className={styles.page}>
        <div className={styles.board} data-grab {...grab}>
          {shown.map(block => (
            <section key={block.id} className={styles.column} aria-label={block.title}>
              <div className={styles.head}>
                <span className={styles.headTitle}>{block.title}</span>
                <span className={styles.headCount}>{block.list.length}</span>
              </div>
              {block.list.length ? <div role="list">{block.list.map(card)}</div> : <div className={styles.empty}>{emptyText}</div>}
              {block === adder ? adderRow : null}
            </section>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {shown.map(block => (
        <section key={block.id} className={styles.block} aria-label={block.title}>
          <div className={styles.head}>
            <span className={styles.headTitle}>{block.title}</span>
            <span className={styles.headCount}>{block.list.length}</span>
          </div>
          {block.list.length ? <div role="list">{block.list.map(card)}</div> : <div className={styles.empty}>{emptyText}</div>}
          {block === adder ? adderRow : null}
        </section>
      ))}
      {!shown.length ? <div className={styles.empty}>{emptyText}</div> : null}
    </div>
  )
}

/** Linha de criação rápida: Enter cria e continua; Esc fecha. Prazo, prioridade e metas ficam no popup. */
function Composer({ onAdd, onClose }: { onAdd: (title: string) => void; onClose: () => void }) {
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement | null>(null)
  useEffect(() => { input.current?.focus() }, [])
  const submit = () => { const title = value.trim(); if (!title) return; onAdd(title); setValue('') }
  return (
    <div className={styles.composer}>
      <input ref={input} className={styles.composerInput} value={value} placeholder="Nome da meta" aria-label="Nome da meta" onChange={event => setValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); submit() } if (event.key === 'Escape') onClose() }} />
      <button type="button" className={styles.composerButton} data-primary onClick={submit} disabled={!value.trim()}>Adicionar <Icon name="add" size={18} filled={false} /></button>
      <button type="button" className={styles.composerButton} onClick={onClose}>Cancelar</button>
    </div>
  )
}
