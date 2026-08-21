'use client'

import { useMemo } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { AppView, Row } from './app-types'
import type { InspectableItem } from './ContextDrawer'
import { MaiIcon } from './MaiIcons'
import styles from './unified.module.css'

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const cleanText = (value: unknown) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

type Props = {
  state: MaiState
  query: string
  setQuery: (value: string) => void
  onClose: () => void
  inspect: (item: InspectableItem) => void
  navigate: (view: AppView) => void
  openProject: (projectId: string) => void
}

export function SearchOverlay({ state, query, setQuery, onClose, inspect, openProject }: Props) {
  const projects = rows(state.projects)
  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR')
    if (!q) return []
    const matches = (...values: unknown[]) => values.map(cleanText).join(' ').toLocaleLowerCase('pt-BR').includes(q)
    return [
      ...state.tasks.filter(item => matches(item.titulo, item.descricao)).map(item => ({ kind: 'task', id: item.id, title: item.titulo, meta: String(item.data_vencimento || 'Sem data').slice(0, 10), raw: item as Row })),
      ...projects.filter(item => matches(item.nome)).map(item => ({ kind: 'project', id: String(item.id), title: String(item.nome), meta: 'Projeto', raw: item })),
      ...rows(state.events).filter(item => matches(item.titulo, item.descricao)).map(item => ({ kind: 'event', id: String(item.id), title: String(item.titulo || 'Compromisso'), meta: `${String(item.data_inicio || '').slice(0, 10)} · Em breve`, raw: item })),
      ...rows(state.habits).filter(item => matches(item.nome)).map(item => ({ kind: 'habit', id: String(item.id), title: String(item.nome), meta: 'Hábito', raw: item })),
      ...rows(state.goals).filter(item => matches(item.titulo, item.descricao)).map(item => ({ kind: 'goal', id: String(item.id), title: String(item.titulo || 'Meta'), meta: 'Meta', raw: item })),
      ...rows(state.notes).filter(item => matches(item.titulo, item.conteudo)).map(item => ({ kind: 'note', id: String(item.id), title: String(item.titulo || 'Nota'), meta: 'Nota', raw: item })),
      ...rows(state.finance.transactions).filter(item => matches(item.titulo, item.observacao, item.categoria)).map(item => ({ kind: 'finance', id: String(item.id), title: String(item.titulo || 'Lançamento'), meta: 'Finanças', raw: item })),
    ].slice(0, 60)
  }, [query, state, projects])

  function open(result: { kind: string; id: string; title: string; raw: Row }) {
    onClose(); setQuery('')
    if (result.kind === 'project') { openProject(result.id); return }
    inspect({ kind: result.kind as InspectableItem['kind'], sourceId: result.id, title: result.title, date: String(result.raw.data_vencimento || result.raw.data_inicio || result.raw.data || result.raw.prazo || '').slice(0, 10), raw: result.raw })
  }

  return <div className={styles.searchLayer} onMouseDown={onClose}><section onMouseDown={event => event.stopPropagation()}><header><MaiIcon name="search" /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar em todo o MAI" /><kbd>Esc</kbd></header><div>{results.map(result => <button key={`${result.kind}-${result.id}`} onClick={() => open(result)}><span><strong>{result.title}</strong><small>{result.meta}</small></span><b>↗</b></button>)}{query && !results.length ? <p>Nenhum resultado encontrado.</p> : !query ? <p>Digite para buscar.</p> : null}</div></section></div>
}
