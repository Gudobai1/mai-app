'use client'

import { CSSProperties, ReactNode, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { Row } from './app-types'
import styles from './unified.module.css'
import { useAutosaveDraft } from './useAutosaveDraft'

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const dateOnly = (value: unknown) => String(value || '').slice(0, 10)

function addDays(key: string, amount: number) {
  const value = new Date(`${key}T12:00:00`)
  value.setDate(value.getDate() + amount)
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

function formatDate(value: string, today: string) {
  if (!value) return 'Não selecionado'
  if (value === today) return 'Hoje'
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
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

function TextEditor({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (value: string) => void }) {
  return <div className="mai-task-v4-time-custom"><input value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)}/></div>
}

function ProjectPicker({ projects, projectId, section, onProject, onSection, close }: { projects: Row[]; projectId: string; section: string; onProject: (id: string) => void; onSection: (value: string) => void; close: () => void }) {
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
      const projectSections = rows(project.secoes).map(String)
      return <button type="button" key={id} data-selected={projectId === id || undefined} onClick={() => { onProject(id); onSection(''); if (projectSections.length) setLevelProject(id); else close() }}>
        {project.imagem_url ? <img className="mai-task-v4-project-option-image" src={String(project.imagem_url)} alt=""/> : <span className="material-symbols-rounded" style={{ color:String(project.cor || 'var(--v3-accent)') }}>{String(project.icone || 'folder')}</span>}
        <span>{String(project.nome || 'Projeto')}</span>{projectSections.length ? <span className="material-symbols-rounded">chevron_right</span> : projectId === id ? <span className="material-symbols-rounded">check</span> : <span />}
      </button>
    })}
  </div>
}

type Props = {
  kind: 'task' | 'event'
  allowKindSwitch?: boolean
  state: MaiState
  today: string
  defaultProjectId?: string
  defaultDate?: string
  commit: (change: (current: MaiState) => MaiState) => void
  onClose: () => void
}

