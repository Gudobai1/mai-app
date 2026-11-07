'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { IonIcon as Icon } from '../../ds'
import { eventCategories, removeEventCategory, updateEventCategory, withEventCategory, EVENT_CATEGORY_COLORS } from '../../../lib/v2/event-categories'
import type { MaiState } from '../../../lib/v2/state'
import { askConfirm } from '../shell/ConfirmDialog'
import { ColorField } from './ColorField'
import styles from './CategoryManager.module.css'

type Commit = (change: (current: MaiState) => MaiState) => void

/** Linha editável: o nome só é gravado ao sair do campo ou apertar Enter. */
function Row({ name, color, count, commit }: { name: string; color: string; count: number; commit: Commit }) {
  const [text, setText] = useState(name)
  useEffect(() => setText(name), [name])
  const save = () => {
    const next = text.trim()
    if (!next || next === name) { setText(name); return }
    commit(current => updateEventCategory(current, name, { nome: next, cor: color }))
  }
  return (
    <div className={styles.row}>
      <ColorField compact className={styles.color} value={color} label="Cor" onChange={cor => commit(current => updateEventCategory(current, name, { nome: name, cor }))} />
      <input className={styles.name} value={text} aria-label={`Nome da categoria ${name}`} onChange={event => setText(event.target.value)} onBlur={save} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } if (event.key === 'Escape') { event.stopPropagation(); setText(name); event.currentTarget.blur() } }} />
      <small className={styles.count}>{count ? `${count} ${count === 1 ? 'compromisso' : 'compromissos'}` : 'sem uso'}</small>
      <button type="button" className={styles.remove} aria-label={`Excluir ${name}`} title="Excluir" onClick={async () => {
        const ok = await askConfirm({ title: `Excluir “${name}”?`, message: count ? `Os ${count} compromissos dessa categoria ficam sem categoria.` : undefined, confirmLabel: 'Excluir', tone: 'danger' })
        if (ok) commit(current => removeEventCategory(current, name))
      }}><Icon name="delete" size={18} filled={false} /></button>
    </div>
  )
}

/** Janela para renomear, trocar a cor, criar e excluir categorias de compromisso. */
export function CategoryManager({ state, commit, onClose }: { state: MaiState; commit: Commit; onClose: () => void }) {
  const categories = eventCategories(state)
  const [name, setName] = useState('')
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  const countOf = (category: string) => (Array.isArray(state.events) ? state.events : []).filter(event => String((event as Record<string, unknown>).categoria || '').toLowerCase() === category.toLowerCase()).length
  const create = () => {
    const nome = name.trim()
    if (!nome) return
    const used = new Set(categories.map(item => item.cor))
    const cor = EVENT_CATEGORY_COLORS.find(item => !used.has(item)) || EVENT_CATEGORY_COLORS[categories.length % EVENT_CATEGORY_COLORS.length]
    commit(current => withEventCategory(current, { nome, cor }))
    setName('')
  }
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className={styles.layer} onMouseDown={onClose}>
      <section className={styles.panel} role="dialog" aria-modal="true" aria-label="Categorias de compromisso" onMouseDown={event => event.stopPropagation()}>
        <header className={styles.head}>
          <strong>Categorias</strong>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar"><Icon name="close" size={20} filled={false} /></button>
        </header>
        <div className={styles.list}>
          {categories.length ? categories.map(item => <Row key={item.nome} name={item.nome} color={item.cor} count={countOf(item.nome)} commit={commit} />) : <p className={styles.empty}>Nenhuma categoria ainda.</p>}
        </div>
        <div className={styles.add}>
          <Icon name="add" size={18} filled={false} />
          <input value={name} placeholder="Nova categoria" enterKeyHint="done" onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); create() } }} />
          <button type="button" disabled={!name.trim()} onClick={create}>Adicionar</button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
