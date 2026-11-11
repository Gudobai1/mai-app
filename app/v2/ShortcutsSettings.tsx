'use client'

import { useEffect, useState } from 'react'
import { Icon } from '../ds'
import { DEFAULT_SHORTCUTS, FIXED_SHORTCUTS, SHORTCUT_ACTIONS, normalizeShortcuts, shortcutLabel, type ShortcutId, type Shortcuts } from '../../lib/v2/shortcuts'
import styles from './ShortcutsSettings.module.css'

type Props = { value: unknown; onChange: (next: Shortcuts) => void }

/** Configurações → Atalhos: clique na tecla e aperte a nova. Uma tecla por ação; repetida é recusada. */
export function ShortcutsSettings({ value, onChange }: Props) {
  const config = normalizeShortcuts(value)
  const [recording, setRecording] = useState<ShortcutId | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!recording) return
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') { setRecording(null); setMessage(''); return }
      if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) { setMessage('Use uma tecla simples (letra, número ou sinal), sem Ctrl/Alt.'); return }
      const key = event.key.toLowerCase()
      const clash = SHORTCUT_ACTIONS.find(action => action.id !== recording && config[action.id] === key)
      if (clash) { setMessage(`"${key.toUpperCase()}" já é usada em "${clash.label}".`); return }
      onChange(normalizeShortcuts({ ...config, [recording]: key }))
      setRecording(null)
      setMessage('')
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, value])

  const changed = JSON.stringify(config) !== JSON.stringify(DEFAULT_SHORTCUTS)

  return (
    <div className={styles.wrap}>
      {SHORTCUT_ACTIONS.map(action => (
        <div key={action.id} className={styles.row}>
          <span className={styles.text}><strong>{action.label}</strong><small>{action.hint}</small></span>
          <button type="button" className={styles.key} data-recording={recording === action.id || undefined} onClick={() => { setMessage(''); setRecording(recording === action.id ? null : action.id) }} aria-label={`Tecla de ${action.label}`}>
            {recording === action.id ? 'Aperte a tecla…' : config[action.id] ? <kbd>{shortcutLabel(config[action.id])}</kbd> : 'Sem atalho'}
          </button>
          {config[action.id] ? <button type="button" className={styles.clear} onClick={() => onChange(normalizeShortcuts({ ...config, [action.id]: '' }))} aria-label="Remover atalho" title="Remover atalho"><Icon name="close" size={16} filled={false} /></button> : <span className={styles.clearSpace} />}
        </div>
      ))}
      {message ? <p className={styles.message} role="alert">{message}</p> : null}
      {changed ? <button type="button" className={styles.reset} onClick={() => { setMessage(''); onChange({ ...DEFAULT_SHORTCUTS }) }}>Voltar aos padrões</button> : null}
      <div className={styles.fixed}>
        <h4>Sempre ativos</h4>
        {FIXED_SHORTCUTS.map(item => <div key={item.keys} className={styles.fixedRow}><span>{item.label}</span><kbd>{item.keys}</kbd></div>)}
      </div>
    </div>
  )
}
