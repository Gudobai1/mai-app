'use client'

import { useState } from 'react'
import { UNIT_GROUPS, abbreviateUnit, isPresetUnit } from '../../../lib/v2/units'

const CUSTOM = '__custom__'

/** Escolha da unidade em abreviação, com muitas opções prontas e "Outra…" para digitar. */
export function UnitField({ value, onChange, className, ariaLabel = 'Unidade' }: { value: string; onChange: (unit: string) => void; className?: string; ariaLabel?: string }) {
  const current = abbreviateUnit(value)
  const [custom, setCustom] = useState(Boolean(current) && !isPresetUnit(current))
  const selected = custom ? CUSTOM : current
  return (
    <span style={{ display: 'flex', gap: 6, minWidth: 0, width: '100%' }}>
      <select className={className} aria-label={ariaLabel} value={selected} onChange={event => {
        if (event.target.value === CUSTOM) { setCustom(true); return }
        setCustom(false)
        onChange(event.target.value)
      }} style={{ flex: 1, minWidth: 0 }}>
        <option value="">Sem unidade</option>
        {UNIT_GROUPS.map(group => (
          <optgroup key={group.label} label={group.label}>
            {group.units.map(unit => <option key={unit.value} value={unit.value}>{unit.value} — {unit.name}</option>)}
          </optgroup>
        ))}
        <option value={CUSTOM}>Outra…</option>
      </select>
      {custom ? <input className={className} aria-label="Unidade personalizada" value={current} maxLength={6} placeholder="sigla" onChange={event => onChange(event.target.value)} style={{ width: 72, flex: 'none' }} autoFocus={!current} /> : null}
    </span>
  )
}
