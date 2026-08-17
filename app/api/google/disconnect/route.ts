import { NextResponse } from 'next/server'
import { GOOGLE_COOKIE } from '../../../../lib/google'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(GOOGLE_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return response
}
