'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import styles from './mai-v2.module.css'
import { createTask, dateKey, emptyState, LegacyTask, loadState, MaiState, persistState } from '../../lib/v2/state'
import { V2ModuleView } from './V2ModuleViews'

type Area = 'inicio' | 'planejar' | 'tarefas' | 'rotinas' | 'projetos' | 'notas' | 'dinheiro' | 'bem-estar' | 'arquivos'

const areas: { id: Area; label: string; icon: string }[] = [
  { id: 'inicio', label: 'Início', icon: 'home' },
  { id: 'planejar', label: 'Planejar', icon: 'calendar' },
  { id: 'tarefas', label: 'Tarefas', icon: 'check' },
  { id: 'rotinas', label: 'Rotinas', icon: 'repeat' },
  { id: 'projetos', label: 'Projetos', icon: 'folder' },
  { id: 'notas', label: 'Notas', icon: 'note' },
  { id: 'dinheiro', label: 'Dinheiro', icon: 'wallet' },
  { id: 'bem-estar', label: 'Bem-estar', icon: 'heart' },
  { id: 'arquivos', label: 'Arquivos', icon: 'cloud' },
]

const iconPaths: Record<string, string> = {
  home: 'M3 11.5 12 4l9 7.5V21h-6v-6H9v6H3z',
  calendar: 'M5 3v3m14-3v3M4 8h16v12H4zM8 12h3v3H8z',
  check: 'm5 12 4 4L19 6',
  repeat: 'M17 2l4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3',
  folder: 'M3 6h7l2 2h9v11H3z',
  note: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  wallet: 'M3 6h16v14H3zM3 9h18v7h-5a3 3 0 0 1 0-6h5',
  heart: 'M12 21S3 15.5 3 9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 9 2.5C21 15.5 12 21 12 21Z',
  cloud: 'M7 19h11a4 4 0 0 0 .6-7.95A7 7 0 0 0 5.2 9.4 4.8 4.8 0 0 0 7 19Z',
  plus: 'M12 5v14M5 12h14',
  search: 'm20 20-4.5-4.5M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
}

function Icon({ name, size = 19 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={iconPaths[name]} />
    </svg>
  )
}

function taskDate(task: LegacyTask) {
  return String(task.data_vencimento || '').slice(0, 10)
}

