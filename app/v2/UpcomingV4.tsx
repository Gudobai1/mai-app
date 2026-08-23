'use client'

import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'
import { UpcomingCompact } from './UpcomingCompact'

export function UpcomingV4({state,today,commit,inspect}:{state:MaiState;today:string;commit:(change:(current:MaiState)=>MaiState)=>void;inspect:(item:InspectableItem)=>void}){
  return <div className="mai-v4-upcoming-wrap"><UpcomingCompact state={state} today={today} inspect={inspect} commit={commit}/></div>
}
