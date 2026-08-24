'use client'

import { useMemo, useState } from 'react'
import { addDays, plannerItems, type PlannerItem } from '../../lib/v2/planner'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem, InspectableKind } from './ContextDrawer'
import type { AppView, Row } from './app-types'
import { MaiIcon } from './MaiIcons'

type Commit = (change: (current: MaiState) => MaiState) => void
type ColumnId = string

type BoardCard = {
  id: string
  title: string
  subtitle?: string
  detail?: string
  date?: string
  color?: string
  priority?: number
  kind?: InspectableKind
  sourceId?: string
  raw?: Row
  draggable?: boolean
}

type BoardColumn = {
  id: ColumnId
  title: string
  subtitle: string
  icon: string
  cards: BoardCard[]
}

type Props = {
  view: Exclude<AppView, 'tasks' | 'home' | 'inbox' | `project:${string}`>
  state: MaiState
  today: string
  commit: Commit
  inspect: (item: InspectableItem) => void
}

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const dateKey = (value: unknown) => String(value || '').slice(0, 10)
const money = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' })
const paid = (value: unknown) => ['pago','paga','quitado','quitada','concluido','concluida','concluído','concluída'].includes(String(value || '').toLocaleLowerCase('pt-BR'))
const concluded = (value: unknown) => String(value || '').toLocaleLowerCase('pt-BR').includes('conclu')
const paused = (value: unknown) => String(value || '').toLocaleLowerCase('pt-BR').includes('paus')

function naturalDate(key: string, today: string) {
  if (!key) return 'Sem data'
  if (key === today) return 'Hoje'
  const base = new Date(`${today}T12:00:00`)
  const target = new Date(`${key}T12:00:00`)
  const diff = Math.round((target.getTime() - base.getTime()) / 86_400_000)
  if (diff === -1) return 'Ontem'
  if (diff === 1) return 'Amanhã'
  if (diff > 1 && diff < 7) return target.toLocaleDateString('pt-BR', { weekday:'long' })
  return target.toLocaleDateString('pt-BR', { day:'numeric', month:'short' }).replace('.', '')
}

function plannerCard(item: PlannerItem): BoardCard {
  return {
    id:item.id,
    title:item.title,
    subtitle:item.subtitle,
    detail:item.time || '',
    date:item.date,
    color:item.color,
    priority:item.kind === 'task' ? Number(item.raw.prioridade || 4) : undefined,
    kind:item.kind,
    sourceId:item.sourceId,
    raw:item.raw,
  }
}

function plannerAllowed(item: PlannerItem, state: MaiState, view: 'today' | 'upcoming') {
  const configs = state.configs as Row
  const filters = (view === 'today' ? configs.todayFilters : configs.upcomingFilters) as Row | undefined
  const value = filters && typeof filters === 'object' ? filters : {}
  if (view === 'upcoming') {
    if (item.kind === 'task' && value.tasks === false) return false
    if (item.kind === 'event' && value.events === false) return false
    if (item.kind === 'habit' && value.habits === false) return false
    if (item.kind === 'finance' && value.finance === false) return false
    if (item.kind === 'goal' && value.goals === false) return false
  }
  if (item.kind === 'task') {
    const project = String(value.project || 'all')
    if (project !== 'all' && String(item.raw.projeto_id || 'entrada') !== project) return false
    const priority = String(value.priority || 'all')
    if (priority !== 'all' && String(Number(item.raw.prioridade || 4)) !== priority) return false
  }
  return !item.completed
}

