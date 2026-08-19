'use client'

import { DragEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { createTask, LegacyTask, MaiState, nextRepeat } from '../../lib/v2/state'
import styles from './unified.module.css'

type Row = Record<string, any>
type Commit = (change: (current: MaiState) => MaiState) => void
export type TaskWorkspaceView = 'inbox' | 'today' | `project:${string}`

type Props = {
  state: MaiState
  today: string
  view: TaskWorkspaceView
  commit: Commit
  googleRpc: (method: string, args?: unknown[]) => Promise<any>
  onOpenAgenda: () => void
  createRequest?: number
}

type GroupMode = 'none' | 'priority' | 'project' | 'due' | 'date' | 'time'
type SortMode = 'manual' | 'due' | 'time' | 'priority' | 'name'
type Direction = 'asc' | 'desc'
type DisplayMode = 'list' | 'board'

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const cleanText = (value: unknown) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const dayOf = (task: LegacyTask) => String(task.data_vencimento || '').slice(0, 10)
const timeOf = (task: LegacyTask) => String(task.data_vencimento || '').includes('T') ? String(task.data_vencimento).slice(11, 16) : ''
const priorityName = (value: unknown) => ({ 1: 'Urgente', 2: 'Alta', 3: 'Média', 4: 'Normal' } as Record<number, string>)[Number(value || 4)] || 'Normal'

function RichEditor({ value, onChange, placeholder = 'Adicione detalhes…', minHeight = 130 }: { value: string; onChange: (value: string) => void; placeholder?: string; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value && document.activeElement !== ref.current) ref.current.innerHTML = value
  }, [value])
  const command = (name: string, argument?: string) => {
    ref.current?.focus()
    document.execCommand(name, false, argument)
    onChange(ref.current?.innerHTML || '')
  }
  return <div className={styles.richEditor}>
    <div className={styles.richToolbar}>
      <button type="button" onClick={() => command('bold')}><b>B</b></button>
      <button type="button" onClick={() => command('italic')}><i>I</i></button>
      <button type="button" onClick={() => command('underline')}><u>U</u></button>
      <button type="button" onClick={() => command('strikeThrough')}><s>S</s></button>
      <button type="button" onClick={() => command('insertUnorderedList')}>• Lista</button>
      <button type="button" onClick={() => command('insertOrderedList')}>1. Lista</button>
      <button type="button" onClick={() => { const url = prompt('Endereço do link:'); if (url) command('createLink', url) }}>Link</button>
      <button type="button" onClick={() => command('removeFormat')}>Limpar</button>
    </div>
    <div ref={ref} className={styles.richSurface} style={{ minHeight }} contentEditable suppressContentEditableWarning data-placeholder={placeholder} onInput={event => onChange(event.currentTarget.innerHTML)} />
  </div>
}

function Modal({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className={styles.modalLayer} onMouseDown={onClose}>
    <section className={wide ? `${styles.modalCard} ${styles.modalWide}` : styles.modalCard} onMouseDown={event => event.stopPropagation()}>
      <header className={styles.modalHeader}><div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div><button type="button" onClick={onClose} aria-label="Fechar">×</button></header>
      {children}
    </section>
  </div>
}

function resizeProjectImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const image = new Image()
      image.onerror = reject
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = 320; canvas.height = 320
        const context = canvas.getContext('2d')
        if (!context) return reject(new Error('Canvas indisponível'))
        const side = Math.min(image.width, image.height)
        context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 320, 320)
        resolve(canvas.toDataURL('image/webp', .84))
      }
      image.src = String(reader.result || '')
    }
    reader.readAsDataURL(file)
  })
}

function dueBucket(task: LegacyTask, today: string) {
  const day = dayOf(task)
  if (!day) return { key: 'none', label: 'Sem data', rank: 6 }
  const tomorrow = new Date(`${today}T12:00:00`); tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
  const end = new Date(`${today}T12:00:00`); end.setDate(end.getDate() + Math.max(0, 7 - end.getDay()))
  const endKey = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
  if (day < today) return { key: 'overdue', label: 'Atrasadas', rank: 1 }
  if (day === today) return { key: 'today', label: 'Hoje', rank: 2 }
  if (day === tomorrowKey) return { key: 'tomorrow', label: 'Amanhã', rank: 3 }
  if (day <= endKey) return { key: 'week', label: 'Esta semana', rank: 4 }
  return { key: 'later', label: 'Depois', rank: 5 }
}

function timeBucket(task: LegacyTask) {
  const value = timeOf(task)
  if (!value) return { key: 'none', label: 'Sem horário', rank: 5 }
  const minutes = Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
  if (minutes < 360) return { key: 'dawn', label: 'Madrugada', rank: 1 }
  if (minutes < 720) return { key: 'morning', label: 'Manhã', rank: 2 }
  if (minutes < 1080) return { key: 'afternoon', label: 'Tarde', rank: 3 }
  return { key: 'night', label: 'Noite', rank: 4 }
}

