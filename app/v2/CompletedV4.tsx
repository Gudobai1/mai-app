'use client'

import { useMemo } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import type { Row } from './app-types'
import { MaiIcon } from './MaiIcons'

type Commit = (change: (current: MaiState) => MaiState) => void
type Kind = InspectableItem['kind']
type CompletedItem = {
  id: string
  kind: Kind
  sourceId: string
  title: string
  date: string
  sort: string
  detail: string
  raw: Row
  completionId?: string
  occurrenceDue?: string
  recurringOccurrence?: boolean
  snapshot?: Row
}

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const dateKey = (value: unknown) => String(value || '').slice(0, 10)
const money = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' })
const paidStatus = (value: unknown) => ['pago','paga','quitado','quitada','concluido','concluida'].includes(String(value || '').toLocaleLowerCase('pt-BR'))
const concludedStatus = (value: unknown) => String(value || '').toLocaleLowerCase('pt-BR').includes('conclu')

function resetSubtasks(value: unknown): Row[] {
  return rows(value).map(subtask => ({ ...subtask, concluida:false, concluida_em:'', subtarefas:resetSubtasks(subtask.subtarefas) }))
}

function naturalDate(key: string, today: string) {
  if (!key) return 'Sem data'
  if (key === today) return 'Hoje'
  const base = new Date(`${today}T12:00:00`)
  const target = new Date(`${key}T12:00:00`)
  const diff = Math.round((target.getTime() - base.getTime()) / 86_400_000)
  if (diff === -1) return 'Ontem'
  if (diff === 1) return 'Amanhã'
  return target.toLocaleDateString('pt-BR', { day:'numeric', month:'short', year:target.getFullYear() !== base.getFullYear() ? 'numeric' : undefined })
}

function groupDate(key: string, today: string) {
  if (!key) return 'Sem data'
  if (key === today) return 'Hoje'
  const base = new Date(`${today}T12:00:00`)
  const target = new Date(`${key}T12:00:00`)
  const diff = Math.round((target.getTime() - base.getTime()) / 86_400_000)
  if (diff === -1) return 'Ontem'
  return target.toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long', year:target.getFullYear() !== base.getFullYear() ? 'numeric' : undefined })
}

function iconFor(kind: Kind) {
  if (kind === 'task') return 'inbox'
  if (kind === 'event') return 'calendar'
  if (kind === 'habit') return 'habits'
  if (kind === 'goal') return 'goals'
  if (kind === 'finance') return 'finance'
  return 'notes'
}