function completedCards(state: MaiState): BoardColumn[] {
  const taskCards: BoardCard[] = []
  const routineCards: BoardCard[] = []
  const otherCards: BoardCard[] = []

  state.tasks.filter(task => task.concluida === true && !task.parent_id).forEach(task => taskCards.push({
    id:`task:${task.id}`,
    title:String(task.titulo || 'Tarefa'),
    subtitle:'Tarefa',
    date:dateKey(task.concluida_em || task.data_vencimento),
    priority:Number(task.prioridade || 4),
    kind:'task',
    sourceId:String(task.id),
    raw:task as Row,
  }))

  rows(state.taskCompletions).forEach(entry => {
    const snapshot = entry.snapshot && typeof entry.snapshot === 'object' ? entry.snapshot as Row : {}
    if (snapshot.parent_id) return
    taskCards.push({
      id:`task-occurrence:${String(entry.id || `${entry.task_id}:${entry.data}`)}`,
      title:String(entry.titulo || snapshot.titulo || 'Tarefa'),
      subtitle:'Tarefa recorrente',
      date:dateKey(entry.concluida_em || entry.data || entry.data_vencimento),
      priority:Number(entry.prioridade || snapshot.prioridade || 4),
      kind:'task',
      sourceId:String(entry.task_id || snapshot.id || ''),
      raw:snapshot,
    })
  })

  const events = new Map(rows(state.events).map(event => [String(event.id), event]))
  rows(state.eventCompletions).filter(entry => entry.concluida !== false).forEach(entry => {
    const sourceId = String(entry.evento_id || String(entry.chave || '').split('|')[0] || '')
    const event = events.get(sourceId)
    if (!event) return
    routineCards.push({ id:`event:${sourceId}:${String(entry.data || '')}`, title:String(event.titulo || 'Compromisso'), subtitle:'Compromisso', date:dateKey(entry.data || String(entry.chave || '').split('|')[1]), kind:'event', sourceId, raw:event })
  })

  const habits = new Map(rows(state.habits).map(habit => [String(habit.id), habit]))
  rows(state.habitEntries).forEach(entry => {
    const habit = habits.get(String(entry.habito_id || ''))
    if (!habit) return
    const target = Math.max(1, Number(habit.meta || 1))
    if (Number(entry.valor || 0) < target) return
    routineCards.push({ id:`habit:${String(habit.id)}:${dateKey(entry.data)}`, title:String(habit.nome || 'Hábito'), subtitle:'Hábito', detail:`${Number(entry.valor || 0)} de ${target}${habit.unidade ? ` ${habit.unidade}` : ''}`, date:dateKey(entry.data), kind:'habit', sourceId:String(habit.id), raw:habit })
  })

  rows(state.goals).filter(goal => goal.concluida === true || concluded(goal.status)).forEach(goal => otherCards.push({ id:`goal:${goal.id}`, title:String(goal.titulo || goal.nome || 'Meta'), subtitle:'Meta', date:dateKey(goal.concluida_em || goal.prazo), kind:'goal', sourceId:String(goal.id), raw:goal }))
  rows(state.finance?.transactions).filter(item => paid(item.status)).forEach(item => otherCards.push({ id:`finance:${item.id}`, title:String(item.titulo || item.descricao || 'Lançamento'), subtitle:item.tipo === 'receita' ? 'Receita' : 'Despesa', detail:money.format(Number(item.valor || 0)), date:dateKey(item.data), kind:'finance', sourceId:String(item.id), raw:item }))
  rows(state.notes).filter(note => note.concluida === true || concluded(note.status)).forEach(note => otherCards.push({ id:`note:${note.id}`, title:String(note.titulo || 'Sem título'), subtitle:'Nota', date:dateKey(note.concluida_em || note.updated_at || note.data), kind:'note', sourceId:String(note.id), raw:note }))

  const byRecent = (a:BoardCard,b:BoardCard) => String(b.date || '').localeCompare(String(a.date || '')) || a.title.localeCompare(b.title,'pt-BR')
  taskCards.sort(byRecent); routineCards.sort(byRecent); otherCards.sort(byRecent)
  return [
    { id:'tasks', title:'Tarefas', subtitle:'Tarefas concluídas', icon:'check_circle', cards:taskCards },
    { id:'routine', title:'Agenda e hábitos', subtitle:'Compromissos e hábitos realizados', icon:'event_available', cards:routineCards },
    { id:'other', title:'Outros', subtitle:'Metas, finanças e notas', icon:'inventory_2', cards:otherCards },
  ]
}

