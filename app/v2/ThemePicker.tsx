'use client'

import type { CSSProperties } from 'react'
import { Icon } from '../ds'
import styles from './ThemePicker.module.css'
import { THEMES, normalizeMode, normalizeTheme, type ThemeId, type ThemeMode } from './theme'

const MODES: { id: ThemeMode; label: string }[] = [
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Escuro' },
  { id: 'system', label: 'Sistema' },
]

type Props = {
  mode: unknown
  theme: unknown
  onMode: (mode: ThemeMode) => void
  onTheme: (theme: ThemeId) => void
}

/* Aparência no estilo do Todoist: modo (Claro/Escuro/Sistema) + temas com prévia. */
export function ThemePicker({ mode, theme, onMode, onTheme }: Props) {
  const currentMode = normalizeMode(mode)
  const currentTheme = normalizeTheme(theme)
  return (
    <div className={styles.picker}>
      <div className={styles.modes} role="radiogroup" aria-label="Aparência">
        {MODES.map(item => (
          <button key={item.id} type="button" role="radio" aria-checked={currentMode === item.id} data-active={currentMode === item.id || undefined} onClick={() => onMode(item.id)}>{item.label}</button>
        ))}
      </div>
      <h4 className={styles.heading}>Seus temas</h4>
      <div className={styles.grid} role="radiogroup" aria-label="Tema">
        {THEMES.map(item => {
          const selected = currentTheme === item.id
          return (
            <button key={item.id} type="button" role="radio" aria-checked={selected} data-active={selected || undefined} className={styles.card} style={{ '--tc': item.color, '--tcd': item.dark } as CSSProperties} onClick={() => onTheme(item.id)}>
              <span className={styles.side}><i /><i /><i /><i /></span>
              <span className={styles.main}>
                <span className={styles.name}>{item.label}{selected ? <Icon name="check" size={16} filled={false} /> : null}</span>
                <span className={styles.line}><b className={styles.circle} /><span><i /><i /></span></span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
