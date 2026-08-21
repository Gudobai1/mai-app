'use client'

import { FormEvent, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { Row } from './app-types'
import styles from './unified.module.css'

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []

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
    ? { titulo: '', descricao: '', data: defaultDate ?? '', hora: '', prioridade: 4, projeto_id: defaultProjectId, secao: '', repeticao: '', lembrete: '' }
    : { titulo: '', descricao: '', data: defaultDate || today, hora_inicio: '', hora_fim: '', dia_inteiro: false, local: '', categoria: '', categoria_cor: '#6f8168', categoria_icone: 'calendar', repeticao: '', lembrete: '' }
  const [currentKind, setCurrentKind] = useState<'task' | 'event'>(kind)
  const [draft, setDraft] = useState<Row>(() => makeDraft(kind))
  const projects = rows(state.projects).filter(item => item.ativo !== false)
  const selectedProject = projects.find(project => String(project.id) === String(draft.projeto_id || 'entrada'))
  const projectSections = selectedProject ? rows(selectedProject.secoes).map(String) : []

  function switchKind(next: 'task' | 'event') {
    if (next === currentKind) return
    setCurrentKind(next)
    setDraft(makeDraft(next))
  }

  function save(event: FormEvent) {
    event.preventDefault()
    if (!String(draft.titulo || '').trim()) return
    if (currentKind === 'task') {
      const due = draft.data ? `${draft.data}${draft.hora ? `T${draft.hora}` : ''}` : ''
      const task = {
        id: `t-${crypto.randomUUID()}`,
        titulo: String(draft.titulo).trim(),
        descricao: draft.descricao || '',
        data_vencimento: due,
        prioridade: Number(draft.prioridade || 4),
        concluida: false,
        projeto_id: draft.projeto_id || 'entrada',
        criado_em: new Date().toISOString(),
        ordem: Date.now(),
        notas: [],
        anexos: [],
        subtarefas: [],
        repeticao: draft.repeticao || '',
        lembretes: draft.lembrete ? [draft.lembrete] : [],
        etiquetas: [],
        secao: draft.secao || '',
        ocultar_agenda: false,
      }
      commit(current => ({ ...current, tasks: [...current.tasks, task] }))
    } else {
      const eventRow = {
        id: `local-event-${crypto.randomUUID()}`,
        tipo: 'local',
        titulo: String(draft.titulo).trim(),
        descricao: draft.descricao || '',
        data_inicio: draft.data || today,
        hora_inicio: draft.dia_inteiro ? '' : draft.hora_inicio || '',
        hora_fim: draft.dia_inteiro ? '' : draft.hora_fim || '',
        dia_inteiro: draft.dia_inteiro === true,
        local: draft.local || '',
        categoria: draft.categoria || '',
        categoria_cor: draft.categoria_cor || '#6f8168',
        categoria_icone: draft.categoria_icone || 'calendar',
        repeticao: draft.repeticao || '',
        lembretes: draft.lembrete ? [draft.lembrete] : [],
        anexos: [],
        cor: draft.categoria_cor || '#6f8168',
      }
      commit(current => ({ ...current, events: [...rows(current.events), eventRow] }))
    }
    onClose()
  }

  return <div className="mai-v3-create-layer" onMouseDown={onClose}>
    <form className="mai-v3-create-drawer" onSubmit={save} onMouseDown={event => event.stopPropagation()}>
      <header className="mai-v3-drawer-header">
        <div>{allowKindSwitch ? <div className="mai-v3-kind-switch"><button type="button" data-active={currentKind === 'task'} onClick={() => switchKind('task')}>Tarefa</button><button type="button" data-active={currentKind === 'event'} onClick={() => switchKind('event')}>Compromisso</button></div> : <strong>{currentKind === 'task' ? 'Nova tarefa' : 'Novo compromisso'}</strong>}</div>
        <button type="button" className="mai-v3-close" onClick={onClose}>×</button>
      </header>

      <div className="mai-v3-drawer-body">
        <input className="mai-v3-title-input" autoFocus placeholder={currentKind === 'task' ? 'Nome da tarefa' : 'Nome do compromisso'} value={draft.titulo || ''} onChange={event => setDraft({ ...draft, titulo: event.target.value })} />
        <textarea className="mai-v3-description-input" rows={4} placeholder="Descrição" value={draft.descricao || ''} onChange={event => setDraft({ ...draft, descricao: event.target.value })} />

        <div className="mai-v3-field-line"><span>Data</span><input type="date" value={draft.data || ''} onChange={event => setDraft({ ...draft, data: event.target.value })} /></div>

        {currentKind === 'task' ? <>
          <div className="mai-v3-field-line"><span>Horário</span><input type="time" value={draft.hora || ''} onChange={event => setDraft({ ...draft, hora: event.target.value })} /></div>
          <div className="mai-v3-field-line"><span>Projeto</span><select value={draft.projeto_id || 'entrada'} onChange={event => setDraft({ ...draft, projeto_id: event.target.value, secao: '' })}><option value="entrada">Entrada</option>{projects.map(project => <option key={String(project.id)} value={String(project.id)}>{String(project.nome)}</option>)}</select></div>
          {projectSections.length ? <div className="mai-v3-field-line mai-v3-section-field"><span>Seção</span><select value={draft.secao || ''} onChange={event => setDraft({ ...draft, secao: event.target.value })}><option value="">Sem seção</option>{projectSections.map(section => <option key={section} value={section}>{section}</option>)}</select></div> : null}
          <div className="mai-v3-field-line"><span>Prioridade</span><select value={Number(draft.prioridade || 4)} onChange={event => setDraft({ ...draft, prioridade: Number(event.target.value) })}><option value={4}>Sem prioridade</option><option value={3}>Baixa</option><option value={2}>Média</option><option value={1}>Alta</option></select></div>
          <div className="mai-v3-field-line"><span>Repetir</span><select value={draft.repeticao || ''} onChange={event => setDraft({ ...draft, repeticao: event.target.value })}><option value="">Não repetir</option><option value="diariamente">Todos os dias</option><option value="semanalmente">Toda semana</option><option value="semanal:1,2,3,4,5">Dias úteis</option><option value="mensalmente">Todo mês</option></select></div>
          <div className="mai-v3-field-line"><span>Lembrete</span><select value={draft.lembrete || ''} onChange={event => setDraft({ ...draft, lembrete: event.target.value })}><option value="">Sem lembrete</option><option value="10m">10 minutos antes</option><option value="30m">30 minutos antes</option><option value="1h">1 hora antes</option><option value="1d">1 dia antes</option></select></div>
        </> : <>
          <label className="mai-v3-switch-line"><span>Dia inteiro</span><input type="checkbox" checked={draft.dia_inteiro === true} onChange={event => setDraft({ ...draft, dia_inteiro: event.target.checked })} /></label>
          {!draft.dia_inteiro ? <div className="mai-v3-field-line"><span>Horário</span><div className="mai-v3-inline-times"><input type="time" value={draft.hora_inicio || ''} onChange={event => setDraft({ ...draft, hora_inicio: event.target.value })} /><span>·</span><input type="time" value={draft.hora_fim || ''} onChange={event => setDraft({ ...draft, hora_fim: event.target.value })} /></div></div> : null}
          <div className="mai-v3-field-line"><span>Local</span><input value={draft.local || ''} placeholder="Adicionar local" onChange={event => setDraft({ ...draft, local: event.target.value })} /></div>
          <div className="mai-v3-field-line"><span>Categoria</span><div className="mai-v3-category-field"><input type="color" value={draft.categoria_cor || '#6f8168'} onChange={event => setDraft({ ...draft, categoria_cor: event.target.value })} /><input value={draft.categoria || ''} placeholder="Sem categoria" onChange={event => setDraft({ ...draft, categoria: event.target.value })} /></div></div>
          <div className="mai-v3-field-line"><span>Repetir</span><select value={draft.repeticao || ''} onChange={event => setDraft({ ...draft, repeticao: event.target.value })}><option value="">Não repetir</option><option value="diariamente">Todos os dias</option><option value="semanalmente">Toda semana</option><option value="semanal:1,2,3,4,5">Dias úteis</option><option value="mensalmente">Todo mês</option></select></div>
          <div className="mai-v3-field-line"><span>Lembrete</span><select value={draft.lembrete || ''} onChange={event => setDraft({ ...draft, lembrete: event.target.value })}><option value="">Sem lembrete</option><option value="10m">10 minutos antes</option><option value="30m">30 minutos antes</option><option value="1h">1 hora antes</option><option value="1d">1 dia antes</option></select></div>
        </>}
      </div>

      <footer className="mai-v3-drawer-footer"><button type="button" className={styles.secondaryButton} onClick={onClose}>Cancelar</button><button className={styles.primaryButton}>Salvar</button></footer>
    </form>
  </div>
}
