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
export function SideRow({ id, label, summary, open, setOpen, children }: RowProps) {
  const active = open === id
  return <div className={s.row} data-open={active || undefined}>
    <button type="button" className={s.rowButton} onClick={() => setOpen(active ? '' : id)}><small>{label}</small><span>{summary || 'Não selecionado'}</span></button>
    {active ? <div className={s.rowEditor}>{children}</div> : null}
  </div>
}

/** Linha da lateral com controle direto (campo, seleção, cor). */
export function SideField({ label, children }: { label: string; children: ReactNode }) {
  return <div className={s.row}><label className={s.field}><small>{label}</small>{children}</label></div>
}
