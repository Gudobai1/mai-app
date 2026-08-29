'use client'

import { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import { MaiIcon } from './MaiIcons'
import { TaskSubtaskSortableV4 } from './TaskSubtaskSortableV4'
import { useAutosaveDraft } from './useAutosaveDraft'

type Row = Record<string, any>
type Props = {
  item: InspectableItem | null
  state: MaiState
  today: string
  commit: (change: (current: MaiState) => MaiState) => void
  googleRpc: (method: string, args?: unknown[]) => Promise<any>
  refreshEvents?: () => Promise<void> | void
  onClose: () => void
}

type ToolProps = {
  id: string
  icon: string
  label: string
  summary: string
  color: string
  leading?: ReactNode
  open: string
  setOpen: (id: string) => void
  children: ReactNode
}

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const dateOnly = (value: unknown) => String(value || '').slice(0, 10)
const timeOnly = (value: unknown) => String(value || '').includes('T') ? String(value).slice(11, 16) : ''
const priorityColor = (value: unknown) => Number(value || 4) === 1 ? '#c85b52' : Number(value || 4) === 2 ? '#c28a3d' : Number(value || 4) === 3 ? '#7c9274' : '#8d958b'

function addDays(key: string, amount: number) {
  const value = new Date(`${key}T12:00:00`)
  value.setDate(value.getDate() + amount)
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

function formatDate(value: string) {
  if (!value) return 'Não selecionado'
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function selectedDate(value: string, today: string) {
  if (!value) return 'Não selecionado'
  return value === today ? 'Hoje' : formatDate(value)
}

function Tool({ id, icon, label, summary, color, leading, open, setOpen, children }: ToolProps) {
  const active = open === id
  const visual = leading ?? <span className="material-symbols-rounded" aria-hidden="true">{icon}</span>
  return <div className="mai-task-v4-tool" data-open={active || undefined} style={{ '--mai-tool-color': color } as CSSProperties}>
    <button type="button" className="mai-task-v4-tool-button" aria-label={`${label}: ${summary}`} title={`${label}: ${summary}`} onClick={() => setOpen(active ? '' : id)}>
      <span className="mai-task-v4-leading">{visual}</span>
      <span className="mai-task-v4-tool-value">{summary || 'Não selecionado'}</span>
    </button>
    {active ? <div className="mai-task-v4-popover" role="dialog" aria-label={label} onMouseDown={event => event.stopPropagation()}>
      <header><span className="mai-task-v4-popover-leading">{visual}</span><div><strong>{label}</strong><small>{summary || 'Não selecionado'}</small></div></header>
      <div className="mai-task-v4-popover-body">{children}</div>
    </div> : null}
  </div>
}

function OptionList({ options, value, onChange, close }: { options: { value: string | number; label: string; icon?: string }[]; value: string | number; onChange: (value: string) => void; close: () => void }) {
  return <div className="mai-task-v4-option-list">{options.map(option => <button type="button" key={String(option.value)} data-selected={String(option.value) === String(value) || undefined} onClick={() => { onChange(String(option.value)); close() }}>
    {option.icon ? <span className="material-symbols-rounded">{option.icon}</span> : <span />}
    <span>{option.label}</span>
    {String(option.value) === String(value) ? <span className="material-symbols-rounded">check</span> : <span />}
  </button>)}</div>
}

function CalendarPicker({ value, today, onChange, close }: { value: string; today: string; onChange: (value: string) => void; close: () => void }) {
  const initial = value || today
  const [cursor, setCursor] = useState(initial.slice(0, 7))
  const first = new Date(`${cursor}-01T12:00:00`)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(first)
  start.setDate(first.getDate() - offset)
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return { key, day: date.getDate(), inMonth: key.slice(0, 7) === cursor }
  })
  function moveMonth(amount: number) {
    const next = new Date(first)
    next.setMonth(first.getMonth() + amount)
    setCursor(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
  }
  return <div className="mai-task-v4-calendar">
    <div className="mai-task-v4-calendar-nav"><button type="button" onClick={() => moveMonth(-1)}>‹</button><strong>{first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</strong><button type="button" onClick={() => moveMonth(1)}>›</button></div>
    <div className="mai-task-v4-calendar-week"><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span><span>D</span></div>
    <div className="mai-task-v4-calendar-grid">{cells.map(cell => <button type="button" key={cell.key} data-outside={!cell.inMonth || undefined} data-today={cell.key === today || undefined} data-selected={cell.key === value || undefined} onClick={() => { onChange(cell.key); close() }}>{cell.day}</button>)}</div>
    <div className="mai-task-v4-quick-row"><button type="button" onClick={() => { onChange(today); close() }}>Hoje</button><button type="button" onClick={() => { onChange(addDays(today, 1)); close() }}>Amanhã</button><button type="button" onClick={() => { onChange(''); close() }}>Sem data</button></div>
  </div>
}

function TimePicker({ value, onChange, close }: { value: string; onChange: (value: string) => void; close: () => void }) {
  const options = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`)
  return <div className="mai-task-v4-time-picker">
    <div className="mai-task-v4-time-grid">{options.map(option => <button type="button" key={option} data-selected={option === value || undefined} onClick={() => { onChange(option); close() }}>{option}</button>)}</div>
    <div className="mai-task-v4-time-custom"><span>Outro horário</span><input inputMode="numeric" placeholder="HH:MM" value={value} onChange={event => onChange(event.target.value.slice(0, 5))}/></div>
    <button type="button" className="mai-task-v4-clear" onClick={() => { onChange(''); close() }}>Sem horário</button>
  </div>
}

function ProjectSectionPicker({ projects, projectId, section, onProject, onSection, close }: { projects: Row[]; projectId: string; section: string; onProject: (id: string) => void; onSection: (section: string) => void; close: () => void }) {
  const [levelProject, setLevelProject] = useState('')
  const current = projects.find(project => String(project.id) === levelProject)
  const sections = current ? rows(current.secoes).map(String) : []
  if (current) return <div className="mai-task-v4-project-level">
    <button type="button" className="mai-task-v4-back" onClick={() => setLevelProject('')}><span className="material-symbols-rounded">arrow_back</span><span>{String(current.nome || 'Projeto')}</span></button>
    <div className="mai-task-v4-option-list">
      <button type="button" data-selected={!section || undefined} onClick={() => { onSection(''); close() }}><span className="material-symbols-rounded">horizontal_rule</span><span>Sem seção</span>{!section ? <span className="material-symbols-rounded">check</span> : <span />}</button>
      {sections.map(name => <button type="button" key={name} data-selected={section === name || undefined} onClick={() => { onSection(name); close() }}><span className="material-symbols-rounded">segment</span><span>{name}</span>{section === name ? <span className="material-symbols-rounded">check</span> : <span />}</button>)}
    </div>
  </div>
  return <div className="mai-task-v4-option-list">
    <button type="button" data-selected={projectId === 'entrada' || undefined} onClick={() => { onProject('entrada'); onSection(''); close() }}><span className="material-symbols-rounded">inbox</span><span>Entrada</span>{projectId === 'entrada' ? <span className="material-symbols-rounded">check</span> : <span />}</button>
    {projects.map(project => {
      const id = String(project.id)
      const sections = rows(project.secoes).map(String)
      return <button type="button" key={id} data-selected={projectId === id || undefined} onClick={() => { onProject(id); onSection(''); if (sections.length) setLevelProject(id); else close() }}>
        {project.imagem_url ? <img className="mai-task-v4-project-option-image" src={String(project.imagem_url)} alt=""/> : <span className="material-symbols-rounded" style={{ color:String(project.cor || 'var(--v3-accent)') }}>{String(project.icone || 'folder')}</span>}
        <span>{String(project.nome || 'Projeto')}</span>{sections.length ? <span className="material-symbols-rounded">chevron_right</span> : projectId === id ? <span className="material-symbols-rounded">check</span> : <span />}
      </button>
    })}
  </div>
}

export function TaskContextDrawerV4({ item, state, today, commit, onClose }: Props) {
  const [focusId, setFocusId] = useState('')
  const [draft, setDraft] = useState<Row>({})
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [openTool, setOpenTool] = useState('')
  const pathRef = useRef<HTMLElement>(null)

  useEffect(() => { setFocusId(item?.sourceId || ''); setOpenTool('') }, [item?.sourceId])
  const taskMap = useMemo(() => new Map(state.tasks.map(task => [String(task.id), task])), [state.tasks])
  const focusedTask = taskMap.get(focusId || String(item?.sourceId || ''))
  const activeId = String(focusedTask?.id || item?.sourceId || '')
  const activeRaw = (focusedTask || item?.raw || {}) as Row

  useEffect(() => {
    if (!item) return
    setDraft({ ...activeRaw, _hora: timeOnly(activeRaw.data_vencimento) })
    setSubtaskTitle('')
    setOpenTool('')
  }, [item, activeId])

  const projects = useMemo(() => rows(state.projects).filter(project => project.ativo !== false), [state.projects])
  const directChildren = useMemo(() => state.tasks.filter(task => String(task.parent_id || '') === activeId).sort((a,b) => Number(a.ordem || 0) - Number(b.ordem || 0)), [state.tasks, activeId])
  const breadcrumbs = useMemo(() => {
    const chain: { id: string; title: string }[] = []
    const seen = new Set<string>()
    let cursor = taskMap.get(activeId)
    while (cursor && !seen.has(String(cursor.id))) {
      seen.add(String(cursor.id))
      chain.unshift({ id: String(cursor.id), title: String(cursor.titulo || 'Tarefa') })
      cursor = cursor.parent_id ? taskMap.get(String(cursor.parent_id)) : undefined
    }
    return chain
  }, [activeId, taskMap])

  useEffect(() => {
    if (pathRef.current) pathRef.current.scrollLeft = pathRef.current.scrollWidth
  }, [activeId, breadcrumbs.length])

  function persistDraft(snapshot: Row) {
    if (!activeId) return
    const day = dateOnly(snapshot.data_vencimento)
    const hour = String(snapshot._hora || '')
    const due = day ? `${day}${hour ? `T${hour}` : ''}` : ''
    const snapshotProjectId = String(snapshot.projeto_id || 'entrada')
    const snapshotSection = String(snapshot.secao || '')
    const snapshotAttachments = rows(snapshot.anexos)
    const { _hora: _ignoredHour, ...clean } = snapshot
    commit(current => ({
      ...current,
      tasks: current.tasks.map(task => String(task.id) === activeId ? {
        ...task,
        ...clean,
        titulo: String(snapshot.titulo || '').trim(),
        descricao: snapshot.descricao || '',
        data_vencimento: due,
        projeto_id: snapshotProjectId,
        secao: snapshotSection,
        prioridade: Number(snapshot.prioridade || 4),
        anexos: snapshotAttachments,
      } : task),
    }))
  }

  useAutosaveDraft({ value: item ? draft : null, identity: activeId, enabled: Boolean(item && activeId), save: persistDraft })

  if (!item) return null

  const set = (patch: Row) => setDraft(current => ({ ...current, ...patch }))
  const attachments = rows(draft.anexos)
  const projectId = String(draft.projeto_id || 'entrada')
  const project = projects.find(entry => String(entry.id) === projectId)
  const projectName = projectId === 'entrada' ? 'Entrada' : String(project?.nome || 'Projeto')
  const section = String(draft.secao || '')
  const priorityLabel = ({ 1: 'Alta', 2: 'Média', 3: 'Baixa', 4: 'Não selecionado' } as Record<number,string>)[Number(draft.prioridade || 4)]
  const repeatLabel = ({ '': 'Não selecionado', diariamente: 'Todos os dias', semanalmente: 'Toda semana', 'semanal:1,2,3,4,5': 'Dias úteis', mensalmente: 'Todo mês' } as Record<string,string>)[String(draft.repeticao || '')] || 'Personalizado'
  const projectLeading = projectId === 'entrada'
    ? <span className="material-symbols-rounded">inbox</span>
    : project?.imagem_url
      ? <img className="mai-task-v4-project-icon-image" src={String(project.imagem_url)} alt=""/>
      : <span className="material-symbols-rounded">{String(project?.icone || 'folder')}</span>
  const projectColor = projectId === 'entrada' ? '#687d62' : String(project?.cor || '#687d62')

  function remove() {
    if (!confirm('Excluir tarefa?')) return
    const parentId = String(draft.parent_id || '')
    commit(current => ({ ...current, tasks: current.tasks.filter(task => String(task.id) !== activeId).map(task => String(task.parent_id || '') === activeId ? { ...task, parent_id: parentId } : task) }))
    onClose()
  }

  function addSubtask() {
    const title = subtaskTitle.trim()
    if (!title) return
    const child = {
      id: `t-${crypto.randomUUID()}`,
      titulo: title,
      descricao: '',
      data_vencimento: '',
      prioridade: 4,
      concluida: false,
      projeto_id: projectId,
      parent_id: activeId,
      criado_em: new Date().toISOString(),
      ordem: Date.now(),
      notas: [], anexos: [], subtarefas: [], lembretes: [], etiquetas: [], repeticao: '', secao: section, ocultar_agenda: false,
    }
    commit(current => ({ ...current, tasks: [...current.tasks, child] }))
    setSubtaskTitle('')
  }

  function toggleSubtask(id: string) {
    commit(current => ({ ...current, tasks: current.tasks.map(task => String(task.id) === id ? { ...task, concluida: !task.concluida, concluida_em: !task.concluida ? new Date().toISOString() : '' } : task) }))
  }

  return <div className="mai-context-layer mai-task-v4-layer" onMouseDown={onClose}>
    <aside className="mai-context-drawer mai-task-v4-drawer" onMouseDown={event => event.stopPropagation()}>
      <header className="mai-task-v4-top">
        <div className="mai-task-v4-path-wrap">{breadcrumbs.length > 1 ? <nav ref={pathRef} className="mai-task-v4-breadcrumbs">{breadcrumbs.map((crumb,index) => <span key={crumb.id}>{index ? <i>›</i> : null}<button type="button" data-current={index === breadcrumbs.length - 1 || undefined} onClick={() => setFocusId(crumb.id)}>{crumb.title}</button></span>)}</nav> : <span className="mai-task-v4-kind">Tarefa</span>}</div>
        <button type="button" className="mai-task-v4-close" onClick={onClose} aria-label="Fechar"><MaiIcon name="close" size={18}/></button>
      </header>

      <form className="mai-task-v4-form" onSubmit={event => event.preventDefault()}>
        <div className="mai-task-v4-scroll" onMouseDown={() => openTool && setOpenTool('')}>
          <input className="mai-v3-title-input mai-context-unified-title" autoFocus value={String(draft.titulo || '')} onChange={event => set({ titulo: event.target.value })} placeholder="Nome da tarefa" onMouseDown={event => event.stopPropagation()}/>
          <textarea className="mai-v3-description-input mai-context-unified-description" rows={2} value={String(draft.descricao || '')} placeholder="Descrição" onChange={event => set({ descricao: event.target.value })} onMouseDown={event => event.stopPropagation()}/>

          <div className="mai-task-v4-toolbar mai-context-unified-tools" onMouseDown={event => event.stopPropagation()}>
            <Tool id="date" icon="calendar_today" label="Data" summary={selectedDate(dateOnly(draft.data_vencimento), today)} color="#4f7cac" open={openTool} setOpen={setOpenTool}><CalendarPicker value={dateOnly(draft.data_vencimento)} today={today} onChange={value => set({ data_vencimento: value, _hora: value ? draft._hora || '' : '' })} close={() => setOpenTool('')}/></Tool>
            <Tool id="time" icon="schedule" label="Horário" summary={String(draft._hora || 'Não selecionado')} color="#875fb2" open={openTool} setOpen={setOpenTool}><TimePicker value={String(draft._hora || '')} onChange={value => set({ _hora: value })} close={() => setOpenTool('')}/></Tool>
            <Tool id="project" icon="folder" label="Projeto e seção" summary={`${projectName}${section ? ` · ${section}` : ''}`} color={projectColor} leading={projectLeading} open={openTool} setOpen={setOpenTool}><ProjectSectionPicker projects={projects} projectId={projectId} section={section} onProject={id => set({ projeto_id: id, secao: '' })} onSection={value => set({ secao: value })} close={() => setOpenTool('')}/></Tool>
            <Tool id="priority" icon="flag" label="Prioridade" summary={priorityLabel} color={priorityColor(draft.prioridade)} open={openTool} setOpen={setOpenTool}><OptionList value={Number(draft.prioridade || 4)} onChange={value => set({ prioridade: Number(value) })} close={() => setOpenTool('')} options={[{value:4,label:'Sem prioridade',icon:'flag'},{value:3,label:'Baixa',icon:'flag'},{value:2,label:'Média',icon:'flag'},{value:1,label:'Alta',icon:'flag'}]}/></Tool>
            <Tool id="repeat" icon="repeat" label="Repetir" summary={repeatLabel} color="#2f8a83" open={openTool} setOpen={setOpenTool}><OptionList value={String(draft.repeticao || '')} onChange={value => set({ repeticao: value })} close={() => setOpenTool('')} options={[{value:'',label:'Não repetir',icon:'block'},{value:'diariamente',label:'Todos os dias',icon:'today'},{value:'semanalmente',label:'Toda semana',icon:'date_range'},{value:'semanal:1,2,3,4,5',label:'Dias úteis',icon:'work'},{value:'mensalmente',label:'Todo mês',icon:'calendar_month'}]}/></Tool>
          </div>

          <section className="mai-task-v4-section mai-task-v4-subtasks">
            <header><strong>Subtarefas</strong><small>{directChildren.filter(child => child.concluida).length}/{directChildren.length}</small></header>
            <TaskSubtaskSortableV4 parentId={activeId} tasks={directChildren} commit={commit} onToggle={toggleSubtask} onOpen={setFocusId}/>
            <div className="mai-task-v4-subtask-add"><span className="material-symbols-rounded">add</span><input value={subtaskTitle} placeholder="Adicionar subtarefa" onChange={event => setSubtaskTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addSubtask() } }}/><button type="button" onClick={addSubtask}>Adicionar</button></div>
          </section>

          <section className="mai-task-v4-section mai-task-v4-files">
            <header><strong>Arquivos</strong></header>
            {attachments.length ? <div>{attachments.map((file,index) => <div className="mai-task-v4-file" key={String(file.id || file.nome || file.name || index)}><span className="material-symbols-rounded">description</span><span>{String(file.nome || file.name || 'Arquivo')}</span></div>)}</div> : <small>Nenhum arquivo anexado.</small>}
          </section>
        </div>

        <footer className="mai-task-v4-footer">
          <button type="button" className="mai-task-v4-delete" onClick={remove}><MaiIcon name="delete" size={15}/>Excluir</button>
          <span className="mai-autosave-status">Alterações salvas automaticamente</span>
        </footer>
      </form>
    </aside>
  </div>
}