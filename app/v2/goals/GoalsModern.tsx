'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../ds'
import { GOAL_STATUS, goalAmountText, goalColor, goalDone, goalDue, goalDueInfo, goalPaused, goalPct, setGoalDone, sortGoals, type GoalSort } from '../../../lib/v2/goals'
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
  const goals = rows(state.goals)
  const [adding, setAdding] = useState(false)
  const showDone = showCompleted(state, 'goals')
  const sort = (String(record(record(state.configs.moduleControls).goals).sort || 'date') as GoalSort)
  const status = String(record(record(state.configs.moduleFilters).goals).status || 'all')

  useEffect(() => { if (createRequest?.startsWith('goals:')) setAdding(true) }, [createRequest])

  const open = (goal: Row) => inspect({ kind: 'goal', sourceId: String(goal.id), title: String(goal.titulo || 'Meta'), date: goalDue(goal), raw: goal })
  const toggle = (goal: Row) => commit(current => ({ ...current, goals: rows(current.goals).map(row => (String(row.id) === String(goal.id) ? setGoalDone(row, !goalDone(row)) : row)) }))
  const add = (titulo: string) => {
    const goal = { id: uid(), titulo, tipo: 'percentual', status: GOAL_STATUS.active, prazo: '', progresso_atual: 0, progresso_total: 100, descricao: '', prioridade: 4, anexos: [], concluida: false }
    commit(current => ({ ...current, goals: [goal, ...rows(current.goals)] }))
  }

  const visible = goals.filter(goal => (showDone || !goalDone(goal)))
  const blocks = [
    { id: 'active', title: 'Em andamento', list: sortGoals(visible.filter(goal => !goalPaused(goal)), sort), hidden: status === 'paused' },
    { id: 'paused', title: 'Pausadas', list: sortGoals(visible.filter(goalPaused), sort), hidden: status === 'active' },
  ].filter(block => !block.hidden && (block.id === 'active' || block.list.length))

  return (
    <div className={styles.page}>
      {blocks.map(block => (
        <section key={block.id} className={styles.block} aria-label={block.title}>
          <div className={styles.head}>
            <span className={styles.headTitle}>{block.title}</span>
            <span className={styles.headCount}>{block.list.length}</span>
          </div>
          {block.list.length ? (
            <div role="list">
              {block.list.map(goal => {
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
              })}
            </div>
          ) : (
            <div className={styles.empty}>{goals.length ? 'Nenhuma meta neste filtro.' : 'Nenhuma meta criada ainda.'}</div>
          )}
          {block.id === 'active' ? (
            adding ? <Composer onAdd={add} onClose={() => setAdding(false)} /> : (
              <button type="button" className={styles.addRow} onClick={() => setAdding(true)}>
                <Icon name="add" size={20} filled={false} /><span>Adicionar meta</span>
              </button>
            )
          ) : null}
        </section>
      ))}
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
