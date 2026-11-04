import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { allowedGoogleEmail, GOOGLE_COOKIE, hasAllowedGoogleCookie } from './google'
import { getSupabasePublicConfig } from './supabase/config'

/** Mesma checagem de /api/state: cookie Google do dono + sessão Supabase do dono. */
export async function requireOwner(request: Request): Promise<{ ok: true } | { ok: false; error: string; status: 401 | 403 | 503 }> {
  const cookieStore = await cookies()
  if (!hasAllowedGoogleCookie(cookieStore.get(GOOGLE_COOKIE)?.value)) return { ok: false, error: 'Login Google obrigatório', status: 401 }
  const config = getSupabasePublicConfig()
  if (!config) return { ok: false, error: 'Supabase não configurado', status: 503 }
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, error: 'Não autenticado', status: 401 }
  const client = createClient(config.url, config.publishableKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) return { ok: false, error: 'Sessão inválida', status: 401 }
  if (String(data.user.email || '').trim().toLowerCase() !== allowedGoogleEmail()) return { ok: false, error: 'Conta não autorizada', status: 403 }
  return { ok: true }
}
