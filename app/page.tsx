'use client'

import { useEffect, useState } from 'react'

export default function Page() {
  const [connected, setConnected] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/google/status', {cache:'no-store'})
      .then(r => r.json())
      .then(data => setConnected(data.connected === true))
      .catch(() => setConnected(false))
  }, [])

  return (
    <main style={{position:'fixed',inset:0,background:'#fff'}}>
      {connected === false && (
        <a href="/api/google/connect" style={{position:'fixed',right:16,top:12,zIndex:999999,padding:'9px 14px',borderRadius:9,background:'#fff',color:'#202124',border:'1px solid #dadce0',boxShadow:'0 2px 8px rgba(0,0,0,.12)',font:'600 12px Inter,system-ui,sans-serif',textDecoration:'none'}}>
          Conectar Google Drive e Agenda
        </a>
      )}
      <iframe
        src="/mai.html"
        title="MAI"
        onLoad={event => {
          const doc = event.currentTarget.contentDocument
          if (!doc || doc.getElementById('mai-google-rpc')) return
          const script = doc.createElement('script')
          script.id = 'mai-google-rpc'
          script.src = '/google-rpc-overrides.js'
          doc.body.appendChild(script)
        }}
        style={{position:'fixed',inset:0,width:'100%',height:'100%',border:0,background:'#fff'}}
      />
    </main>
  )
}
