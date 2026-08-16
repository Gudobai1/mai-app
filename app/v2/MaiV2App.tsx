'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import styles from './mai-v2.module.css'
import { createTask, dateKey, emptyState, LegacyTask, loadState, MaiState, persistState } from '../../lib/v2/state'

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

  function addTask(event: FormEvent) {
    event.preventDefault()
    const value = title.trim()
    if (!value) return
    updateTasks([...state.tasks, createTask(value)])
    setTitle('')
  }

  function toggleTask(id: string) {
    updateTasks(state.tasks.map(task => task.id === id ? { ...task, concluida: !task.concluida } : task))
  }

  const greeting = !now ? 'Olá' : now.getHours() < 12 ? 'Bom dia' : now.getHours() < 18 ? 'Boa tarde' : 'Boa noite'
  const formattedDate = now?.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const activeLabel = areas.find(item => item.id === area)?.label || 'Início'

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
          <div className={styles.content}>
            <section className={styles.welcome}>
              <div>
                <p>{formattedDate || 'Carregando seu dia...'}</p>
                <h1>{greeting}, Adm.</h1>
                <span>Organize o que importa e deixe o restante em segundo plano.</span>
              </div>
              <div className={styles.syncStatus}><i /> Tudo sincronizado</div>
            </section>

            <section className={styles.metrics}>
              <article>
                <span>Pendências de hoje</span>
                <strong>{ready ? pending : '—'}</strong>
                <small>{pending === 1 ? 'item precisa da sua atenção' : 'itens precisam da sua atenção'}</small>
              </article>
              <article>
                <span>Concluído</span>
                <strong>{progress}%</strong>
                <div className={styles.progress}><i style={{ width: `${progress}%` }} /></div>
              </article>
              <article className={styles.focusCard}>
                <span>Próximo passo</span>
                <strong>{todayTasks.find(task => !task.concluida)?.titulo || 'Seu dia está livre'}</strong>
                <small>{pending ? 'Continue de onde parou' : 'Aproveite para planejar algo novo'}</small>
              </article>
            </section>

            <section className={styles.grid}>
              <article className={styles.panel}>
                <div className={styles.panelHead}>
                  <div><span>Agora</span><h2>Meu dia</h2></div>
                  <button onClick={() => setArea('tarefas')}>Ver tarefas</button>
                </div>

                <form className={styles.quickAdd} onSubmit={addTask}>
                  <button type="submit" aria-label="Adicionar tarefa"><Icon name="plus" /></button>
                  <input id="v2-quick-task" value={title} onChange={event => setTitle(event.target.value)} placeholder="Adicionar algo para hoje..." autoComplete="off" />
                  <kbd>Enter</kbd>
                </form>

                <div className={styles.taskList}>
                  {!ready ? (
                    <div className={styles.empty}>Carregando suas informações...</div>
                  ) : todayTasks.length === 0 ? (
                    <div className={styles.empty}><span>✓</span><strong>Nada pendente por aqui</strong><small>Adicione uma tarefa acima para começar.</small></div>
                  ) : todayTasks.map(task => (
                    <label className={styles.task} key={task.id} data-done={task.concluida}>
                      <input type="checkbox" checked={task.concluida === true} onChange={() => toggleTask(task.id)} />
                      <i />
                      <span><strong>{task.titulo}</strong><small>{task.prioridade && task.prioridade < 4 ? `Prioridade P${task.prioridade}` : 'Hoje'}</small></span>
                      <button type="button" aria-label="Opções da tarefa"><Icon name="more" /></button>
                    </label>
                  ))}
                </div>
              </article>

              <aside className={styles.sideColumn}>
                <article className={styles.miniPanel}>
                  <div className={styles.panelHead}><div><span>Agenda</span><h2>Próximos</h2></div><button onClick={() => setArea('planejar')}>Abrir</button></div>
                  <div className={styles.timeline}>
                    <div><time>Agora</time><i /><span><strong>Planejamento do dia</strong><small>Organização pessoal</small></span></div>
                    <div><time>Mais tarde</time><i /><span><strong>Tempo de foco</strong><small>Reserve espaço para o essencial</small></span></div>
                  </div>
                </article>

                <article className={styles.quote}>
                  <span>Intenção do dia</span>
                  <p>“Clareza primeiro. Movimento depois.”</p>
                  <button>Definir intenção</button>
                </article>
              </aside>
            </section>
          </div>
        ) : (
          <div className={styles.content}>
            <section className={styles.moduleIntro}>
              <span>Nova área</span>
              <h1>{activeLabel}</h1>
              <p>Esta área será reconstruída do zero na próxima etapa, com interação instantânea e sincronização em segundo plano.</p>
              <button onClick={() => setArea('inicio')}>Voltar ao Início</button>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
