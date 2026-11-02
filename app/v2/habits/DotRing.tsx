const COUNT = 14
const R = 16.5

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

/** Círculo de pontos na borda; os pontos preenchidos indicam o progresso e o centro mostra a quantidade. */
export function DotRing({ pct, value, unit, label, fail, empty, today }: Props) {
  const filled = empty ? 0 : fail ? COUNT : Math.max(1, Math.round((Math.max(0, Math.min(100, pct)) / 100) * COUNT))
  const color = fail ? 'var(--ds-danger)' : 'var(--hc)'
  const shortUnit = String(unit || '').trim().slice(0, 4)
  const amount = String(value ?? '')
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
      {Array.from({ length: COUNT }, (_, index) => {
        const angle = (index / COUNT) * Math.PI * 2 - Math.PI / 2
        return <circle key={index} cx={20 + R * Math.cos(angle)} cy={20 + R * Math.sin(angle)} r={2.1} fill={index < filled ? color : (today ? 'var(--ds-muted)' : 'var(--ds-line-strong)')} />
      })}
      {empty ? null : fail ? (
        <path d="M15.5 15.5 L24.5 24.5 M24.5 15.5 L15.5 24.5" stroke="var(--ds-danger)" strokeWidth={2} strokeLinecap="round" />
      ) : label ? (
        <text x="20" y="20" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={700} fill="var(--ds-text)">{label}</text>
      ) : shortUnit ? (
        <>
          <text x="20" y="16.5" textAnchor="middle" dominantBaseline="central" fontSize={amount.length > 3 ? 10 : 13.5} fontWeight={700} fill="var(--ds-text)">{amount}</text>
          <text x="20" y="26" textAnchor="middle" dominantBaseline="central" fontSize={8.5} fontWeight={600} fill="var(--ds-muted)">{shortUnit}</text>
        </>
      ) : (
        <text x="20" y="20" textAnchor="middle" dominantBaseline="central" fontSize={amount.length > 3 ? 11 : 15} fontWeight={700} fill="var(--ds-text)">{amount}</text>
      )}
    </svg>
  )
}
