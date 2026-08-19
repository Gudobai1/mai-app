'use client'

import { FormEvent, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { Row } from './app-types'
import styles from './unified.module.css'

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []

type Props = {
  state: MaiState
  commit: (change: (current: MaiState) => MaiState) => void
  onClose: () => void
  onCreated: (id: string) => void
}

export function ProjectDrawer({ state, commit, onClose, onCreated }: Props) {
  const [draft, setDraft] = useState<Row>({ nome: '', cor: '#60765a', icone: 'folder', parent_id: '' })
  const projects = rows(state.projects).filter(item => item.ativo !== false)
  function save(event: FormEvent) {
    event.preventDefault()
    if (!String(draft.nome || '').trim()) return
    const id = `p-${crypto.randomUUID()}`
    const next = { ...draft, id, nome: String(draft.nome).trim(), cor: draft.cor || '#60765a', icone: draft.icone || 'folder', parent_id: draft.parent_id || '', ordem: projects.length, secoes: [], ativo: true }
    commit(current => ({ ...current, projects: [...rows(current.projects), next] }))
    onCreated(id)
  }
  return <div className={styles.modalLayer} onMouseDown={onClose}><form className={styles.modalCard} onSubmit={save} onMouseDown={event => event.stopPropagation()}><header className={styles.modalHeader}><div><h2>Novo projeto</h2></div><button type="button" onClick={onClose}>×</button></header><div className={styles.areaForm}><label className={styles.span2}><span>Nome</span><input autoFocus value={draft.nome || ''} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></label><label><span>Cor</span><input type="color" value={draft.cor || '#60765a'} onChange={event => setDraft({ ...draft, cor: event.target.value })} /></label><label><span>Projeto pai</span><select value={draft.parent_id || ''} onChange={event => setDraft({ ...draft, parent_id: event.target.value })}><option value="">Nenhum</option>{projects.map(item => <option key={String(item.id)} value={item.id}>{item.nome}</option>)}</select></label></div><footer><span /><div><button type="button" className={styles.secondaryButton} onClick={onClose}>Cancelar</button><button className={styles.primaryButton}>Criar projeto</button></div></footer></form></div>
}
