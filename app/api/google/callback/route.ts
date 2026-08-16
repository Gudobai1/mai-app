import { NextRequest, NextResponse } from 'next/server'
import { GOOGLE_COOKIE, googleConfig, sealTokens } from '../../../../lib/google'

export async function GET(request: NextRequest) {
  const { clientId, clientSecret, appUrl } = googleConfig()
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const expected = request.cookies.get('mai_google_oauth_state')?.value
  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(`${appUrl}/?google=invalid_state`)
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${appUrl}/api/google/callback`,
      grant_type: 'authorization_code',
    }),
    cache: 'no-store',
  })
  const data = await tokenResponse.json()
  if (!tokenResponse.ok || !data.refresh_token) {
    return NextResponse.redirect(`${appUrl}/?google=token_error`)
  }

  const response = NextResponse.redirect(`${appUrl}/?google=connected`)
  response.cookies.set(GOOGLE_COOKIE, sealTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + Number(data.expires_in || 3600) * 1000,
  }), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  response.cookies.delete('mai_google_oauth_state')
  return response
}
