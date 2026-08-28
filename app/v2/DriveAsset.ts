'use client'

export type DriveAsset = {
  idDrive: string
  nome: string
  tipo: string
  tamanho: number
  url?: string
}

export const DRIVE_ASSET_CACHE = 'mai-assets-v1'

function reconnectGoogle() {
  if (typeof window === 'undefined') return
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`
  try { window.sessionStorage.setItem('mai-google-return-to', returnTo) } catch {}
  window.location.assign('/api/google/connect?mode=connect')
}

export async function googleDriveRpc(method: string, args: unknown[] = []) {
  const response = await fetch('/api/google/rpc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, args }),
  })
  const data = await response.json().catch(() => null)
  if (response.status === 401 || data?.error === 'GOOGLE_NOT_CONNECTED') {
    reconnectGoogle()
    throw new Error('Reconectando sua conta Google…')
  }
  if (!response.ok) throw new Error(data?.error || 'Não foi possível acessar o Google Drive')
  return data?.payload
}

export function drivePreviewUrl(id: string) {
  return id ? `/api/google/drive/preview?id=${encodeURIComponent(id)}&asset=1` : ''
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

export function driveAssetUrl(value: unknown) {
  const text = String(value || '')
  if (!text || text.startsWith('data:') || text.startsWith('blob:')) return text
  const id = driveIdFromAssetUrl(text)
  return id ? drivePreviewUrl(id) : text
}

export async function cacheDriveAsset(value: unknown) {
  if (typeof window === 'undefined' || !('caches' in window)) return
  const url = driveAssetUrl(value)
  if (!url || !url.includes('/api/google/drive/preview') || !url.includes('asset=1')) return
  const cache = await window.caches.open(DRIVE_ASSET_CACHE)
  if (await cache.match(url)) return
  const response = await fetch(url, { cache: 'no-store' })
  if (response.ok && response.status === 200) await cache.put(url, response.clone())
}

export async function removeDriveAssetCache(value: unknown) {
  if (typeof window === 'undefined' || !('caches' in window)) return
  const id = driveIdFromAssetUrl(value)
  if (!id) return
  const cache = await window.caches.open(DRIVE_ASSET_CACHE)
  await Promise.all([
    cache.delete(drivePreviewUrl(id)),
    cache.delete(`/api/google/drive/preview?id=${encodeURIComponent(id)}`),
  ])
}

export async function uploadDataUrlToDrive(dataUrl: string, fileName: string, mime: string): Promise<DriveAsset> {
  const response = await googleDriveRpc('salvarAnexoDrive', [dataUrl, fileName, mime])
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
  await removeDriveAssetCache(value).catch(() => null)
  await googleDriveRpc('trashDriveItem', [id]).catch(() => null)
}
