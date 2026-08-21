'use client'

import { useEffect } from 'react'
import { ItemDateTone } from './v2/ItemDateTone'

export function PwaRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => null)
  }, [])
  return <ItemDateTone />
}
