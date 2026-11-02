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
}

/** Anel: a borda é preenchida de acordo com a porcentagem e o centro mostra a quantidade. */
export function DotRing({ pct, value, unit, label, fail, empty, today }: Props) {
  const ratio = fail ? 1 : Math.max(0.04, Math.min(1, pct / 100))
  const color = fail ? 'var(--ds-danger)' : 'var(--hc)'
  const shortUnit = String(unit || '').trim().slice(0, 4)
  const amount = String(value ?? '')
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
      <circle cx="20" cy="20" r={R} fill="none" stroke={today && empty ? 'var(--ds-muted)' : 'var(--ds-line)'} strokeWidth={3} opacity={today && empty ? 0.6 : 1} />
      {!empty ? <circle cx="20" cy="20" r={R} fill="none" stroke={color} strokeWidth={3} strokeLinecap={ratio >= 1 ? 'butt' : 'round'} strokeDasharray={`${ratio * CIRC} ${CIRC}`} transform="rotate(-90 20 20)" /> : null}
      {empty ? null : fail ? (
        <path d="M15.5 15.5 L24.5 24.5 M24.5 15.5 L15.5 24.5" stroke="var(--ds-danger)" strokeWidth={2} strokeLinecap="round" />
      ) : label ? (
        <text x="20" y="20" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={700} fill="var(--ds-text)">{label}</text>
      ) : shortUnit ? (
        <>
          <text x="20" y="15.5" textAnchor="middle" dominantBaseline="central" fontSize={amount.length > 3 ? 8.5 : 11} fontWeight={700} fill="var(--ds-text)">{amount}</text>
          <text x="20" y="26.5" textAnchor="middle" dominantBaseline="central" fontSize={7.5} fontWeight={600} fill="var(--ds-muted)">{shortUnit}</text>
        </>
      ) : (
        <text x="20" y="20" textAnchor="middle" dominantBaseline="central" fontSize={amount.length > 3 ? 9 : 12} fontWeight={700} fill="var(--ds-text)">{amount}</text>
      )}
    </svg>
  )
}
