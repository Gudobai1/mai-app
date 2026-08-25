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

export function drivePreviewUrl(file: Row) {
  const id = fileId(file)
  const url = sourceUrl(file)
  if (!id) return String(file.previewUrl || url)
  const encoded = encodeURIComponent(id)
  const mime = mimeType(file)
  if (mime === 'application/vnd.google-apps.document' || /docs\.google\.com\/document\//.test(url)) return `https://docs.google.com/document/d/${encoded}/preview`
  if (mime === 'application/vnd.google-apps.spreadsheet' || /docs\.google\.com\/spreadsheets\//.test(url)) return `https://docs.google.com/spreadsheets/d/${encoded}/preview`
  if (mime === 'application/vnd.google-apps.presentation' || /docs\.google\.com\/presentation\//.test(url)) return `https://docs.google.com/presentation/d/${encoded}/preview`
  if (mime === 'application/vnd.google-apps.drawing' || /docs\.google\.com\/drawings\//.test(url)) return `https://docs.google.com/drawings/d/${encoded}/preview`
  if (mime === 'application/vnd.google-apps.form' || /docs\.google\.com\/forms\//.test(url)) return `https://docs.google.com/forms/d/${encoded}/viewform?embedded=true`
  return `https://drive.google.com/file/d/${encoded}/preview`
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

  return createPortal(<div className="mai-file-preview-layer" role="dialog" aria-modal="true" aria-label={`Visualizar ${fileName(file)}`} onMouseDown={onClose}>
    <section className="mai-file-preview" onMouseDown={event => event.stopPropagation()}>
      <header>
        <div>
          <span className="material-symbols-rounded" aria-hidden="true">description</span>
          <strong title={fileName(file)}>{fileName(file)}</strong>
        </div>
        <div>
          {external ? <a href={external} target="_blank" rel="noreferrer" title="Abrir no Google" data-mai-preview-external="true"><span className="material-symbols-rounded">open_in_new</span></a> : null}
          <button type="button" onClick={onClose} aria-label="Fechar visualização"><span className="material-symbols-rounded">close</span></button>
        </div>
      </header>
      <div className="mai-file-preview-body">
        {preview ? <iframe src={preview} title={fileName(file)} allow="autoplay; fullscreen" /> : <div className="mai-file-preview-unavailable"><span className="material-symbols-rounded">visibility_off</span><strong>Pré-visualização indisponível</strong><small>Este arquivo não possui uma referência compatível com o visualizador interno.</small>{external ? <a href={external} target="_blank" rel="noreferrer" data-mai-preview-external="true">Abrir no Google</a> : null}</div>}
      </div>
    </section>
  </div>, document.body)
}
