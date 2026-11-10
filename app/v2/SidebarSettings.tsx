'use client'

import { useState } from 'react'
import { Icon } from '../ds'
import { SIDEBAR_ICON_CHOICES, SIDEBAR_ITEMS, normalizeSidebar, type SidebarConfig } from './shell/sidebar-config'
import styles from './SidebarSettings.module.css'

type Props = { value: unknown; legacyHideInbox: boolean; onChange: (next: SidebarConfig) => void }

/** Configurações → Barra lateral: ícones ligados/desligados e, por item, ícone próprio ou oculto. Um só lugar para isso (ver docs/PADROES.md). */
export function SidebarSettings({ value, legacyHideInbox, onChange }: Props) {
  const config = normalizeSidebar(value, legacyHideInbox)
  const [picking, setPicking] = useState<string | null>(null)
  const patch = (id: string, entry: { icon?: string; hidden?: boolean }) => {
    const items = { ...config.items }
    const next = { ...items[id], ...entry }
    if (!next.icon && !next.hidden) delete items[id]
    else items[id] = next
    onChange(normalizeSidebar({ ...config, items }, false))
  }
  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span><strong>Mostrar ícones</strong><small>Desligado, o menu mostra só os nomes.</small></span>
        <button type="button" role="switch" aria-checked={config.icons} aria-label="Mostrar ícones no menu" className={styles.switch} data-on={config.icons || undefined} onClick={() => onChange({ ...config, icons: !config.icons })}><i /></button>
      </div>
      {SIDEBAR_ITEMS.map(item => {
        const entry = config.items[item.id] || {}
        const icon = entry.icon || item.icon
        const hidden = Boolean(entry.hidden)
        return (
          <div key={item.id} className={styles.item} data-hidden={hidden || undefined}>
            <div className={styles.line}>
              <button type="button" className={styles.iconButton} disabled={!config.icons} aria-expanded={picking === item.id} aria-label={`Escolher ícone de ${item.label}`} onClick={() => setPicking(picking === item.id ? null : item.id)}>
                {config.icons ? <Icon name={icon} size={20} filled={false} /> : <Icon name="visibility_off" size={20} filled={false} />}
              </button>
              <span className={styles.name}>{item.label}</span>
              {entry.icon ? <button type="button" className={styles.link} onClick={() => patch(item.id, { icon: undefined })}>Padrão</button> : null}
              <button type="button" role="switch" aria-checked={!hidden} aria-label={`Mostrar ${item.label}`} className={styles.switch} data-on={!hidden || undefined} onClick={() => patch(item.id, { hidden: !hidden })}><i /></button>
            </div>
            {picking === item.id && config.icons ? (
              <div className={styles.grid} role="listbox" aria-label={`Ícones para ${item.label}`}>
                {SIDEBAR_ICON_CHOICES.map(name => (
                  <button key={name} type="button" role="option" aria-selected={icon === name} aria-label={name} data-active={icon === name || undefined} onClick={() => { patch(item.id, { icon: name === item.icon ? undefined : name }); setPicking(null) }}>
                    <Icon name={name} size={20} filled={false} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
