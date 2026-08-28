'use client'

import { useEffect } from 'react'
import { GlobalFilePreviewBridge } from './v2/GlobalFilePreviewBridge'
import { ItemDateTone } from './v2/ItemDateTone'
import { ModuleListSorter } from './v2/ModuleListSorter'

export function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(registration => registration.update()).catch(() => null)
  }, [])
  return <><ItemDateTone/><ModuleListSorter/><GlobalFilePreviewBridge/></>
}
