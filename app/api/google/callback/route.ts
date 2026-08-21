import { NextRequest, NextResponse } from 'next/server'
import { allowedGoogleEmail, GOOGLE_COOKIE, googleConfig, sealTokens } from '../../../../lib/google'
import { getSupabasePublicConfig } from '../../../../lib/supabase/config'

function loginRedirect(appUrl: string, error: string) {
  return NextResponse.redirect(`${appUrl}/login?error=${encodeURIComponent(error)}`)
}

export async function GET(request: NextRequest) {
  const { clientId, clientSecret, appUrl } = googleConfig()
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const expected = request.cookies.get('mai_google_oauth_state')?.value
  const mode = request.cookies.get('mai_google_oauth_mode')?.value === 'login' ? 'login' : 'connect'
  if (!code || !state || !expected || state !== expected) {
    return loginRedirect(appUrl, 'invalid_state')
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
  const data = await tokenResponse.json().catch(() => null)
  if (!tokenResponse.ok || !data?.access_token || !data?.refresh_token) {
    return loginRedirect(appUrl, 'google_token_error')
  }

  const userInfoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${data.access_token}` },
    cache: 'no-store',
  })
  const googleUser = await userInfoResponse.json().catch(() => null)
  const email = String(googleUser?.email || '').trim().toLowerCase()
  if (!userInfoResponse.ok || googleUser?.email_verified !== true || email !== allowedGoogleEmail()) {
    const response = loginRedirect(appUrl, 'unauthorized_google_account')
    response.cookies.set(GOOGLE_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 })
    response.cookies.delete('mai_google_oauth_state')
    response.cookies.delete('mai_google_oauth_mode')
    return response
  }

  let target = `${appUrl}/?google=connected`
  if (mode === 'login') {
    const supabase = getSupabasePublicConfig()
    if (!supabase) return loginRedirect(appUrl, 'supabase_not_configured')
    const bridgeResponse = await fetch(`${supabase.url}/functions/v1/google-login-bridge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ google_access_token: data.access_token }),
      cache: 'no-store',
    })
    const bridge = await bridgeResponse.json().catch(() => null)
    if (!bridgeResponse.ok || !bridge?.token_hash) return loginRedirect(appUrl, 'supabase_session_error')
    target = `${appUrl}/auth/google-complete?token_hash=${encodeURIComponent(bridge.token_hash)}`
  }

  const response = NextResponse.redirect(target)
  response.cookies.set(GOOGLE_COOKIE, sealTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + Number(data.expires_in || 3600) * 1000,
    email,
  }), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  response.cookies.delete('mai_google_oauth_state')
  response.cookies.delete('mai_google_oauth_mode')
  return response
}
