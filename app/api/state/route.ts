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

const arr = (v: any) => Array.isArray(v) ? v : []
const str = (v: any, fallback = '') => v == null ? fallback : String(v)
const num = (v: any, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback
const pick = (o: any, ...keys: string[]) => { for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k]; return undefined }
const metadata = (o: any) => ({ legacy: true, ...o })

function taskRow(userId: string, task: any) {
  const completed = task?.concluida === true
  const due = task?.data_vencimento ? new Date(task.data_vencimento) : null
  return { user_id:userId, legacy_id:str(task?.id || crypto.randomUUID()), title:str(task?.titulo), description:task?.descricao || null,
    due_at:due && !Number.isNaN(due.getTime()) ? due.toISOString() : null, priority:str(task?.prioridade ?? 4),
    status:completed?'completed':'pending', completed_at:completed?new Date().toISOString():null, recurrence_rule:task?.repeticao||null,
    sort_order:num(task?.ordem), metadata:{ legacy:true, projeto_id:task?.projeto_id||'entrada', secao:task?.secao||'',
      notas:arr(task?.notas), anexos:arr(task?.anexos), subtarefas:arr(task?.subtarefas), ocultar_agenda:task?.ocultar_agenda===true, criado_em:task?.criado_em||null } }
}

function legacyTask(row:any) {
  const m=row?.metadata||{}
  return { id:row.legacy_id||row.id, titulo:row.title||'', descricao:row.description||'', notas:arr(m.notas), data_vencimento:row.due_at||'',
    prioridade:num(row.priority,4), concluida:row.status==='completed', criado_em:m.criado_em||row.created_at, projeto_id:m.projeto_id||'entrada',
    anexos:arr(m.anexos), subtarefas:arr(m.subtarefas), repeticao:row.recurrence_rule||'', secao:m.secao||'', ocultar_agenda:m.ocultar_agenda===true, ordem:num(row.sort_order) }
}

async function syncTasks(client:any,userId:string,tasks:any[]) {
  const rows=arr(tasks).map(t=>taskRow(userId,t))
  if(rows.length){const {error}=await client.from('tasks').upsert(rows,{onConflict:'user_id,legacy_id'});if(error)throw new Error(`tasks upsert: ${error.message}`)}
}

async function mirrorCollection(client:any,userId:string,table:string,items:any[],rowFactory:(userId:string,item:any)=>any) {
  for(const item of arr(items)){
    const row=rowFactory(userId,item)
    if(!row.legacy_id) row.legacy_id=crypto.randomUUID()
    const {data:existing,error:findError}=await client.from(table).select('id').eq('user_id',userId).eq('legacy_id',row.legacy_id).maybeSingle()
    if(findError) throw new Error(`${table} lookup: ${findError.message}`)
    if(existing?.id){const {error}=await client.from(table).update(row).eq('id',existing.id).eq('user_id',userId);if(error)throw new Error(`${table} update: ${error.message}`)}
    else {const {error}=await client.from(table).insert(row);if(error)throw new Error(`${table} insert: ${error.message}`)}
  }
}

