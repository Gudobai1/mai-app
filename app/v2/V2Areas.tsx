'use client'

import type { MaiState } from '../../lib/v2/state'
import { AreaView as BaseAreaView } from './V2AreasBase'
import type { SecondaryView } from './V2AreasBase'
import { LegacyParityExtras } from './LegacyParityExtras'
import { HealthFullParity } from './HealthFullParity'
import { ModuleDetailParity } from './ModuleDetailParity'

export type { SecondaryView } from './V2AreasBase'

type Props = {
  view: SecondaryView
  state: MaiState
  today: string
  commit: (change: (current: MaiState) => MaiState) => void
  googleRpc: (method: string, args?: unknown[]) => Promise<any>
  createRequest?: string
}

export function AreaView(props: Props) {
  return <div style={{ position: 'relative', minHeight: '100%' }}>
    <BaseAreaView {...props} />
    <LegacyParityExtras {...props} />
    <ModuleDetailParity {...props} />
    {props.view === 'health' && <HealthFullParity state={props.state} today={props.today} commit={props.commit} />}
  </div>
}
