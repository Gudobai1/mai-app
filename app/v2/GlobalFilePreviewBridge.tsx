'use client'

import { useEffect, useState } from 'react'
import { FilePreviewOverlay } from './FilePreviewOverlay'

type Row = Record<string, any>

function isGoogleFileUrl(value: string) {
  try {
    const url = new URL(value, window.location.href)
    return ['drive.google.com', 'docs.google.com'].includes(url.hostname)
  } catch {
    return false
  }
}

export function GlobalFilePreviewBridge() {
  const [file, setFile] = useState<Row | null>(null)

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target as HTMLElement | null
      const anchor = target?.closest<HTMLAnchorElement>('a[href]')
      if (!anchor || anchor.dataset.maiPreviewExternal === 'true') return
      const scope = anchor.closest('.mai-notes-v4-attachments,.mai-item-attachments,.mai-task-v4-files,.mai-context-v3-files')
      if (!scope || !isGoogleFileUrl(anchor.href)) return
      event.preventDefault()
      event.stopPropagation()
      setFile({ nome: anchor.textContent?.trim() || anchor.title || 'Arquivo', url: anchor.href })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  return <FilePreviewOverlay file={file} onClose={() => setFile(null)} />
}