export function UnifiedTasks({ state, today, view, commit, googleRpc, onOpenAgenda, createRequest }: Props) {
  const projects = useMemo(() => rows(state.projects).filter(project => project.ativo !== false).sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0)), [state.projects])
  const [taskDraft, setTaskDraft] = useState<LegacyTask | null>(null)
  const [projectDraft, setProjectDraft] = useState<Row | null>(null)
  const [query, setQuery] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [groupMode, setGroupMode] = useState<GroupMode>('none')
  const [sortMode, setSortMode] = useState<SortMode>('manual')
  const [direction, setDirection] = useState<Direction>('asc')
  const [displayMode, setDisplayMode] = useState<DisplayMode>('list')
  const [showCompleted, setShowCompleted] = useState(false)
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [noteText, setNoteText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [customRepeat, setCustomRepeat] = useState<'weekdays' | 'interval'>('weekdays')
  const [interval, setInterval] = useState(2)
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5])
  const projectId = view.startsWith('project:') ? view.slice(8) : ''
  const project = projects.find(item => String(item.id) === projectId)

  const scopeTasks = state.tasks.filter(task => {
    if (view === 'inbox') return String(task.projeto_id || 'entrada') === 'entrada'
    if (view === 'today') return dayOf(task) === today
    return String(task.projeto_id || '') === projectId
  })
  const openTasks = scopeTasks.filter(task => !task.concluida)
  const completed = scopeTasks.filter(task => task.concluida)

  useEffect(() => {
    if (!createRequest) return
    const base = createTask('')
    setTaskDraft({ ...base, titulo: '', data_vencimento: view === 'today' ? today : '', projeto_id: projectId || 'entrada', secao: project?.secoes?.[0] || '', notas: [], anexos: [], subtarefas: [] })
  }, [createRequest])

  function updateTaskDraft(patch: Partial<LegacyTask>) { setTaskDraft(current => current ? { ...current, ...patch } : current) }
  function persistTask(next: LegacyTask) {
    commit(current => ({ ...current, tasks: current.tasks.some(task => task.id === next.id) ? current.tasks.map(task => task.id === next.id ? next : task) : [...current.tasks, next] }))
  }

  function saveTask(event?: FormEvent) {
    event?.preventDefault()
    if (!taskDraft?.titulo.trim()) return
    persistTask({ ...taskDraft, titulo: taskDraft.titulo.trim(), prioridade: Number(taskDraft.prioridade || 4), projeto_id: taskDraft.projeto_id || 'entrada', notas: rows(taskDraft.notas), anexos: rows(taskDraft.anexos), subtarefas: rows(taskDraft.subtarefas), criado_em: taskDraft.criado_em || new Date().toISOString(), ordem: Number(taskDraft.ordem ?? Date.now()) })
    setTaskDraft(null)
  }

  function deleteTask() {
    if (!taskDraft || !confirm('Excluir esta tarefa permanentemente?')) return
    commit(current => ({ ...current, tasks: current.tasks.filter(task => task.id !== taskDraft.id) }))
    setTaskDraft(null)
  }

  function toggleTask(task: LegacyTask) {
    commit(current => ({ ...current, tasks: current.tasks.map(item => {
      if (item.id !== task.id) return item
      if (!item.concluida && item.repeticao && item.data_vencimento) return { ...item, data_vencimento: nextRepeat(item.data_vencimento, item.repeticao), concluida: false, concluida_em: '', subtarefas: rows(item.subtarefas).map(sub => ({ ...sub, concluida: false })) }
      return { ...item, concluida: !item.concluida, concluida_em: !item.concluida ? new Date().toISOString() : '' }
    }) }))
  }

  function filtered(tasks: LegacyTask[]) {
    const needle = query.trim().toLocaleLowerCase('pt-BR')
    return tasks.filter(task => {
      if (priorityFilter !== 'all' && Number(task.prioridade || 4) !== Number(priorityFilter)) return false
      if (!needle) return true
      return `${task.titulo} ${cleanText(task.descricao)} ${rows(task.notas).map(note => cleanText(note.texto || note.text)).join(' ')}`.toLocaleLowerCase('pt-BR').includes(needle)
    })
  }

  function compare(a: LegacyTask, b: LegacyTask) {
    let value = 0
    if (sortMode === 'manual') value = Number(a.ordem || 0) - Number(b.ordem || 0)
    if (sortMode === 'due') value = (dayOf(a) || '9999-99-99').localeCompare(dayOf(b) || '9999-99-99')
    if (sortMode === 'time') value = (timeOf(a) || '99:99').localeCompare(timeOf(b) || '99:99')
    if (sortMode === 'priority') value = Number(a.prioridade || 4) - Number(b.prioridade || 4)
    if (sortMode === 'name') value = a.titulo.localeCompare(b.titulo, 'pt-BR', { numeric: true, sensitivity: 'base' })
    return direction === 'desc' ? -value : value
  }

  function groupInfo(task: LegacyTask) {
    if (groupMode === 'priority') return { key: `p${task.prioridade || 4}`, label: priorityName(task.prioridade), rank: Number(task.prioridade || 4) }
    if (groupMode === 'project') { const p = projects.find(item => String(item.id) === String(task.projeto_id)); return { key: String(task.projeto_id || 'entrada'), label: p?.nome || 'Entrada', rank: p?.nome || 'zzzz' } }
    if (groupMode === 'due') return dueBucket(task, today)
    if (groupMode === 'date') return { key: dayOf(task) || 'none', label: dayOf(task) ? new Date(`${dayOf(task)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' }) : 'Sem data', rank: dayOf(task) || '9999-99-99' }
    if (groupMode === 'time') return timeBucket(task)
    return { key: 'all', label: '', rank: 0 }
  }

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; rank: any; tasks: LegacyTask[] }>()
    filtered(openTasks).forEach(task => {
      const info = groupInfo(task)
      if (!map.has(info.key)) map.set(info.key, { ...info, tasks: [] })
      map.get(info.key)!.tasks.push(task)
    })
    const result = [...map.values()]
    result.forEach(group => group.tasks.sort(compare))
    result.sort((a, b) => typeof a.rank === 'number' && typeof b.rank === 'number' ? a.rank - b.rank : String(a.rank).localeCompare(String(b.rank), 'pt-BR'))
    return result.length ? result : [{ key: 'all', label: '', rank: 0, tasks: [] }]
  }, [openTasks, query, priorityFilter, groupMode, sortMode, direction, projects, today])

  function startTaskDrag(event: DragEvent, task: LegacyTask) { event.dataTransfer.setData('application/mai-task', task.id); event.dataTransfer.effectAllowed = 'move' }
  function reorderTask(sourceId: string, targetId: string) {
    if (!sourceId || sourceId === targetId) return
    commit(current => {
      const list = [...current.tasks]
      const source = list.findIndex(task => task.id === sourceId); const target = list.findIndex(task => task.id === targetId)
      if (source < 0 || target < 0) return current
      const [moved] = list.splice(source, 1); list.splice(target, 0, moved)
      return { ...current, tasks: list.map((task, index) => ({ ...task, ordem: index })) }
    })
  }
  function moveTaskToSection(taskId: string, section: string) {
    commit(current => ({ ...current, tasks: current.tasks.map(task => task.id === taskId ? { ...task, projeto_id: projectId, secao: section, ordem: Date.now() } : task) }))
  }

  function addSubtask(parentIndex?: number) {
    if (!taskDraft || !subtaskTitle.trim()) return
    const newSub = { id: uid('sub'), titulo: subtaskTitle.trim(), concluida: false, descricao: '', subtarefas: [] }
    if (parentIndex === undefined) updateTaskDraft({ subtarefas: [...rows(taskDraft.subtarefas), newSub] })
    else updateTaskDraft({ subtarefas: rows(taskDraft.subtarefas).map((sub, index) => index === parentIndex ? { ...sub, subtarefas: [...rows(sub.subtarefas), newSub] } : sub) })
    setSubtaskTitle('')
  }

  function addNote() {
    if (!taskDraft || !noteText.trim()) return
    updateTaskDraft({ notas: [...rows(taskDraft.notas), { id: uid('tn'), texto: noteText.trim(), data: new Date().toISOString() }] })
    setNoteText('')
  }

  async function uploadAttachments(files?: FileList | null) {
    if (!taskDraft || !files?.length) return
    setUploading(true)
    try {
      const added: Row[] = []
      for (const file of Array.from(files)) {
        const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = reject; reader.readAsDataURL(file) })
        const response = await googleRpc('salvarAnexoDrive', [dataUrl, file.name, file.type])
        const item = response?.item || response
        added.push({ idDrive: item.id || item.idDrive, nome: item.name || item.nome || file.name, tipo: item.tipo || item.mimeType || file.type, url: item.url || item.webViewLink || '' })
      }
      updateTaskDraft({ anexos: [...rows(taskDraft.anexos), ...added] })
    } catch (error: any) { alert(error?.message || 'Não foi possível anexar o arquivo.') }
    finally { setUploading(false) }
  }

  async function renameAttachment(index: number) {
    if (!taskDraft) return
    const file = rows(taskDraft.anexos)[index]
    const name = prompt('Novo nome:', String(file.nome || ''))
    if (!name?.trim()) return
    if (file.idDrive) await googleRpc('renomearDriveItem', [file.idDrive, name.trim()]).catch(() => null)
    updateTaskDraft({ anexos: rows(taskDraft.anexos).map((item, position) => position === index ? { ...item, nome: name.trim() } : item) })
  }

  async function removeAttachment(index: number) {
    if (!taskDraft) return
    const file = rows(taskDraft.anexos)[index]
    if (file.idDrive && confirm('Também mover o arquivo para a lixeira do Google Drive?')) await googleRpc('trashDriveItem', [file.idDrive]).catch(() => null)
    updateTaskDraft({ anexos: rows(taskDraft.anexos).filter((_, position) => position !== index) })
  }

  function convertTaskToLocalEvent() {
    if (!taskDraft || !confirm('Transformar esta tarefa em compromisso?')) return
    const date = dayOf(taskDraft) || today; const time = timeOf(taskDraft)
    const event = { id: uid('local-event'), tipo: 'local', titulo: taskDraft.titulo, descricao: taskDraft.descricao || '', data_inicio: date, hora_inicio: time || '09:00', hora_fim: time ? '' : '10:00', dia_inteiro: !time, repeticao: taskDraft.repeticao || '', subtarefas: rows(taskDraft.subtarefas).map(sub => ({ ...sub, done: sub.concluida === true })), anexos: rows(taskDraft.anexos), cor: '#718269' }
    commit(current => ({ ...current, events: [...rows(current.events), event], tasks: current.tasks.filter(task => task.id !== taskDraft.id) }))
    setTaskDraft(null); onOpenAgenda()
  }

  function saveCustomRepeat() {
    if (!taskDraft) return
    if (customRepeat === 'interval') updateTaskDraft({ repeticao: `intervalo:${Math.max(1, interval)}` })
    else if (weekdays.length) updateTaskDraft({ repeticao: `semanal:${weekdays.sort().join(',')}` })
  }

  function seedProject(): Row { return { id: '', nome: '', cor: '#718269', icone: 'folder', parent_id: '', ordem: projects.length, secoes: [], imagem_url: '', ativo: true } }
  function saveProject(event: FormEvent) {
    event.preventDefault()
    if (!projectDraft || !String(projectDraft.nome || '').trim()) return
    const next = { ...projectDraft, id: projectDraft.id || uid('p'), nome: String(projectDraft.nome).trim(), secoes: rows(projectDraft.secoes).map(String).filter(Boolean), ordem: Number(projectDraft.ordem ?? projects.length), ativo: true }
    commit(current => ({ ...current, projects: rows(current.projects).some(item => String(item.id) === String(next.id)) ? rows(current.projects).map(item => String(item.id) === String(next.id) ? next : item) : [...rows(current.projects), next] }))
    setProjectDraft(null)
  }
  function deleteProject() {
    if (!projectDraft?.id || !confirm('Excluir este projeto? As tarefas irão para a Entrada e os subprojetos para a raiz.')) return
    const id = String(projectDraft.id)
    commit(current => ({ ...current, projects: rows(current.projects).filter(item => String(item.id) !== id).map(item => String(item.parent_id || '') === id ? { ...item, parent_id: '' } : item), tasks: current.tasks.map(task => String(task.projeto_id || '') === id ? { ...task, projeto_id: 'entrada', secao: '' } : task) }))
    setProjectDraft(null)
  }
  async function setProjectImage(file?: File) {
    if (!projectDraft || !file) return
    try { setProjectDraft({ ...projectDraft, imagem_url: await resizeProjectImage(file), imagem_nome: file.name, imagem_mime: 'image/webp' }) } catch { alert('Não foi possível processar a imagem.') }
  }

  function TaskCard({ task, board = false }: { task: LegacyTask; board?: boolean }) {
    const due = dayOf(task); const projectItem = projects.find(item => String(item.id) === String(task.projeto_id))
    return <article className={board ? `${styles.taskCard} ${styles.taskCardBoard}` : styles.taskCard} draggable onDragStart={event => startTaskDrag(event, task)} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); reorderTask(event.dataTransfer.getData('application/mai-task'), task.id) }} onClick={() => setTaskDraft({ ...task, notas: rows(task.notas), anexos: rows(task.anexos), subtarefas: rows(task.subtarefas) })}>
      <button type="button" className={styles.taskCheck} data-priority={task.prioridade || 4} onClick={event => { event.stopPropagation(); toggleTask(task) }} aria-label="Concluir tarefa">{task.concluida ? '✓' : ''}</button>
      <div className={styles.taskCardBody}><strong>{task.titulo}</strong>{cleanText(task.descricao) ? <p>{cleanText(task.descricao)}</p> : null}<div className={styles.taskMeta}>{due ? <span data-overdue={due < today}>{due === today ? 'Hoje' : new Date(`${due}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}{timeOf(task) ? ` · ${timeOf(task)}` : ''}</span> : null}{projectItem ? <span><i style={{ background: projectItem.cor || '#718269' }} />{projectItem.nome}</span> : null}{task.secao ? <span>{task.secao}</span> : null}{task.repeticao ? <span>↻</span> : null}{rows(task.subtarefas).length ? <span>☑ {rows(task.subtarefas).filter(item => item.concluida).length}/{rows(task.subtarefas).length}</span> : null}{rows(task.anexos).length ? <span>⌕ {rows(task.anexos).length}</span> : null}{rows(task.notas).length ? <span>◫ {rows(task.notas).length}</span> : null}</div></div>
      <span className={styles.dragHandle}>⋮⋮</span>
    </article>
  }

  const sections = project ? [...new Set(rows(project.secoes).map(String).filter(Boolean))] : []
  const noSectionTasks = filtered(openTasks).filter(task => !String(task.secao || '').trim() || !sections.includes(String(task.secao)))
  const displayTitle = view === 'inbox' ? 'Entrada' : view === 'today' ? 'Hoje' : String(project?.nome || 'Projeto')

  return <div className={styles.taskWorkspace}>
    <div className={styles.moduleHeadline}>
      <div>{project?.imagem_url ? <img className={styles.projectAvatar} src={project.imagem_url} alt="" /> : project ? <span className={styles.projectAvatarFallback} style={{ background: project.cor || '#718269' }}>{String(project.icone || 'folder').slice(0, 1).toUpperCase()}</span> : null}<div><h1>{displayTitle}</h1><p>{view === 'today' ? new Date(`${today}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) : project ? `${openTasks.length} tarefa${openTasks.length === 1 ? '' : 's'} ativa${openTasks.length === 1 ? '' : 's'}` : 'Capture tudo antes de organizar.'}</p></div></div>
      <div>{project ? <button className={styles.secondaryButton} onClick={() => setProjectDraft({ ...project, secoes: rows(project.secoes) })}>Configurar projeto</button> : null}<button className={styles.primaryButton} onClick={() => { const base = createTask(''); setTaskDraft({ ...base, titulo: '', data_vencimento: view === 'today' ? today : '', projeto_id: projectId || 'entrada', secao: sections[0] || '', notas: [], anexos: [], subtarefas: [] }) }}>＋ Tarefa</button></div>
    </div>

    <div className={styles.taskToolbar}>
      <input className={styles.searchInput} value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar nesta lista" />
      <select value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)}><option value="all">Todas as prioridades</option><option value="1">Urgente</option><option value="2">Alta</option><option value="3">Média</option><option value="4">Normal</option></select>
      <select value={groupMode} onChange={event => setGroupMode(event.target.value as GroupMode)}><option value="none">Sem agrupamento</option><option value="priority">Agrupar: prioridade</option><option value="project">Agrupar: projeto</option><option value="due">Agrupar: vencimento</option><option value="date">Agrupar: data</option><option value="time">Agrupar: horário</option></select>
      <select value={sortMode} onChange={event => setSortMode(event.target.value as SortMode)}><option value="manual">Ordem manual</option><option value="due">Prazo</option><option value="time">Horário</option><option value="priority">Prioridade</option><option value="name">Nome</option></select>
      <button className={styles.iconTextButton} onClick={() => setDirection(value => value === 'asc' ? 'desc' : 'asc')}>{direction === 'asc' ? '↑' : '↓'}</button>
      {project && sections.length ? <div className={styles.segmented}><button data-active={displayMode === 'list'} onClick={() => setDisplayMode('list')}>Lista</button><button data-active={displayMode === 'board'} onClick={() => setDisplayMode('board')}>Quadro</button></div> : null}
    </div>

    {displayMode === 'board' && project ? <div className={styles.taskBoard}>
      {[...sections, '__none__'].map(section => {
        const tasks = section === '__none__' ? noSectionTasks : filtered(openTasks).filter(task => String(task.secao || '') === section).sort(compare)
        const label = section === '__none__' ? 'Sem seção' : section
        return <section className={styles.boardColumn} key={section} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); moveTaskToSection(event.dataTransfer.getData('application/mai-task'), section === '__none__' ? '' : section) }}>
          <header><strong>{label}</strong><span>{tasks.length}</span><button onClick={() => { const base = createTask(''); setTaskDraft({ ...base, titulo: '', data_vencimento: '', projeto_id: projectId, secao: section === '__none__' ? '' : section, notas: [], anexos: [], subtarefas: [] }) }}>＋</button></header>
          <div>{tasks.map(task => <TaskCard key={task.id} task={task} board />)}</div>
          <button className={styles.boardAdd} onClick={() => { const base = createTask(''); setTaskDraft({ ...base, titulo: '', data_vencimento: '', projeto_id: projectId, secao: section === '__none__' ? '' : section, notas: [], anexos: [], subtarefas: [] }) }}>＋ Adicionar tarefa</button>
        </section>
      })}
      <button className={styles.newColumnCard} onClick={() => { const name = prompt('Nome da nova seção:'); if (!name?.trim() || !project) return; commit(current => ({ ...current, projects: rows(current.projects).map(item => String(item.id) === String(project.id) ? { ...item, secoes: [...rows(item.secoes).map(String), name.trim()] } : item) })) }}>＋ Nova seção</button>
    </div> : <div className={styles.taskGroups}>{groups.map(group => <section key={group.key}>{group.label ? <header className={styles.groupHeader}><h3>{group.label}</h3><span>{group.tasks.length}</span></header> : null}<div>{group.tasks.map(task => <TaskCard key={task.id} task={task} />)}</div></section>)}{!filtered(openTasks).length ? <div className={styles.emptyState}><strong>Nada por aqui</strong><span>{query ? 'Nenhuma tarefa corresponde aos filtros.' : 'Crie uma tarefa quando surgir algo para fazer.'}</span></div> : null}</div>}

    {completed.length ? <section className={styles.completedBlock}><button onClick={() => setShowCompleted(value => !value)}><span>{showCompleted ? '⌄' : '›'}</span> Concluídas <b>{completed.length}</b></button>{showCompleted ? <div>{filtered(completed).sort(compare).map(task => <TaskCard key={task.id} task={task} />)}</div> : null}</section> : null}

    {taskDraft ? <Modal title={taskDraft.id && state.tasks.some(task => task.id === taskDraft.id) ? 'Editar tarefa' : 'Nova tarefa'} subtitle="Tudo da tarefa em um único lugar" onClose={() => setTaskDraft(null)} wide>
      <form onSubmit={saveTask} className={styles.taskEditor}>
        <main>
          <div className={styles.taskEditorTitle}><button type="button" className={styles.taskCheck} data-priority={taskDraft.prioridade || 4} onClick={() => updateTaskDraft({ concluida: !taskDraft.concluida })}>{taskDraft.concluida ? '✓' : ''}</button><textarea autoFocus value={taskDraft.titulo} onChange={event => updateTaskDraft({ titulo: event.target.value })} placeholder="Nome da tarefa" rows={2} /></div>
          <section><label className={styles.sectionLabel}>Descrição</label><RichEditor value={taskDraft.descricao || ''} onChange={value => updateTaskDraft({ descricao: value })} /></section>

          <section className={styles.editorSection}><div className={styles.editorSectionHead}><strong>Subtarefas</strong><span>{rows(taskDraft.subtarefas).filter(item => item.concluida).length}/{rows(taskDraft.subtarefas).length}</span></div>
            <div className={styles.subtaskList}>{rows(taskDraft.subtarefas).map((sub, index) => <div className={styles.subtaskGroup} key={String(sub.id || index)}><div className={styles.subtaskRow}><input type="checkbox" checked={sub.concluida === true} onChange={event => updateTaskDraft({ subtarefas: rows(taskDraft.subtarefas).map((item, position) => position === index ? { ...item, concluida: event.target.checked } : item) })} /><input value={sub.titulo || ''} onChange={event => updateTaskDraft({ subtarefas: rows(taskDraft.subtarefas).map((item, position) => position === index ? { ...item, titulo: event.target.value } : item) })} /><button type="button" title="Adicionar nível abaixo" onClick={() => { const value = prompt('Nome da etapa interna:'); if (!value?.trim()) return; updateTaskDraft({ subtarefas: rows(taskDraft.subtarefas).map((item, position) => position === index ? { ...item, subtarefas: [...rows(item.subtarefas), { id: uid('sub'), titulo: value.trim(), concluida: false }] } : item) }) }}>↳</button><button type="button" onClick={() => updateTaskDraft({ subtarefas: rows(taskDraft.subtarefas).filter((_, position) => position !== index) })}>×</button></div>{rows(sub.subtarefas).map((nested, nIndex) => <div className={styles.nestedSubtask} key={String(nested.id || nIndex)}><input type="checkbox" checked={nested.concluida === true} onChange={event => updateTaskDraft({ subtarefas: rows(taskDraft.subtarefas).map((item, position) => position === index ? { ...item, subtarefas: rows(item.subtarefas).map((child, childPosition) => childPosition === nIndex ? { ...child, concluida: event.target.checked } : child) } : item) })} /><input value={nested.titulo || ''} onChange={event => updateTaskDraft({ subtarefas: rows(taskDraft.subtarefas).map((item, position) => position === index ? { ...item, subtarefas: rows(item.subtarefas).map((child, childPosition) => childPosition === nIndex ? { ...child, titulo: event.target.value } : child) } : item) })} /><button type="button" onClick={() => updateTaskDraft({ subtarefas: rows(taskDraft.subtarefas).map((item, position) => position === index ? { ...item, subtarefas: rows(item.subtarefas).filter((_, childPosition) => childPosition !== nIndex) } : item) })}>×</button></div>)}</div>)}</div>
            <div className={styles.inlineAdd}><input value={subtaskTitle} onChange={event => setSubtaskTitle(event.target.value)} placeholder="Adicionar subtarefa" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addSubtask() } }} /><button type="button" onClick={() => addSubtask()}>Adicionar</button></div>
          </section>

          <section className={styles.editorSection}><div className={styles.editorSectionHead}><strong>Notas</strong><span>{rows(taskDraft.notas).length}</span></div>{rows(taskDraft.notas).map((note, index) => <article className={styles.noteMini} key={String(note.id || index)}><div><p>{note.texto || note.text}</p><small>{note.data ? new Date(note.data).toLocaleString('pt-BR') : ''}</small></div><button type="button" onClick={() => updateTaskDraft({ notas: rows(taskDraft.notas).filter((_, position) => position !== index) })}>×</button></article>)}<div className={styles.inlineAdd}><input value={noteText} onChange={event => setNoteText(event.target.value)} placeholder="Registrar uma nota" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addNote() } }} /><button type="button" onClick={addNote}>Adicionar</button></div></section>

          <section className={styles.editorSection}><div className={styles.editorSectionHead}><strong>Anexos</strong><label className={styles.secondaryButton}>{uploading ? 'Enviando…' : '＋ Anexar'}<input hidden multiple type="file" disabled={uploading} onChange={event => void uploadAttachments(event.target.files)} /></label></div><div className={styles.attachments}>{rows(taskDraft.anexos).map((file, index) => <div key={`${file.idDrive}-${index}`}><a href={file.url || '#'} target="_blank" rel="noreferrer">{file.nome || 'Arquivo'}</a><span><button type="button" onClick={() => void renameAttachment(index)}>Renomear</button><button type="button" onClick={() => void removeAttachment(index)}>×</button></span></div>)}</div></section>
        </main>

        <aside>
          <label><span>Vencimento</span><input type="date" value={dayOf(taskDraft)} onChange={event => updateTaskDraft({ data_vencimento: event.target.value ? `${event.target.value}${timeOf(taskDraft) ? `T${timeOf(taskDraft)}` : ''}` : '' })} /></label>
          <div className={styles.quickDateButtons}><button type="button" onClick={() => updateTaskDraft({ data_vencimento: `${today}${timeOf(taskDraft) ? `T${timeOf(taskDraft)}` : ''}` })}>Hoje</button><button type="button" onClick={() => { const date = new Date(`${today}T12:00:00`); date.setDate(date.getDate() + 1); const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; updateTaskDraft({ data_vencimento: `${key}${timeOf(taskDraft) ? `T${timeOf(taskDraft)}` : ''}` }) }}>Amanhã</button><button type="button" onClick={() => updateTaskDraft({ data_vencimento: '' })}>Sem data</button></div>
          <label><span>Horário</span><input type="time" value={timeOf(taskDraft)} onChange={event => { const day = dayOf(taskDraft) || today; updateTaskDraft({ data_vencimento: event.target.value ? `${day}T${event.target.value}` : day }) }} /></label>
          <label><span>Prioridade</span><select value={Number(taskDraft.prioridade || 4)} onChange={event => updateTaskDraft({ prioridade: Number(event.target.value) })}><option value={1}>Urgente</option><option value={2}>Alta</option><option value={3}>Média</option><option value={4}>Normal</option></select></label>
          <label><span>Projeto</span><select value={String(taskDraft.projeto_id || 'entrada')} onChange={event => updateTaskDraft({ projeto_id: event.target.value, secao: '' })}><option value="entrada">Entrada</option>{projects.map(item => <option key={String(item.id)} value={item.id}>{item.nome}</option>)}</select></label>
          {String(taskDraft.projeto_id || 'entrada') !== 'entrada' ? <label><span>Seção</span><select value={String(taskDraft.secao || '')} onChange={event => updateTaskDraft({ secao: event.target.value })}><option value="">Sem seção</option>{rows(projects.find(item => String(item.id) === String(taskDraft.projeto_id))?.secoes).map(section => <option key={String(section)}>{String(section)}</option>)}</select></label> : null}
          <label><span>Recorrência</span><select value={String(taskDraft.repeticao || '')} onChange={event => updateTaskDraft({ repeticao: event.target.value })}><option value="">Não repetir</option><option value="diariamente">Diariamente</option><option value="semanalmente">Semanalmente</option><option value="mensalmente">Mensalmente</option><option value="anualmente">Anualmente</option>{String(taskDraft.repeticao || '').startsWith('semanal:') || String(taskDraft.repeticao || '').startsWith('intervalo:') ? <option value={taskDraft.repeticao}>Personalizado atual</option> : null}</select></label>
          <details className={styles.customRepeat}><summary>Recorrência personalizada</summary><div className={styles.segmented}><button type="button" data-active={customRepeat === 'weekdays'} onClick={() => setCustomRepeat('weekdays')}>Dias</button><button type="button" data-active={customRepeat === 'interval'} onClick={() => setCustomRepeat('interval')}>Intervalo</button></div>{customRepeat === 'weekdays' ? <div className={styles.weekdays}>{['D','S','T','Q','Q','S','S'].map((label, day) => <button type="button" key={`${label}-${day}`} data-active={weekdays.includes(day)} onClick={() => setWeekdays(value => value.includes(day) ? value.filter(item => item !== day) : [...value, day])}>{label}</button>)}</div> : <label><span>A cada quantos dias?</span><input type="number" min="1" value={interval} onChange={event => setInterval(Math.max(1, Number(event.target.value) || 1))} /></label>}<button type="button" className={styles.secondaryButton} onClick={saveCustomRepeat}>Aplicar</button></details>
          <label className={styles.toggleRow}><input type="checkbox" checked={taskDraft.ocultar_agenda === true} onChange={event => updateTaskDraft({ ocultar_agenda: event.target.checked })} /><span>Ocultar da Agenda</span></label>
          <button type="button" className={styles.secondaryButton} onClick={convertTaskToLocalEvent}>Transformar em compromisso</button>
        </aside>
        <footer><button type="button" className={styles.dangerButton} onClick={deleteTask}>Excluir</button><div><button type="button" className={styles.secondaryButton} onClick={() => setTaskDraft(null)}>Cancelar</button><button type="submit" className={styles.primaryButton}>Salvar tarefa</button></div></footer>
      </form>
    </Modal> : null}

    {projectDraft ? <Modal title={projectDraft.id ? 'Configurar projeto' : 'Novo projeto'} subtitle="Hierarquia, identidade e colunas" onClose={() => setProjectDraft(null)}>
      <form className={styles.projectEditor} onSubmit={saveProject}>
        <div className={styles.projectIdentity}>{projectDraft.imagem_url ? <img src={projectDraft.imagem_url} alt="Prévia do projeto" /> : <span style={{ background: projectDraft.cor || '#718269' }}>{String(projectDraft.icone || 'F').slice(0, 1).toUpperCase()}</span>}<label className={styles.secondaryButton}>Imagem<input hidden type="file" accept="image/*" onChange={event => void setProjectImage(event.target.files?.[0])} /></label>{projectDraft.imagem_url ? <button type="button" onClick={() => setProjectDraft({ ...projectDraft, imagem_url: '' })}>Remover</button> : null}</div>
        <label><span>Nome</span><input autoFocus value={projectDraft.nome || ''} onChange={event => setProjectDraft({ ...projectDraft, nome: event.target.value })} /></label>
        <div className={styles.twoCols}><label><span>Cor</span><input type="color" value={projectDraft.cor || '#718269'} onChange={event => setProjectDraft({ ...projectDraft, cor: event.target.value })} /></label><label><span>Ícone</span><select value={projectDraft.icone || 'folder'} onChange={event => setProjectDraft({ ...projectDraft, icone: event.target.value })}><option value="folder">Pasta</option><option value="work">Trabalho</option><option value="home">Casa</option><option value="target">Alvo</option><option value="star">Estrela</option><option value="favorite">Coração</option></select></label></div>
        <label><span>Projeto pai</span><select value={projectDraft.parent_id || ''} onChange={event => setProjectDraft({ ...projectDraft, parent_id: event.target.value })}><option value="">Nenhum</option>{projects.filter(item => String(item.id) !== String(projectDraft.id)).map(item => <option key={String(item.id)} value={item.id}>{item.nome}</option>)}</select></label>
        <section className={styles.editorSection}><div className={styles.editorSectionHead}><strong>Seções / colunas</strong><span>{rows(projectDraft.secoes).length}</span></div><div className={styles.sectionEditor}>{rows(projectDraft.secoes).map((section, index) => <div key={`${section}-${index}`} draggable onDragStart={event => event.dataTransfer.setData('text/section-index', String(index))} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const from = Number(event.dataTransfer.getData('text/section-index')); if (!Number.isFinite(from) || from === index) return; const next = [...rows(projectDraft.secoes).map(String)]; const [moved] = next.splice(from, 1); next.splice(index, 0, moved); setProjectDraft({ ...projectDraft, secoes: next }) }}><span>⋮⋮</span><input value={String(section)} onChange={event => setProjectDraft({ ...projectDraft, secoes: rows(projectDraft.secoes).map((value, position) => position === index ? event.target.value : value) })} /><button type="button" onClick={() => setProjectDraft({ ...projectDraft, secoes: rows(projectDraft.secoes).filter((_, position) => position !== index) })}>×</button></div>)}</div><button type="button" className={styles.secondaryButton} onClick={() => setProjectDraft({ ...projectDraft, secoes: [...rows(projectDraft.secoes), `Seção ${rows(projectDraft.secoes).length + 1}`] })}>＋ Adicionar seção</button></section>
        <footer>{projectDraft.id ? <button type="button" className={styles.dangerButton} onClick={deleteProject}>Excluir projeto</button> : <span />}<div><button type="button" className={styles.secondaryButton} onClick={() => setProjectDraft(null)}>Cancelar</button><button className={styles.primaryButton}>Salvar projeto</button></div></footer>
      </form>
    </Modal> : null}
  </div>
}
