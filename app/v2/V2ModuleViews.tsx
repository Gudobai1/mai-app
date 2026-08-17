'use client'

import { FormEvent, useMemo, useState } from 'react'
import styles from './mai-v2.module.css'
import type { LegacyTask, MaiState } from '../../lib/v2/state'

type Props = {
  area: string
  state: MaiState
  today: string
  onCreateTask: (title: string, dueDate?: string) => void
  onToggleTask: (id: string) => void
}

const rows = (value: unknown) => Array.isArray(value) ? value as Array<Record<string, any>> : []
const taskDate = (task: LegacyTask) => String(task.data_vencimento || '').slice(0, 10)
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function Header({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: string }) {
  return (
    <header className={styles.viewHeader}>
      <div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
      {action && <button className={styles.primaryAction}>＋ {action}</button>}
    </header>
  )
}

function Empty({ icon, title, text, action }: { icon: string; title: string; text: string; action?: string }) {
  return (
    <div className={styles.viewEmpty}>
      <i>{icon}</i><strong>{title}</strong><p>{text}</p>
      {action && <button>{action}</button>}
    </div>
  )
}

function PlanningView({ state, today }: Pick<Props, 'state' | 'today'>) {
  const base = new Date(`${today}T12:00:00`)
  const year = base.getFullYear()
  const month = base.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const lastDate = new Date(year, month + 1, 0).getDate()
  const previousLast = new Date(year, month, 0).getDate()
  const tasks = state.tasks
  const events = rows(state.events)
  const monthName = base.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    let day = index - firstDay + 1
    let cellMonth = month
    let cellYear = year
    let outside = false
    if (day < 1) { day = previousLast + day; cellMonth--; outside = true }
    if (day > lastDate) { day -= lastDate; cellMonth++; outside = true }
    if (cellMonth < 0) { cellMonth = 11; cellYear-- }
    if (cellMonth > 11) { cellMonth = 0; cellYear++ }
    const key = `${cellYear}-${String(cellMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const total = tasks.filter(task => taskDate(task) === key).length + events.filter(event => String(event.data_inicio || '').slice(0, 10) === key).length
    return { day, key, outside, total }
  })

  const agenda = [
    ...tasks.filter(task => taskDate(task) >= today && !task.concluida).map(task => ({ type: 'Tarefa', title: task.titulo, date: taskDate(task), time: String(task.data_vencimento || '').includes('T') ? String(task.data_vencimento).slice(11, 16) : 'Dia todo' })),
    ...events.filter(event => String(event.data_inicio || '').slice(0, 10) >= today).map(event => ({ type: 'Agenda', title: event.titulo || 'Compromisso', date: String(event.data_inicio || '').slice(0, 10), time: event.hora_inicio || 'Dia todo' })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6)

  return (
    <>
      <Header eyebrow="Visão geral" title="Planejar" description="Tarefas e compromissos em uma única linha do tempo." action="Novo compromisso" />
      <div className={styles.plannerLayout}>
        <section className={styles.calendarCard}>
          <div className={styles.calendarToolbar}>
            <div><button aria-label="Mês anterior">‹</button><h2>{monthName}</h2><button aria-label="Próximo mês">›</button></div>
            <button>Hoje</button>
          </div>
          <div className={styles.weekDays}>{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(day => <span key={day}>{day}</span>)}</div>
          <div className={styles.monthGrid}>
            {calendarDays.map(cell => (
              <button key={cell.key} data-current={cell.key === today} data-outside={cell.outside}>
                <span>{cell.day}</span>
                {cell.total > 0 && <i>{cell.total}</i>}
              </button>
            ))}
          </div>
        </section>
        <aside className={styles.agendaRail}>
          <div className={styles.railHead}><div><span>Próximos</span><h2>Sua agenda</h2></div><button>•••</button></div>
          {agenda.length ? <div className={styles.agendaList}>{agenda.map((item, index) => (
            <article key={`${item.type}-${index}`}><time>{new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</time><i /><div><span>{item.type} · {item.time}</span><strong>{item.title}</strong></div></article>
          ))}</div> : <Empty icon="◇" title="Agenda livre" text="Seus próximos compromissos aparecerão aqui." />}
        </aside>
      </div>
    </>
  )
}

function TasksView({ state, today, onCreateTask, onToggleTask }: Props) {
  const [filter, setFilter] = useState<'abertas' | 'todas' | 'concluidas'>('abertas')
  const [draft, setDraft] = useState('')
  const visible = state.tasks.filter(task => filter === 'todas' || (filter === 'concluidas' ? task.concluida : !task.concluida))
  const todayCount = state.tasks.filter(task => taskDate(task) === today && !task.concluida).length
  const upcomingCount = state.tasks.filter(task => taskDate(task) > today && !task.concluida).length

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!draft.trim()) return
    onCreateTask(draft.trim(), today)
    setDraft('')
  }

  return (
    <>
      <Header eyebrow="Organização" title="Tarefas" description="Capture, priorize e conclua sem esperar o servidor." action="Nova tarefa" />
      <div className={styles.tasksLayout}>
        <aside className={styles.taskFilters}>
          <button className={styles.filterActive}><span>Hoje</span><b>{todayCount}</b></button>
          <button><span>Próximas</span><b>{upcomingCount}</b></button>
          <button><span>Entrada</span><b>{state.tasks.filter(task => task.projeto_id === 'entrada').length}</b></button>
          <hr />
          <small>Visualização</small>
          <button onClick={() => setFilter('abertas')} data-selected={filter === 'abertas'}><span>Em aberto</span></button>
          <button onClick={() => setFilter('todas')} data-selected={filter === 'todas'}><span>Todas</span></button>
          <button onClick={() => setFilter('concluidas')} data-selected={filter === 'concluidas'}><span>Concluídas</span></button>
        </aside>
        <section className={styles.taskWorkspace}>
          <form className={styles.moduleQuickAdd} onSubmit={submit}><button>＋</button><input value={draft} onChange={event => setDraft(event.target.value)} placeholder="Adicionar uma tarefa..." /><kbd>Enter</kbd></form>
          <div className={styles.listToolbar}><strong>{filter === 'abertas' ? 'Em aberto' : filter === 'concluidas' ? 'Concluídas' : 'Todas as tarefas'}</strong><span>{visible.length} itens</span></div>
          {visible.length ? <div className={styles.moduleTaskList}>{visible.map(task => (
            <label key={task.id} data-done={task.concluida}><input type="checkbox" checked={task.concluida === true} onChange={() => onToggleTask(task.id)} /><i /><div><strong>{task.titulo}</strong><span>{taskDate(task) ? new Date(`${taskDate(task)}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) : 'Sem data'} · {task.projeto_id === 'entrada' ? 'Entrada' : 'Projeto'}</span></div><button type="button">•••</button></label>
          ))}</div> : <Empty icon="✓" title="Tudo organizado" text="Nenhuma tarefa nesta visualização." />}
        </section>
      </div>
    </>
  )
}

