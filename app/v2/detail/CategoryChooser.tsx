'use client'

import { useState } from 'react'
import { Icon } from '../../ds'
import { ColorField } from './ColorField'
import { eventCategoryColors, type EventCategory } from '../../../lib/v2/event-categories'
import { OptionList } from './Pickers'
import styles from './CategoryChooser.module.css'

/** Conteúdo do seletor de categoria: escolher uma existente ou criar uma nova com cor. */
export function CategoryChooser({ categories, value, onSelect, onCreate, onManage }: {
  categories: EventCategory[]
  value: string
  onSelect: (category: EventCategory | null) => void
  onCreate: (category: EventCategory) => void
  /** Abre a janela para renomear, mudar a cor e excluir categorias. */
  onManage?: () => void
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(eventCategoryColors()[0])
  const create = () => {
    const nome = name.trim()
    if (!nome) return
    onCreate({ nome, cor: color })
  }
  return (
    <div className={styles.box}>
      <OptionList
        options={[{ value: '', label: 'Sem categoria', icon: 'block' }, ...categories.map(item => ({ value: item.nome, label: item.nome, color: item.cor }))]}
        value={value}
        onSelect={next => onSelect(categories.find(item => item.nome === next) || null)}
      />
      <div className={styles.create}>
        <span className={styles.label}>Nova categoria</span>
        <div className={styles.row}>
          <input
            className={styles.input}
            value={name}
            placeholder="Nome"
            enterKeyHint="done"
            onChange={event => setName(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); create() } }}
          />
          <button type="button" className={styles.add} disabled={!name.trim()} onClick={create} aria-label="Criar categoria"><Icon name="add" size={18} /></button>
        </div>
        <ColorField value={color} onChange={setColor} />
      </div>
      {onManage ? <button type="button" className={styles.manage} onClick={onManage}><Icon name="settings" size={16} filled={false} />Gerenciar categorias</button> : null}
    </div>
  )
}
