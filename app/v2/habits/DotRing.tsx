import styles from './DotRing.module.css'

const R = 17
const CIRC = 2 * Math.PI * R

type Props = {
  /** Progresso de 0 a 100: define quantos pontos ficam preenchidos. */
  pct: number
  /** Quantidade registrada (em cima) e unidade (embaixo). */
  value?: number | string
  unit?: string
  /** Texto fixo no centro (ex.: número do dia no calendário). */
  label?: string
  /** Falha: pontos vermelhos e X no centro. */
  fail?: boolean
  /** Dia sem registro: só os pontos apagados. */
  empty?: boolean
  /** Destaca o dia de hoje. */
  today?: boolean
  /** Hábito sem métrica: no lugar do número aparece um check. */
  plain?: boolean
}

/** Anel: a borda é preenchida de acordo com a porcentagem e o centro mostra a quantidade. */
export function DotRing({ pct, value, unit, label, fail, empty, today, plain }: Props) {
  const ratio = fail ? 1 : Math.max(0.04, Math.min(1, pct / 100))
  const color = fail ? 'var(--ds-danger)' : 'var(--hc)'
  const shortUnit = String(unit || '').trim().slice(0, 4)
  const amount = String(value ?? '')
  const open = !fail && !label && ratio < 1 // ainda não concluído: mostra o check no hover
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
      <circle cx="20" cy="20" r={R} fill="none" stroke={today && empty ? 'var(--ds-muted)' : 'var(--ds-line)'} strokeWidth={3} opacity={today && empty ? 0.6 : 1} />
      {!empty ? <circle cx="20" cy="20" r={R} fill="none" stroke={color} strokeWidth={3} strokeLinecap={ratio >= 1 ? 'butt' : 'round'} strokeDasharray={`${ratio * CIRC} ${CIRC}`} transform="rotate(-90 20 20)" /> : null}
      {open ? <path className={styles.hoverCheck} d="M13.5 20.5 L18 25 L26.5 15" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /> : null}
      {empty ? null : fail ? (
        <path d="M15.5 15.5 L24.5 24.5 M24.5 15.5 L15.5 24.5" stroke="var(--ds-danger)" strokeWidth={2} strokeLinecap="round" />
      ) : label ? (
        <text x="20" y="20" textAnchor="middle" dominantBaseline="central" fontSize={9.5} fontWeight={700} fill="var(--ds-text)">{label}</text>
      ) : plain ? (
        <path d="M13.5 20.5 L18 25 L26.5 15 " fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      ) : shortUnit ? (
        <g className={open ? styles.dim : undefined}>
          <text x="20" y="16" textAnchor="middle" dominantBaseline="central" fontSize={amount.length > 3 ? 8.5 : 11} fontWeight={700} fill={color}>{amount}</text>
          <text x="20" y="26" textAnchor="middle" dominantBaseline="central" fontSize={7} fontWeight={600} fill={color} opacity={0.85}>{shortUnit}</text>
        </g>
      ) : (
        <text className={open ? styles.dim : undefined} x="20" y="20" textAnchor="middle" dominantBaseline="central" fontSize={amount.length > 3 ? 9 : 12} fontWeight={700} fill={color}>{amount}</text>
      )}
    </svg>
  )
}