function RoutinesView({ state, today }: Pick<Props, 'state' | 'today'>) {
  const habits = rows(state.habits)
  const entries = rows(state.habitEntries).filter(entry => entry.data === today)
  return (
    <>
      <Header eyebrow="Consistência" title="Rotinas" description="Acompanhe hábitos sem transformar seu dia em uma planilha." action="Nova rotina" />
      <section className={styles.routineHero}>
        <div><span>Hoje</span><strong>{entries.length}<small> concluídas</small></strong><p>Continue no seu ritmo. Consistência importa mais que perfeição.</p></div>
        <div className={styles.rings}><i style={{'--value': `${habits.length ? Math.min(100, Math.round(entries.length / habits.length * 100)) : 0}%`} as React.CSSProperties}><span>{habits.length ? Math.round(entries.length / habits.length * 100) : 0}%</span></i></div>
      </section>
      {habits.length ? <div className={styles.cardGrid}>{habits.map(habit => {
        const done = entries.some(entry => String(entry.habito_id) === String(habit.id))
        return <article className={styles.routineCard} key={String(habit.id)} data-done={done}><div className={styles.cardIcon}>{habit.icone || '✓'}</div><button>•••</button><strong>{habit.nome || 'Rotina'}</strong><span>{habit.meta || 1} {habit.unidade || 'vez por dia'}</span><footer><i>{done ? '✓' : ''}</i><small>{done ? 'Feito hoje' : 'Marcar como feito'}</small></footer></article>
      })}</div> : <section className={styles.largeEmpty}><Empty icon="↻" title="Crie sua primeira rotina" text="Monte hábitos simples e acompanhe seu ritmo ao longo da semana." action="Criar rotina" /></section>}
    </>
  )
}

