'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './MoneyInput.module.css'

const MAX_CENTS = 99_999_999_999

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '00', '0', 'back']

/**
 * Valor em reais no estilo caixa eletrônico: os dígitos entram pela direita e
 * sobem para a esquerda (1 → 0,01 · 12 → 0,12 · 125 → 1,25). Começa em branco.
 * Mostra o valor grande e o teclado numérico, e também aceita o teclado do computador.
 */
export function MoneyPad({ value, onChange, max, active = true, onEnter }: { value: number; onChange: (value: number) => void; max?: number; active?: boolean; onEnter?: () => void }) {
  const cents = Math.max(0, Math.round((Number(value) || 0) * 100))
  const limit = max !== undefined ? Math.min(MAX_CENTS, Math.round(max * 100)) : MAX_CENTS
  const commit = (next: number) => onChange(Math.min(limit, Math.max(0, Math.round(next))) / 100)
  const press = (key: string) => {
    if (key === 'back') commit(Math.floor(cents / 10))
    else if (key === 'clear') commit(0)
    else if (key === '00') commit(cents * 100)
    else commit(cents * 10 + Number(key))
  }

  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (/^\d$/.test(event.key)) { event.preventDefault(); press(event.key) }
      else if (event.key === 'Backspace') { event.preventDefault(); press('back') }
      else if (event.key === 'Delete') { event.preventDefault(); press('clear') }
      else if (event.key === 'Enter' && onEnter) { event.preventDefault(); onEnter() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className={styles.padWrap}>
      <div className={styles.display} data-empty={cents === 0 || undefined} aria-live="polite">
        <span className={styles.currency}>R$</span>
        <span className={styles.amount}>{brl(cents)}</span>
      </div>
      <div className={styles.pad} role="group" aria-label="Teclado numérico">
        {KEYS.map(key => (
          <button key={key} type="button" className={styles.key} data-kind={key === 'back' ? 'back' : undefined} aria-label={key === 'back' ? 'Apagar' : key} onClick={() => press(key)}>{key === 'back' ? '⌫' : key}</button>
        ))}
      </div>
      <button type="button" className={styles.clear} onClick={() => press('clear')}>Limpar</button>
    </div>
  )
}

/**
 * Campo de valor: mostra o valor e, ao clicar, abre uma janela no meio da tela
 * com o teclado numérico. Use `autoOpen` para abrir assim que o campo aparece.
 */
export function MoneyInput({ value, onChange, className, placeholder = '0,00', autoOpen, autoFocus, max, title = 'Valor', ariaLabel }: { value: number; onChange: (value: number) => void; className?: string; placeholder?: string; autoOpen?: boolean; autoFocus?: boolean; max?: number; title?: string; ariaLabel?: string; keypad?: boolean }) {
  const [open, setOpen] = useState(Boolean(autoOpen || autoFocus))
  const [draft, setDraft] = useState(value)
  const cents = Math.max(0, Math.round((Number(value) || 0) * 100))

  const show = () => { setDraft(value); setOpen(true) }
  const confirm = () => { onChange(draft); setOpen(false) }
  const cancel = () => setOpen(false)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); cancel() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  return (
    <>
      <button type="button" className={`${styles.trigger} ${className || ''}`} data-money="" data-empty={cents === 0 || undefined} aria-label={ariaLabel || title} onClick={show}>
        {cents > 0 ? brl(cents) : placeholder}
      </button>
      {open && typeof document !== 'undefined' ? createPortal(
        <div className={styles.layer} role="dialog" aria-modal="true" aria-label={title} onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) cancel() }} onPointerDown={event => event.stopPropagation()} onContextMenu={event => event.preventDefault()}>
          <div className={styles.card}>
            <strong className={styles.heading}>{title}</strong>
            <MoneyPad value={draft} onChange={setDraft} max={max} onEnter={confirm} />
            <div className={styles.actions}>
              <button type="button" className={styles.ghost} onClick={cancel}>Cancelar</button>
              <button type="button" className={styles.primary} onClick={confirm}>Confirmar</button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  )
}
