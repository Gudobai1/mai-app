'use client'

import { useEffect } from 'react'

type Row = Record<string, any>

type Props = {
  file: Row | null
  onClose: () => void
}

const browserNative = (mime: string) => mime.startsWith('image/') || mime.startsWith('audio/') || mime.startsWith('video/') || mime.startsWith('text/') || mime === 'application/pdf'
const googleNative = (mime: string) => mime.startsWith('application/vnd.google-apps.') && mime !== 'application/vnd.google-apps.folder'

function fileId(file: Row) {
  return String(file.idDrive || file.driveId || file.id || '').trim()
}

function fileName(file: Row) {
  return String(file.nome || file.name || 'Arquivo')
}

function fileMime(file: Row) {
  return String(file.mimeType || file.tipo || '').trim()
}

function externalUrl(file: Row) {
  return String(file.webViewLink || file.url || '').trim()
}

function previewUrl(file: Row) {
  const id = fileId(file)
  const mime = fileMime(file)
  if (!id) return externalUrl(file)
  if (browserNative(mime) || googleNative(mime)) return `/api/google/drive/preview?id=${encodeURIComponent(id)}`
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`
}

export function FilePreview({ file, onClose }: Props) {
  useEffect(() => {
    if (!file) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [file, onClose])

  if (!file) return null
  const name = fileName(file)
  const mime = fileMime(file)
  const src = previewUrl(file)
  const external = externalUrl(file)

  return <div className="mai-file-preview-layer" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label={`Visualizar ${name}`}>
    <div className="mai-file-preview" onMouseDown={event => event.stopPropagation()}>
      <header>
        <div>
          <span className="material-symbols-rounded" aria-hidden="true">preview</span>
          <span><strong>{name}</strong><small>{mime || 'Arquivo do Google Drive'}</small></span>
        </div>
        <div className="mai-file-preview-actions">
          {external ? <a href={external} target="_blank" rel="noreferrer" title="Editar ou abrir no Google"><span className="material-symbols-rounded">open_in_new</span><span>Abrir no Google</span></a> : null}
          <button type="button" onClick={onClose} aria-label="Fechar visualização" title="Fechar"><span className="material-symbols-rounded">close</span></button>
        </div>
      </header>
      <div className="mai-file-preview-body">
        {src ? <iframe src={src} title={name} allow="autoplay; fullscreen" /> : <div className="mai-file-preview-unavailable"><span className="material-symbols-rounded">visibility_off</span><strong>Visualização indisponível</strong><p>Este arquivo não possui uma referência válida no Google Drive.</p></div>}
      </div>
    </div>
  </div>
}
