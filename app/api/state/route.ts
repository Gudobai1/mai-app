import { createClient } from '@supabase/supabase-js'

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !publishable) return null
  return { url, publishable }
}

async function scopedClient(request: Request) {
  const e = env()
  if (!e) return { error: 'Supabase não configurado', status: 503 as const }
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { error: 'Não autenticado', status: 401 as const }

  const client = createClient(e.url, e.publishable, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) return { error: 'Sessão inválida', status: 401 as const }
  return { client, user: data.user }
}

function taskRow(userId: string, task: any) {
  const completed = task?.concluida === true
  const due = task?.data_vencimento ? new Date(task.data_vencimento) : null
  return {
    user_id: userId,
    legacy_id: String(task?.id || crypto.randomUUID()),
    title: String(task?.titulo || ''),
    description: task?.descricao || null,
    due_at: due && !Number.isNaN(due.getTime()) ? due.toISOString() : null,
    priority: String(task?.prioridade ?? 4),
    status: completed ? 'completed' : 'pending',
    completed_at: completed ? new Date().toISOString() : null,
    recurrence_rule: task?.repeticao || null,
    sort_order: Number(task?.ordem || 0),
    metadata: {
      legacy: true,
      projeto_id: task?.projeto_id || 'entrada',
      secao: task?.secao || '',
      notas: Array.isArray(task?.notas) ? task.notas : [],
      anexos: Array.isArray(task?.anexos) ? task.anexos : [],
      subtarefas: Array.isArray(task?.subtarefas) ? task.subtarefas : [],
      ocultar_agenda: task?.ocultar_agenda === true,
      criado_em: task?.criado_em || null,
    },
  }
}

function legacyTask(row: any) {
  const metadata = row?.metadata || {}
  return {
    id: row.legacy_id || row.id,
    titulo: row.title || '',
    descricao: row.description || '',
    notas: Array.isArray(metadata.notas) ? metadata.notas : [],
    data_vencimento: row.due_at || '',
    prioridade: Number(row.priority || 4),
    concluida: row.status === 'completed',
    criado_em: metadata.criado_em || row.created_at,
    projeto_id: metadata.projeto_id || 'entrada',
    anexos: Array.isArray(metadata.anexos) ? metadata.anexos : [],
    subtarefas: Array.isArray(metadata.subtarefas) ? metadata.subtarefas : [],
    repeticao: row.recurrence_rule || '',
    secao: metadata.secao || '',
    ocultar_agenda: metadata.ocultar_agenda === true,
    ordem: Number(row.sort_order || 0),
  }
}

async function syncTasks(client: any, userId: string, tasks: any[]) {
  const normalized = Array.isArray(tasks) ? tasks : []
  const rows = normalized.map(task => taskRow(userId, task))

  if (rows.length) {
    const { error } = await client.from('tasks').upsert(rows, { onConflict: 'user_id,legacy_id' })
    if (error) throw new Error(`tasks upsert: ${error.message}`)
  }

  const { data: existing, error: readError } = await client
    .from('tasks')
    .select('id,legacy_id')
    .eq('user_id', userId)
    .not('legacy_id', 'is', null)

  if (readError) throw new Error(`tasks read: ${readError.message}`)

  const wanted = new Set(rows.map(row => row.legacy_id))
  const obsolete = (existing || []).filter((row: any) => !wanted.has(row.legacy_id)).map((row: any) => row.id)
  if (obsolete.length) {
    const { error } = await client.from('tasks').delete().eq('user_id', userId).in('id', obsolete)
    if (error) throw new Error(`tasks delete: ${error.message}`)
  }
}

async function readTasks(client: any, userId: string) {
  const { data, error } = await client
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(`tasks select: ${error.message}`)
  return (data || []).map(legacyTask)
}

export async function GET(request: Request) {
  const auth = await scopedClient(request)
  if (!('client' in auth)) return Response.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await auth.client
    .from('mai_state')
    .select('data,updated_at')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  let state = data?.data ?? null
  try {
    const tasks = await readTasks(auth.client, auth.user.id)
    if (state) state = { ...state, tasks }
    else state = { version: 1, tasks }
  } catch (taskError: any) {
    return Response.json({ error: taskError?.message || 'Erro ao carregar tarefas' }, { status: 500 })
  }

  return Response.json({ data: state, updated_at: data?.updated_at ?? null })
}

export async function PUT(request: Request) {
  const auth = await scopedClient(request)
  if (!('client' in auth)) return Response.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => null)
  if (!body || typeof body.data !== 'object' || Array.isArray(body.data)) {
    return Response.json({ error: 'Payload inválido' }, { status: 400 })
  }

  try {
    await syncTasks(auth.client, auth.user.id, body.data.tasks || [])
  } catch (taskError: any) {
    return Response.json({ error: taskError?.message || 'Erro ao salvar tarefas' }, { status: 500 })
  }

  const { error } = await auth.client
    .from('mai_state')
    .upsert(
      { user_id: auth.user.id, data: body.data, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
