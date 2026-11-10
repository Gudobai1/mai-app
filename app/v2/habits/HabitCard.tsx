'use client'

import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { Icon } from '../../ds'
import styles from './HabitCard.module.css'

export type HabitCardProps = {
  /** Cor do hábito (círculo). */
  color: string
  title: string
  /** Linha de baixo: meta/valor do dia, descrição ou frequência. */
  description?: string
  /** Dias seguidos; aparece sempre à direita. */
  streak: number
  level: '' | 'full' | 'part' | 'fail'
  pct?: number
  value?: number | string
  unit?: string
  plain?: boolean
  today?: boolean
  /** Dia fora da frequência ou no futuro: círculo desativado. */
  disabled?: boolean
  ariaLabel: string
  onToggle: () => void
  onOpen: () => void
  onContextMenu?: (event: React.MouseEvent) => void
  rootProps?: HTMLAttributes<HTMLDivElement>
  /** Ação extra à direita do streak (ex.: edição rápida). */
  trailing?: ReactNode
}

/**
 * Cartão de hábito — único para todo o app (Hoje, Em breve, Hábitos).
 * Círculo (borda na cor do hábito, só o check por dentro, mesmo tamanho do check de tarefa) à esquerda · título (cor do texto) com a descrição embaixo · sequência à direita.
 * Ver docs/PADROES.md ("Cartão de hábito"). Não criar outra versão.
 */
export function HabitCard(props: HabitCardProps) {
  const { color, title, description, streak, level, disabled, ariaLabel, onToggle, onOpen, onContextMenu, rootProps, trailing } = props
  return (
    <div role="listitem" className={styles.card} style={{ '--hc': color } as CSSProperties} {...rootProps}>
      <button
        type="button"
        className={styles.circle}
        data-level={level || undefined}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-pressed={level === 'full'}
        onClick={onToggle}
        onContextMenu={onContextMenu}
      >
        <span className={styles.ring}>
          {level === 'full' || level === 'part' ? <Icon name="check" size={13} weight={600} filled={false} /> : level === 'fail' ? <Icon name="close" size={13} weight={600} filled={false} /> : null}
        </span>
      </button>
      <button type="button" className={styles.body} onClick={onOpen}>
        <span className={styles.title}>{title}</span>
        {description ? <span className={styles.desc}>{description}</span> : null}
      </button>
      <span className={styles.streak} data-on={streak > 0 || undefined} title={`Sequência de ${streak} ${streak === 1 ? 'dia' : 'dias'}`}>
        <Icon name="local_fire_department" size={16} filled={false} />{streak}
      </span>
      {trailing}
    </div>
  )
}
