'use client'

import React, { useEffect, useRef, useState } from 'react'
import styles from './section-adder.module.css'

/**
 * Adicionar seção / categoria no lugar exato (padrão Todoist).
 * Fica entre duas seções (lista, horizontal) ou entre colunas (quadro, vertical).
 * Ao passar o mouse, mostra uma linha na cor de destaque com o rótulo; ao clicar abre o campo de nome no mesmo lugar.
 * Único componente para tarefas/projetos, metas e qualquer módulo com seções ou categorias.
 */
export function SectionAdder({ orientation = 'horizontal', label = 'Adicionar seção', placeholder = 'Nomear esta seção', submitLabel, onAdd }: {
  orientation?: 'horizontal' | 'vertical'
  label?: string
  placeholder?: string
  submitLabel?: string
  onAdd: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement | null>(null)
  useEffect(() => { if (open) input.current?.focus() }, [open])
  const close = () => { setOpen(false); setValue('') }
  const submit = () => { const name = value.trim(); if (!name) return; onAdd(name); close() }
  if (open) {
    return (
      <div className={styles.form} data-orientation={orientation} data-section-adder="open">
        <input ref={input} className={styles.input} value={value} placeholder={placeholder} aria-label={placeholder} onChange={event => setValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); submit() } if (event.key === 'Escape') close() }} />
        <div className={styles.actions}>
          <button type="button" className={styles.btn} data-primary onClick={submit} disabled={!value.trim()}>{submitLabel || label}</button>
          <button type="button" className={styles.btn} onClick={close}>Cancelar</button>
        </div>
      </div>
    )
  }
  return (
    <div className={styles.slot} data-orientation={orientation} data-section-adder="closed">
      <button type="button" className={styles.hit} onClick={() => setOpen(true)} aria-label={label}>
        <span className={styles.line} aria-hidden="true" />
        <span className={styles.label}>{label}</span>
      </button>
    </div>
  )
}
