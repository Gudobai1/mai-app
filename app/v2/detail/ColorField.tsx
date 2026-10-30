'use client'

import { useRef, useState } from 'react'
import { Icon } from '../../ds'
import { PALETTE, colorName } from '../../../lib/v2/palette'
import { Floating, OptionList, type PickerOption } from './Pickers'
import styles from './ColorField.module.css'

const OPTIONS: PickerOption[] = PALETTE.map(item => ({ value: item.color, label: item.label, color: item.color }))

/* Seletor de cor no padrão do Todoist: ponto + nome, lista de 20 cores. */
export function ColorField({ value, onChange, className, label = 'Cor' }: { value: unknown; onChange: (color: string) => void; className?: string; label?: string }) {
  const anchor = useRef<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(false)
  const current = String(value || '')
  const known = OPTIONS.some(item => item.value.toLowerCase() === current.toLowerCase())
  const options = known || !current ? OPTIONS : [{ value: current, label: 'Personalizada', color: current }, ...OPTIONS]
  const selected = options.find(item => item.value.toLowerCase() === current.toLowerCase())?.value || ''
  return (
    <>
      <button ref={anchor} type="button" className={`${styles.trigger} ${className || ''}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(true)}>
        <span className={styles.dot} style={{ background: current || 'var(--ds-muted)' }} />
        <span className={styles.name}>{current ? colorName(current) : label}</span>
        <Icon name="expand_more" size={18} filled={false} />
      </button>
      {open ? (
        <Floating anchor={anchor} title={label} width={240} onClose={() => setOpen(false)}>
          <OptionList options={options} value={selected} onSelect={next => { onChange(next); setOpen(false) }} />
        </Floating>
      ) : null}
    </>
  )
}
