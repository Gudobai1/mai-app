'use client'

import { ReactNode } from 'react'
import { Disclosure, Icon } from './ui'
import styles from './options.module.css'

/**
 * Painel de ajustes dos módulos (único): cabeçalho com "Redefinir", grupos com título e linhas
 * (seleção segmentada, lista de escolha, interruptor). Ver docs/PADROES.md ("Ajustes dos módulos").
 */
export function OptionsPanel({ title, hint, onReset, onClose, children, className }: { title: string; hint?: string; onReset?: () => void; onClose?: () => void; children: ReactNode; className?: string }) {
  return (
    <div className={`${styles.panel} ${className || ''}`} role="dialog" aria-label={`Ajustes de ${title}`}>
      <header className={styles.head}>
        <span className={styles.headTitle}><strong>{title}</strong>{hint ? <small>{hint}</small> : null}</span>
        {onReset ? <button type="button" className={styles.reset} onClick={onReset}>Redefinir</button> : null}
        {onClose ? <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar"><Icon name="close" size={18} filled={false} /></button> : null}
      </header>
      <div className={styles.body}>{children}</div>
    </div>
  )
}

/** `order` coloca o grupo na ordem Ver → Mostrar → Filtrar → Ordenar → Avançado. */
export function OptionsGroup({ title, order = 5, children }: { title: string; order?: number; children: ReactNode }) {
  return <section className={styles.group} style={{ order }}><h4>{title}</h4><div className={styles.rows}>{children}</div></section>
}

export function OptionsSegment({ value, onChange, items, label }: { value: string; onChange: (value: string) => void; items: { value: string; label: string; icon?: string }[]; label?: string }) {
  const many = items.length > 3 || items.some(item => item.label.length > 13)
  return (
    <div className={styles.segmentRow}>
      {label ? <span className={styles.rowLabel}>{label}</span> : null}
      <div className={styles.segment} data-many={many || undefined} role="radiogroup" aria-label={label}>
        {items.map(item => (
          <button key={item.value} type="button" role="radio" aria-checked={value === item.value} data-active={value === item.value || undefined} onClick={() => onChange(item.value)}>
            {item.icon ? <Icon name={item.icon} size={16} filled={false} /> : null}{item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function OptionsSelect({ label, value, onChange, children, active }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode; active?: boolean }) {
  return (
    <label className={styles.selectRow} data-changed={active || undefined}>
      <span className={styles.rowLabel}>{label}</span>
      <select value={value} onChange={event => onChange(event.target.value)}>{children}</select>
      <Disclosure open={false} size={16} />
    </label>
  )
}

export function OptionsSwitch({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={styles.switchRow} onClick={() => onChange(!checked)}>
      <span className={styles.switchText}><span>{label}</span>{hint ? <small>{hint}</small> : null}</span>
      <i className={styles.track} data-on={checked || undefined} aria-hidden="true"><b /></i>
    </button>
  )
}

/** Interruptor com setas para mudar a ordem (ex.: seções de Hoje). */
export function OptionsSwitchMove({ label, checked, onChange, onUp, onDown }: { label: string; checked: boolean; onChange: (value: boolean) => void; onUp?: () => void; onDown?: () => void }) {
  return (
    <div className={styles.moveRow}>
      <div className={styles.moveSwitch}><OptionsSwitch label={label} checked={checked} onChange={onChange} /></div>
      <button type="button" className={styles.moveBtn} disabled={!onUp} onClick={onUp} aria-label={`Mover ${label} para cima`}><Icon name="arrow_upward" size={16} filled={false} /></button>
      <button type="button" className={styles.moveBtn} disabled={!onDown} onClick={onDown} aria-label={`Mover ${label} para baixo`}><Icon name="arrow_downward" size={16} filled={false} /></button>
    </div>
  )
}
