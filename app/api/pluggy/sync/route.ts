import { requireOwner } from '../../../../lib/ownerAuth'
import { pluggyConfigured, syncItem } from '../../../../lib/pluggy'

const headers = { 'Cache-Control': 'private, no-store, max-age=0' }
const dateOk = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

export async function POST(request: Request) {
  const auth = await requireOwner(request)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers })
  if (!pluggyConfigured()) return Response.json({ error: 'Open Finance não configurado', code: 'NOT_CONFIGURED' }, { status: 503, headers })
  const body = await request.json().catch(() => null) as { itemIds?: unknown; from?: unknown } | null
  const itemIds = Array.isArray(body?.itemIds) ? body!.itemIds.filter((id): id is string => typeof id === 'string' && /^[\w-]{8,64}$/.test(id)).slice(0, 10) : []
  if (!itemIds.length) return Response.json({ error: 'Nenhuma conexão informada' }, { status: 400, headers })
  const from = dateOk(body?.from) ? String(body!.from) : new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10)
  const results = await Promise.all(itemIds.map(async itemId => {
    try { return { ok: true as const, item: await syncItem(itemId, from) } } catch (error: any) { return { ok: false as const, itemId, error: error?.message || 'Falha ao sincronizar' } }
  }))
  return Response.json({ items: results.filter(r => r.ok).map(r => (r as any).item), errors: results.filter(r => !r.ok).map(r => ({ itemId: (r as any).itemId, error: (r as any).error })) }, { headers })
}
