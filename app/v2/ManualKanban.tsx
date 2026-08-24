'use client'

import { useMemo, useState } from 'react'
import { plannerItems } from '../../lib/v2/planner'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem, InspectableKind } from './ContextDrawer'
import type { Row, TaskModuleScope } from './app-types'
import { MaiIcon } from './MaiIcons'

type Mode = 'today' | 'tasks'
type Commit = (change: (current: MaiState) => MaiState) => void

type ManualItem = {
  key: string
  title: string
  subtitle: string
  detail?: string
  date?: string
  time?: string
  kind: InspectableKind
  sourceId: string
  raw: Row
  color?: string
  completed?: boolean
  priority?: number
}

type KanbanColumn = { id: string; title: string }
type BoardState = {
  columns: KanbanColumn[]
  placements: Record<string, string>
  orders: Record<string, string[]>
}

type Props = {
  mode: Mode
  state: MaiState
  today: string
  commit: Commit
  inspect: (item: InspectableItem) => void
  scope?: TaskModuleScope
  selectedId?: string
}

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const dateKey = (value: unknown) => String(value || '').slice(0, 10)

function naturalDate(key: string, today: string) {
  if (!key) return 'Sem data'
  if (key === today) return 'Hoje'
  const base = new Date(`${today}T12:00:00`)
  const target = new Date(`${key}T12:00:00`)
  const diff = Math.round((target.getTime() - base.getTime()) / 86_400_000)
  if (diff === -1) return 'Ontem'
  if (diff === 1) return 'Amanhã'
  return target.toLocaleDateString('pt-BR', { day:'numeric', month:'short' }).replace('.', '')
}

function kindLabel(kind: InspectableKind) {
  if (kind === 'task') return 'Tarefa'
  if (kind === 'event') return 'Compromisso'
  if (kind === 'habit') return 'Hábito'
  if (kind === 'goal') return 'Meta'
  if (kind === 'finance') return 'Finanças'
  return 'Nota'
}

function kindIcon(kind: InspectableKind) {
  if (kind === 'task') return 'task_alt'
  if (kind === 'event') return 'calendar_today'
  if (kind === 'habit') return 'repeat'
  if (kind === 'goal') return 'flag'
  if (kind === 'finance') return 'payments'
  return 'description'
}

function normalizeBoard(value: unknown): BoardState {
  const source = value && typeof value === 'object' ? value as Row : {}
  const columns = rows(source.columns)
    .filter(column => column.id && String(column.title || '').trim())
    .map(column => ({ id:String(column.id), title:String(column.title).trim() }))
  const placements = source.placements && typeof source.placements === 'object' ? { ...(source.placements as Record<string,string>) } : {}
  const rawOrders = source.orders && typeof source.orders === 'object' ? source.orders as Record<string,unknown> : {}
  const orders = Object.fromEntries(Object.entries(rawOrders).map(([id, value]) => [id, Array.isArray(value) ? value.map(String) : []]))
  return { columns, placements, orders }
}

function boardMap(state: MaiState): Record<string, unknown> {
  const value = (state.configs as Row).kanbanBoards
  return value && typeof value === 'object' ? value as Record<string,unknown> : {}
}

