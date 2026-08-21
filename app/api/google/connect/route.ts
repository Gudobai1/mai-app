import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { GOOGLE_SCOPES, googleConfig } from '../../../../lib/google'

export async function GET(request: NextRequest) {
  const { clientId, appUrl } = googleConfig()
  const state = crypto.randomBytes(24).toString('base64url')
  const mode = request.nextUrl.searchParams.get('mode') === 'login' ? 'login' : 'connect'
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/api/google/callback`,
    response_type: 'code',
    access_type: 'offline',
    prompt: mode === 'login' ? 'select_account consent' : 'consent',
    include_granted_scopes: 'true',
    scope: GOOGLE_SCOPES,
    state,
  }).toString()
  const response = NextResponse.redirect(url)
  response.cookies.set('mai_google_oauth_state', state, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600,
  })
  response.cookies.set('mai_google_oauth_mode', mode, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600,
  })
  return response
}
