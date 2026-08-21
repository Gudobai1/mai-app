import { NextRequest, NextResponse } from 'next/server'
import { authorizedGoogle } from '../../../../lib/google'

export async function GET(request: NextRequest) {
  try {
    const google = await authorizedGoogle(request)
    const response = await google.fetch('https://openidconnect.googleapis.com/v1/userinfo')
    const profile = await response.json().catch(() => null)
    if (!response.ok || !profile?.email) {
      return NextResponse.json({ error: 'Perfil Google indisponível' }, { status: 502 })
    }
    return NextResponse.json({
      name: String(profile.name || profile.given_name || profile.email || 'Meu perfil'),
      picture: String(profile.picture || ''),
      email: String(profile.email || ''),
    })
  } catch {
    return NextResponse.json({ error: 'Google não conectado' }, { status: 401 })
  }
}