function projectRow(userId:string,p:any){return {user_id:userId,legacy_id:str(p.id||crypto.randomUUID()),name:str(p.nome||p.name),description:p.descricao||null,color:p.cor||p.color||null,status:p.status||'active',sort_order:num(p.ordem),metadata:metadata(p)}}
function habitRow(userId:string,h:any){return {user_id:userId,legacy_id:str(h.id||crypto.randomUUID()),name:str(h.nome||h.name),description:h.descricao||null,frequency:str(h.frequencia||h.frequency||'daily'),target:num(h.meta||h.target,1),unit:h.unidade||h.unit||null,color:h.cor_hex||h.cor||h.color||null,active:h.ativo!==false,sort_order:num(h.ordem),metadata:metadata(h)}}
function habitEntryRow(userId:string,h:any){return {user_id:userId,legacy_id:str(h.id||`${h.habito_id||h.habit_id}-${h.data}`||crypto.randomUUID()),habit_id:null,entry_date:str(h.data||h.entry_date||new Date().toISOString().slice(0,10)),value:num(h.valor||h.value,1),completed:h.concluida!==false&&h.completed!==false,metadata:metadata(h)}}
function noteRow(userId:string,n:any){return {user_id:userId,legacy_id:str(n.id||crypto.randomUUID()),title:str(n.titulo||n.title),content:n.conteudo||n.content||n.texto||null,folder:n.pasta||n.folder||null,metadata:metadata(n)}}
function eventRow(userId:string,e:any){const start=pick(e,'data_inicio','starts_at','start');const end=pick(e,'data_fim','ends_at','end');return {user_id:userId,legacy_id:str(e.id||crypto.randomUUID()),title:str(e.titulo||e.title||e.nome),description:e.descricao||e.description||null,starts_at:start?new Date(start).toISOString():new Date().toISOString(),ends_at:end?new Date(end).toISOString():null,all_day:e.dia_inteiro===true||e.all_day===true,recurrence_rule:e.repeticao||e.recurrence_rule||null,external_provider:e.external_provider||null,external_id:e.external_id||null,metadata:metadata(e)}}
function goalRow(userId:string,g:any){return {user_id:userId,legacy_id:str(g.id||crypto.randomUUID()),title:str(g.titulo||g.nome||g.title),description:g.descricao||g.description||null,status:g.status||'active',target_value:pick(g,'valor_meta','target_value','meta')!=null?num(pick(g,'valor_meta','target_value','meta')):null,current_value:num(pick(g,'valor_atual','current_value','progresso')),due_at:pick(g,'data_fim','due_at')?new Date(pick(g,'data_fim','due_at')).toISOString():null,metadata:metadata(g)}}
function accountRow(userId:string,a:any){return {user_id:userId,legacy_id:str(a.id||crypto.randomUUID()),name:str(a.nome||a.name),type:a.tipo||a.type||'checking',initial_balance:num(pick(a,'saldo_inicial','initial_balance')),active:a.ativo!==false,metadata:metadata(a)}}
function cardRow(userId:string,c:any){return {user_id:userId,legacy_id:str(c.id||crypto.randomUUID()),account_id:null,name:str(c.nome||c.name),credit_limit:pick(c,'limite','credit_limit')!=null?num(pick(c,'limite','credit_limit')):null,closing_day:pick(c,'dia_fechamento','closing_day')!=null?num(pick(c,'dia_fechamento','closing_day')):null,due_day:pick(c,'dia_vencimento','due_day')!=null?num(pick(c,'dia_vencimento','due_day')):null,active:c.ativo!==false,metadata:metadata(c)}}
function transactionRow(userId:string,t:any){return {user_id:userId,legacy_id:str(t.id||crypto.randomUUID()),account_id:null,card_id:null,description:str(t.descricao||t.nome||t.description),amount:num(t.valor||t.amount),transaction_date:str(t.data||t.transaction_date||new Date().toISOString().slice(0,10)).slice(0,10),category:t.categoria||t.category||null,type:t.tipo||t.type||'expense',status:t.status||'posted',metadata:metadata(t)}}
function healthRow(userId:string,h:any,legacy?:string){return {user_id:userId,legacy_id:str(legacy||h.id||crypto.randomUUID()),entry_date:str(h.data||h.entry_date||new Date().toISOString().slice(0,10)).slice(0,10),data:h}} 
function attachmentRow(userId:string,a:any){return {user_id:userId,legacy_id:str(a.id||crypto.randomUUID()),bucket:a.bucket||'attachments',path:a.path||a.caminho||'',file_name:str(a.file_name||a.nome||a.name),mime_type:a.mime_type||a.mime||null,size_bytes:a.size_bytes!=null?num(a.size_bytes):null,entity_type:a.entity_type||null,entity_id:a.entity_id||null}}

