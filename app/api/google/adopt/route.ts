import { NextRequest, NextResponse } from 'next/server'
import { GOOGLE_COOKIE, hasAllowedGoogleCookie, openTokens } from '../../../../lib/google'

/**
 * App Android: o login do Google acontece no navegador do sistema, que tem os próprios cookies.
 * Aqui o app (WebView) recebe as credenciais seladas pelo servidor e as grava como cookie dele.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { g?: unknown } | null
  const sealed = typeof body?.g === 'string' ? body.g : ''
  if (!sealed || !openTokens(sealed) || !hasAllowedGoogleCookie(sealed)) return NextResponse.json({ ok: false }, { status: 400, headers: { 'cache-control': 'no-store' } })
  const response = NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } })
  response.cookies.set(GOOGLE_COOKIE, sealed, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 })
  return response
}
