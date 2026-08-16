import { NextRequest, NextResponse } from 'next/server'
import { GOOGLE_COOKIE, openTokens } from '../../../../lib/google'

export async function GET(request: NextRequest) {
  return NextResponse.json({ connected: !!openTokens(request.cookies.get(GOOGLE_COOKIE)?.value) })
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete(GOOGLE_COOKIE)
  return response
}
