import { NextRequest, NextResponse } from 'next/server'
import { authorizedGoogle, GOOGLE_COOKIE, sealTokens } from '../../../../lib/google'

const cookieOptions = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge: 60 * 60 * 24 * 365 }

export async function GET(request: NextRequest) {
  try {
    const google = await authorizedGoogle(request)
    const response = NextResponse.json({ connected: true })
    response.cookies.set(GOOGLE_COOKIE, sealTokens(google.tokens), cookieOptions)
    return response
  } catch (error: any) {
    if (error?.message === 'GOOGLE_NOT_CONNECTED') {
      const response = NextResponse.json({ connected: false, reconnectRequired: true })
      response.cookies.set(GOOGLE_COOKIE, '', { ...cookieOptions, maxAge: 0 })
      return response
    }
    return NextResponse.json({ connected: false, error: error?.message || 'Erro ao validar conexão Google' }, { status: 500 })
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(GOOGLE_COOKIE, '', { ...cookieOptions, maxAge: 0 })
  return response
}
