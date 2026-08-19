'use client'

import type { PlannerItem } from '../../lib/v2/planner'
import { type MaiState, nextRepeat } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import type { Row } from './app-types'
import styles from './unified.module.css'

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []

type Props = {
  items: PlannerItem[]
  overdue: MaiState['tasks']
  commit: (change: (current: MaiState) => MaiState) => void
  inspect: (item: InspectableItem) => void
}

export function TodayFlow({ items, overdue, commit, inspect }: Props) {
  const sorted = [...items].sort((a, b) => `${a.time || '99:99'} ${a.title}`.localeCompare(`${b.time || '99:99'} ${b.title}`))

  function toggle(item: PlannerItem) {
    if (item.kind === 'task') {
      commit(current => ({ ...current, tasks: current.tasks.map(task => {
        if (task.id !== item.sourceId) return task
        if (!task.concluida && task.repeticao && task.data_vencimento) return { ...task, data_vencimento: nextRepeat(task.data_vencimento, task.repeticao), concluida: false, concluida_em: '' }
        return { ...task, concluida: !task.concluida, concluida_em: !task.concluida ? new Date().toISOString() : '' }
      }) }))
      return
    }
    if (item.kind === 'habit') {
      commit(current => {
        const entries = rows(current.habitEntries)
        const exists = entries.some(entry => String(entry.habito_id) === item.sourceId && String(entry.data).slice(0, 10) === item.date)
        return { ...current, habitEntries: exists ? entries.filter(entry => !(String(entry.habito_id) === item.sourceId && String(entry.data).slice(0, 10) === item.date)) : [...entries, { id: `hr-${crypto.randomUUID()}`, habito_id: item.sourceId, data: item.date, valor: Number(item.raw.meta || 1), criado_em: new Date().toISOString() }] }
      })
      return
    }
    if (item.kind === 'finance') {
      if (item.raw.fixo_id || item.raw.recorrente === true) {
        commit(current => {
          const list = rows(current.finance.fixedOccurrences)
          const key = `${item.raw.fixo_id || item.sourceId}|${item.date.slice(0, 7)}`
          const next = { chave: key, fixo_id: item.raw.fixo_id || item.sourceId, competencia: item.date.slice(0, 7), status: item.completed ? 'pendente' : 'pago', valor_pago: item.completed ? 0 : Number(item.raw.valor_real || item.raw.valor || 0), atualizado_em: new Date().toISOString() }
          return { ...current, finance: { ...current.finance, fixedOccurrences: list.some(entry => entry.chave === key) ? list.map(entry => entry.chave === key ? { ...entry, ...next } : entry) : [...list, next] } }
        })
      } else commit(current => ({ ...current, finance: { ...current.finance, transactions: rows(current.finance.transactions).map(tx => String(tx.id) === item.sourceId ? { ...tx, status: item.completed ? 'pendente' : 'pago', valor_pago: item.completed ? 0 : Number(tx.valor || 0) } : tx) } }))
      return
    }
    if (item.kind === 'event') {
      const key = `${item.sourceId}|${item.date}|${item.time || ''}`
      commit(current => { const list = rows(current.eventCompletions), exists = list.some(entry => entry.chave === key); return { ...current, eventCompletions: exists ? list.filter(entry => entry.chave !== key) : [...list, { chave: key, evento_id: item.sourceId, data: item.date, hora: item.time, concluida: true, atualizado_em: new Date().toISOString() }] } })
      return
    }
    if (item.kind === 'goal') commit(current => ({ ...current, goals: rows(current.goals).map(goal => String(goal.id) === item.sourceId ? { ...goal, status: 'Concluída', progresso_atual: Number(goal.progresso_total || 100) } : goal) }))
  }

  return <section className={styles.todayFlow}>
    <header><div><strong>Seu dia</strong><span>{sorted.length + overdue.length} itens</span></div></header>
    {overdue.length ? <div className={styles.todayGroup}><h3>Atrasadas <span>{overdue.length}</span></h3>{overdue.map(task => <article className={styles.todayRow} key={task.id}><button onClick={() => commit(current => ({ ...current, tasks: current.tasks.map(item => item.id === task.id ? { ...item, concluida: true, concluida_em: new Date().toISOString() } : item) }))} /><button onClick={() => inspect({ kind: 'task', sourceId: task.id, title: task.titulo, date: String(task.data_vencimento || '').slice(0, 10), raw: task as Row })}><strong>{task.titulo}</strong><small>{String(task.data_vencimento || '').slice(0, 10)} · atrasada</small></button><time>!</time></article>)}</div> : null}
    <div className={styles.todayTimeline}>{sorted.map(item => <article className={styles.todayRow} key={item.id} data-completed={item.completed}><button style={{ borderColor: item.color, background: item.completed ? item.color : '' }} onClick={() => toggle(item)}>{item.completed ? '✓' : ''}</button><button onClick={() => inspect({ kind: item.kind, sourceId: item.sourceId, title: item.title, date: item.date, time: item.time, raw: item.raw })}><strong>{item.title}</strong><small>{item.subtitle}{item.recurring ? ' · recorrente' : ''}</small></button><time>{item.time || 'Dia todo'}</time></article>)}{!sorted.length && !overdue.length ? <div className={styles.emptyState}><strong>Dia livre</strong><span>Nada agendado para hoje.</span></div> : null}</div>
  </section>
}
