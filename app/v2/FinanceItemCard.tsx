'use client'

import type { ReactNode } from 'react'
import { MaiIcon } from './MaiIcons'
import s from './FinanceItemCard.module.css'

/** Casca do cartão de item financeiro: conteúdo à esquerda, configurações à direita. */
export function FinanceItemShell({ crumb, onClose, content, side, footer }: { crumb: string; onClose: () => void; content: ReactNode; side: ReactNode; footer: ReactNode }) {
  return <div className={s.layer} onMouseDown={onClose}>
    <div className={s.panel} role="dialog" aria-label={crumb} onMouseDown={event => event.stopPropagation()}>
      <header className={s.header}><span className={s.crumb}>{crumb}</span><button type="button" className={s.close} onClick={onClose} aria-label="Fechar"><MaiIcon name="close" size={18} /></button></header>
      <div className={s.body}><div className={s.content}>{content}</div><aside className={s.side}>{side}</aside></div>
      <footer className={s.footer}>{footer}</footer>
    </div>
  </div>
}

type RowProps = { id: string; icon?: string; label: string; summary: string; color?: string; leading?: ReactNode; open: string; setOpen: (id: string) => void; children?: ReactNode }

/** Linha da lateral: rótulo pequeno sobre o valor; ao clicar abre o editor logo abaixo. */
export function SideRow({ id, icon, color, label, summary, open, setOpen, children }: RowProps) {
  const active = open === id
  return <div className={s.row} data-open={active || undefined}>
    <button type="button" className={s.rowButton} onClick={() => setOpen(active ? '' : id)}>{icon ? <i className={s.rowIcon} style={{ color }}><MaiIcon name={icon} size={18} /></i> : null}<small>{label}</small><span>{summary || 'Não selecionado'}</span></button>
    {active ? <div className={s.rowEditor}>{children}</div> : null}
  </div>
}

/** Linha da lateral com controle direto (campo, seleção, cor). */
export function SideField({ label, icon, color, children }: { label: string; icon?: string; color?: string; children: ReactNode }) {
  return <div className={s.row}><label className={s.field}>{icon ? <i className={s.rowIcon} style={{ color }}><MaiIcon name={icon} size={18} /></i> : null}<small>{label}</small>{children}</label></div>
}

/** Escolha de mês no padrão do app (sem o seletor do navegador). */
export function MonthStepper({ value, onChange, clearable = false, empty = 'Sem fim' }: { value: string; onChange: (value: string) => void; clearable?: boolean; empty?: string }) {
  const label = value ? new Date(`${value}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '') : empty
  const move = (amount: number) => {
    const base = value || new Date().toISOString().slice(0, 7)
    const date = new Date(`${base}-15T12:00:00`)
    date.setMonth(date.getMonth() + amount)
    onChange(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
  }
  return <div className={s.stepper}><button type="button" onClick={() => move(-1)} aria-label="Mês anterior">‹</button><span>{label}</span><button type="button" onClick={() => move(1)} aria-label="Próximo mês">›</button>{clearable && value ? <button type="button" onClick={() => onChange('')} aria-label="Limpar">×</button> : null}</div>
}

/** Escolha entre poucas opções, em botões do app. */
export function Chips({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <div className={s.chips}>{options.map(option => <button key={option.value} type="button" data-active={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>
}
