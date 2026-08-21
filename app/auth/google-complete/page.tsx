'use client'

import { useEffect, useState } from 'react'
import { createStatelessSupabaseClient, saveSupabaseSession } from '../../../lib/supabase/browser'
import { flushRemoteSync, hydrateRemoteState, loadState } from '../../../lib/v2/state'

export default function GoogleCompletePage() {
  const [message, setMessage] = useState('Conectando sua conta…')

  useEffect(() => {
    void (async () => {
      const tokenHash = new URLSearchParams(window.location.search).get('token_hash') || ''
      const supabase = createStatelessSupabaseClient()
      if (!tokenHash || !supabase) {
        location.replace('/login?error=supabase_session_error')
        return
      }

      const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
      if (error || !data.session) {
        location.replace('/login?error=supabase_session_error')
        return
      }

      saveSupabaseSession(data.session)
      setMessage('Sincronizando seus dados…')
      const local = loadState()
      await hydrateRemoteState(local)
      await flushRemoteSync()
      location.replace('/')
    })()
  }, [])

  return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',fontFamily:'Inter,system-ui,sans-serif',background:'#f7f8f6',color:'#202420'}}>
    <div style={{textAlign:'center'}}><strong style={{display:'block',fontSize:20,marginBottom:8}}>MAI</strong><span style={{fontSize:13,color:'#737b71'}}>{message}</span></div>
  </main>
}
