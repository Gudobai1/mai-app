import crypto from 'node:crypto'
import type { NextRequest } from 'next/server'

export const GOOGLE_COOKIE = 'mai_google_tokens'
export const DEFAULT_ALLOWED_GOOGLE_EMAIL = 'marcelljunior2@gmail.com'
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive',
].join(' ')

type GoogleTokens = {
  access_token?: string
  refresh_token: string
  expires_at?: number
  email?: string
}

type GoogleTokenError = {
  error?: string
  error_description?: string
}

export function allowedGoogleEmail() {
  return String(process.env.MAI_ALLOWED_GOOGLE_EMAIL || DEFAULT_ALLOWED_GOOGLE_EMAIL).trim().toLowerCase()
}

function key() {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || ''
  if (!raw) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY não configurada')
  return crypto.createHash('sha256').update(raw).digest()
}

export function sealTokens(value: GoogleTokens) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
}

export function openTokens(value?: string): GoogleTokens | null {
  if (!value) return null
  try {
    const bytes = Buffer.from(value, 'base64url')
    const iv = bytes.subarray(0, 12)
    const tag = bytes.subarray(12, 28)
    const encrypted = bytes.subarray(28)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv)
    decipher.setAuthTag(tag)
    return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'))
  } catch {
    return null
  }
}

export function hasAllowedGoogleCookie(cookieValue?: string) {
  const tokens = openTokens(cookieValue)
  return Boolean(tokens?.refresh_token && String(tokens.email || '').trim().toLowerCase() === allowedGoogleEmail())
}

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!clientId || !clientSecret || !appUrl) throw new Error('Configuração Google incompleta')
  return { clientId, clientSecret, appUrl: appUrl.replace(/\/$/, '') }
}

function googleHeaders(init: RequestInit, accessToken?: string) {
  return {
    ...Object.fromEntries(new Headers(init.headers).entries()),
    authorization: `Bearer ${accessToken || ''}`,
  }
}

async function refresh(tokens: GoogleTokens) {
  if (!tokens.refresh_token) throw new Error('GOOGLE_NOT_CONNECTED')
  const { clientId, clientSecret } = googleConfig()
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  })
  const data = await response.json().catch(() => null) as (GoogleTokenError & { access_token?: string; expires_in?: number }) | null
  if (!response.ok || !data?.access_token) {
    // invalid_grant é o retorno normal do Google quando o refresh token foi
    // revogado, expirou ou deixou de ser válido. Para o MAI isso significa
    // simplesmente que é necessário obter uma autorização nova.
    if (data?.error === 'invalid_grant') throw new Error('GOOGLE_NOT_CONNECTED')
    throw new Error(data?.error_description || data?.error || 'Não foi possível renovar a conexão Google')
  }
  return {
    ...tokens,
    access_token: data.access_token,
    expires_at: Date.now() + Number(data.expires_in || 3600) * 1000,
  } satisfies GoogleTokens
}

export async function authorizedGoogle(request: NextRequest) {
  let tokens = openTokens(request.cookies.get(GOOGLE_COOKIE)?.value)
  if (!tokens || !tokens.refresh_token || String(tokens.email || '').trim().toLowerCase() !== allowedGoogleEmail()) throw new Error('GOOGLE_NOT_CONNECTED')
  if (!tokens.access_token || !tokens.expires_at || tokens.expires_at < Date.now() + 60_000) {
    tokens = await refresh(tokens)
  }

  const authenticatedFetch = async (url: string, init: RequestInit = {}) => {
    let response = await fetch(url, {
      ...init,
      headers: googleHeaders(init, tokens?.access_token),
      cache: 'no-store',
    })

    // O Google também pode invalidar um access token antes do expires_at.
    // Nesse caso renovamos uma única vez e repetimos a chamada original.
    if (response.status === 401) {
      tokens = await refresh(tokens!)
      response = await fetch(url, {
        ...init,
        headers: googleHeaders(init, tokens.access_token),
        cache: 'no-store',
      })
    }
    return response
  }

  return {
    get tokens() { return tokens! },
    fetch: authenticatedFetch,
  }
}
