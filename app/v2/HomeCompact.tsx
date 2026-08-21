'use client'

import { useMemo } from 'react'
import { plannerItems } from '../../lib/v2/planner'
import type { MaiState } from '../../lib/v2/state'
import type { AppView } from './app-types'
import { MaiIcon } from './MaiIcons'

type Row = Record<string, any>
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const dateKey = (value: unknown) => String(value || '').slice(0, 10)

export function HomeCompact({ state, today, navigate, onSearch }: { state: MaiState; today: string; navigate: (view: AppView) => void; onSearch: () => void }) {
  const plan = useMemo(() => plannerItems(state, today, today), [state, today])
  const tasks = state.tasks.filter(task => !task.concluida && dateKey(task.data_vencimento) === today)
  const appointments = plan.filter(item => item.kind === 'event')
  const habits = rows(state.habits).filter(item => item.ativo !== false)
  const entries = rows(state.habitEntries).filter(item => dateKey(item.data) === today)
  const habitDone = habits.filter(habit => Number(entries.find(entry => String(entry.habito_id) === String(habit.id))?.valor || 0) >= Math.max(1, Number(habit.meta || 1))).length
  const goals = rows(state.goals).filter(goal => !String(goal.status || '').toLocaleLowerCase('pt-BR').includes('conclu') && !String(goal.status || '').toLocaleLowerCase('pt-BR').includes('paus'))
  const notes = [...rows(state.notes)].filter(note => note.ativo !== false && note.arquivado !== true).sort((a,b) => String(b.data || '').localeCompare(String(a.data || ''))).slice(0,3)
  const dateLabel = new Date(`${today}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return <div className="mai-v4-home">
    <header className="mai-v3-page-header mai-v4-home-header">
      <div><h1>Início</h1><p>{dateLabel}</p></div>
      <div className="mai-v3-page-actions"><button aria-label="Buscar" title="Buscar" onClick={onSearch}><MaiIcon name="search" size={18}/></button></div>
    </header>

    <div className="mai-v4-home-grid">
      <section className="mai-v4-home-main">
        <div className="mai-v4-section-head"><h2>Hoje</h2><button onClick={() => navigate('today')}>Abrir tarefas</button></div>
        <div className="mai-v4-home-flow">
          <button onClick={() => navigate('today')}><span><MaiIcon name="today" size={17}/></span><div><strong>{tasks.length}</strong><small>{tasks.length === 1 ? 'tarefa para hoje' : 'tarefas para hoje'}</small></div></button>
          <button onClick={() => navigate('today')}><span><MaiIcon name="calendar" size={17}/></span><div><strong>{appointments.length}</strong><small>{appointments.length === 1 ? 'compromisso' : 'compromissos'}</small></div></button>
          <button onClick={() => navigate('habits')}><span><MaiIcon name="habits" size={17}/></span><div><strong>{habitDone}/{habits.length}</strong><small>hábitos concluídos</small></div></button>
        </div>

        <section className="mai-v4-home-section">
          <div className="mai-v4-section-head"><h2>Em andamento</h2><button onClick={() => navigate('goals')}>Ver metas</button></div>
          <div className="mai-v4-home-goals">{goals.slice(0,4).map(goal => {
            const total = Math.max(1, Number(goal.progresso_total || 100)); const pct = Math.max(0, Math.min(100, Math.round(Number(goal.progresso_atual || 0) / total * 100)))
            return <button key={String(goal.id)} onClick={() => navigate('goals')}><div><strong>{goal.titulo || 'Meta'}</strong><span>{pct}%</span></div><i><b style={{width:`${pct}%`}}/></i></button>
          })}{!goals.length ? <div className="mai-v3-empty-line">Nenhuma meta em andamento.</div> : null}</div>
        </section>
      </section>

      <aside className="mai-v4-home-side">
        <section><div className="mai-v4-section-head"><h2>Notas recentes</h2><button onClick={() => navigate('notes')}>Ver todas</button></div><div className="mai-v4-home-notes">{notes.map(note => <button key={String(note.id)} onClick={() => navigate('notes')}><strong>{note.titulo || 'Sem título'}</strong><small>{dateKey(note.data) ? new Date(`${dateKey(note.data)}T12:00:00`).toLocaleDateString('pt-BR',{day:'numeric',month:'short'}) : ''}</small></button>)}{!notes.length ? <div className="mai-v3-empty-line">Nenhuma nota ainda.</div> : null}</div></section>
      </aside>
    </div>
  </div>
}
