'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

type Row = Record<string, any>

function fileName(file: Row) {
  return String(file.name || file.nome || file.title || 'Arquivo')
}

function fileId(file: Row) {
  const direct = String(file.idDrive || file.driveId || file.id || '')
  if (direct) return direct
  const url = String(file.webViewLink || file.url || file.webContentLink || '')
  const match = url.match(/\/d\/([^/?#]+)/) || url.match(/[?&]id=([^&#]+)/)
  return match?.[1] || ''
}

function mimeType(file: Row) {
  return String(file.mimeType || file.tipo || file.type || '').toLowerCase()
}

export function drivePreviewUrl(file: Row) {
  const id = fileId(file)
  if (!id) return String(file.previewUrl || file.url || file.webViewLink || '')
  const mime = mimeType(file)
  if (mime === 'application/vnd.google-apps.document') return `https://docs.google.com/document/d/${encodeURIComponent(id)}/preview`
  if (mime === 'application/vnd.google-apps.spreadsheet') return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/preview`
  if (mime === 'application/vnd.google-apps.presentation') return `https://docs.google.com/presentation/d/${encodeURIComponent(id)}/preview`
  if (mime === 'application/vnd.google-apps.drawing') return `https://docs.google.com/drawings/d/${encodeURIComponent(id)}/preview`
  if (mime === 'application/vnd.google-apps.form') return `https://docs.google.com/forms/d/${encodeURIComponent(id)}/viewform?embedded=true`
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`
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
  const external = String(file.webViewLink || file.url || file.webContentLink || '')

  return createPortal(<div className="mai-file-preview-layer" role="dialog" aria-modal="true" aria-label={`Visualizar ${fileName(file)}`} onMouseDown={onClose}>
    <section className="mai-file-preview" onMouseDown={event => event.stopPropagation()}>
      <header>
        <div>
          <span className="material-symbols-rounded" aria-hidden="true">description</span>
          <strong title={fileName(file)}>{fileName(file)}</strong>
        </div>
        <div>
          {external ? <a href={external} target="_blank" rel="noreferrer" title="Abrir no Google"><span className="material-symbols-rounded">open_in_new</span></a> : null}
          <button type="button" onClick={onClose} aria-label="Fechar visualização"><span className="material-symbols-rounded">close</span></button>
        </div>
      </header>
      <div className="mai-file-preview-body">
        {preview ? <iframe src={preview} title={fileName(file)} allow="autoplay; fullscreen" /> : <div className="mai-file-preview-unavailable"><span className="material-symbols-rounded">visibility_off</span><strong>Pré-visualização indisponível</strong><small>Este arquivo não possui uma referência compatível com o visualizador interno.</small>{external ? <a href={external} target="_blank" rel="noreferrer">Abrir no Google</a> : null}</div>}
      </div>
    </section>
  </div>, document.body)
}
