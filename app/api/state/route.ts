import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { allowedGoogleEmail, GOOGLE_COOKIE, hasAllowedGoogleCookie } from '../../../lib/google'
import { getSupabasePublicConfig } from '../../../lib/supabase/config'

async function scopedClient(request: Request) {
  const cookieStore = await cookies()
  if (!hasAllowedGoogleCookie(cookieStore.get(GOOGLE_COOKIE)?.value)) {
    return { error: 'Login Google obrigatório', status: 401 as const }
  }

  const config = getSupabasePublicConfig()
  if (!config) return { error: 'Supabase não configurado', status: 503 as const }
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return { error: 'Não autenticado', status: 401 as const }
  const client = createClient(config.url, config.publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) return { error: 'Sessão inválida', status: 401 as const }
  if (String(data.user.email || '').trim().toLowerCase() !== allowedGoogleEmail()) {
    return { error: 'Conta não autorizada', status: 403 as const }
  }
  return { client, user: data.user }
}

const headers = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET(request: Request) {
  const auth = await scopedClient(request)
  if (!('client' in auth) || !auth.client || !auth.user) return Response.json({ error: auth.error }, { status: auth.status, headers })
  const { data, error } = await auth.client
    .from('mai_state')
    .select('data,updated_at')
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 500, headers })
  let state = data?.data ?? null
  if (!state) {
    const legacy = await auth.client.from('tasks').select('*').eq('user_id', auth.user.id).order('sort_order', { ascending: true })
    if (!legacy.error && legacy.data?.length) state = {
      version: 1,
      tasks: legacy.data.map((row: any) => ({ id: row.legacy_id || row.id, titulo: row.title || '', descricao: row.description || '', data_vencimento: row.due_at || '', prioridade: Number(row.priority || 4), concluida: row.status === 'completed', criado_em: row.metadata?.criado_em || row.created_at, projeto_id: row.metadata?.projeto_id || 'entrada', anexos: Array.isArray(row.metadata?.anexos) ? row.metadata.anexos : [], subtarefas: Array.isArray(row.metadata?.subtarefas) ? row.metadata.subtarefas : [], notas: Array.isArray(row.metadata?.notas) ? row.metadata.notas : [], repeticao: row.recurrence_rule || '', secao: row.metadata?.secao || '', ocultar_agenda: row.metadata?.ocultar_agenda === true, ordem: Number(row.sort_order || 0) })),
      meta: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), recoveredFrom: 'tasks' },
    }
  }
  return Response.json({ data: state, updated_at: data?.updated_at ?? null }, { headers })
}

export async function PUT(request: Request) {
  const auth = await scopedClient(request)
  if (!('client' in auth) || !auth.client || !auth.user) return Response.json({ error: auth.error }, { status: auth.status, headers })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.data !== 'object' || Array.isArray(body.data)) {
    return Response.json({ error: 'Payload inválido' }, { status: 400, headers })
  }
  const serialized = JSON.stringify(body.data)
  if (serialized.length > 8_000_000) return Response.json({ error: 'Estado maior que o limite permitido' }, { status: 413, headers })
  const updatedAt = new Date().toISOString()
  const { error } = await auth.client.from('mai_state').upsert({
    user_id: auth.user.id,
    data: body.data,
    updated_at: updatedAt,
  }, { onConflict: 'user_id' })
  if (error) return Response.json({ error: error.message }, { status: 500, headers })
  return Response.json({ ok: true, updated_at: updatedAt }, { headers })
}
