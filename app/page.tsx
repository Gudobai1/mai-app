import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { GOOGLE_COOKIE, hasAllowedGoogleCookie } from '../lib/google'
import { MaiV2ParityShell } from './v2/MaiV2ParityShell'

export default async function Page() {
  const store = await cookies()
  if (!hasAllowedGoogleCookie(store.get(GOOGLE_COOKIE)?.value)) redirect('/login')
  return <MaiV2ParityShell />
}
