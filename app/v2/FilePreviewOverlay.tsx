'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

type Row = Record<string, any>

function fileName(file: Row) {
  return String(file.name || file.nome || file.title || 'Arquivo')
}

function sourceUrl(file: Row) {
  return String(file.webViewLink || file.url || file.webContentLink || '')
}

function fileId(file: Row) {
  const direct = String(file.idDrive || file.driveId || file.id || '')
  if (direct) return direct
  const url = sourceUrl(file)
  const match = url.match(/\/d\/([^/?#]+)/) || url.match(/[?&]id=([^&#]+)/)
  return match?.[1] || ''
}

function mimeType(file: Row) {
  return String(file.mimeType || file.tipo || file.type || '').toLowerCase()
}

function internalPreviewUrl(file: Row) {
  const id = fileId(file)
  if (!id) return ''
  const mime = mimeType(file)
  const browserNative = mime.startsWith('image/') || mime.startsWith('audio/') || mime.startsWith('video/') || mime.startsWith('text/') || mime === 'application/pdf'
  const googleNative = mime.startsWith('application/vnd.google-apps.') && mime !== 'application/vnd.google-apps.folder'
  if (browserNative || googleNative) return `/api/google/drive/preview?id=${encodeURIComponent(id)}`
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`
}

export function drivePreviewUrl(file: Row) {
  return internalPreviewUrl(file) || String(file.previewUrl || sourceUrl(file))
}

export function FilePreviewOverlay({ file, onClose }: { file: Row | null; onClose: () => void }) {
  useEffect(() => {
    if (!file) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [file, onClose])

  if (!file || typeof document === 'undefined') return null
  const preview = drivePreviewUrl(file)
  const external = sourceUrl(file)
  const name = fileName(file)
  const mime = mimeType(file)

  return createPortal(<div className="mai-file-preview-layer" role="dialog" aria-modal="true" aria-label={`Visualizar ${name}`} onMouseDown={onClose}>
    <section className="mai-file-preview" onMouseDown={event => event.stopPropagation()}>
      <header>
        <div>
          <span className="material-symbols-rounded" aria-hidden="true">preview</span>
          <span><strong title={name}>{name}</strong><small>{mime || 'Arquivo do Google Drive'}</small></span>
        </div>
        <div className="mai-file-preview-actions">
          {external ? <a href={external} target="_blank" rel="noreferrer" title="Editar ou abrir no Google" data-mai-preview-external="true"><span className="material-symbols-rounded">open_in_new</span><span>Abrir no Google</span></a> : null}
          <button type="button" onClick={onClose} aria-label="Fechar visualização" title="Fechar"><span className="material-symbols-rounded">close</span></button>
        </div>
      </header>
      <div className="mai-file-preview-body">
        {preview ? <iframe src={preview} title={name} allow="autoplay; fullscreen" /> : <div className="mai-file-preview-unavailable"><span className="material-symbols-rounded">visibility_off</span><strong>Visualização indisponível</strong><p>Este arquivo não possui uma referência válida no Google Drive.</p></div>}
      </div>
    </section>
  </div>, document.body)
}
