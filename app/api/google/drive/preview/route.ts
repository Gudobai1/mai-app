import { NextRequest, NextResponse } from 'next/server'
import { authorizedGoogle, GOOGLE_COOKIE, sealTokens } from '../../../../../lib/google'

const q = (value: unknown) => encodeURIComponent(String(value ?? ''))

const exportMime: Record<string, string> = {
  'application/vnd.google-apps.document': 'application/pdf',
  'application/vnd.google-apps.spreadsheet': 'application/pdf',
  'application/vnd.google-apps.presentation': 'application/pdf',
  'application/vnd.google-apps.drawing': 'application/pdf',
}

function safeName(value: unknown) {
  return String(value || 'arquivo').replace(/[\r\n"]/g, ' ').trim() || 'arquivo'
}

export async function GET(request: NextRequest) {
  try {
    const id = String(request.nextUrl.searchParams.get('id') || '').trim()
    const appAsset = request.nextUrl.searchParams.get('asset') === '1'
    if (!id) return NextResponse.json({ error: 'Arquivo não informado' }, { status: 400 })

    const g = await authorizedGoogle(request)
    const metaResponse = await g.fetch(`https://www.googleapis.com/drive/v3/files/${q(id)}?supportsAllDrives=true&fields=id,name,mimeType,size`)
    const meta = await metaResponse.json()
    if (!metaResponse.ok) return NextResponse.json({ error: meta.error?.message || 'Arquivo não encontrado' }, { status: metaResponse.status })
    if (meta.mimeType === 'application/vnd.google-apps.folder') return NextResponse.json({ error: 'Pastas não possuem visualização de arquivo' }, { status: 400 })

    const exported = exportMime[String(meta.mimeType || '')]
    const sourceUrl = exported
      ? `https://www.googleapis.com/drive/v3/files/${q(id)}/export?mimeType=${q(exported)}`
      : `https://www.googleapis.com/drive/v3/files/${q(id)}?alt=media&supportsAllDrives=true`

    const upstreamHeaders: Record<string, string> = {}
    const range = request.headers.get('range')
    if (range && !exported) upstreamHeaders.range = range

    const upstream = await g.fetch(sourceUrl, { headers: upstreamHeaders })
    if (!upstream.ok && upstream.status !== 206) {
      const text = await upstream.text().catch(() => '')
      return NextResponse.json({ error: text || 'Não foi possível visualizar este arquivo' }, { status: upstream.status || 500 })
    }

    const headers = new Headers()
    headers.set('content-type', exported || upstream.headers.get('content-type') || meta.mimeType || 'application/octet-stream')
    headers.set('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(safeName(meta.name))}`)
    headers.set('cache-control', appAsset ? 'private, max-age=31536000, immutable' : 'private, max-age=60')
    headers.set('accept-ranges', upstream.headers.get('accept-ranges') || 'bytes')
    const contentLength = upstream.headers.get('content-length')
    const contentRange = upstream.headers.get('content-range')
    if (contentLength) headers.set('content-length', contentLength)
    if (contentRange) headers.set('content-range', contentRange)

    const response = new NextResponse(upstream.body, { status: upstream.status, headers })
    response.cookies.set(GOOGLE_COOKIE, sealTokens(g.tokens), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 })
    return response
  } catch (error: any) {
    const status = error?.message === 'GOOGLE_NOT_CONNECTED' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Erro ao visualizar arquivo' }, { status })
  }
}