function ProjectsView({ state }: Pick<Props, 'state'>) {
  const projects = rows(state.projects)
  const display = [{ id: 'entrada', nome: 'Entrada', cor: '#7d887c' }, ...projects]
  return (
    <>
      <Header eyebrow="Resultados" title="Projetos" description="Organize tarefas em resultados claros, com começo, meio e fim." action="Novo projeto" />
      <div className={styles.projectOverview}><div><span>Projetos ativos</span><strong>{projects.length}</strong></div><div><span>Tarefas distribuídas</span><strong>{state.tasks.filter(task => task.projeto_id !== 'entrada').length}</strong></div><div><span>Na entrada</span><strong>{state.tasks.filter(task => task.projeto_id === 'entrada').length}</strong></div></div>
      <div className={styles.projectGrid}>{display.map((project, index) => {
        const count = state.tasks.filter(task => String(task.projeto_id || 'entrada') === String(project.id)).length
        const done = state.tasks.filter(task => String(task.projeto_id || 'entrada') === String(project.id) && task.concluida).length
        const progress = count ? Math.round(done / count * 100) : 0
        return <article className={styles.projectCard} key={String(project.id)}><header><i style={{background: project.cor || ['#71806f','#807767','#697886'][index % 3]}} /><button>•••</button></header><strong>{project.nome || project.name || 'Projeto sem nome'}</strong><p>{count} tarefas · {done} concluídas</p><div><i style={{width: `${progress}%`}} /></div><footer><span>{progress}% concluído</span><b>→</b></footer></article>
      })}</div>
    </>
  )
}

function NotesView({ state }: Pick<Props, 'state'>) {
  const notes = rows(state.notes).filter(note => note.ativo !== false && note.arquivado !== true)
  return (
    <>
      <Header eyebrow="Conhecimento" title="Notas" description="Um espaço simples para ideias, referências e decisões." action="Nova nota" />
      <div className={styles.notesToolbar}><div><button className={styles.filterActive}>Todas</button><button>Fixadas</button><button>Arquivadas</button></div><label>⌕<input placeholder="Buscar notas" /></label></div>
      {notes.length ? <div className={styles.notesGrid}>{notes.map(note => <article className={styles.noteCard} key={String(note.id)}><header><span>{note.fixado ? 'Fixada' : 'Nota'}</span><button>•••</button></header><strong>{note.titulo || 'Sem título'}</strong><p>{String(note.conteudo || 'Nota sem conteúdo').replace(/<[^>]*>/g, '').slice(0, 180)}</p><footer>{new Date(note.data || Date.now()).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}</footer></article>)}</div> : <section className={styles.largeEmpty}><Empty icon="▤" title="Seu espaço está limpo" text="Crie notas rápidas e encontre tudo quando precisar." action="Criar nota" /></section>}
    </>
  )
}

function MoneyView({ state }: Pick<Props, 'state'>) {
  const finance = state.finance as Record<string, unknown>
  const transactions = rows(finance.transactions)
  const income = transactions.filter(item => item.tipo === 'receita').reduce((sum, item) => sum + Number(item.valor || 0), 0)
  const expense = transactions.filter(item => item.tipo !== 'receita').reduce((sum, item) => sum + Number(item.valor || 0), 0)
  return (
    <>
      <Header eyebrow="Visão financeira" title="Dinheiro" description="Entenda seu mês sem excesso de gráficos e controles." action="Nova movimentação" />
      <div className={styles.moneyCards}><article className={styles.balanceCard}><span>Saldo do período</span><strong>{money.format(income - expense)}</strong><small>Receitas menos despesas registradas</small></article><article><span>Entradas</span><strong>{money.format(income)}</strong><small>Este período</small></article><article><span>Saídas</span><strong>{money.format(expense)}</strong><small>Este período</small></article></div>
      <div className={styles.moneyLayout}><section className={styles.transactionPanel}><div className={styles.panelHead}><div><span>Movimentações</span><h2>Recentes</h2></div><button>Filtrar</button></div>{transactions.length ? <div className={styles.transactionList}>{transactions.slice(0, 8).map(item => <article key={String(item.id)}><i data-type={item.tipo}>{item.tipo === 'receita' ? '↙' : '↗'}</i><div><strong>{item.titulo || item.descricao || 'Movimentação'}</strong><span>{item.categoria || 'Sem categoria'} · {item.data || 'Sem data'}</span></div><b data-negative={item.tipo !== 'receita'}>{item.tipo === 'receita' ? '+' : '−'} {money.format(Number(item.valor || 0))}</b></article>)}</div> : <Empty icon="↕" title="Nenhuma movimentação" text="Registre uma entrada ou saída para começar." />}</section><aside className={styles.budgetCard}><span>Orçamento do mês</span><strong>Visão tranquila</strong><p>Defina limites por categoria e acompanhe apenas o essencial.</p><button>Configurar orçamento</button></aside></div>
    </>
  )
}

