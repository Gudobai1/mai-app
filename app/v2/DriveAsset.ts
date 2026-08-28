'use client'

export type DriveAsset = {
  idDrive: string
  nome: string
  tipo: string
  tamanho: number
  url?: string
}

async function googleRpc(method: string, args: unknown[] = []) {
  const response = await fetch('/api/google/rpc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, args }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || 'Não foi possível acessar o Google Drive')
  return data?.payload
}

export function drivePreviewUrl(id: string) {
  return id ? `/api/google/drive/preview?id=${encodeURIComponent(id)}` : ''
}

export function driveIdFromAssetUrl(value: unknown) {
  const text = String(value || '')
  if (!text || text.startsWith('data:') || text.startsWith('blob:')) return ''
  try {
    const url = new URL(text, typeof window !== 'undefined' ? window.location.origin : 'https://mai.local')
    if (url.pathname === '/api/google/drive/preview') return String(url.searchParams.get('id') || '')
  } catch {}
  return ''
}

export async function uploadDataUrlToDrive(dataUrl: string, fileName: string, mime: string): Promise<DriveAsset> {
  const response = await googleRpc('salvarAnexoDrive', [dataUrl, fileName, mime])
  const item = response?.item || response || {}
  const idDrive = String(item.id || item.idDrive || '')
  if (!idDrive) throw new Error('O Google Drive não retornou o identificador do arquivo.')
  return {
    idDrive,
    nome: String(item.name || item.nome || fileName || 'arquivo'),
    tipo: String(item.tipo || item.mimeType || mime || 'application/octet-stream'),
    tamanho: Number(item.tamanho || item.size || 0),
    url: String(item.url || item.webViewLink || ''),
  }
}

export async function trashDriveAsset(value: unknown) {
  const id = driveIdFromAssetUrl(value)
  if (!id) return
  await googleRpc('trashDriveItem', [id]).catch(() => null)
}
