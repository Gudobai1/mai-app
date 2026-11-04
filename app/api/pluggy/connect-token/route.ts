import { requireOwner } from '../../../../lib/ownerAuth'
import { createConnectToken, pluggyConfigured } from '../../../../lib/pluggy'

const headers = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function POST(request: Request) {
  const auth = await requireOwner(request)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers })
  if (!pluggyConfigured()) return Response.json({ error: 'Open Finance não configurado (faltam PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET)', code: 'NOT_CONFIGURED' }, { status: 503, headers })
  const body = await request.json().catch(() => ({})) as { itemId?: string }
  try {
    return Response.json({ accessToken: await createConnectToken(typeof body.itemId === 'string' ? body.itemId : undefined) }, { headers })
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Falha ao criar token' }, { status: 502, headers })
  }
}
