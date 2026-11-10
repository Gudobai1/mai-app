'use client'

import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { Icon } from '../../ds'
import { DotRing } from './DotRing'
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
  pct: number
  value?: number | string
  unit?: string
  /** Hábito sem métrica: o círculo mostra um check. */
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
 * Círculo à esquerda na cor do hábito · título (cor do texto) com a descrição embaixo · sequência à direita.
 * Ver docs/PADROES.md ("Cartão de hábito"). Não criar outra versão.
 */
export function HabitCard(props: HabitCardProps) {
  const { color, title, description, streak, level, pct, value, unit, plain, today, disabled, ariaLabel, onToggle, onOpen, onContextMenu, rootProps, trailing } = props
  return (
    <div role="listitem" className={styles.card} style={{ '--hc': color } as CSSProperties} {...rootProps}>
      <button
        type="button"
        className={styles.circle}
        data-level={level || undefined}
        style={{ ['--p' as string]: pct } as CSSProperties}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-pressed={level === 'full'}
        onClick={onToggle}
        onContextMenu={onContextMenu}
      >
        <DotRing pct={level === 'full' ? 100 : pct} value={value} unit={unit} plain={plain} fail={level === 'fail'} empty={!level} today={today} />
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
