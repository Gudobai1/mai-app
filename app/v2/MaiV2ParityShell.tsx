'use client'

import { useEffect, useState } from 'react'
import { hasStoredSupabaseSession } from '../../lib/supabase/browser'
import { UnifiedAppUx } from './UnifiedAppUx'
import { UxController } from './UxController'

export function MaiV2ParityShell() {
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    if (!hasStoredSupabaseSession()) {
      location.replace('/login')
      return
    }
    setAuthorized(true)
  }, [])

  if (!authorized) return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',fontFamily:'Inter,system-ui,sans-serif',color:'#7b8379'}}>Carregando MAI…</div>

  return <>
    <UnifiedAppUx />
    <UxController />
  </>
}
