'use client'

import { FormEvent, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { Row } from './app-types'
import styles from './unified.module.css'

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []

type Props = {
  kind: 'task' | 'event'
  state: MaiState
  today: string
  defaultProjectId?: string
  defaultDate?: string
  commit: (change: (current: MaiState) => MaiState) => void
  onClose: () => void
}

export function QuickCreateDrawer({ kind, state, today, defaultProjectId = 'entrada', defaultDate, commit, onClose }: Props) {
  const [draft, setDraft] = useState<Row>(kind === 'task'
    ? { titulo: '', descricao: '', data: defaultDate ?? '', hora: '', prioridade: 4, projeto_id: defaultProjectId }
    : { titulo: '', descricao: '', data: defaultDate || today, hora_inicio: '', hora_fim: '', dia_inteiro: false })
  const projects = rows(state.projects).filter(item => item.ativo !== false)
  function save(event: FormEvent) {
    event.preventDefault()
    if (!String(draft.titulo || '').trim()) return
    if (kind === 'task') {
      const due = draft.data ? `${draft.data}${draft.hora ? `T${draft.hora}` : ''}` : ''
      const task = { id: `t-${crypto.randomUUID()}`, titulo: String(draft.titulo).trim(), descricao: draft.descricao || '', data_vencimento: due, prioridade: Number(draft.prioridade || 4), concluida: false, projeto_id: draft.projeto_id || 'entrada', criado_em: new Date().toISOString(), ordem: Date.now(), notas: [], anexos: [], subtarefas: [], repeticao: '', secao: '', ocultar_agenda: false }
      commit(current => ({ ...current, tasks: [...current.tasks, task] }))
    } else {
      const eventRow = { id: `local-event-${crypto.randomUUID()}`, tipo: 'local', titulo: String(draft.titulo).trim(), descricao: draft.descricao || '', data_inicio: draft.data || today, hora_inicio: draft.dia_inteiro ? '' : draft.hora_inicio || '', hora_fim: draft.dia_inteiro ? '' : draft.hora_fim || '', dia_inteiro: draft.dia_inteiro === true, repeticao: '', cor: '#60765a' }
      commit(current => ({ ...current, events: [...rows(current.events), eventRow] }))
    }
    onClose()
  }
  return <div className={styles.modalLayer} onMouseDown={onClose}><form className={styles.modalCard} onSubmit={save} onMouseDown={event => event.stopPropagation()}><header className={styles.modalHeader}><div><h2>{kind === 'task' ? 'Nova tarefa' : 'Novo compromisso'}</h2></div><button type="button" onClick={onClose}>×</button></header><div className={styles.areaForm}><label className={styles.span2}><span>Título</span><input autoFocus value={draft.titulo || ''} onChange={event => setDraft({ ...draft, titulo: event.target.value })} /></label><label className={styles.span2}><span>Descrição</span><textarea rows={5} value={draft.descricao || ''} onChange={event => setDraft({ ...draft, descricao: event.target.value })} /></label><label><span>Data</span><input type="date" value={draft.data || ''} onChange={event => setDraft({ ...draft, data: event.target.value })} /></label>{kind === 'task' ? <><label><span>Horário</span><input type="time" value={draft.hora || ''} onChange={event => setDraft({ ...draft, hora: event.target.value })} /></label><label><span>Prioridade</span><select value={draft.prioridade || 4} onChange={event => setDraft({ ...draft, prioridade: Number(event.target.value) })}><option value={1}>Urgente</option><option value={2}>Alta</option><option value={3}>Média</option><option value={4}>Normal</option></select></label><label><span>Projeto</span><select value={draft.projeto_id || 'entrada'} onChange={event => setDraft({ ...draft, projeto_id: event.target.value })}><option value="entrada">Entrada</option>{projects.map(project => <option key={String(project.id)} value={project.id}>{project.nome}</option>)}</select></label></> : <><label className={styles.toggleRow}><input type="checkbox" checked={draft.dia_inteiro === true} onChange={event => setDraft({ ...draft, dia_inteiro: event.target.checked })} /><span>Dia inteiro</span></label>{!draft.dia_inteiro ? <><label><span>Início</span><input type="time" value={draft.hora_inicio || ''} onChange={event => setDraft({ ...draft, hora_inicio: event.target.value })} /></label><label><span>Fim</span><input type="time" value={draft.hora_fim || ''} onChange={event => setDraft({ ...draft, hora_fim: event.target.value })} /></label></> : null}</>}</div><footer><span /><div><button type="button" className={styles.secondaryButton} onClick={onClose}>Cancelar</button><button className={styles.primaryButton}>Salvar</button></div></footer></form></div>
}