export function ManualKanban({ mode, state, today, commit, inspect, scope='entrada', selectedId='' }: Props) {
  const boardKey = mode === 'today' ? 'today' : 'tasks'
  const board = normalizeBoard(boardMap(state)[boardKey])
  const [dragKey, setDragKey] = useState('')
  const [overColumn, setOverColumn] = useState('')
  const [addingColumn, setAddingColumn] = useState(false)
  const [newColumnTitle, setNewColumnTitle] = useState('')
  const [editingColumn, setEditingColumn] = useState('')
  const [editingTitle, setEditingTitle] = useState('')
  const [pickerColumn, setPickerColumn] = useState('')
  const [query, setQuery] = useState('')

  const projects = useMemo(() => new Map(rows(state.projects).map(project => [String(project.id), project])), [state.projects])

  const items = useMemo<ManualItem[]>(() => {
    if (mode === 'today') {
      const filters = (state.configs as Row).todayFilters && typeof (state.configs as Row).todayFilters === 'object' ? (state.configs as Row).todayFilters as Row : {}
      const projectFilter = String(filters.project || 'all')
      const priorityFilter = String(filters.priority || 'all')
      return plannerItems(state, today, today).filter(item => {
        const raw = item.raw || {}
        if (projectFilter !== 'all' && item.kind === 'task' && String(raw.projeto_id || 'entrada') !== projectFilter) return false
        if (priorityFilter !== 'all' && ['task','goal'].includes(item.kind) && String(Number(raw.prioridade || 4)) !== priorityFilter) return false
        return true
      }).map(item => ({
        key:item.id,
        title:item.title,
        subtitle:`${kindLabel(item.kind)}${item.subtitle ? ` · ${item.subtitle}` : ''}`,
        detail:item.time || (item.completed ? 'Concluído' : ''),
        date:item.date,
        time:item.time,
        kind:item.kind,
        sourceId:item.sourceId,
        raw:item.raw,
        color:item.color,
        completed:item.completed,
        priority:Number(item.raw?.prioridade || 0) || undefined,
      }))
    }

    const currentScope = scope || 'entrada'
    return state.tasks.filter(task => {
      const projectId = String(task.projeto_id || 'entrada')
      const day = dateKey(task.data_vencimento)
      if (currentScope === 'entrada') return projectId === 'entrada'
      if (currentScope === 'today') return day === today
      if (currentScope === 'upcoming') return Boolean(day && day > today)
      if (currentScope.startsWith('project:')) return projectId === currentScope.slice(8)
      return true
    }).map(task => {
      const project = projects.get(String(task.projeto_id || 'entrada'))
      const day = dateKey(task.data_vencimento)
      const time = String(task.data_vencimento || '').includes('T') ? String(task.data_vencimento).slice(11,16) : ''
      return {
        key:`task:${task.id}`,
        title:String(task.titulo || 'Tarefa'),
        subtitle:String(project?.nome || 'Entrada'),
        detail:[naturalDate(day,today), time, task.concluida ? 'Concluída' : ''].filter(Boolean).join(' · '),
        date:day,
        time,
        kind:'task' as const,
        sourceId:String(task.id),
        raw:task as Row,
        completed:task.concluida === true,
        priority:Number(task.prioridade || 4),
      }
    })
  }, [mode, state, today, scope, projects])

  const itemMap = useMemo(() => new Map(items.map(item => [item.key, item])), [items])
  const pickerItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('pt-BR')
    return [...items]
      .filter(item => !needle || `${item.title} ${item.subtitle} ${item.detail || ''}`.toLocaleLowerCase('pt-BR').includes(needle))
      .sort((a,b) => a.title.localeCompare(b.title, 'pt-BR', { sensitivity:'base' }))
  }, [items, query])

  function updateBoard(change: (current: BoardState) => BoardState) {
    commit(current => {
      const boards = boardMap(current)
      const currentBoard = normalizeBoard(boards[boardKey])
      return {
        ...current,
        configs:{
          ...current.configs,
          kanbanBoards:{ ...boards, [boardKey]:change(currentBoard) },
        },
      }
    })
  }

  function addColumn() {
    const title = newColumnTitle.trim()
    if (!title) return
    updateBoard(current => ({ ...current, columns:[...current.columns,{ id:`kb-${crypto.randomUUID()}`, title }] }))
    setNewColumnTitle('')
    setAddingColumn(false)
  }

  function renameColumn(id: string) {
    const title = editingTitle.trim()
    if (!title) return
    updateBoard(current => ({ ...current, columns:current.columns.map(column => column.id === id ? { ...column, title } : column) }))
    setEditingColumn('')
    setEditingTitle('')
  }

  function deleteColumn(id: string) {
    if (!window.confirm('Excluir esta coluna? Os itens voltarão a ficar disponíveis para adicionar.')) return
    updateBoard(current => {
      const placements = { ...current.placements }
      Object.keys(placements).forEach(key => { if (placements[key] === id) delete placements[key] })
      const orders = { ...current.orders }
      delete orders[id]
      return { columns:current.columns.filter(column => column.id !== id), placements, orders }
    })
    if (pickerColumn === id) setPickerColumn('')
  }

  function moveColumn(id: string, direction: -1 | 1) {
    updateBoard(current => {
      const index = current.columns.findIndex(column => column.id === id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.columns.length) return current
      const columns = [...current.columns]
      const [moved] = columns.splice(index,1)
      columns.splice(target,0,moved)
      return { ...current, columns }
    })
  }

  function placeItem(key: string, columnId: string) {
    updateBoard(current => {
      const placements = { ...current.placements, [key]:columnId }
      const orders = Object.fromEntries(Object.entries(current.orders).map(([id, order]) => [id, order.filter(itemKey => itemKey !== key)])) as Record<string,string[]>
      orders[columnId] = [...(orders[columnId] || []), key]
      return { ...current, placements, orders }
    })
    setDragKey('')
    setOverColumn('')
  }

  function removeItem(key: string) {
    updateBoard(current => {
      const placements = { ...current.placements }
      delete placements[key]
      const orders = Object.fromEntries(Object.entries(current.orders).map(([id, order]) => [id, order.filter(itemKey => itemKey !== key)])) as Record<string,string[]>
      return { ...current, placements, orders }
    })
  }

  function columnItems(columnId: string) {
    const placed = items.filter(item => board.placements[item.key] === columnId)
    const order = board.orders[columnId] || []
    const rank = new Map(order.map((key,index) => [key,index]))
    return placed.sort((a,b) => (rank.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.key) ?? Number.MAX_SAFE_INTEGER) || a.title.localeCompare(b.title,'pt-BR',{sensitivity:'base'}))
  }

  function openItem(item: ManualItem) {
    inspect({ kind:item.kind, sourceId:item.sourceId, title:item.title, date:item.date, time:item.time, raw:item.raw })
  }

  const unplacedCount = items.filter(item => !board.placements[item.key] || !board.columns.some(column => column.id === board.placements[item.key])).length
  const targetColumn = board.columns.find(column => column.id === pickerColumn)

  return <div className="mai-manual-kanban">
    <header className="mai-manual-kanban-toolbar">
      <div><strong>Kanban manual</strong><span>{board.columns.length} coluna{board.columns.length === 1 ? '' : 's'} · {unplacedCount} {unplacedCount === 1 ? 'item disponível' : 'itens disponíveis'}</span></div>
      <button type="button" onClick={() => setAddingColumn(true)}><span className="material-symbols-rounded">add</span>Nova coluna</button>
    </header>

    {addingColumn ? <div className="mai-manual-kanban-new-column">
      <input autoFocus value={newColumnTitle} placeholder="Nome da coluna" onChange={event => setNewColumnTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') addColumn(); if (event.key === 'Escape') { setAddingColumn(false); setNewColumnTitle('') } }}/>
      <button type="button" onClick={addColumn}>Criar</button>
      <button type="button" onClick={() => { setAddingColumn(false); setNewColumnTitle('') }}>Cancelar</button>
    </div> : null}

    {targetColumn ? <section className="mai-manual-kanban-picker">
      <header><div><strong>Adicionar à “{targetColumn.title}”</strong><span>Escolha qualquer item visível neste módulo.</span></div><button type="button" onClick={() => { setPickerColumn(''); setQuery('') }} aria-label="Fechar">×</button></header>
      <div className="mai-manual-kanban-search"><MaiIcon name="search" size={15}/><input autoFocus value={query} placeholder="Buscar item" onChange={event => setQuery(event.target.value)}/></div>
      <div className="mai-manual-kanban-picker-list">
        {pickerItems.map(item => {
          const currentColumnId = board.placements[item.key]
          const currentColumn = board.columns.find(column => column.id === currentColumnId)
          return <button type="button" key={item.key} onClick={() => placeItem(item.key, targetColumn.id)}>
            <i><span className="material-symbols-rounded">{kindIcon(item.kind)}</span></i>
            <span><strong>{item.title}</strong><small>{item.subtitle}{item.detail ? ` · ${item.detail}` : ''}</small></span>
            <b>{currentColumn ? currentColumn.id === targetColumn.id ? 'Aqui' : `Mover de ${currentColumn.title}` : 'Adicionar'}</b>
          </button>
        })}
        {!pickerItems.length ? <div className="mai-manual-kanban-picker-empty">Nenhum item encontrado.</div> : null}
      </div>
    </section> : null}

    {!board.columns.length ? <div className="mai-manual-kanban-empty-board">
      <span className="material-symbols-rounded">view_kanban</span>
      <strong>Seu Kanban ainda não tem colunas</strong>
      <p>Crie as colunas com os nomes que fizerem sentido para você. Nenhum status será criado automaticamente.</p>
      <button type="button" onClick={() => setAddingColumn(true)}>Criar primeira coluna</button>
    </div> : <div className="mai-manual-kanban-board">
      {board.columns.map((column,index) => {
        const cards = columnItems(column.id)
        return <section className="mai-manual-kanban-column" key={column.id} data-over={overColumn === column.id || undefined} onDragEnter={event => { event.preventDefault(); setOverColumn(column.id) }} onDragOver={event => event.preventDefault()} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node|null)) setOverColumn('') }} onDrop={event => { event.preventDefault(); if (dragKey && itemMap.has(dragKey)) placeItem(dragKey,column.id) }}>
          <header className="mai-manual-kanban-column-head">
            {editingColumn === column.id ? <input autoFocus value={editingTitle} onChange={event => setEditingTitle(event.target.value)} onBlur={() => renameColumn(column.id)} onKeyDown={event => { if (event.key === 'Enter') renameColumn(column.id); if (event.key === 'Escape') { setEditingColumn(''); setEditingTitle('') } }}/> : <div><strong>{column.title}</strong><span>{cards.length}</span></div>}
            <nav>
              <button type="button" disabled={index === 0} title="Mover para a esquerda" onClick={() => moveColumn(column.id,-1)}><span className="material-symbols-rounded">chevron_left</span></button>
              <button type="button" disabled={index === board.columns.length - 1} title="Mover para a direita" onClick={() => moveColumn(column.id,1)}><span className="material-symbols-rounded">chevron_right</span></button>
              <button type="button" title="Renomear" onClick={() => { setEditingColumn(column.id); setEditingTitle(column.title) }}><span className="material-symbols-rounded">edit</span></button>
              <button type="button" title="Excluir coluna" onClick={() => deleteColumn(column.id)}><span className="material-symbols-rounded">delete</span></button>
            </nav>
          </header>

          <div className="mai-manual-kanban-cards">
            {cards.map(item => <article className="mai-manual-kanban-card" data-selected={selectedId === item.sourceId || undefined} data-completed={item.completed || undefined} key={item.key} draggable onDragStart={event => { setDragKey(item.key); event.dataTransfer.effectAllowed='move'; event.dataTransfer.setData('text/plain',item.key) }} onDragEnd={() => { setDragKey(''); setOverColumn('') }} onClick={() => openItem(item)}>
              <div className="mai-manual-kanban-card-top">
                <span className="mai-manual-kanban-kind"><i style={item.color ? { background:item.color } : undefined}/><span className="material-symbols-rounded">{kindIcon(item.kind)}</span>{kindLabel(item.kind)}</span>
                <button type="button" title="Remover do Kanban" aria-label={`Remover ${item.title} do Kanban`} onClick={event => { event.stopPropagation(); removeItem(item.key) }}>×</button>
              </div>
              <strong>{item.title}</strong>
              <small>{item.subtitle}</small>
              {item.detail ? <p>{item.detail}</p> : null}
            </article>)}
            {!cards.length ? <div className="mai-manual-kanban-column-empty">Arraste um item para cá ou adicione manualmente.</div> : null}
          </div>

          <button type="button" className="mai-manual-kanban-add-item" onClick={() => { setPickerColumn(column.id); setQuery('') }}><span className="material-symbols-rounded">add</span>Adicionar item</button>
        </section>
      })}
    </div>}
  </div>
}
