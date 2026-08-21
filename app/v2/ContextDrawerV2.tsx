'use client'

import type { ComponentProps } from 'react'
import { ContextDrawerV2 as GeneralContextDrawer } from './ContextDrawerV3'
import { GeneralContextDrawerV4 } from './GeneralContextDrawerV4'
import { TaskContextDrawerV4 } from './TaskContextDrawerV4'

type Props = ComponentProps<typeof GeneralContextDrawer>

export function ContextDrawerV2(props: Props) {
  if (props.item?.kind === 'task') return <TaskContextDrawerV4 {...props} />
  return <GeneralContextDrawerV4 {...props} />
}
