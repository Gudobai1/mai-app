'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './MoneyInput.module.css'

const MAX_CENTS = 99_999_999_999

const format = (cents: number) => (cents > 0 ? (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')

/**
 * Valor em reais no estilo caixa eletrônico: os dígitos entram pela direita e
 * sobem para a esquerda (1 → 0,01 · 12 → 0,12 · 125 → 1,25). Começa vazio, sem zero.
 * Ao focar, mostra um teclado numérico para clicar com o mouse.
 */
export function MoneyInput({ value, onChange, className, placeholder = '0,00', autoFocus, max, keypad = true, ariaLabel }: { value: number; onChange: (value: number) => void; className?: string; placeholder?: string; autoFocus?: boolean; max?: number; keypad?: boolean; ariaLabel?: string }) {
  const [focused, setFocused] = useState(false)
  const [coarse, setCoarse] = useState(false)
  const ref = useRef<HTMLInputElement | null>(null)
  const cents = Math.max(0, Math.round((Number(value) || 0) * 100))

  useEffect(() => { try { setCoarse(window.matchMedia('(pointer: coarse)').matches) } catch {} }, [])

  const commit = (next: number) => {
    let clamped = Math.min(MAX_CENTS, Math.max(0, Math.round(next)))
    if (max !== undefined) clamped = Math.min(clamped, Math.round(max * 100))
    onChange(clamped / 100)
  }
  const press = (key: string) => {
    if (key === 'back') commit(Math.floor(cents / 10))
    else if (key === 'clear') commit(0)
    else commit(cents * (key === '00' ? 100 : 10) + (key === '00' ? 0 : Number(key)))
    ref.current?.focus()
  }

  return (
    <div className={styles.wrap}>
      <input
        ref={ref}
        className={className}
        value={format(cents)}
        placeholder={placeholder}
        inputMode={coarse && keypad ? 'none' : 'numeric'}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={event => commit(Number(event.target.value.replace(/\D/g, '') || 0))}
      />
      {keypad && focused ? (
        <div className={styles.pad} role="group" aria-label="Teclado numérico" onMouseDown={event => event.preventDefault()}>
          {['7', '8', '9', '4', '5', '6', '1', '2', '3', '00', '0', 'back'].map(key => (
            <button key={key} type="button" className={styles.key} data-kind={key === 'back' ? 'back' : undefined} aria-label={key === 'back' ? 'Apagar' : key} onClick={() => press(key)} onPointerDown={event => event.preventDefault()}>{key === 'back' ? '⌫' : key}</button>
          ))}
          <button type="button" className={`${styles.key} ${styles.clear}`} onClick={() => press('clear')} onPointerDown={event => event.preventDefault()}>Limpar</button>
        </div>
      ) : null}
    </div>
  )
}
