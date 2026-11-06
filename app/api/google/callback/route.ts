import { NextRequest, NextResponse } from 'next/server'
import { allowedGoogleEmail, GOOGLE_COOKIE, googleConfig, sealTokens } from '../../../../lib/google'
import { getSupabasePublicConfig } from '../../../../lib/supabase/config'

function loginRedirect(appUrl: string, error: string) {
  return NextResponse.redirect(`${appUrl}/login?error=${encodeURIComponent(error)}`)
}

/** No app Android o login roda no navegador do sistema: esta página devolve o usuário ao app por link profundo (bukid://). */
function backToApp(link: string) {
  const safe = link.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bukid</title></head><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#fafafa;color:#202020;text-align:center"><div><p style="font-size:18px;font-weight:600;margin:0 0 6px">Voltando ao Bukid…</p><p style="margin:0 0 18px;color:#666;font-size:14px">Se o app não abrir sozinho, toque no botão.</p><a href="${safe}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#DE4C4A;color:#fff;text-decoration:none;font-weight:600">Abrir o Bukid</a></div><script>location.replace(${JSON.stringify(link)})</script></body></html>`
  const response = new NextResponse(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
  response.cookies.delete('mai_google_oauth_state')
  response.cookies.delete('mai_google_oauth_mode')
  response.cookies.delete('mai_google_oauth_native')
  return response
}

export async function GET(request: NextRequest) {
  const { clientId, clientSecret, appUrl } = googleConfig()
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const expected = request.cookies.get('mai_google_oauth_state')?.value
  const mode = request.cookies.get('mai_google_oauth_mode')?.value === 'login' ? 'login' : 'connect'
  const native = request.cookies.get('mai_google_oauth_native')?.value === '1'
  const fail = (error: string) => native ? backToApp(`bukid://auth?error=${encodeURIComponent(error)}`) : loginRedirect(appUrl, error)
  if (!code || !state || !expected || state !== expected) {
    return fail('invalid_state')
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
    return fail('google_token_error')
  }

  const userInfoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${data.access_token}` },
    cache: 'no-store',
  })
  const googleUser = await userInfoResponse.json().catch(() => null)
  const email = String(googleUser?.email || '').trim().toLowerCase()
  if (!userInfoResponse.ok || googleUser?.email_verified !== true || email !== allowedGoogleEmail()) {
    const response = fail('unauthorized_google_account')
    response.cookies.set(GOOGLE_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 })
    response.cookies.delete('mai_google_oauth_state')
    response.cookies.delete('mai_google_oauth_mode')
    return response
  }

  let target = `${appUrl}/?google=connected`
  if (mode === 'login') {
    const supabase = getSupabasePublicConfig()
    if (!supabase) return fail('supabase_not_configured')
    const bridgeResponse = await fetch(`${supabase.url}/functions/v1/google-login-bridge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ google_access_token: data.access_token }),
      cache: 'no-store',
    })
    const bridge = await bridgeResponse.json().catch(() => null)
    if (!bridgeResponse.ok || !bridge?.token_hash) return fail('supabase_session_error')
    target = `${appUrl}/auth/google-complete?token_hash=${encodeURIComponent(bridge.token_hash)}`
  }

  const sealed = sealTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + Number(data.expires_in || 3600) * 1000,
    email,
  })
  if (native) {
    const tokenHash = mode === 'login' ? new URL(target).searchParams.get('token_hash') || '' : ''
    return backToApp(`bukid://auth?mode=${mode}${tokenHash ? `&token_hash=${encodeURIComponent(tokenHash)}` : ''}&g=${encodeURIComponent(sealed)}`)
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
