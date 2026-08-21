'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import { MaiIcon } from './MaiIcons'

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
const priorityColor = (value: unknown) => Number(value || 4) === 1 ? '#c85b52' : Number(value || 4) === 2 ? '#c28a3d' : Number(value || 4) === 3 ? '#7c9274' : '#b8beb7'

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

function DescriptionEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value
  }, [value])
  return <div className="mai-context-v2-description-editor">
    <div ref={ref} className="mai-context-v2-description-surface" contentEditable suppressContentEditableWarning data-placeholder="Adicionar descrição…" onInput={event => onChange(event.currentTarget.innerHTML)} />
  </div>
}

function MetaRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return <div className="mai-context-v2-meta-row">
    <span className="material-symbols-rounded" aria-hidden="true">{icon}</span>
    <span className="mai-context-v2-meta-label">{label}</span>
    <div className="mai-context-v2-meta-control">{children}</div>
  </div>
}

export function ContextDrawerV2({ item, state, today, commit, googleRpc, refreshEvents, onClose }: Props) {
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
  const directChildren = useMemo(() => active.kind === 'task' ? state.tasks.filter(task => String(task.parent_id || '') === active.sourceId).sort((a,b) => Number(a.ordem || 0)-Number(b.ordem || 0)) : [], [active.kind, active.sourceId, state.tasks])
  const habitEntry = useMemo(() => active.kind === 'habit' ? rows(state.habitEntries).find(entry => String(entry.habito_id) === active.sourceId && dateOnly(entry.data) === (active.date || today)) : undefined, [active.kind, active.sourceId, active.date, state.habitEntries, today])
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

  const set = (patch: Row) => setDraft(current => ({ ...current, ...patch }))
  const attachments = rows(draft.anexos)
  const label = ({ task: 'Tarefa', event: 'Compromisso', habit: 'Hábito', finance: 'Lançamento', goal: 'Meta', note: 'Nota' } as const)[active.kind]

  const titleValue = active.kind === 'habit' ? String(draft.nome || '') : String(draft.titulo || '')
  const setTitle = (value: string) => active.kind === 'habit' ? set({ nome: value }) : set({ titulo: value })

  async function save(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    if (active.kind === 'task') {
      const day = dateOnly(draft.data_vencimento)
      const hour = String(draft._hora ?? timeOnly(draft.data_vencimento))
      const due = day ? `${day}${hour ? `T${hour}` : ''}` : ''
      commit(current => ({ ...current, tasks: current.tasks.map(task => task.id === active.sourceId ? { ...task, ...draft, titulo: String(draft.titulo || '').trim(), data_vencimento: due, prioridade: Number(draft.prioridade || 4), projeto_id: draft.projeto_id || 'entrada', anexos: attachments } : task) }))
    } else if (active.kind === 'event') {
      const duration = Math.max(5, Number(draft._duracao || 60))
      const next: Row = { ...draft, titulo: String(draft.titulo || '').trim(), data_inicio: dateOnly(draft.data_inicio) || active.date || today, hora_fim: draft.dia_inteiro ? '' : endFromDuration(String(draft.hora_inicio || ''), duration), anexos: attachments }
      delete next._duracao
      if (next.tipo === 'google' || next.tipo === 'gcalendar' || String(next.id || '').includes('::')) {
        setBusy(true)
        try { await googleRpc('salvarEventoAgenda', [next]); await refreshEvents?.() }
        catch (error: any) { setMessage(error?.message || 'Não foi possível salvar no Google Agenda.'); return }
        finally { setBusy(false) }
      } else commit(current => ({ ...current, events: rows(current.events).map(row => String(row.id) === active.sourceId ? next : row) }))
    } else if (active.kind === 'habit') {
      const value = Math.max(0, Number(draft._valor ?? habitEntry?.valor ?? 0))
      const day = active.date || today
      commit(current => {
        const entries = rows(current.habitEntries).filter(entry => !(String(entry.habito_id) === active.sourceId && dateOnly(entry.data) === day))
        return { ...current, habits: rows(current.habits).map(habit => String(habit.id) === active.sourceId ? { ...habit, ...draft, nome: String(draft.nome || habit.nome).trim(), meta: Number(draft.meta || 1), anexos: attachments } : habit), habitEntries: value > 0 ? [...entries, { id: habitEntry?.id || `hr-${crypto.randomUUID()}`, habito_id: active.sourceId, data: day, valor: value, criado_em: habitEntry?.criado_em || new Date().toISOString() }] : entries }
      })
    } else if (active.kind === 'finance') {
      if (active.raw.fixo_id || active.raw.recorrente === true) commit(current => ({ ...current, finance: { ...current.finance, fixed: rows(current.finance.fixed).map(rule => String(rule.id) === String(active.raw.fixo_id || active.sourceId) ? { ...rule, ...draft, titulo: draft.titulo || rule.titulo, valor: Number(draft.valor_real ?? draft.valor ?? rule.valor), anexos: attachments } : rule) } }))
      else commit(current => ({ ...current, finance: { ...current.finance, transactions: rows(current.finance.transactions).map(tx => String(tx.id) === active.sourceId ? { ...tx, ...draft, titulo: draft.titulo || tx.titulo, valor: Number(draft.valor || 0), data: dateOnly(draft.data) || tx.data, anexos: attachments } : tx) } }))
    } else if (active.kind === 'goal') {
      commit(current => ({ ...current, goals: rows(current.goals).map(goal => String(goal.id) === active.sourceId ? { ...goal, ...draft, titulo: draft.titulo || goal.titulo, prazo: dateOnly(draft.prazo), progresso_atual: Number(draft.progresso_atual || 0), progresso_total: Math.max(1, Number(draft.progresso_total || 100)), anexos: attachments } : goal) }))
    } else {
      commit(current => ({ ...current, notes: rows(current.notes).map(note => String(note.id) === active.sourceId ? { ...note, ...draft, titulo: draft.titulo || '', conteudo: draft.conteudo || '', anexos: attachments, data: new Date().toISOString() } : note) }))
    }
    onClose()
  }

  async function remove() {
    if (!confirm(`Excluir ${label.toLocaleLowerCase('pt-BR')}?`)) return
    if (active.kind === 'task') {
      const parentId = String(draft.parent_id || '')
      commit(current => ({ ...current, tasks: current.tasks.filter(task => task.id !== active.sourceId).map(task => String(task.parent_id || '') === active.sourceId ? { ...task, parent_id: parentId } : task) }))
    } else if (active.kind === 'note') commit(current => ({ ...current, notes: rows(current.notes).map(note => String(note.id) === active.sourceId ? { ...note, ativo: false } : note) }))
    else if (active.kind === 'goal') commit(current => ({ ...current, goals: rows(current.goals).filter(goal => String(goal.id) !== active.sourceId) }))
    else if (active.kind === 'habit') commit(current => ({ ...current, habits: rows(current.habits).map(habit => String(habit.id) === active.sourceId ? { ...habit, ativo: false } : habit) }))
    else if (active.kind === 'finance') {
      if (active.raw.fixo_id || active.raw.recorrente === true) commit(current => ({ ...current, finance: { ...current.finance, fixed: rows(current.finance.fixed).filter(rule => String(rule.id) !== String(active.raw.fixo_id || active.sourceId)) } }))
      else commit(current => ({ ...current, finance: { ...current.finance, transactions: rows(current.finance.transactions).filter(tx => String(tx.id) !== active.sourceId) } }))
    } else if (active.kind === 'event') {
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
      data_vencimento: '',
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

  function toggleSubtask(id: string) {
    commit(current => ({ ...current, tasks: current.tasks.map(task => task.id === id ? { ...task, concluida: !task.concluida, concluida_em: !task.concluida ? new Date().toISOString() : '' } : task) }))
  }

  const description = active.kind === 'finance' ? String(draft.observacao || '') : active.kind === 'note' ? String(draft.conteudo || '') : String(draft.descricao || '')
  const setDescription = (value: string) => active.kind === 'finance' ? set({ observacao: value }) : active.kind === 'note' ? set({ conteudo: value }) : set({ descricao: value })

  return <div className="mai-context-layer mai-context-v2-layer" onMouseDown={onClose}>
    <aside className="mai-context-drawer mai-context-v2-drawer" data-kind={active.kind} onMouseDown={event => event.stopPropagation()}>
      <header className="mai-context-v2-top">
        <div>{active.kind === 'task' && breadcrumbs.length > 1 ? <nav className="mai-context-v2-breadcrumbs">{breadcrumbs.map((crumb,index) => <span key={crumb.id}>{index ? '›' : ''}<button type="button" data-current={index === breadcrumbs.length - 1} onClick={() => setFocusId(crumb.id)}>{crumb.title}</button></span>)}</nav> : <span>{label}</span>}</div>
        <button type="button" className="mai-context-v2-close" onClick={onClose} aria-label="Fechar"><MaiIcon name="close" size={17}/></button>
      </header>

      <form onSubmit={save} className="mai-context-v2-form">
        <div className="mai-context-v2-scroll">
          <input className="mai-context-v2-title" autoFocus value={titleValue} onChange={e => setTitle(e.target.value)} placeholder={`Nome ${label.toLocaleLowerCase('pt-BR')}`} />

          <section className="mai-context-v2-meta-list" aria-label="Detalhes">
            {active.kind === 'task' ? <>
              <MetaRow icon="calendar_today" label="Data"><input type="date" value={dateOnly(draft.data_vencimento)} onChange={e => set({ data_vencimento: e.target.value, _hora: draft._hora ?? timeOnly(draft.data_vencimento) })}/></MetaRow>
              <MetaRow icon="schedule" label="Horário"><input type="time" value={String(draft._hora ?? timeOnly(draft.data_vencimento))} onChange={e => set({ _hora: e.target.value })}/></MetaRow>
              <MetaRow icon="folder" label="Projeto"><select value={draft.projeto_id || 'entrada'} onChange={e => set({ projeto_id: e.target.value })}><option value="entrada">Entrada</option>{projects.map(project => <option key={String(project.id)} value={String(project.id)}>{String(project.nome || 'Projeto')}</option>)}</select></MetaRow>
              <MetaRow icon="flag" label="Prioridade"><select value={Number(draft.prioridade || 4)} onChange={e => set({ prioridade: Number(e.target.value) })}><option value={4}>Sem prioridade</option><option value={3}>Baixa</option><option value={2}>Média</option><option value={1}>Alta</option></select></MetaRow>
              <MetaRow icon="repeat" label="Repetir"><select value={draft.repeticao || ''} onChange={e => set({ repeticao: e.target.value })}><option value="">Não repetir</option><option value="diariamente">Todos os dias</option><option value="semanalmente">Toda semana</option><option value="semanal:1,2,3,4,5">Dias úteis</option><option value="mensalmente">Todo mês</option></select></MetaRow>
            </> : null}

            {active.kind === 'event' ? <>
              <MetaRow icon="calendar_today" label="Data"><input type="date" value={dateOnly(draft.data_inicio) || active.date || today} onChange={e => set({ data_inicio: e.target.value })}/></MetaRow>
              <MetaRow icon="event_busy" label="Termina"><input type="date" value={dateOnly(draft.data_fim)} onChange={e => set({ data_fim: e.target.value })}/></MetaRow>
              <MetaRow icon="schedule" label="Horário"><input type="time" disabled={draft.dia_inteiro === true} value={draft.hora_inicio || ''} onChange={e => set({ hora_inicio: e.target.value })}/></MetaRow>
              <MetaRow icon="timelapse" label="Duração"><select disabled={draft.dia_inteiro === true} value={Number(draft._duracao || 60)} onChange={e => set({ _duracao: Number(e.target.value) })}><option value={15}>15 min</option><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>1 h</option><option value={90}>1 h 30</option><option value={120}>2 h</option></select></MetaRow>
              <MetaRow icon="today" label="Dia inteiro"><input type="checkbox" checked={draft.dia_inteiro === true} onChange={e => set({ dia_inteiro: e.target.checked })}/></MetaRow>
              <MetaRow icon="location_on" label="Local"><input value={draft.local || ''} placeholder="Sem local" onChange={e => set({ local: e.target.value })}/></MetaRow>
              <MetaRow icon="repeat" label="Repetir"><select value={draft.repeticao || ''} onChange={e => set({ repeticao: e.target.value })}><option value="">Não repetir</option><option value="diariamente">Todos os dias</option><option value="semanalmente">Toda semana</option><option value="mensalmente">Todo mês</option></select></MetaRow>
            </> : null}

            {active.kind === 'habit' ? <>
              <MetaRow icon="schedule" label="Horário"><input type="time" value={draft.hora || ''} onChange={e => set({ hora: e.target.value })}/></MetaRow>
              <MetaRow icon="target" label="Meta"><input type="number" min="0" step="0.1" value={draft.meta ?? 1} onChange={e => set({ meta: Number(e.target.value) })}/></MetaRow>
              <MetaRow icon="straighten" label="Unidade"><input value={draft.unidade || ''} placeholder="Sem unidade" onChange={e => set({ unidade: e.target.value })}/></MetaRow>
              <MetaRow icon="check_circle" label="Realizado"><input type="number" min="0" step="0.1" value={draft._valor ?? habitEntry?.valor ?? 0} onChange={e => set({ _valor: Number(e.target.value) })}/></MetaRow>
            </> : null}

            {active.kind === 'finance' ? <>
              {!active.raw.fixo_id && active.raw.recorrente !== true ? <MetaRow icon="calendar_today" label="Data"><input type="date" value={dateOnly(draft.data)} onChange={e => set({ data: e.target.value })}/></MetaRow> : null}
              <MetaRow icon="payments" label="Valor"><input type="number" step="0.01" value={draft.valor_real ?? draft.valor ?? 0} onChange={e => set({ [draft.valor_real != null ? 'valor_real' : 'valor']: Number(e.target.value) })}/></MetaRow>
              <MetaRow icon="task_alt" label="Status"><select value={draft.status || 'pendente'} onChange={e => set({ status: e.target.value })}><option value="pendente">Pendente</option><option value="parcial">Parcial</option><option value="pago">Pago</option></select></MetaRow>
              <MetaRow icon="sell" label="Categoria"><input value={draft.categoria || ''} placeholder="Sem categoria" onChange={e => set({ categoria: e.target.value })}/></MetaRow>
            </> : null}

            {active.kind === 'goal' ? <>
              <MetaRow icon="calendar_today" label="Prazo"><input type="date" value={dateOnly(draft.prazo)} onChange={e => set({ prazo: e.target.value })}/></MetaRow>
              <MetaRow icon="trending_up" label="Atual"><input type="number" step="0.1" value={draft.progresso_atual || 0} onChange={e => set({ progresso_atual: Number(e.target.value) })}/></MetaRow>
              <MetaRow icon="target" label="Alvo"><input type="number" min="1" step="0.1" value={draft.progresso_total || 100} onChange={e => set({ progresso_total: Number(e.target.value) })}/></MetaRow>
              <MetaRow icon="task_alt" label="Status"><select value={draft.status || 'Em Andamento'} onChange={e => set({ status: e.target.value })}><option>Em Andamento</option><option>Pausada</option><option>Concluída</option></select></MetaRow>
            </> : null}
          </section>

          <section className="mai-context-v2-section mai-context-v2-description">
            <header><span className="material-symbols-rounded">notes</span><strong>{active.kind === 'note' ? 'Conteúdo' : 'Descrição'}</strong></header>
            <DescriptionEditor value={description} onChange={setDescription}/>
          </section>

          {active.kind === 'task' ? <section className="mai-context-v2-section mai-context-v2-subtasks">
            <header><span className="material-symbols-rounded">account_tree</span><strong>Subtarefas</strong><small>{directChildren.filter(child => child.concluida).length}/{directChildren.length}</small></header>
            <div className="mai-context-v2-subtask-list">{directChildren.map(child => <div className="mai-context-v2-subtask" key={child.id}>
              <button type="button" className="mai-context-v2-subtask-check" data-done={child.concluida === true} style={!child.concluida ? { borderColor: priorityColor(child.prioridade) } : undefined} onClick={() => toggleSubtask(child.id)}>{child.concluida ? '✓' : ''}</button>
              <button type="button" className="mai-context-v2-subtask-main" onClick={() => setFocusId(child.id)}><strong>{child.titulo}</strong><small>{dateOnly(child.data_vencimento) ? `${dateOnly(child.data_vencimento)} · tarefa com data` : 'Dentro desta tarefa'}</small></button>
              <MaiIcon name="chevron" size={13}/>
            </div>)}</div>
            <div className="mai-context-v2-subtask-add"><span className="material-symbols-rounded">add</span><input value={subtaskTitle} placeholder="Adicionar subtarefa" onChange={e => setSubtaskTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubtask() } }}/><button type="button" onClick={addSubtask}>Adicionar</button></div>
          </section> : null}

          <section className="mai-context-v2-section mai-context-v2-files">
            <header><span className="material-symbols-rounded">attach_file</span><strong>Arquivos</strong></header>
            {attachments.length ? <div>{attachments.map((file,index) => <div className="mai-context-v2-file" key={String(file.id || file.nome || file.name || index)}><span className="material-symbols-rounded">description</span><span>{String(file.nome || file.name || 'Arquivo')}</span></div>)}</div> : <small>Nenhum arquivo anexado.</small>}
          </section>

          {message ? <p className="mai-context-error">{message}</p> : null}
        </div>

        <footer className="mai-context-v2-footer">
          <button type="button" className="mai-context-v2-delete" onClick={() => void remove()} disabled={busy}><MaiIcon name="delete" size={15}/>Excluir</button>
          <div><button type="button" onClick={onClose}>Cancelar</button><button className="mai-context-v2-save" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button></div>
        </footer>
      </form>
    </aside>
  </div>
}
