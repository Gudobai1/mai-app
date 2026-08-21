'use client'

import type { ComponentProps } from 'react'
import { ContextDrawerV2 as GeneralContextDrawer } from './ContextDrawerV3'
import { TaskContextDrawerV5 } from './TaskContextDrawerV5'

type Props = ComponentProps<typeof GeneralContextDrawer>

export function ContextDrawerV2(props: Props) {
  if (props.item?.kind === 'task') return <TaskContextDrawerV5 {...props} />
  return <GeneralContextDrawer {...props} />
}
