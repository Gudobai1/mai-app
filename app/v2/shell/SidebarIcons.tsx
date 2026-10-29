import type { CSSProperties, ReactNode } from 'react'

/*
 * Ícones do menu lateral — linha fina e cantos redondos, com cor por área
 * (referência: Todoist). Cada um herda a cor de `color` e usa um
 * preenchimento bem suave da mesma cor.
 */

const TINT = 'none'

type Spec = { color: string; node: (day: number) => ReactNode }

// Engrenagem desenhada por pontos, com 8 dentes.
function gearPath() {
  const teeth = 8
  const outer = 9
  const inner = 7.1
  const points: string[] = []
  for (let i = 0; i < teeth; i += 1) {
    const base = (i / teeth) * Math.PI * 2
    const step = (Math.PI * 2) / teeth
    const angles = [base - step * 0.2, base + step * 0.2, base + step * 0.3, base + step * 0.7]
    const radii = [outer, outer, inner, inner]
    angles.forEach((angle, index) => {
      points.push(`${(12 + Math.cos(angle) * radii[index]).toFixed(2)} ${(12 + Math.sin(angle) * radii[index]).toFixed(2)}`)
    })
  }
  return `M${points.join('L')}Z`
}

const GEAR = gearPath()

const SPECS: Record<string, Spec> = {
  search: {
    color: 'var(--ds-muted)',
    node: () => (<><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>),
  },
  today: {
    color: 'var(--ds-muted)',
    node: day => (
      <>
        <rect x="3.5" y="4" width="17" height="16.5" rx="3.5" fill={TINT} />
        <path d="M7 8.6h10" />
        <text x="12" y="17.2" textAnchor="middle" fontSize="8.6" fontWeight="400" fill="currentColor" stroke="none" style={{ fontFamily: 'inherit' }}>{day}</text>
      </>
    ),
  },
  upcoming: {
    color: 'var(--ds-muted)',
    node: () => (
      <>
        <rect x="3.5" y="4" width="17" height="16.5" rx="3.5" fill={TINT} />
        <path d="M7 8.6h10" />
        <g fill="currentColor" stroke="none">
          <circle cx="8.5" cy="12.6" r="1" /><circle cx="12" cy="12.6" r="1" /><circle cx="15.5" cy="12.6" r="1" />
          <circle cx="8.5" cy="16.4" r="1" /><circle cx="12" cy="16.4" r="1" /><circle cx="15.5" cy="16.4" r="1" />
        </g>
      </>
    ),
  },
  completed: {
    color: 'var(--ds-muted)',
    node: () => (<><circle cx="12" cy="12" r="8.5" fill={TINT} /><path d="M8.2 12.3l2.7 2.7 5-5.6" /></>),
  },
  finance: {
    color: 'var(--ds-muted)',
    node: () => (
      <>
        <rect x="3.5" y="6.5" width="17" height="12.5" rx="3.2" fill={TINT} />
        <path d="M3.8 9.8h12.4a2.2 2.2 0 0 0 2.2-2.2V6" />
        <circle cx="16.3" cy="13.6" r="1.1" fill="currentColor" stroke="none" />
      </>
    ),
  },
  habits: {
    color: 'var(--ds-muted)',
    node: () => (
      <>
        <circle cx="12" cy="12" r="3.8" fill={TINT} />
        <path d="M12 3.6v2M12 18.4v2M3.6 12h2M18.4 12h2M6.1 6.1l1.4 1.4M16.5 16.5l1.4 1.4M17.9 6.1l-1.4 1.4M7.5 16.5l-1.4 1.4" />
      </>
    ),
  },
  goals: {
    color: 'var(--ds-muted)',
    node: () => (
      <>
        <path d="M6 20.5V4.6" />
        <path d="M6 5.4c2.6-1.4 4.4 1.2 7 0 1.8-.9 3.2-.7 4.6-.2v7.6c-1.4-.5-2.8-.7-4.6.2-2.6 1.2-4.4-1.4-7 0" fill={TINT} />
      </>
    ),
  },
  notes: {
    color: 'var(--ds-muted)',
    node: () => (<><rect x="4" y="4" width="16" height="16" rx="3.2" /><path d="M8 9.2h8M8 12.4h8M8 15.6h5" /></>),
  },
  files: {
    color: 'var(--ds-muted)',
    node: () => (
      <>
        <rect x="3.5" y="8.5" width="12" height="12" rx="2.6" fill={TINT} />
        <path d="M8 5.6h8.9a2.6 2.6 0 0 1 2.6 2.6v8.9M12.4 3.5H18a2.5 2.5 0 0 1 2.5 2.5v5.6" />
      </>
    ),
  },
  settings: {
    color: 'var(--ds-muted)',
    node: () => (<><path d={GEAR} /><circle cx="12" cy="12" r="3" /></>),
  },
}

export function SidebarIcon({ name, size = 22, style }: { name: string; size?: number; style?: CSSProperties }) {
  const spec = SPECS[name]
  if (!spec) return null
  const day = new Date().getDate()
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ color: spec.color, flexShrink: 0, ...style }}
    >
      {spec.node(day)}
    </svg>
  )
}
