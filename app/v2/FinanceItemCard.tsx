'use client'

import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MaiIcon } from './MaiIcons'
import s from './FinanceItemCard.module.css'

/** Casca do cartão de item financeiro: conteúdo à esquerda, configurações à direita. */
export type Crumb = { label: string; onClick?: () => void }

export function FinanceItemShell({ crumb, onClose, content, side, footer }: { crumb: string | Crumb[]; onClose: () => void; content: ReactNode; side: ReactNode; footer: ReactNode }) {
  const layer = <div className={s.layer} onMouseDown={onClose}>
    <div className={s.panel} role="dialog" aria-label={typeof crumb === 'string' ? crumb : crumb.map(item => item.label).join(' › ')} onMouseDown={event => event.stopPropagation()}>
      <header className={s.header}><span className={s.crumb}>{typeof crumb === 'string' ? crumb : crumb.map((item, index) => <span key={index}>{index ? ' › ' : ''}{item.onClick ? <button type="button" className={s.crumbLink} onClick={item.onClick}>{item.label}</button> : item.label}</span>)}</span><button type="button" className={s.close} onClick={onClose} aria-label="Fechar"><MaiIcon name="close" size={18} /></button></header>
      <div className={s.body}><div className={s.content}>{content}</div><aside className={s.side}>{side}</aside></div>
      <footer className={s.footer}>{footer}</footer>
    </div>
  </div>
  // Portal: o centro é o da tela inteira, não o da área ao lado do menu lateral.
  return typeof document === 'undefined' ? layer : createPortal(layer, document.body)
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
export function MonthStepper({ value, onChange, clearable = false, empty = 'Sem fim', long = false, onLabel }: { value: string; onChange: (value: string) => void; clearable?: boolean; empty?: string; long?: boolean; onLabel?: () => void }) {
  const label = value ? (long ? new Date(`${value}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(' de ', ' de ') : new Date(`${value}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '')) : empty
  const move = (amount: number) => {
    const base = value || new Date().toISOString().slice(0, 7)
    const date = new Date(`${base}-15T12:00:00`)
    date.setMonth(date.getMonth() + amount)
    onChange(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
  }
  return <div className={s.stepper}><button type="button" onClick={() => move(-1)} aria-label="Mês anterior">‹</button>{onLabel ? <button type="button" className={s.stepperLabel} onClick={onLabel} title="Voltar ao mês atual">{label}</button> : <span>{label}</span>}<button type="button" onClick={() => move(1)} aria-label="Próximo mês">›</button>{clearable && value ? <button type="button" onClick={() => onChange('')} aria-label="Limpar">×</button> : null}</div>
}

/** Linha da lateral com setas (mês anterior/próximo); clicar no nome volta para o atual. */
export function SideStepper({ icon, color, label, value, onPrev, onNext, onReset }: { icon?: string; color?: string; label: string; value: string; onPrev: () => void; onNext: () => void; onReset: () => void }) {
  return <div className={s.row}><div className={s.rowStatic}>
    {icon ? <i className={s.rowIcon} style={{ color }}><MaiIcon name={icon} size={18} /></i> : null}
    <small>{label}</small>
    <button type="button" className={s.rowStepperValue} onClick={onReset} title="Voltar ao atual">{value}</button>
    <div className={s.rowArrows}>
      <button type="button" onClick={onPrev} aria-label="Anterior"><MaiIcon name="chevron_left" size={22} /></button>
      <button type="button" onClick={onNext} aria-label="Próximo"><MaiIcon name="chevron_right" size={22} /></button>
    </div>
  </div></div>
}

/** Escolha entre poucas opções, em botões do app. */
export function Chips({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <div className={s.chips}>{options.map(option => <button key={option.value} type="button" data-active={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>
}
