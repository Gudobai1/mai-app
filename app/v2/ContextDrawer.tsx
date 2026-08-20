'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import { MaiIcon } from './MaiIcons'

export type InspectableKind = 'task' | 'event' | 'habit' | 'finance' | 'goal' | 'note'
export type InspectableItem = { kind: InspectableKind; sourceId: string; title: string; date?: string; time?: string; raw: Record<string, any> }
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

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const values = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const dateOnly = (value: unknown) => String(value || '').slice(0, 10)
const timeOnly = (value: unknown) => String(value || '').includes('T') ? String(value).slice(11, 16) : String(value || '').slice(0, 5)
const clean = (value: unknown) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

const priorityColor = (value: unknown) => {
  const priority = Number(value || 4)
  if (priority === 1) return '#c85b52'
  if (priority === 2) return '#c28a3d'
  if (priority === 3) return '#7c9274'
  return '#b8beb7'
}

function durationMinutes(start: string, end: string) {
  if (!start || !end) return 60
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const difference = (eh * 60 + em) - (sh * 60 + sm)
  return difference > 0 ? difference : 60
}

function endFromDuration(start: string, duration: number) {
  if (!start) return ''
  const [hour, minute] = start.split(':').map(Number)
  const total = hour * 60 + minute + Math.max(5, duration || 60)
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function TaskDescriptionEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value
  }, [value])
  const command = (name: string, argument?: string) => {
    ref.current?.focus()
    document.execCommand(name, false, argument)
    onChange(ref.current?.innerHTML || '')
  }
  return <div className="mai-v3-light-editor">
    <div className="mai-v3-light-toolbar">
      <button type="button" title="Negrito" onClick={() => command('bold')}><b>B</b></button>
      <button type="button" title="Itálico" onClick={() => command('italic')}><i>I</i></button>
      <button type="button" title="Lista" onClick={() => command('insertUnorderedList')}>•</button>
      <button type="button" title="Checklist" onClick={() => command('insertUnorderedList')}>☑</button>
      <button type="button" title="Link" onClick={() => { const url = prompt('Endereço do link:'); if (url) command('createLink', url) }}>↗</button>
    </div>
    <div ref={ref} className="mai-v3-light-surface" contentEditable suppressContentEditableWarning onInput={event => onChange(event.currentTarget.innerHTML)} />
  </div>
}