export function QuickCreateDrawer({ kind, allowKindSwitch = false, state, today, defaultProjectId = 'entrada', defaultDate, commit, onClose }: Props) {
  const makeDraft = (target: 'task' | 'event'): Row => target === 'task'
    ? { _id: `t-${crypto.randomUUID()}`, _persisted: false, titulo: '', descricao: '', data: defaultDate ?? '', hora: '', prioridade: 4, projeto_id: defaultProjectId, secao: '', repeticao: '', lembrete: '' }
    : { _id: `local-event-${crypto.randomUUID()}`, _persisted: false, titulo: '', descricao: '', data: defaultDate || today, hora_inicio: '', hora_fim: '', dia_inteiro: false, local: '', categoria: '', categoria_cor: '#6f8168', repeticao: '', lembrete: '' }
  const [currentKind, setCurrentKind] = useState<'task' | 'event'>(kind)
  const [draft, setDraft] = useState<Row>(() => makeDraft(kind))
  const [openTool, setOpenTool] = useState('')
  const projects = rows(state.projects).filter(item => item.ativo !== false)
  const projectId = String(draft.projeto_id || 'entrada')
  const project = projects.find(item => String(item.id) === projectId)
  const projectName = projectId === 'entrada' ? 'Entrada' : String(project?.nome || 'Projeto')
  const projectLeading = projectId === 'entrada'
    ? <span className="material-symbols-rounded">inbox</span>
    : project?.imagem_url
      ? <img className="mai-task-v4-project-icon-image" src={String(project.imagem_url)} alt=""/>
      : <span className="material-symbols-rounded">{String(project?.icone || 'folder')}</span>
  const projectColor = projectId === 'entrada' ? '#687d62' : String(project?.cor || '#687d62')
  const section = String(draft.secao || '')
  const priorityLabel = ({ 1:'Alta', 2:'Média', 3:'Baixa', 4:'Não selecionado' } as Record<number,string>)[Number(draft.prioridade || 4)]
  const priorityColor = Number(draft.prioridade || 4) === 1 ? '#c85b52' : Number(draft.prioridade || 4) === 2 ? '#c28a3d' : Number(draft.prioridade || 4) === 3 ? '#7c9274' : '#8d958b'
  const repeatLabel = ({ '':'Não selecionado', diariamente:'Todos os dias', semanalmente:'Toda semana', 'semanal:1,2,3,4,5':'Dias úteis', mensalmente:'Todo mês' } as Record<string,string>)[String(draft.repeticao || '')] || 'Personalizado'
  const reminderLabel = ({ '':'Não selecionado', '10m':'10 min antes', '30m':'30 min antes', '1h':'1 hora antes', '1d':'1 dia antes' } as Record<string,string>)[String(draft.lembrete || '')] || String(draft.lembrete || 'Não selecionado')

  function persistDraft(snapshot: Row) {
    const title = String(snapshot.titulo || '').trim()
    if (!title) return
    const id = String(snapshot._id)
    if (currentKind === 'task') {
      const due = snapshot.data ? `${snapshot.data}${snapshot.hora ? `T${snapshot.hora}` : ''}` : ''
      const task = {
        id,
        titulo: title, descricao: snapshot.descricao || '', data_vencimento: due,
        prioridade: Number(snapshot.prioridade || 4), concluida: false, projeto_id: snapshot.projeto_id || 'entrada',
        criado_em: snapshot.criado_em || new Date().toISOString(), ordem: Number(snapshot.ordem || Date.now()), notas: [], anexos: [], subtarefas: [],
        repeticao: snapshot.repeticao || '', lembretes: snapshot.lembrete ? [snapshot.lembrete] : [], etiquetas: [], secao: snapshot.secao || '', ocultar_agenda: false,
      }
      commit(current => ({ ...current, tasks: current.tasks.some(item => String(item.id) === id) ? current.tasks.map(item => String(item.id) === id ? { ...item, ...task } : item) : [...current.tasks, task] }))
    } else {
      const eventRow = {
        id, tipo: 'local', titulo: title, descricao: snapshot.descricao || '',
        data_inicio: snapshot.data || today, hora_inicio: snapshot.dia_inteiro ? '' : snapshot.hora_inicio || '', hora_fim: snapshot.dia_inteiro ? '' : snapshot.hora_fim || '',
        dia_inteiro: snapshot.dia_inteiro === true, local: snapshot.local || '', categoria: snapshot.categoria || '', categoria_cor: snapshot.categoria_cor || '#6f8168',
        categoria_icone: 'calendar', repeticao: snapshot.repeticao || '', lembretes: snapshot.lembrete ? [snapshot.lembrete] : [], anexos: [], cor: snapshot.categoria_cor || '#6f8168',
      }
      commit(current => ({ ...current, events: rows(current.events).some(item => String(item.id) === id) ? rows(current.events).map(item => String(item.id) === id ? { ...item, ...eventRow } : item) : [...rows(current.events), eventRow] }))
    }
    if (snapshot._persisted === false) setDraft(current => current && String(current._id) === id ? { ...current, _persisted: true } : current)
  }

  useAutosaveDraft({ value: draft, identity: `${currentKind}:${String(draft._id)}`, enabled: Boolean(draft), save: persistDraft })

  function switchKind(next: 'task' | 'event') {
    if (next === currentKind) return
    const previousId = String(draft._id || '')
    if (draft._persisted && previousId) {
      commit(current => currentKind === 'task'
        ? { ...current, tasks: current.tasks.filter(item => String(item.id) !== previousId) }
        : { ...current, events: rows(current.events).filter(item => String(item.id) !== previousId) })
    }
    setCurrentKind(next)
    setDraft(makeDraft(next))
    setOpenTool('')
  }

  return <div className="mai-v3-create-layer" onMouseDown={onClose}>
    <form className="mai-v3-create-drawer" onSubmit={event => event.preventDefault()} onMouseDown={event => event.stopPropagation()}>
      <header className="mai-v3-drawer-header">
        <div>{allowKindSwitch ? <div className="mai-v3-kind-switch"><button type="button" data-active={currentKind === 'task'} onClick={() => switchKind('task')}>Tarefa</button><button type="button" data-active={currentKind === 'event'} onClick={() => switchKind('event')}>Compromisso</button></div> : <strong>{currentKind === 'task' ? 'Nova tarefa' : 'Novo compromisso'}</strong>}</div>
        <button type="button" className="mai-v3-close" onClick={onClose}>×</button>
      </header>

      <div className="mai-v3-drawer-body mai-create-unified-body" onMouseDown={() => openTool && setOpenTool('')}>
        <input className="mai-v3-title-input" autoFocus placeholder={currentKind === 'task' ? 'Nome da tarefa' : 'Nome do compromisso'} value={draft.titulo || ''} onMouseDown={event => event.stopPropagation()} onChange={event => setDraft({ ...draft, titulo: event.target.value })} />
        <textarea className="mai-v3-description-input mai-create-unified-description" rows={2} placeholder="Descrição" value={draft.descricao || ''} onMouseDown={event => event.stopPropagation()} onChange={event => setDraft({ ...draft, descricao: event.target.value })} />

        <div className="mai-task-v4-toolbar mai-context-unified-tools mai-create-unified-tools" onMouseDown={event => event.stopPropagation()}>
          {currentKind === 'task' ? <>
            <Tool id="date" icon="calendar_today" label="Data" summary={formatDate(dateOnly(draft.data), today)} color="#4f7cac" open={openTool} setOpen={setOpenTool}><CalendarPicker value={dateOnly(draft.data)} today={today} onChange={value => setDraft(current => ({ ...current, data:value, hora:value ? current.hora || '' : '' }))} close={() => setOpenTool('')}/></Tool>
            <Tool id="time" icon="schedule" label="Horário" summary={String(draft.hora || 'Não selecionado')} color="#875fb2" open={openTool} setOpen={setOpenTool}><TimePicker value={String(draft.hora || '')} onChange={value => setDraft(current => ({ ...current, hora:value }))} close={() => setOpenTool('')}/></Tool>
            <Tool id="project" icon="folder" label="Projeto e seção" summary={`${projectName}${section ? ` · ${section}` : ''}`} color={projectColor} leading={projectLeading} open={openTool} setOpen={setOpenTool}><ProjectPicker projects={projects} projectId={projectId} section={section} onProject={value => setDraft(current => ({ ...current, projeto_id:value, secao:'' }))} onSection={value => setDraft(current => ({ ...current, secao:value }))} close={() => setOpenTool('')}/></Tool>
            <Tool id="priority" icon="flag" label="Prioridade" summary={priorityLabel} color={priorityColor} open={openTool} setOpen={setOpenTool}><OptionList value={Number(draft.prioridade || 4)} onChange={value => setDraft(current => ({ ...current, prioridade:Number(value) }))} close={() => setOpenTool('')} options={[{value:4,label:'Sem prioridade',icon:'flag'},{value:3,label:'Baixa',icon:'flag'},{value:2,label:'Média',icon:'flag'},{value:1,label:'Alta',icon:'flag'}]}/></Tool>
            <Tool id="repeat" icon="repeat" label="Repetir" summary={repeatLabel} color="#2f8a83" open={openTool} setOpen={setOpenTool}><OptionList value={String(draft.repeticao || '')} onChange={value => setDraft(current => ({ ...current, repeticao:value }))} close={() => setOpenTool('')} options={[{value:'',label:'Não repetir',icon:'block'},{value:'diariamente',label:'Todos os dias',icon:'today'},{value:'semanalmente',label:'Toda semana',icon:'date_range'},{value:'semanal:1,2,3,4,5',label:'Dias úteis',icon:'work'},{value:'mensalmente',label:'Todo mês',icon:'calendar_month'}]}/></Tool>
            <Tool id="reminder" icon="notifications" label="Lembrete" summary={reminderLabel} color="#b16b4b" open={openTool} setOpen={setOpenTool}><OptionList value={String(draft.lembrete || '')} onChange={value => setDraft(current => ({ ...current, lembrete:value }))} close={() => setOpenTool('')} options={[{value:'',label:'Sem lembrete',icon:'notifications_off'},{value:'10m',label:'10 minutos antes',icon:'notifications'},{value:'30m',label:'30 minutos antes',icon:'notifications'},{value:'1h',label:'1 hora antes',icon:'notifications'},{value:'1d',label:'1 dia antes',icon:'notifications'}]}/></Tool>
          </> : <>
            <Tool id="event-date" icon="calendar_today" label="Data" summary={formatDate(dateOnly(draft.data), today)} color="#4f7cac" open={openTool} setOpen={setOpenTool}><CalendarPicker value={dateOnly(draft.data)} today={today} onChange={value => setDraft(current => ({ ...current, data:value }))} close={() => setOpenTool('')}/></Tool>
            <Tool id="event-start" icon="schedule" label="Início" summary={draft.dia_inteiro ? 'Dia inteiro' : String(draft.hora_inicio || 'Não selecionado')} color="#875fb2" open={openTool} setOpen={setOpenTool}><TimePicker value={String(draft.hora_inicio || '')} onChange={value => setDraft(current => ({ ...current, hora_inicio:value, dia_inteiro:false }))} close={() => setOpenTool('')}/></Tool>
            <Tool id="event-end" icon="schedule" label="Término" summary={draft.dia_inteiro ? 'Dia inteiro' : String(draft.hora_fim || 'Não selecionado')} color="#7654a6" open={openTool} setOpen={setOpenTool}><TimePicker value={String(draft.hora_fim || '')} onChange={value => setDraft(current => ({ ...current, hora_fim:value, dia_inteiro:false }))} close={() => setOpenTool('')}/></Tool>
            <Tool id="event-all-day" icon="today" label="Dia inteiro" summary={draft.dia_inteiro ? 'Ativado' : 'Desativado'} color="#388a83" open={openTool} setOpen={setOpenTool}><OptionList value={draft.dia_inteiro ? 'yes':'no'} onChange={value => setDraft(current => ({ ...current, dia_inteiro:value === 'yes' }))} close={() => setOpenTool('')} options={[{value:'yes',label:'Dia inteiro',icon:'check_circle'},{value:'no',label:'Usar horário',icon:'schedule'}]}/></Tool>
            <Tool id="event-location" icon="location_on" label="Local" summary={String(draft.local || 'Não selecionado')} color="#b85c76" open={openTool} setOpen={setOpenTool}><TextEditor value={String(draft.local || '')} placeholder="Adicionar local" onChange={value => setDraft(current => ({ ...current, local:value }))}/></Tool>
            <Tool id="event-category" icon="sell" label="Categoria" summary={String(draft.categoria || 'Não selecionado')} color={String(draft.categoria_cor || '#b27a35')} open={openTool} setOpen={setOpenTool}><TextEditor value={String(draft.categoria || '')} placeholder="Adicionar categoria" onChange={value => setDraft(current => ({ ...current, categoria:value }))}/></Tool>
            <Tool id="event-repeat" icon="repeat" label="Repetir" summary={repeatLabel} color="#2f8a83" open={openTool} setOpen={setOpenTool}><OptionList value={String(draft.repeticao || '')} onChange={value => setDraft(current => ({ ...current, repeticao:value }))} close={() => setOpenTool('')} options={[{value:'',label:'Não repetir',icon:'block'},{value:'diariamente',label:'Todos os dias',icon:'today'},{value:'semanalmente',label:'Toda semana',icon:'date_range'},{value:'mensalmente',label:'Todo mês',icon:'calendar_month'}]}/></Tool>
            <Tool id="event-reminder" icon="notifications" label="Lembrete" summary={reminderLabel} color="#b16b4b" open={openTool} setOpen={setOpenTool}><OptionList value={String(draft.lembrete || '')} onChange={value => setDraft(current => ({ ...current, lembrete:value }))} close={() => setOpenTool('')} options={[{value:'',label:'Sem lembrete',icon:'notifications_off'},{value:'10m',label:'10 minutos antes',icon:'notifications'},{value:'30m',label:'30 minutos antes',icon:'notifications'},{value:'1h',label:'1 hora antes',icon:'notifications'},{value:'1d',label:'1 dia antes',icon:'notifications'}]}/></Tool>
          </>}
        </div>
      </div>

      <footer className="mai-v3-drawer-footer"><span/><span className="mai-autosave-status">Alterações salvas automaticamente</span></footer>
    </form>
  </div>
}