'use client'

import { useEffect } from 'react'
import { isNativeApp, nativePlugin, openGoogleAuth, parseAuthLink } from '../lib/native/native'

/** Só age dentro do app Android: manda o login do Google para o navegador do sistema e trata a volta por link profundo. */
export function NativeBridge() {
  useEffect(() => {
    if (!isNativeApp()) return
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.('a[href*="/api/google/connect"]') as HTMLAnchorElement | null
      if (!anchor) return
      event.preventDefault()
      void openGoogleAuth(anchor.getAttribute('href') || '/api/google/connect')
    }
    document.addEventListener('click', onClick, true)
    const app = nativePlugin('App')
    const handle = app?.addListener?.('appUrlOpen', async (event: { url?: string }) => {
      const link = parseAuthLink(String(event?.url || ''))
      if (!link) return
      try { await nativePlugin('Browser')?.close?.() } catch { /* já fechou */ }
      if (link.error) { location.assign(`/login?error=${encodeURIComponent(link.error)}`); return }
      // as credenciais do Google foram criadas no navegador: aqui elas viram o cookie do app
      if (link.sealed) { try { await fetch('/api/google/adopt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ g: link.sealed }) }) } catch { /* segue: o login ainda vale */ } }
      location.assign(link.mode === 'login' && link.tokenHash ? `/auth/google-complete?token_hash=${encodeURIComponent(link.tokenHash)}` : '/?google=connected')
    })
    return () => { document.removeEventListener('click', onClick, true); void Promise.resolve(handle).then(item => item?.remove?.()) }
  }, [])
  return null
}