function WellbeingView({ state, today }: Pick<Props, 'state' | 'today'>) {
  const health = state.health as Record<string, any>
  const diary = health.diary?.[today] || {}
  const trackers = rows(health.trackers)
  return (
    <>
      <Header eyebrow="Equilíbrio" title="Bem-estar" description="Saúde, energia e autocuidado apresentados com leveza." action="Registrar agora" />
      <div className={styles.wellbeingHero}><div><span>Como você está hoje?</span><h2>Faça um pequeno check-in</h2><p>Leva menos de um minuto e ajuda a entender seus padrões.</p><div className={styles.moodRow}>{['Muito bem','Bem','Neutro','Cansado','Difícil'].map((mood, index) => <button key={mood} title={mood}>{['●','◕','◑','◔','○'][index]}</button>)}</div></div><aside><span>Resumo de hoje</span><strong>{Object.keys(diary).length ? 'Registrado' : 'Sem registros'}</strong><small>{Object.keys(diary).length} informações adicionadas</small></aside></div>
      <div className={styles.wellbeingGrid}>{trackers.length ? trackers.map(item => <article key={String(item.id)}><div className={styles.cardIcon}>{item.icone || '＋'}</div><span>{item.nome || 'Indicador'}</span><strong>{item.valor || '—'} <small>{item.unidade || ''}</small></strong><footer>Atualizar <b>→</b></footer></article>) : ['Sono','Água','Movimento','Energia'].map((item, index) => <article key={item}><div className={styles.cardIcon}>{['☾','◌','↗','ϟ'][index]}</div><span>{item}</span><strong>—</strong><footer>Adicionar registro <b>→</b></footer></article>)}</div>
    </>
  )
}

function FilesView({ state }: Pick<Props, 'state'>) {
  const drive = state.drive as Record<string, unknown>
  const items = rows(drive.items)
  return (
    <>
      <Header eyebrow="Google Drive" title="Arquivos" description="Seus documentos e pastas dentro do seu espaço pessoal." action="Enviar arquivo" />
      <div className={styles.filesToolbar}><div><button className={styles.filterActive}>Meu Drive</button><button>Recentes</button><button>Favoritos</button></div><div><button>＋ Pasta</button><button>☷</button></div></div>
      <section className={styles.driveStatus}><i>G</i><div><strong>Google Drive conectado</strong><span>Alterações são sincronizadas diretamente com sua conta.</span></div><button>Gerenciar</button></section>
      {items.length ? <div className={styles.fileGrid}>{items.map(item => <article key={String(item.id)}><div className={styles.fileIcon}>{item.tipo === 'folder' ? '▰' : '▤'}</div><button>•••</button><strong>{item.nome || item.name || 'Arquivo'}</strong><span>{item.tipo === 'folder' ? 'Pasta' : item.tipo || 'Arquivo'}</span></article>)}</div> : <section className={styles.largeEmpty}><Empty icon="□" title="Esta pasta está vazia" text="Crie uma pasta ou envie um arquivo para o Google Drive." action="Enviar arquivo" /></section>}
    </>
  )
}

export function V2ModuleView(props: Props) {
  const views: Record<string, React.ReactNode> = {
    planejar: <PlanningView state={props.state} today={props.today} />,
    tarefas: <TasksView {...props} />,
    rotinas: <RoutinesView state={props.state} today={props.today} />,
    projetos: <ProjectsView state={props.state} />,
    notas: <NotesView state={props.state} />,
    dinheiro: <MoneyView state={props.state} />,
    'bem-estar': <WellbeingView state={props.state} today={props.today} />,
    arquivos: <FilesView state={props.state} />,
  }
  return <div className={styles.content}>{views[props.area] || views.tarefas}</div>
}
