'use client'

import type { ComponentProps } from 'react'
import { AttachmentPortal } from './AttachmentPortal'
import { ContextDrawerV2 as GeneralContextDrawer } from './ContextDrawerV3'
import { GeneralContextDrawerV4 } from './GeneralContextDrawerV4'
import { TaskContextDrawerV4 } from './TaskContextDrawerV4'

type Props = ComponentProps<typeof GeneralContextDrawer>

export function ContextDrawerV2(props: Props) {
  if (!props.item) return null
  const drawer = props.item.kind === 'task' ? <TaskContextDrawerV4 {...props} /> : <GeneralContextDrawerV4 {...props} />
  return <>{drawer}<AttachmentPortal item={props.item} state={props.state} commit={props.commit} googleRpc={props.googleRpc} /></>
}