export function MaiV2App() {
  const [area, setArea] = useState<Area>('inicio')
  const [state, setState] = useState<MaiState>(() => emptyState())
  const [ready, setReady] = useState(false)
  const [title, setTitle] = useState('')
  const [now, setNow] = useState<Date | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    setState(loadState())
    setNow(new Date())
    setReady(true)
  }, [])

  const today = dateKey(now || new Date())
  const todayTasks = useMemo(
    () => state.tasks
      .filter(task => taskDate(task) === today)
      .sort((a, b) => Number(a.concluida) - Number(b.concluida) || Number(a.ordem || 0) - Number(b.ordem || 0)),
    [state.tasks, today],
  )
  const completed = todayTasks.filter(task => task.concluida).length
  const pending = todayTasks.length - completed
  const progress = todayTasks.length ? Math.round((completed / todayTasks.length) * 100) : 0

  function updateTasks(tasks: LegacyTask[]) {
    const next = persistState({ ...state, tasks })
    setState(next)
  }

  function addTaskForDate(taskTitle: string, dueDate = today) {
    const task = { ...createTask(taskTitle), data_vencimento: dueDate }
    updateTasks([...state.tasks, task])
  }

  function addTask(event: FormEvent) {
    event.preventDefault()
    const value = title.trim()
    if (!value) return
    addTaskForDate(value)
    setTitle('')
  }

  function toggleTask(id: string) {
    updateTasks(state.tasks.map(task => task.id === id ? { ...task, concluida: !task.concluida } : task))
  }

  const greeting = !now ? 'Olá' : now.getHours() < 12 ? 'Bom dia' : now.getHours() < 18 ? 'Boa tarde' : 'Boa noite'
  const formattedDate = now?.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const activeLabel = areas.find(item => item.id === area)?.label || 'Início'
  const eventRows = Array.isArray(state.events) ? state.events as Array<Record<string, any>> : []
  const habitRows = Array.isArray(state.habits) ? state.habits as Array<Record<string, any>> : []
  const habitEntryRows = Array.isArray(state.habitEntries) ? state.habitEntries as Array<Record<string, any>> : []
  const projectRows = Array.isArray(state.projects) ? state.projects as Array<Record<string, any>> : []
  const overdueTasks = state.tasks.filter(task => !task.concluida && taskDate(task) && taskDate(task) < today)
  const todayEvents = eventRows.filter(event => String(event.data_inicio || '').slice(0, 10) === today)
  const nextWeek = new Date(new Date(`${today}T12:00:00`).getTime() + 7 * 86400000).toISOString().slice(0, 10)
  const upcomingTasks = state.tasks
    .filter(task => !task.concluida && taskDate(task) > today && taskDate(task) <= nextWeek)
    .sort((a, b) => taskDate(a).localeCompare(taskDate(b)))
  const habitsDoneToday = habitEntryRows.filter(entry => String(entry.data || '').slice(0, 10) === today).length
  const finance = state.finance as Record<string, any>
  const pendingFinance = Array.isArray(finance.transactions)
    ? finance.transactions.filter((item: Record<string, any>) => !['pago','paga','concluido','concluída'].includes(String(item.status || '').toLowerCase())).length
    : 0
  const todayOverviewItems: Array<{ id: string; type: 'Tarefa' | 'Agenda'; title: string; time: string; done: boolean }> = [
    ...todayTasks.map(task => ({
      id: task.id,
      type: 'Tarefa' as const,
      title: task.titulo,
      time: String(task.data_vencimento || '').includes('T') ? String(task.data_vencimento).slice(11, 16) : 'Dia todo',
      done: task.concluida === true,
    })),
    ...todayEvents.map(event => ({
      id: String(event.id),
      type: 'Agenda' as const,
      title: String(event.titulo || 'Compromisso'),
      time: String(event.hora_inicio || 'Dia todo'),
      done: false,
    })),
  ].sort((a, b) => (a.time === 'Dia todo' ? '99:99' : a.time).localeCompare(b.time === 'Dia todo' ? '99:99' : b.time))

  return (
    <div className={styles.app}>
      <aside className={styles.sidebar} data-open={sidebarOpen}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>M</div>
          <div><strong>MAI</strong><span>Seu espaço pessoal</span></div>
        </div>

        <nav className={styles.nav} aria-label="Áreas do MAI">
          <span className={styles.navCaption}>Organizar</span>
          {areas.slice(0, 5).map(item => (
            <button key={item.id} className={area === item.id ? styles.navActive : ''} onClick={() => { setArea(item.id); setSidebarOpen(false) }}>
              <Icon name={item.icon} /><span>{item.label}</span>
            </button>
          ))}
          <span className={styles.navCaption}>Vida</span>
          {areas.slice(5).map(item => (
            <button key={item.id} className={area === item.id ? styles.navActive : ''} onClick={() => { setArea(item.id); setSidebarOpen(false) }}>
              <Icon name={item.icon} /><span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className={styles.account}>
          <div className={styles.avatar}>A</div>
          <div><strong>Adm</strong><span>Sincronização ativa</span></div>
          <button aria-label="Mais opções"><Icon name="more" /></button>
        </div>
      </aside>

      {sidebarOpen && <button className={styles.scrim} aria-label="Fechar menu" onClick={() => setSidebarOpen(false)} />}

      <main className={styles.main}>
        <header className={styles.topbar}>
          <button className={styles.menuButton} onClick={() => setSidebarOpen(true)} aria-label="Abrir menu"><Icon name="menu" /></button>
          <div className={styles.breadcrumb}><span>MAI</span><b>/</b><strong>{activeLabel}</strong></div>
          <div className={styles.topActions}>
            <button className={styles.searchButton}><Icon name="search" /><span>Buscar</span><kbd>⌘ K</kbd></button>
            <button className={styles.newButton} onClick={() => document.getElementById('v2-quick-task')?.focus()}><Icon name="plus" />Novo</button>
          </div>
        </header>

        {area === 'inicio' ? (
          <div className={styles.glanceContent}>
            <section className={styles.glanceHeader}>
              <div>
                <span>{formattedDate || 'Carregando seu dia...'}</span>
                <h1>Visão geral</h1>
                <p>O que importa, o que precisa de atenção e o que vem depois.</p>
              </div>
              <button onClick={() => document.getElementById('v2-glance-add')?.focus()}><Icon name="plus" /> Adicionar item</button>
            </section>

            <section className={styles.glanceSummary} aria-label="Resumo rápido">
              <article><span>Hoje</span><strong>{ready ? todayOverviewItems.length : '—'}</strong><small>{pending} tarefas · {todayEvents.length} compromissos</small></article>
              <article data-alert={overdueTasks.length > 0}><span>Precisam de atenção</span><strong>{ready ? overdueTasks.length : '—'}</strong><small>{overdueTasks.length ? 'Itens atrasados' : 'Nenhum item atrasado'}</small></article>
              <article><span>Próximos 7 dias</span><strong>{ready ? upcomingTasks.length : '—'}</strong><small>Itens já planejados</small></article>
              <article><span>Progresso de hoje</span><strong>{progress}%</strong><div><i style={{ width: `${progress}%` }} /></div></article>
            </section>

            <section className={styles.glanceMainGrid}>
              <article className={styles.todayOverview}>
                <header>
                  <div><span>Hoje</span><h2>Seu dia em ordem</h2></div>
                  <button onClick={() => setArea('planejar')}>Abrir planejamento</button>
                </header>

                <form className={styles.glanceAdd} onSubmit={addTask}>
                  <button type="submit" aria-label="Adicionar">＋</button>
                  <input id="v2-glance-add" value={title} onChange={event => setTitle(event.target.value)} placeholder="Escreva e pressione Enter para adicionar uma tarefa hoje" autoComplete="off" />
                  <kbd>Enter</kbd>
                </form>

                <div className={styles.overviewList}>
                  {!ready ? <div className={styles.glanceEmpty}>Carregando informações...</div> : todayOverviewItems.length ? todayOverviewItems.map(item => (
                    <div key={`${item.type}-${item.id}`} className={styles.overviewRow} data-done={item.done}>
                      <time>{item.time}</time>
                      <span data-type={item.type}>{item.type}</span>
                      <strong>{item.title}</strong>
                      {item.type === 'Tarefa'
                        ? <button onClick={() => toggleTask(item.id)}>{item.done ? 'Concluída' : 'Concluir'}</button>
                        : <button onClick={() => setArea('planejar')}>Ver agenda</button>}
                    </div>
                  )) : <div className={styles.glanceEmpty}><strong>Seu dia está livre</strong><span>Adicione uma tarefa ou compromisso quando precisar.</span></div>}
                </div>
              </article>

              <aside className={styles.attentionColumn}>
                <section className={styles.attentionPanel}>
                  <header><div><span>Atenção</span><h2>Pendências</h2></div><b>{overdueTasks.length}</b></header>
                  {overdueTasks.length ? overdueTasks.slice(0, 4).map(task => (
                    <button key={task.id} onClick={() => setArea('tarefas')}><i /><span><strong>{task.titulo}</strong><small>Venceu em {new Date(`${taskDate(task)}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}</small></span><b>→</b></button>
                  )) : <div className={styles.compactEmpty}><i>✓</i><span><strong>Nada atrasado</strong><small>Você está em dia.</small></span></div>}
                </section>

                <section className={styles.nextPanel}>
                  <header><div><span>Depois</span><h2>Próximos 7 dias</h2></div><button onClick={() => setArea('planejar')}>Ver tudo</button></header>
                  {upcomingTasks.length ? upcomingTasks.slice(0, 4).map(task => (
                    <div key={task.id}><time>{new Date(`${taskDate(task)}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' })}</time><span>{task.titulo}</span></div>
                  )) : <div className={styles.compactEmpty}><i>○</i><span><strong>Nada planejado</strong><small>Os próximos dias estão livres.</small></span></div>}
                </section>
              </aside>
            </section>

            <section className={styles.followSection}>
              <header><div><span>Acompanhamento</span><h2>Outras áreas importantes</h2></div><small>Resumo, sem precisar abrir cada tela</small></header>
              <div className={styles.followGrid}>
                <button onClick={() => setArea('rotinas')}><span>Rotinas</span><strong>{habitsDoneToday} de {habitRows.length}</strong><small>concluídas hoje</small><b>→</b></button>
                <button onClick={() => setArea('projetos')}><span>Projetos</span><strong>{projectRows.length}</strong><small>em acompanhamento</small><b>→</b></button>
                <button onClick={() => setArea('dinheiro')}><span>Dinheiro</span><strong>{pendingFinance}</strong><small>movimentações pendentes</small><b>→</b></button>
                <button onClick={() => setArea('bem-estar')}><span>Bem-estar</span><strong>{Object.keys((state.health as Record<string, any>)?.diary?.[today] || {}).length ? 'Registrado' : 'Pendente'}</strong><small>check-in de hoje</small><b>→</b></button>
              </div>
            </section>
          </div>
        ) : (
          <V2ModuleView
            area={area}
            state={state}
            today={today}
            onCreateTask={addTaskForDate}
            onToggleTask={toggleTask}
          />
        )}
      </main>
    </div>
  )
}
