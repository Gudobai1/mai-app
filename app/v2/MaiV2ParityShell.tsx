'use client'

import { useState } from 'react'
import { MaiV2App } from './MaiV2App'
import { TaskProjectParity } from './TaskProjectParity'

export function MaiV2ParityShell() {
  const [revision, setRevision] = useState(0)
  return <>
    <MaiV2App key={revision} />
    <TaskProjectParity onChanged={() => setRevision(value => value + 1)} />
    <style jsx global>{`
      button[style*="z-index: 8050"] { bottom: 132px !important; }
    `}</style>
  </>
}
