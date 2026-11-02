const COUNT = 14
const R = 16.5

/** Círculo de pontos na borda; os pontos preenchidos indicam o progresso. */
export function DotRing({ pct, label }: { pct: number; label?: string }) {
  const filled = Math.max(1, Math.round((Math.max(0, Math.min(100, pct)) / 100) * COUNT))
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
      {Array.from({ length: COUNT }, (_, index) => {
        const angle = (index / COUNT) * Math.PI * 2 - Math.PI / 2
        return <circle key={index} cx={20 + R * Math.cos(angle)} cy={20 + R * Math.sin(angle)} r={2.1} fill={index < filled ? 'var(--hc)' : 'var(--ds-line-strong)'} />
      })}
      <text x="20" y="20" textAnchor="middle" dominantBaseline="central" fontSize={label && label.length > 3 ? 8.5 : 10} fontWeight={700} fill="var(--ds-text)">{label ?? `${Math.round(pct)}%`}</text>
    </svg>
  )
}