async function syncAll(client:any,userId:string,state:any){
  await syncTasks(client,userId,state.tasks)
  await mirrorCollection(client,userId,'projects',state.projects,projectRow)
  await mirrorCollection(client,userId,'habits',state.habits,habitRow)
  // Habit entries are kept in their native table; the parent habit is resolved after the upsert.
  for(const h of arr(state.habitEntries)){
    const legacy=str(h.id||`${h.habito_id||h.habit_id||'habit'}-${h.data||h.entry_date}`)
    const parent=str(h.habito_id||h.habit_id||'')
    const {data:habit}=await client.from('habits').select('id').eq('user_id',userId).eq('legacy_id',parent).maybeSingle()
    const row=habitEntryRow(userId,{...h,id:legacy})
    row.habit_id=habit?.id||null
    if(!row.habit_id) continue
    const {data:existing}=await client.from('habit_entries').select('id').eq('user_id',userId).eq('id',row.id).maybeSingle()
    if(existing?.id) await client.from('habit_entries').update(row).eq('id',existing.id).eq('user_id',userId)
    else await client.from('habit_entries').insert(row)
  }
  await mirrorCollection(client,userId,'notes',state.notes,noteRow)
  await mirrorCollection(client,userId,'calendar_events',state.events,eventRow)
  await mirrorCollection(client,userId,'goals',state.goals,goalRow)
  const finance=state.finance||{}
  await mirrorCollection(client,userId,'finance_accounts',finance.accounts,accountRow)
  await mirrorCollection(client,userId,'finance_cards',finance.cards,cardRow)
  await mirrorCollection(client,userId,'finance_transactions',finance.transactions,transactionRow)
  const health=state.health||{}
  for(const h of arr(health.trackers)) await mirrorCollection(client,userId,'health_entries',[healthRow(userId,h,`tracker:${h.id||crypto.randomUUID()}`)],(_u,x)=>x)
  for(const [date,value] of Object.entries(health.diary||{})) await mirrorCollection(client,userId,'health_entries',[healthRow(userId,{data:date,diary:value},`diary:${date}`)],(_u,x)=>x)
  await mirrorCollection(client,userId,'attachments',arr(state.drive?.items),attachmentRow)
}

export async function GET(request: Request) {
  const auth=await scopedClient(request)
  if(!('client' in auth)) return Response.json({error:auth.error},{status:auth.status})
  const {data,error}=await auth.client.from('mai_state').select('data,updated_at').eq('user_id',auth.user.id).maybeSingle()
  if(error) return Response.json({error:error.message},{status:500})
  let state=data?.data??null
  try { const tasks=await readTasks(auth.client,auth.user.id); state=state?{...state,tasks}: {version:1,tasks} } catch(taskError:any){return Response.json({error:taskError?.message||'Erro ao carregar tarefas'},{status:500})}
  return Response.json({data:state,updated_at:data?.updated_at??null})
}

async function readTasks(client:any,userId:string){
  const {data,error}=await client.from('tasks').select('*').eq('user_id',userId).order('sort_order',{ascending:true})
  if(error) throw new Error(`tasks select: ${error.message}`)
  return (data||[]).map(legacyTask)
}

export async function PUT(request: Request) {
  const auth=await scopedClient(request)
  if(!('client' in auth)) return Response.json({error:auth.error},{status:auth.status})
  const body=await request.json().catch(()=>null)
  if(!body||typeof body.data!=='object'||Array.isArray(body.data)) return Response.json({error:'Payload inválido'},{status:400})
  try { await syncAll(auth.client,auth.user.id,body.data) } catch(e:any) { return Response.json({error:e?.message||'Erro ao sincronizar módulos'},{status:500}) }
  const {error}=await auth.client.from('mai_state').upsert({user_id:auth.user.id,data:body.data,updated_at:new Date().toISOString()},{onConflict:'user_id'})
  if(error) return Response.json({error:error.message},{status:500})
  return Response.json({ok:true})
}