export function CompletedV4({ state, today, commit, inspect }: { state:MaiState; today:string; commit:Commit; inspect:(item:InspectableItem)=>void }) {
  const projects = useMemo(() => new Map(rows(state.projects).map(project => [String(project.id), project])), [state.projects])

  const items = useMemo(() => {
    const result: CompletedItem[] = []

    state.tasks.filter(task => task.concluida === true && !task.parent_id).forEach(task => {
      const project = projects.get(String(task.projeto_id || 'entrada'))
      const date = dateKey(task.concluida_em || task.data_vencimento)
      result.push({ id:`task:${task.id}`, kind:'task', sourceId:String(task.id), title:String(task.titulo || 'Tarefa'), date, sort:String(task.concluida_em || `${date}T00:00:00`), detail:String(project?.nome || 'Entrada'), raw:task as Row })
    })

    rows(state.taskCompletions).forEach(entry => {
      const taskId = String(entry.task_id || '')
      if (!taskId) return
      const snapshot = entry.snapshot && typeof entry.snapshot === 'object' ? entry.snapshot as Row : {}
      if (snapshot.parent_id) return
      const currentTask = state.tasks.find(task => String(task.id) === taskId)
      const raw = (currentTask || snapshot) as Row
      const project = projects.get(String(entry.projeto_id || snapshot.projeto_id || currentTask?.projeto_id || 'entrada'))
      const completedAt = String(entry.concluida_em || '')
      const occurrenceDue = String(entry.data_vencimento || entry.data || snapshot.data_vencimento || '')
      const date = dateKey(completedAt || entry.data || occurrenceDue)
      const completionId = String(entry.id || `tc:${taskId}:${occurrenceDue}`)
      result.push({
        id:`task-occurrence:${completionId}`,
        kind:'task',
        sourceId:taskId,
        title:String(entry.titulo || snapshot.titulo || currentTask?.titulo || 'Tarefa'),
        date,
        sort:completedAt || `${date}T00:00:00`,
        detail:String(project?.nome || 'Entrada'),
        raw,
        completionId,
        occurrenceDue,
        recurringOccurrence:true,
        snapshot,
      })
    })

    const eventMap = new Map(rows(state.events).map(event => [String(event.id), event]))
    rows(state.eventCompletions).filter(entry => entry.concluida !== false).forEach(entry => {
      const eventId = String(entry.evento_id || String(entry.chave || '').split('|')[0] || '')
      const event = eventMap.get(eventId)
      if (!event) return
      const date = dateKey(entry.data || String(entry.chave || '').split('|')[1])
      const time = String(event.hora_inicio || '')
      result.push({ id:`event:${eventId}:${date}`, kind:'event', sourceId:eventId, title:String(event.titulo || 'Compromisso'), date, sort:String(entry.concluida_em || `${date}T${time || '00:00'}`), detail:time || (event.dia_inteiro ? 'Dia inteiro' : 'Compromisso'), raw:event })
    })

    const habitMap = new Map(rows(state.habits).filter(habit => habit.ativo !== false).map(habit => [String(habit.id), habit]))
    rows(state.habitEntries).forEach(entry => {
      const habit = habitMap.get(String(entry.habito_id || ''))
      if (!habit) return
      const value = Number(entry.valor || 0)
      const target = Math.max(1, Number(habit.meta || 1))
      if (value < target) return
      const date = dateKey(entry.data)
      const unit = String(habit.unidade || '').trim()
      result.push({ id:`habit:${habit.id}:${date}`, kind:'habit', sourceId:String(habit.id), title:String(habit.nome || 'Hábito'), date, sort:String(entry.concluida_em || entry.criado_em || `${date}T00:00:00`), detail:target > 1 || unit ? `${value} de ${target}${unit ? ` ${unit}` : ''}` : 'Realizado', raw:habit })
    })

    rows(state.goals).filter(goal => concludedStatus(goal.status) || goal.concluida === true).forEach(goal => {
      const date = dateKey(goal.concluida_em || goal.prazo || goal.data_fim)
      const total = Math.max(1, Number(goal.progresso_total || 100))
      const progress = Math.max(0, Math.min(100, Math.round(Number(goal.progresso_atual || total) / total * 100)))
      result.push({ id:`goal:${goal.id}`, kind:'goal', sourceId:String(goal.id), title:String(goal.titulo || goal.nome || 'Meta'), date, sort:String(goal.concluida_em || `${date}T00:00:00`), detail:`${progress}%`, raw:goal })
    })

    rows(state.finance?.transactions).filter(item => paidStatus(item.status)).forEach(item => {
      const date = dateKey(item.concluida_em || item.data)
      const income = String(item.tipo || '').toLowerCase() === 'receita'
      result.push({ id:`finance:${item.id}`, kind:'finance', sourceId:String(item.id), title:String(item.titulo || item.descricao || 'Lançamento'), date, sort:String(item.concluida_em || `${date}T00:00:00`), detail:`${income ? '+' : '−'} ${money.format(Number(item.valor || 0))}`, raw:item })
    })

    rows(state.notes).filter(note => note.ativo !== false && note.arquivado !== true && (note.concluida === true || concludedStatus(note.status))).forEach(note => {
      const date = dateKey(note.concluida_em || note.updated_at || note.data || note.criado_em)
      result.push({ id:`note:${note.id}`, kind:'note', sourceId:String(note.id), title:String(note.titulo || 'Sem título'), date, sort:String(note.concluida_em || note.updated_at || note.data || `${date}T00:00:00`), detail:'Nota', raw:note })
    })

    return result.sort((a,b) => b.sort.localeCompare(a.sort) || a.title.localeCompare(b.title, 'pt-BR'))
  }, [state, projects])

  const groups = useMemo(() => {
    const map = new Map<string, CompletedItem[]>()
    items.forEach(item => {
      const key = item.date || ''
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    })
    return [...map.entries()].sort(([a],[b]) => {
      if (!a) return 1
      if (!b) return -1
      return b.localeCompare(a)
    })
  }, [items])

  function reopen(item: CompletedItem) {
    if (item.kind === 'task' && item.recurringOccurrence) {
      commit(current => {
        const history = rows(current.taskCompletions)
        const completion = history.find(entry => String(entry.id || '') === String(item.completionId || ''))
        const snapshot = completion?.snapshot && typeof completion.snapshot === 'object' ? completion.snapshot as Row : item.snapshot || {}
        const due = String(completion?.data_vencimento || item.occurrenceDue || snapshot.data_vencimento || item.date)
        const reopened = {
          ...snapshot,
          id:`t-${crypto.randomUUID()}`,
          titulo:item.title,
          data_vencimento:due,
          repeticao:'',
          concluida:false,
          concluida_em:'',
          parent_id:'',
          criado_em:new Date().toISOString(),
          ordem:Date.now(),
          subtarefas:resetSubtasks(snapshot.subtarefas),
        }
        return {
          ...current,
          taskCompletions:history.filter(entry => String(entry.id || '') !== String(item.completionId || '')),
          tasks:[...current.tasks, reopened],
        }
      })
      return
    }
    if (item.kind === 'task') {
      commit(current => ({ ...current, tasks:current.tasks.map(task => String(task.id) === item.sourceId ? { ...task, concluida:false, concluida_em:'' } : task) }))
      return
    }
    if (item.kind === 'event') {
      commit(current => ({ ...current, eventCompletions:rows(current.eventCompletions).filter(entry => !(String(entry.evento_id || String(entry.chave || '').split('|')[0]) === item.sourceId && dateKey(entry.data || String(entry.chave || '').split('|')[1]) === item.date)) }))
      return
    }
    if (item.kind === 'habit') {
      commit(current => ({ ...current, habitEntries:rows(current.habitEntries).filter(entry => !(String(entry.habito_id) === item.sourceId && dateKey(entry.data) === item.date)) }))
      return
    }
    if (item.kind === 'goal') {
      commit(current => ({ ...current, goals:rows(current.goals).map(goal => String(goal.id) === item.sourceId ? { ...goal, status:'Em Andamento', concluida:false, concluida_em:'' } : goal) }))
      return
    }
    if (item.kind === 'finance') {
      commit(current => ({ ...current, finance:{ ...current.finance, transactions:rows(current.finance.transactions).map(tx => String(tx.id) === item.sourceId ? { ...tx, status:'pendente', concluida_em:'', valor_pago:0 } : tx) } }))
      return
    }
    commit(current => ({ ...current, notes:rows(current.notes).map(note => String(note.id) === item.sourceId ? { ...note, concluida:false, status:'', concluida_em:'' } : note) }))
  }

  const renderItem = (item: CompletedItem) => <article className="mai-today-unified-row mai-item-row-v2 mai-completed-row" key={item.id} onClick={() => inspect({ kind:item.kind, sourceId:item.sourceId, title:item.title, date:item.date, raw:item.raw })}>
    <button className="mai-today-unified-dot" data-done="true" aria-label={`Reabrir ${item.title}`} title="Reabrir" onClick={event => { event.stopPropagation(); reopen(item) }}>✓</button>
    <span className="mai-item-copy-v2"><span className="mai-item-titleline-v2"><strong>{item.title}</strong></span><span className="mai-item-subline-v2"><span>{naturalDate(item.date,today)}</span><span>·</span><span className="mai-completed-detail"><MaiIcon name={iconFor(item.kind)} size={11}/>{item.detail}</span></span></span>
  </article>

  return <div className="mai-v3-area-page mai-v4-completed">
    <header className="mai-v3-area-header"><div><h1>Concluídos</h1><p>Itens finalizados, ainda ligados às áreas onde foram criados.</p></div></header>
    <div className="mai-upcoming-scroll mai-v3-upcoming-scroll mai-completed-groups">
      {groups.map(([day, dayItems]) => <section className="mai-completed-day" key={day || 'sem-data'}>
        <header><strong>{groupDate(day,today)}</strong><span>{dayItems.length}</span></header>
        {dayItems.map(renderItem)}
      </section>)}
    </div>
  </div>
}
