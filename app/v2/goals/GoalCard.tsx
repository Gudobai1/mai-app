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
  progress?: string
  pct: number
  done: boolean
  paused?: boolean
  /** Cor do marcador (prioridade). */
  color: string
  ariaLabel: string
  onToggle: () => void
  onOpen: () => void
  rootProps?: HTMLAttributes<HTMLDivElement>
}

/**
 * Cartão de meta — único para todo o app (Metas, Hoje).
 * Check quadrado de 18px (cor da prioridade) à esquerda · título com prazo e progresso embaixo · porcentagem em texto à direita.
 * Ver docs/PADROES.md ("Cartão de meta"). Não criar outra versão.
 */
export function GoalCard({ title, due, tone, progress, pct, done, paused, color, ariaLabel, onToggle, onOpen, rootProps }: GoalCardProps) {
  return (
    <div role="listitem" className={styles.card} data-done={done || undefined} data-paused={paused || undefined} style={{ '--gc': color } as CSSProperties} {...rootProps}>
      <button type="button" role="checkbox" aria-checked={done} className={styles.check} aria-label={ariaLabel} onClick={onToggle}>
        <Icon name="check" size={13} weight={600} filled={false} />
      </button>
      <button type="button" className={styles.body} onClick={onOpen}>
        <span className={styles.title}>{title}</span>
        <span className={styles.sub}>
          <span className={styles.due} data-tone={tone}>{due}</span>
          {paused ? <span>· Pausada</span> : null}
          {progress ? <span>· {progress}</span> : null}
        </span>
      </button>
      <span className={styles.pct} aria-label={`${pct}%`}>{pct}%</span>
    </div>
  )
}