export function ContextDrawer({ item, state, today, commit, googleRpc, refreshEvents, onClose }: Props) {
  const [focusId, setFocusId] = useState('')
  const [draft, setDraft] = useState<Row>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [subtaskTitle, setSubtaskTitle] = useState('')

  useEffect(() => { setFocusId(item?.kind === 'task' ? item.sourceId : ''); setMessage('') }, [item?.kind, item?.sourceId])

  const taskMap = useMemo(() => new Map(state.tasks.map(task => [String(task.id), task])), [state.tasks])
  const focusedTask = item?.kind === 'task' ? taskMap.get(focusId || item.sourceId) : undefined
  const active: InspectableItem = item?.kind === 'task' && focusedTask
    ? { kind: 'task', sourceId: String(focusedTask.id), title: focusedTask.titulo, date: dateOnly(focusedTask.data_vencimento), time: timeOnly(focusedTask.data_vencimento), raw: focusedTask as Row }
    : item || { kind: 'task', sourceId: '', title: '', raw: {} }

  useEffect(() => {
    if (!item) { setDraft({}); return }
    const next = { ...active.raw }
    if (active.kind === 'event') next._duracao = durationMinutes(String(next.hora_inicio || ''), String(next.hora_fim || ''))
    setDraft(next)
    setSubtaskTitle('')
    setMessage('')
  }, [item, active.kind, active.sourceId, active.date])

  const projects = useMemo(() => rows(state.projects).filter(project => project.ativo !== false), [state.projects])
  const habitEntry = useMemo(() => active.kind === 'habit' ? rows(state.habitEntries).find(entry => String(entry.habito_id) === active.sourceId && dateOnly(entry.data) === (active.date || today)) : undefined, [active.kind, active.sourceId, active.date, state.habitEntries, today])
  const directChildren = useMemo(() => active.kind === 'task' ? state.tasks.filter(task => String(task.parent_id || '') === active.sourceId) : [], [active.kind, active.sourceId, state.tasks])

  const breadcrumbs = useMemo(() => {
    if (active.kind !== 'task') return [] as { id: string; title: string }[]
    const chain: { id: string; title: string }[] = []
    const seen = new Set<string>()
    let cursor = taskMap.get(active.sourceId)
    while (cursor && !seen.has(String(cursor.id))) {
      seen.add(String(cursor.id))
      chain.unshift({ id: String(cursor.id), title: String(cursor.titulo || 'Tarefa') })
      cursor = cursor.parent_id ? taskMap.get(String(cursor.parent_id)) : undefined
    }
    return chain
  }, [active.kind, active.sourceId, taskMap])

  if (!item) return null
  const label = ({ task: 'Tarefa', event: 'Compromisso', habit: 'Rotina', finance: 'Finanças', goal: 'Meta', note: 'Nota' } as const)[active.kind]
  const set = (patch: Row) => setDraft(current => ({ ...current, ...patch }))
  const reminders = values(draft.lembretes).map(String)
  const attachments = rows(draft.anexos)

  async function save(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    if (active.kind === 'task') {
      const day = dateOnly(draft.data_vencimento)
      const hour = String(draft._hora ?? timeOnly(draft.data_vencimento))
      const due = day ? `${day}${hour ? `T${hour}` : ''}` : ''
      commit(current => ({ ...current, tasks: current.tasks.map(task => task.id === active.sourceId ? { ...task, ...draft, titulo: String(draft.titulo || '').trim(), data_vencimento: due, prioridade: Number(draft.prioridade || 4), projeto_id: draft.projeto_id || 'entrada', lembretes: reminders, etiquetas: values(draft.etiquetas).map(String) } : task) }))
    } else if (active.kind === 'event') {
      const duration = Math.max(5, Number(draft._duracao || 60))
      const next: Row = {
        ...draft,
        titulo: String(draft.titulo || '').trim(),
        data_inicio: dateOnly(draft.data_inicio) || active.date || today,
        hora_fim: draft.dia_inteiro ? '' : endFromDuration(String(draft.hora_inicio || ''), duration),
        lembretes: reminders,
      }
      delete next._duracao
      if (next.tipo === 'google' || next.tipo === 'gcalendar' || String(next.id || '').includes('::')) {
        setBusy(true)
        try { await googleRpc('salvarEventoAgenda', [next]); await refreshEvents?.() }
        catch (error: any) { setMessage(error?.message || 'Não foi possível salvar no Google Agenda.'); setBusy(false); return }
        finally { setBusy(false) }
      } else commit(current => ({ ...current, events: rows(current.events).map(row => String(row.id) === active.sourceId ? next : row) }))
    } else if (active.kind === 'habit') {
      const value = Math.max(0, Number(draft._valor ?? habitEntry?.valor ?? 0))
      const day = active.date || today
      commit(current => {
        const entries = rows(current.habitEntries).filter(entry => !(String(entry.habito_id) === active.sourceId && dateOnly(entry.data) === day))
        return { ...current, habits: rows(current.habits).map(habit => String(habit.id) === active.sourceId ? { ...habit, nome: draft.nome || habit.nome, meta: Number(draft.meta || 1), unidade: draft.unidade || '', hora: draft.hora || '' } : habit), habitEntries: value > 0 ? [...entries, { id: habitEntry?.id || `hr-${crypto.randomUUID()}`, habito_id: active.sourceId, data: day, valor: value, criado_em: habitEntry?.criado_em || new Date().toISOString() }] : entries }
      })
    } else if (active.kind === 'finance') {
      if (active.raw.fixo_id || active.raw.recorrente === true) commit(current => ({ ...current, finance: { ...current.finance, fixed: rows(current.finance.fixed).map(rule => String(rule.id) === String(active.raw.fixo_id || active.sourceId) ? { ...rule, titulo: draft.titulo || rule.titulo, valor: Number(draft.valor_real ?? draft.valor ?? rule.valor), categoria: draft.categoria ?? rule.categoria } : rule) } }))
      else commit(current => ({ ...current, finance: { ...current.finance, transactions: rows(current.finance.transactions).map(tx => String(tx.id) === active.sourceId ? { ...tx, titulo: draft.titulo || tx.titulo, valor: Number(draft.valor || 0), data: dateOnly(draft.data) || tx.data, categoria: draft.categoria || '', status: draft.status || 'pendente', valor_pago: draft.status === 'pago' ? Number(draft.valor || 0) : Number(draft.valor_pago || 0) } : tx) } }))
    } else if (active.kind === 'goal') commit(current => ({ ...current, goals: rows(current.goals).map(goal => String(goal.id) === active.sourceId ? { ...goal, titulo: draft.titulo || goal.titulo, prazo: dateOnly(draft.prazo), status: draft.status || goal.status, progresso_atual: Number(draft.progresso_atual || 0), progresso_total: Math.max(1, Number(draft.progresso_total || 100)) } : goal) }))
    else commit(current => ({ ...current, notes: rows(current.notes).map(note => String(note.id) === active.sourceId ? { ...note, titulo: draft.titulo || '', conteudo: draft.conteudo || '', data: new Date().toISOString() } : note) }))
    onClose()
  }

  async function remove() {
    if (!confirm(`Excluir ${label.toLocaleLowerCase('pt-BR')}?`)) return
    if (active.kind === 'task') {
      const parentId = String(draft.parent_id || '')
      commit(current => ({ ...current, tasks: current.tasks.filter(task => task.id !== active.sourceId).map(task => String(task.parent_id || '') === active.sourceId ? { ...task, parent_id: parentId } : task) }))
    }
    if (active.kind === 'note') commit(current => ({ ...current, notes: rows(current.notes).map(note => String(note.id) === active.sourceId ? { ...note, ativo: false } : note) }))
    if (active.kind === 'goal') commit(current => ({ ...current, goals: rows(current.goals).filter(goal => String(goal.id) !== active.sourceId) }))
    if (active.kind === 'finance' && !active.raw.fixo_id && active.raw.recorrente !== true) commit(current => ({ ...current, finance: { ...current.finance, transactions: rows(current.finance.transactions).filter(tx => String(tx.id) !== active.sourceId) } }))
    if (active.kind === 'event') {
      if (draft.tipo === 'google' || draft.tipo === 'gcalendar' || String(draft.id || '').includes('::')) { setBusy(true); try { await googleRpc('excluirEventoAgenda', [draft.id]); await refreshEvents?.() } finally { setBusy(false) } }
      else commit(current => ({ ...current, events: rows(current.events).filter(row => String(row.id) !== active.sourceId) }))
    }
    onClose()
  }

  function addSubtask() {
    const title = subtaskTitle.trim()
    if (!title || active.kind !== 'task') return
    const child = {
      id: `t-${crypto.randomUUID()}`,
      titulo: title,
      descricao: '',
      data_vencimento: String(draft.data_vencimento || ''),
      prioridade: 4,
      concluida: false,
      projeto_id: draft.projeto_id || 'entrada',
      parent_id: active.sourceId,
      criado_em: new Date().toISOString(),
      ordem: Date.now(),
      notas: [], anexos: [], subtarefas: [], lembretes: [], etiquetas: [], repeticao: '', secao: '', ocultar_agenda: false,
    }
    commit(current => ({ ...current, tasks: [...current.tasks, child] }))
    setSubtaskTitle('')
  }

  function addReminder(value: string) {
    if (!value || reminders.includes(value)) return
    set({ lembretes: [...reminders, value] })
  }

  function projectLabel(projectId: unknown) {
    if (!projectId || projectId === 'entrada') return 'Entrada'
    return String(projects.find(project => String(project.id) === String(projectId))?.nome || 'Projeto')
  }

  return <div className="mai-context-layer" onMouseDown={onClose}><aside className="mai-context-drawer" onMouseDown={event => event.stopPropagation()}>
    <header>
      <div className="mai-v3-context-head-copy">
        {active.kind === 'task' && breadcrumbs.length > 1 ? <nav className="mai-v3-breadcrumbs">{breadcrumbs.map((crumb, index) => <span key={crumb.id}>{index ? <i>›</i> : null}<button type="button" data-current={index === breadcrumbs.length - 1} onClick={() => setFocusId(crumb.id)}>{crumb.title}</button></span>)}</nav> : <span>{label}</span>}
      </div>
      <button type="button" onClick={onClose}>×</button>
    </header>

    <form onSubmit={save}>
      {active.kind === 'task' ? <>
        <label><span>Título</span><input autoFocus value={draft.titulo || ''} onChange={e => set({ titulo: e.target.value })} /></label>
        <section className="mai-v3-context-section"><span className="mai-v3-context-label">Descrição</span><TaskDescriptionEditor value={String(draft.descricao || '')} onChange={descricao => set({ descricao })} /></section>
        <label><span>Data</span><input type="date" value={dateOnly(draft.data_vencimento)} onChange={e => set({ data_vencimento: e.target.value, _hora: draft._hora ?? timeOnly(draft.data_vencimento) })} /></label>
        <label><span>Horário</span><input type="time" value={String(draft._hora ?? timeOnly(draft.data_vencimento))} onChange={e => set({ _hora: e.target.value })} /></label>
        <label><span>Projeto</span><select value={draft.projeto_id || 'entrada'} onChange={e => set({ projeto_id: e.target.value })}><option value="entrada">Entrada</option>{projects.map(project => <option key={String(project.id)} value={project.id}>{project.nome}</option>)}</select></label>
        <label><span>Prioridade</span><select value={Number(draft.prioridade || 4)} onChange={e => set({ prioridade: Number(e.target.value) })}><option value={4}>Sem prioridade</option><option value={3}>Baixa</option><option value={2}>Média</option><option value={1}>Alta</option></select></label>
        <label><span>Repetir</span><select value={draft.repeticao || ''} onChange={e => set({ repeticao: e.target.value })}><option value="">Não repetir</option><option value="diariamente">Todos os dias</option><option value="semanalmente">Toda semana</option><option value="semanal:1,2,3,4,5">Dias úteis</option><option value="mensalmente">Todo mês</option></select></label>
        <section className="mai-v3-context-section"><div className="mai-v3-context-section-head"><strong>Subtarefas</strong><small>{directChildren.filter(child => child.concluida).length} de {directChildren.length}</small></div><div className="mai-v3-subtask-list">{directChildren.map(child => {
          const contextChanged = dateOnly(child.data_vencimento) !== dateOnly(draft.data_vencimento) || String(child.projeto_id || 'entrada') !== String(draft.projeto_id || 'entrada')
          return <button type="button" key={child.id} className="mai-v3-subtask-row" onClick={() => setFocusId(child.id)}><i data-completed={child.concluida === true} style={{ borderColor: priorityColor(child.prioridade) }}>{child.concluida ? '✓' : ''}</i><span><strong>{child.titulo}</strong>{contextChanged ? <small>{dateOnly(child.data_vencimento) || 'Sem data'} - {projectLabel(child.projeto_id)}</small> : null}</span><MaiIcon name="chevron" size={13}/></button>
        })}</div><div className="mai-v3-subtask-add"><input value={subtaskTitle} placeholder="Adicionar subtarefa" onChange={event => setSubtaskTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addSubtask() } }} /><button type="button" onClick={addSubtask}>＋</button></div></section>
        <section className="mai-v3-context-section"><div className="mai-v3-context-section-head"><strong>Lembretes</strong></div><div className="mai-v3-reminders">{reminders.map(reminder => <button type="button" key={reminder} onClick={() => set({ lembretes: reminders.filter(item => item !== reminder) })}>{reminder} ×</button>)}<select defaultValue="" onChange={event => { addReminder(event.target.value); event.currentTarget.value = '' }}><option value="">+ Adicionar lembrete</option><option value="10m">10 min antes</option><option value="30m">30 min antes</option><option value="1h">1 h antes</option><option value="1d">1 dia antes</option></select></div></section>
        <label><span>Etiquetas</span><input value={values(draft.etiquetas).map(String).join(', ')} placeholder="Cliente, Rua, Aguardando" onChange={e => set({ etiquetas: e.target.value.split(',').map(value => value.trim()).filter(Boolean) })} /></label>
        <section className="mai-v3-context-section"><div className="mai-v3-context-section-head"><strong>Arquivos</strong></div>{attachments.length ? <div className="mai-v3-attachment-list">{attachments.map((file, index) => <div key={String(file.id || file.nome || index)}>{String(file.nome || file.name || 'Arquivo')}</div>)}</div> : <small className="mai-v3-context-empty">Nenhum arquivo anexado.</small>}</section>
      </> : null}

      {active.kind === 'event' ? <>
        <label><span>Título</span><input autoFocus value={draft.titulo || ''} onChange={e => set({ titulo: e.target.value })} /></label>
        <label><span>Data</span><input type="date" value={dateOnly(draft.data_inicio) || active.date || today} onChange={e => set({ data_inicio: e.target.value })} /></label>
        <label><span>Termina</span><input type="date" value={dateOnly(draft.data_fim)} onChange={e => set({ data_fim: e.target.value })} /></label>
        <label className="mai-v3-switch-field"><span>Dia inteiro</span><input type="checkbox" checked={draft.dia_inteiro === true} onChange={e => set({ dia_inteiro: e.target.checked })} /></label>
        {!draft.dia_inteiro ? <label><span>Horário · duração</span><div className="mai-v3-time-duration"><input type="time" value={draft.hora_inicio || ''} onChange={e => set({ hora_inicio: e.target.value })} /><i>·</i><select value={Number(draft._duracao || 60)} onChange={e => set({ _duracao: Number(e.target.value) })}><option value={15}>15 min</option><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>1 h</option><option value={90}>1 h 30</option><option value={120}>2 h</option></select></div></label> : null}
        <label><span>Local</span><input value={draft.local || ''} onChange={e => set({ local: e.target.value })} /></label>
        <label><span>Categoria</span><div className="mai-v3-category-field"><input type="color" value={draft.categoria_cor || draft.cor || '#6f8168'} onChange={e => set({ categoria_cor: e.target.value, cor: e.target.value })} /><input value={draft.categoria || ''} placeholder="Sem categoria" onChange={e => set({ categoria: e.target.value })} /></div></label>
        <label><span>Repetir</span><select value={draft.repeticao || ''} onChange={e => set({ repeticao: e.target.value })}><option value="">Não repetir</option><option value="diariamente">Todos os dias</option><option value="semanalmente">Toda semana</option><option value="semanal:1,2,3,4,5">Dias úteis</option><option value="mensalmente">Todo mês</option></select></label>
        <section className="mai-v3-context-section"><span className="mai-v3-context-label">Observações</span><textarea rows={5} value={draft.descricao || ''} onChange={e => set({ descricao: e.target.value })} /></section>
        <section className="mai-v3-context-section"><div className="mai-v3-context-section-head"><strong>Lembretes</strong></div><div className="mai-v3-reminders">{reminders.map(reminder => <button type="button" key={reminder} onClick={() => set({ lembretes: reminders.filter(item => item !== reminder) })}>{reminder} ×</button>)}<select defaultValue="" onChange={event => { addReminder(event.target.value); event.currentTarget.value = '' }}><option value="">+ Adicionar lembrete</option><option value="10m">10 min antes</option><option value="30m">30 min antes</option><option value="1h">1 h antes</option><option value="1d">1 dia antes</option></select></div></section>
        <section className="mai-v3-context-section"><div className="mai-v3-context-section-head"><strong>Arquivos</strong></div>{attachments.length ? <div className="mai-v3-attachment-list">{attachments.map((file, index) => <div key={String(file.id || file.nome || index)}>{String(file.nome || file.name || 'Arquivo')}</div>)}</div> : <small className="mai-v3-context-empty">Nenhum arquivo anexado.</small>}</section>
      </> : null}

      {active.kind === 'habit' ? <><label><span>Rotina</span><input value={draft.nome || active.title} onChange={e => set({ nome: e.target.value })} /></label><label><span>Meta</span><input type="number" min="0" step="0.1" value={draft.meta ?? 1} onChange={e => set({ meta: Number(e.target.value) })} /></label><label><span>Unidade</span><input value={draft.unidade || ''} onChange={e => set({ unidade: e.target.value })} /></label><label><span>Horário</span><input type="time" value={draft.hora || ''} onChange={e => set({ hora: e.target.value })} /></label><label><span>Realizado</span><input type="number" min="0" step="0.1" value={draft._valor ?? habitEntry?.valor ?? 0} onChange={e => set({ _valor: Number(e.target.value) })} /></label></> : null}
      {active.kind === 'finance' ? <><label><span>Descrição</span><input value={draft.titulo || active.title} onChange={e => set({ titulo: e.target.value })} /></label><label><span>Valor</span><input type="number" step="0.01" value={draft.valor_real ?? draft.valor ?? 0} onChange={e => set({ [draft.valor_real != null ? 'valor_real' : 'valor']: Number(e.target.value) })} /></label><label><span>Status</span><select value={draft.status || 'pendente'} onChange={e => set({ status: e.target.value })}><option value="pendente">Pendente</option><option value="parcial">Parcial</option><option value="pago">Pago</option></select></label>{!active.raw.fixo_id && active.raw.recorrente !== true ? <label><span>Data</span><input type="date" value={dateOnly(draft.data)} onChange={e => set({ data: e.target.value })} /></label> : null}<label><span>Categoria</span><input value={draft.categoria || ''} onChange={e => set({ categoria: e.target.value })} /></label></> : null}
      {active.kind === 'goal' ? <><label><span>Meta</span><input value={draft.titulo || active.title} onChange={e => set({ titulo: e.target.value })} /></label><label><span>Atual</span><input type="number" step="0.1" value={draft.progresso_atual || 0} onChange={e => set({ progresso_atual: Number(e.target.value) })} /></label><label><span>Alvo</span><input type="number" min="1" step="0.1" value={draft.progresso_total || 100} onChange={e => set({ progresso_total: Number(e.target.value) })} /></label><label><span>Prazo</span><input type="date" value={dateOnly(draft.prazo)} onChange={e => set({ prazo: e.target.value })} /></label><label><span>Status</span><select value={draft.status || 'Em Andamento'} onChange={e => set({ status: e.target.value })}><option>Em Andamento</option><option>Pausada</option><option>Concluída</option></select></label></> : null}
      {active.kind === 'note' ? <><label><span>Título</span><input autoFocus value={draft.titulo || ''} onChange={e => set({ titulo: e.target.value })} /></label><label><span>Conteúdo</span><textarea rows={14} value={clean(draft.conteudo)} onChange={e => set({ conteudo: e.target.value })} /></label></> : null}

      {message ? <p className="mai-context-error">{message}</p> : null}
      <footer><button type="button" className="mai-context-delete" onClick={() => void remove()} disabled={busy}>Excluir</button><div><button type="button" onClick={onClose}>Cancelar</button><button disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button></div></footer>
    </form>
  </aside></div>
}
