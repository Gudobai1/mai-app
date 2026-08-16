import { createClient } from '@supabase/supabase-js'

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const secret = process.env.SUPABASE_SECRET_KEY
  if (!url || !publishable || !secret) return null
  return { url, publishable, secret }
}

async function userFromRequest(request: Request) {
  const e = env()
  if (!e) return { error: 'Supabase não configurado', status: 503 as const }
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { error: 'Não autenticado', status: 401 as const }
  const scoped = createClient(e.url, e.publishable, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data, error } = await scoped.auth.getUser(token)
  if (error || !data.user) return { error: 'Sessão inválida', status: 401 as const }
  return { user: data.user, e }
}

export async function GET(request: Request) {
  const auth = await userFromRequest(request)
  if (!('user' in auth)) return Response.json({ error: auth.error }, { status: auth.status })
  const admin = createClient(auth.e.url, auth.e.secret, { auth: { persistSession: false } })
  const { data, error } = await admin.from('mai_state').select('data,updated_at').eq('user_id', auth.user.id).maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ data: data?.data ?? null, updated_at: data?.updated_at ?? null })
}

export async function PUT(request: Request) {
  const auth = await userFromRequest(request)
  if (!('user' in auth)) return Response.json({ error: auth.error }, { status: auth.status })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.data !== 'object') return Response.json({ error: 'Payload inválido' }, { status: 400 })
  const admin = createClient(auth.e.url, auth.e.secret, { auth: { persistSession: false } })
  const { error } = await admin.from('mai_state').upsert({ user_id: auth.user.id, data: body.data, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
