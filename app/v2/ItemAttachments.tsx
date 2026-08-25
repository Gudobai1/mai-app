'use client'

import { useState } from 'react'

type Row = Record<string, any>
type Rpc = (method: string, args?: unknown[]) => Promise<any>

type Props = {
  attachments: Row[]
  onChange: (attachments: Row[]) => void
  googleRpc?: Rpc
  compact?: boolean
}

const defaultGoogleRpc: Rpc = async (method, args = []) => {
  const response = await fetch('/api/google/rpc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, args }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Não foi possível acessar o Google Drive')
  return data.payload
}

function fileName(file: Row) {
  return String(file.nome || file.name || 'Arquivo')
}

function fileUrl(file: Row) {
  return String(file.url || file.webViewLink || '')
}

function driveId(file: Row) {
  return String(file.idDrive || file.driveId || file.id || '')
}

export function ItemAttachments({ attachments, onChange, googleRpc = defaultGoogleRpc, compact = false }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function upload(file?: File) {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const response = await googleRpc('salvarAnexoDrive', [dataUrl, file.name, file.type])
      const item = response?.item || response || {}
      onChange([
        ...attachments,
        {
          idDrive: item.id,
          nome: item.name || item.nome || file.name,
          tipo: item.tipo || item.mimeType || file.type,
          tamanho: Number(item.tamanho || item.size || file.size || 0),
          url: item.url || item.webViewLink || '',
          criado_em: new Date().toISOString(),
        },
      ])
    } catch (uploadError: any) {
      setError(uploadError?.message || 'Não foi possível adicionar o arquivo.')
    } finally {
      setUploading(false)
    }
  }

  async function remove(index: number) {
    const file = attachments[index]
    const id = driveId(file)
    const next = attachments.filter((_, position) => position !== index)
    onChange(next)
    if (id) await googleRpc('trashDriveItem', [id]).catch(() => null)
  }

  return <section className={`mai-item-attachments${compact ? ' mai-item-attachments-compact' : ''}`}>
    <header>
      <div>
        <span className="material-symbols-rounded" aria-hidden="true">attach_file</span>
        <strong>Arquivos</strong>
        {attachments.length ? <small>{attachments.length}</small> : null}
      </div>
      <label className="mai-item-attachments-add" data-busy={uploading || undefined}>
        <span className="material-symbols-rounded" aria-hidden="true">attach_file_add</span>
        <span>{uploading ? 'Enviando…' : 'Adicionar'}</span>
        <input hidden type="file" disabled={uploading} onChange={event => { void upload(event.target.files?.[0]); event.currentTarget.value = '' }} />
      </label>
    </header>

    {attachments.length ? <div className="mai-item-attachments-list">
      {attachments.map((file, index) => {
        const url = fileUrl(file)
        return <article key={`${driveId(file) || fileName(file)}-${index}`}>
          <span className="material-symbols-rounded mai-item-attachments-file-icon" aria-hidden="true">description</span>
          {url ? <a href={url} target="_blank" rel="noreferrer" title={fileName(file)}>{fileName(file)}</a> : <span title={fileName(file)}>{fileName(file)}</span>}
          <button type="button" aria-label={`Remover ${fileName(file)}`} title="Remover arquivo" onClick={() => void remove(index)}><span className="material-symbols-rounded">close</span></button>
        </article>
      })}
    </div> : <small className="mai-item-attachments-empty">Nenhum arquivo anexado.</small>}

    {error ? <p className="mai-item-attachments-error">{error}</p> : null}
  </section>
}
