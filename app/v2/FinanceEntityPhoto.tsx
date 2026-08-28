'use client'

import { useState } from 'react'
import { cacheDriveAsset, driveAssetUrl, drivePreviewUrl, trashDriveAsset, uploadDataUrlToDrive } from './DriveAsset'

type PickerProps = {
  value?: string
  fallbackIcon: string
  color?: string
  onChange: (value: string) => void
}

type IconProps = {
  photo?: string
  icon: string
  color?: string
  className?: string
}

async function compactPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Selecione uma imagem.')
  if (file.size > 15 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 15 MB.')

  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
    reader.readAsDataURL(file)
  })

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Não foi possível abrir a imagem.'))
    img.src = source
  })

  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Não foi possível preparar a imagem.')

  const side = Math.min(image.naturalWidth, image.naturalHeight)
  const sx = Math.max(0, (image.naturalWidth - side) / 2)
  const sy = Math.max(0, (image.naturalHeight - side) / 2)
  context.drawImage(image, sx, sy, side, side, 0, 0, size, size)

  return canvas.toDataURL('image/webp', 0.82)
}

export function FinanceEntityIcon({ photo, icon, color, className = '' }: IconProps) {
  const photoUrl = driveAssetUrl(photo)
  return <span className={`mai-finance-entity-icon ${photoUrl ? 'has-photo' : ''} ${className}`.trim()} style={{ '--finance-entity-color': color || 'var(--v3-accent)' } as React.CSSProperties}>
    {photoUrl ? <img src={photoUrl} alt="" /> : <span className="material-symbols-rounded">{icon}</span>}
  </span>
}

export function FinanceEntityPhotoPicker({ value, fallbackIcon, color, onChange }: PickerProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function choose(file?: File) {
    if (!file) return
    setBusy(true)
    setError('')
    const previous = value || ''
    try {
      const dataUrl = await compactPhoto(file)
      const safeBase = file.name.replace(/\.[^.]+$/, '').trim().replace(/[^a-zA-Z0-9À-ÿ _-]+/g, '').slice(0, 70) || 'icone'
      const asset = await uploadDataUrlToDrive(dataUrl, `MAI - ${safeBase}.webp`, 'image/webp')
      const reference = drivePreviewUrl(asset.idDrive)
      await cacheDriveAsset(reference).catch(() => null)
      onChange(reference)
      if (previous) void trashDriveAsset(previous)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível usar esta imagem.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    const previous = value || ''
    onChange('')
    if (previous) await trashDriveAsset(previous)
  }

  return <div className="mai-finance-photo-picker">
    <FinanceEntityIcon photo={value} icon={fallbackIcon} color={color} className="mai-finance-photo-preview" />
    <div className="mai-finance-photo-copy">
      <strong>Foto do ícone</strong>
      <small>Opcional. O arquivo fica no Google Drive, a referência no MAI e uma cópia visual fica no cache do aplicativo para abrir instantaneamente.</small>
      <div className="mai-finance-photo-actions">
        <label data-busy={busy}>
          <span className="material-symbols-rounded">photo_camera</span>
          {busy ? 'Enviando…' : value ? 'Trocar foto' : 'Escolher foto'}
          <input type="file" accept="image/*" disabled={busy} onChange={event => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            void choose(file)
          }} />
        </label>
        {value ? <button type="button" disabled={busy} onClick={() => void remove()}>Remover</button> : null}
      </div>
      {error ? <small className="mai-finance-photo-error">{error}</small> : null}
    </div>
  </div>
}