export function AppKanban({ view, state, today, commit, inspect }: Props) {
  const [dragId, setDragId] = useState('')
  const [overColumn, setOverColumn] = useState('')

  const board = useMemo(() => {
    if (view === 'today') {
      const items = plannerItems(state, today, today).filter(item => plannerAllowed(item, state, 'today'))
      const events = items.filter(item => item.kind === 'event').map(plannerCard)
      const tasks = items.filter(item => item.kind === 'task').map(plannerCard)
      const others = items.filter(item => !['event','task'].includes(item.kind)).map(plannerCard)
      return [
        { id:'events', title:'Compromissos', subtitle:'Agenda de hoje', icon:'calendar_today', cards:events },
        { id:'tasks', title:'Tarefas', subtitle:'Tarefas de hoje', icon:'task_alt', cards:tasks },
        { id:'others', title:'Rotinas e prazos', subtitle:'Hábitos, metas e finanças', icon:'auto_awesome_motion', cards:others },
      ] as BoardColumn[]
    }

    if (view === 'upcoming') {
      const start = addDays(today, -90)
      const soon = addDays(today, 7)
      const end = addDays(today, 180)
      const items = plannerItems(state, start, end).filter(item => plannerAllowed(item, state, 'upcoming'))
      return [
        { id:'overdue', title:'Atrasados', subtitle:'Antes de hoje', icon:'warning', cards:items.filter(item => item.date < today).map(plannerCard) },
        { id:'soon', title:'Próximos 7 dias', subtitle:'Hoje e esta semana', icon:'date_range', cards:items.filter(item => item.date >= today && item.date <= soon).map(plannerCard) },
        { id:'later', title:'Depois', subtitle:'Mais adiante', icon:'event_upcoming', cards:items.filter(item => item.date > soon).map(plannerCard) },
      ] as BoardColumn[]
    }

    if (view === 'completed') return completedCards(state)

    if (view === 'habits') {
      const habits = rows(state.habits).filter(habit => habit.ativo !== false)
      const weekday = new Date(`${today}T12:00:00`).getDay()
      const eligible = habits.filter(habit => !Array.isArray(habit.dias_semana) || !habit.dias_semana.length || habit.dias_semana.map(Number).includes(weekday))
      const entryFor = (habit:Row) => rows(state.habitEntries).find(entry => String(entry.habito_id) === String(habit.id) && dateKey(entry.data) === today)
      const card = (habit:Row):BoardCard => { const entry=entryFor(habit); const target=Math.max(1,Number(habit.meta||1)); const value=Number(entry?.valor||0); return { id:String(habit.id), title:String(habit.nome||'Hábito'), subtitle:habit.hora ? String(habit.hora) : 'Hoje', detail:`${value} de ${target}${habit.unidade?` ${habit.unidade}`:''}`, color:String(habit.cor_hex||habit.cor||'var(--v3-accent)'), kind:'habit', sourceId:String(habit.id), raw:habit, draggable:true } }
      return [
        { id:'todo', title:'Não iniciados', subtitle:'Ainda sem registro hoje', icon:'radio_button_unchecked', cards:eligible.filter(habit => Number(entryFor(habit)?.valor||0) <= 0).map(card) },
        { id:'doing', title:'Em progresso', subtitle:'Começados, mas incompletos', icon:'pending', cards:eligible.filter(habit => { const value=Number(entryFor(habit)?.valor||0); const target=Math.max(1,Number(habit.meta||1)); return value>0&&value<target }).map(card) },
        { id:'done', title:'Concluídos', subtitle:'Meta de hoje atingida', icon:'check_circle', cards:eligible.filter(habit => Number(entryFor(habit)?.valor||0) >= Math.max(1,Number(habit.meta||1))).map(card) },
      ] as BoardColumn[]
    }

    if (view === 'goals') {
      const goals = rows(state.goals)
      const card = (goal:Row):BoardCard => { const total=Math.max(1,Number(goal.progresso_total||100)); const progress=Math.round(Number(goal.progresso_atual||0)/total*100); return { id:String(goal.id), title:String(goal.titulo||goal.nome||'Meta'), subtitle:goal.prazo?naturalDate(dateKey(goal.prazo),today):'Sem prazo', detail:`${Math.max(0,Math.min(100,progress))}%`, priority:Number(goal.prioridade||4), kind:'goal', sourceId:String(goal.id), raw:goal, draggable:true } }
      return [
        { id:'active', title:'Em andamento', subtitle:'Metas ativas', icon:'play_circle', cards:goals.filter(goal => !paused(goal.status)&&!concluded(goal.status)&&goal.concluida!==true).map(card) },
        { id:'paused', title:'Pausadas', subtitle:'Aguardando retomada', icon:'pause_circle', cards:goals.filter(goal => paused(goal.status)).map(card) },
        { id:'done', title:'Concluídas', subtitle:'Metas finalizadas', icon:'check_circle', cards:goals.filter(goal => concluded(goal.status)||goal.concluida===true).map(card) },
      ] as BoardColumn[]
    }

    if (view === 'notes') {
      const notes = rows(state.notes).filter(note => note.ativo !== false)
      const card = (note:Row):BoardCard => ({ id:String(note.id), title:String(note.titulo||'Sem título'), subtitle:naturalDate(dateKey(note.updated_at||note.data||note.criado_em),today), detail:String(note.conteudo||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,100), kind:'note', sourceId:String(note.id), raw:note, draggable:true })
      return [
        { id:'pinned', title:'Fixadas', subtitle:'Sempre em destaque', icon:'push_pin', cards:notes.filter(note => note.arquivado!==true&&note.fixado===true).map(card) },
        { id:'notes', title:'Notas', subtitle:'Notas ativas', icon:'description', cards:notes.filter(note => note.arquivado!==true&&note.fixado!==true).map(card) },
        { id:'archived', title:'Arquivadas', subtitle:'Guardadas fora da lista', icon:'archive', cards:notes.filter(note => note.arquivado===true).map(card) },
      ] as BoardColumn[]
    }

    if (view === 'finance') {
      const transactions = rows(state.finance?.transactions)
      const card = (item:Row):BoardCard => ({ id:String(item.id), title:String(item.titulo||item.descricao||'Lançamento'), subtitle:item.tipo==='receita'?'Receita':'Despesa', detail:money.format(Number(item.valor||0)), date:dateKey(item.data), color:item.tipo==='receita'?'var(--mai-success,#5d8a68)':'var(--mai-danger,#c85b52)', kind:'finance', sourceId:String(item.id), raw:item, draggable:true })
      const isPaid=(item:Row)=>paid(item.status)||(Number(item.valor||0)>0&&Number(item.valor_pago||0)>=Number(item.valor||0))
      return [
        { id:'pending', title:'Pendentes', subtitle:'Ainda não liquidados', icon:'schedule', cards:transactions.filter(item => !item.ignorar_calculo&&!isPaid(item)).map(card) },
        { id:'paid', title:'Pagos', subtitle:'Lançamentos liquidados', icon:'payments', cards:transactions.filter(item => !item.ignorar_calculo&&isPaid(item)).map(card) },
        { id:'ignored', title:'Ignorados', subtitle:'Fora dos cálculos', icon:'visibility_off', cards:transactions.filter(item => item.ignorar_calculo===true).map(card) },
      ] as BoardColumn[]
    }

    if (view === 'health') {
      const diary = state.health?.diary && typeof state.health.diary === 'object' ? state.health.diary as Record<string,Row> : {}
      const last7 = addDays(today,-6)
      const card = ([day,value]:[string,Row]):BoardCard => {
        const facts = Object.entries(value).filter(([,entry]) => entry!==''&&entry!=null&&typeof entry!=='object').slice(0,3).map(([key,entry]) => `${key.replaceAll('_',' ')}: ${String(entry)}`)
        return { id:day, title:day===today?'Hoje':new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR',{day:'numeric',month:'long'}), subtitle:'Registro de bem-estar', detail:facts.join(' · '), date:day }
      }
      const entries = Object.entries(diary).sort(([a],[b])=>b.localeCompare(a)) as [string,Row][]
      return [
        { id:'today', title:'Hoje', subtitle:'Registro do dia atual', icon:'today', cards:entries.filter(([day])=>day===today).map(card) },
        { id:'recent', title:'Últimos 7 dias', subtitle:'Registros recentes', icon:'monitoring', cards:entries.filter(([day])=>day<today&&day>=last7).map(card) },
        { id:'older', title:'Anteriores', subtitle:'Histórico mais antigo', icon:'history', cards:entries.filter(([day])=>day<last7).map(card) },
      ] as BoardColumn[]
    }

    const files = rows(state.drive?.items)
    const card = (item:Row):BoardCard => ({ id:String(item.id||item.fileId||item.name), title:String(item.nome||item.name||'Arquivo'), subtitle:item.tipo==='folder'||item.mimeType==='application/vnd.google-apps.folder'?'Pasta':String(item.mimeType||'Arquivo'), detail:String(item.modifiedTime||item.data_modificacao||'') })
    return [
      { id:'folders', title:'Pastas', subtitle:'Organização do Drive', icon:'folder', cards:files.filter(item => item.tipo==='folder'||item.mimeType==='application/vnd.google-apps.folder').map(card) },
      { id:'files', title:'Arquivos', subtitle:'Documentos e anexos', icon:'draft', cards:files.filter(item => !(item.tipo==='folder'||item.mimeType==='application/vnd.google-apps.folder')).map(card) },
    ] as BoardColumn[]
  }, [view, state, today])

  function moveCard(cardId: string, columnId: string) {
    if (!cardId) return
    if (view === 'habits') {
      const habit = rows(state.habits).find(item => String(item.id) === cardId)
      if (!habit) return
      const target = Math.max(1,Number(habit.meta||1))
      const value = columnId === 'done' ? target : columnId === 'doing' ? Math.max(0.5,target/2) : 0
      commit(current => {
        const existing = rows(current.habitEntries).find(entry => String(entry.habito_id)===cardId&&dateKey(entry.data)===today)
        const clean = rows(current.habitEntries).filter(entry => !(String(entry.habito_id)===cardId&&dateKey(entry.data)===today))
        return { ...current, habitEntries:value>0?[...clean,{id:existing?.id||`hr-${crypto.randomUUID()}`,habito_id:cardId,data:today,valor:value,criado_em:existing?.criado_em||new Date().toISOString()}]:clean }
      })
    }
    if (view === 'goals') commit(current => ({ ...current, goals:rows(current.goals).map(goal => String(goal.id)===cardId ? { ...goal, status:columnId==='done'?'Concluída':columnId==='paused'?'Pausada':'Em Andamento', concluida:columnId==='done', concluida_em:columnId==='done'?String(goal.concluida_em||new Date().toISOString()):'' } : goal) }))
    if (view === 'notes') commit(current => ({ ...current, notes:rows(current.notes).map(note => String(note.id)===cardId ? { ...note, fixado:columnId==='pinned', arquivado:columnId==='archived' } : note) }))
    if (view === 'finance') commit(current => ({ ...current, finance:{ ...current.finance, transactions:rows(current.finance.transactions).map(item => String(item.id)===cardId ? { ...item, ignorar_calculo:columnId==='ignored', status:columnId==='paid'?'pago':'pendente', valor_pago:columnId==='paid'?Number(item.valor||0):0 } : item) } }))
    setDragId('')
    setOverColumn('')
  }

  function openCard(card: BoardCard) {
    if (!card.kind || !card.sourceId || !card.raw) return
    inspect({ kind:card.kind, sourceId:card.sourceId, title:card.title, date:card.date, raw:card.raw })
  }

  const movable = ['habits','goals','notes','finance'].includes(view)
  return <div className="mai-global-kanban">
    <div className="mai-global-kanban-note"><span className="material-symbols-rounded">view_kanban</span><span>Kanban · {board.reduce((total,column)=>total+column.cards.length,0)} itens</span></div>
    <div className="mai-kanban-board mai-kanban-board-global" style={{gridTemplateColumns:`repeat(${Math.max(1,board.length)},minmax(220px,1fr))`}}>
      {board.map(column => <section key={column.id} className="mai-kanban-column" data-status={column.id} data-over={overColumn===column.id||undefined} onDragEnter={event=>{if(!movable)return;event.preventDefault();setOverColumn(column.id)}} onDragOver={event=>{if(movable)event.preventDefault()}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setOverColumn('')}} onDrop={event=>{if(!movable)return;event.preventDefault();moveCard(dragId,column.id)}}>
        <header className="mai-kanban-column-head"><div><span className="material-symbols-rounded">{column.icon}</span><strong>{column.title}</strong><b>{column.cards.length}</b></div><small>{column.subtitle}</small></header>
        <div className="mai-kanban-cards">
          {column.cards.map(card => <article key={card.id} className="mai-kanban-card mai-global-kanban-card" data-overdue={card.date&&card.date<today&&!['completed','health'].includes(view)||undefined} draggable={Boolean(movable&&card.draggable)} onDragStart={event=>{if(!movable||!card.draggable)return;setDragId(card.id);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',card.id)}} onDragEnd={()=>{setDragId('');setOverColumn('')}} onClick={()=>openCard(card)}>
            <div className="mai-kanban-card-top">{card.priority?<i className="mai-kanban-priority" data-priority={card.priority}/>:<i className="mai-global-kanban-kind" style={card.color?{background:card.color}:undefined}/>}<span>{card.subtitle||''}</span></div>
            <strong className="mai-kanban-card-title">{card.title}</strong>
            {card.detail?<p>{card.detail}</p>:null}
            {card.date?<div className="mai-kanban-card-meta"><span><span className="material-symbols-rounded">event</span>{naturalDate(card.date,today)}</span></div>:null}
          </article>)}
          {!column.cards.length?<div className="mai-kanban-empty"><span className="material-symbols-rounded">space_dashboard</span><small>Nenhum item aqui.</small></div>:null}
        </div>
      </section>)}
    </div>
  </div>
}
