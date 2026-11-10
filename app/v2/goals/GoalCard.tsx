'use client'

import type { CSSProperties, HTMLAttributes } from 'react'
import { Icon } from '../../ds'
import styles from './GoalCard.module.css'

export type GoalCardProps = {
  title: string
  /** Prazo em texto curto e sua cor semântica. */
  due: string
  tone: 'none' | 'done' | 'late' | 'today' | 'future'
  /** "2 de 5" — linha de baixo, depois do prazo. */
  /** Detalhe à direita, embaixo da porcentagem: "R$ 400 de R$ 1.000", "3 de 5 passos"… */
  amount?: string
  pct: number
  done: boolean
  paused?: boolean
  /** Cor da meta (círculo). */
  color: string
  ariaLabel: string
  onToggle: () => void
  onOpen: () => void
  rootProps?: HTMLAttributes<HTMLDivElement>
}

/**
 * Cartão de meta — único para todo o app (Metas, Hoje).
 * Círculo de 18px na cor da meta (só o check por dentro) à esquerda · título na cor do texto com prazo embaixo · à direita a porcentagem e, embaixo, o detalhe do tipo (valor, passos, quantidade).
 * Ver docs/PADROES.md ("Cartão de meta"). Não criar outra versão.
 */
export function GoalCard({ title, due, tone, amount, pct, done, paused, color, ariaLabel, onToggle, onOpen, rootProps }: GoalCardProps) {
  return (
    <div role="listitem" className={styles.card} data-done={done || undefined} data-paused={paused || undefined} style={{ '--gc': color } as CSSProperties} {...rootProps}>
      <button type="button" role="checkbox" aria-checked={done} className={styles.circle} aria-label={ariaLabel} onClick={onToggle}>
        <span className={styles.ring}>
        {done ? <Icon name="check" size={13} weight={600} filled={false} /> : null}
        </span>
      </button>
      <button type="button" className={styles.body} onClick={onOpen}>
        <span className={styles.title}>{title}</span>
        <span className={styles.sub}>
          <span className={styles.due} data-tone={tone}>{due}</span>
          {paused ? <span>· Pausada</span> : null}
        </span>
      </button>
      <span className={styles.right}>
        <span className={styles.pct} aria-label={`${pct}%`}>{pct}%</span>
        {amount ? <span className={styles.amount}>{amount}</span> : null}
      </span>
    </div>
  )
}
