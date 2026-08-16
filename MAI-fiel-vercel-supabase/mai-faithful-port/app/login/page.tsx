'use client'

import { FormEvent, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!url || !key) { setMessage('Supabase não configurado neste ambiente.'); return }
    setLoading(true); setMessage('')
    const supabase = createClient(url, key)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error || !data.session) { setMessage(error?.message || 'Não foi possível entrar.'); return }
    localStorage.setItem('mai-supabase-access-token', data.session.access_token)
    localStorage.setItem('mai-supabase-refresh-token', data.session.refresh_token)
    location.href = '/'
  }

  return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',fontFamily:'Inter,system-ui,sans-serif',background:'#fafafa',color:'#202020'}}>
    <form onSubmit={submit} style={{width:'min(380px,calc(100vw - 32px))',background:'#fff',border:'1px solid #e8e8e8',borderRadius:16,padding:24,boxShadow:'0 12px 40px rgba(0,0,0,.06)'}}>
      <h1 style={{margin:'0 0 6px',fontSize:22}}>MAI</h1>
      <p style={{margin:'0 0 20px',fontSize:13,color:'#6b6b6b'}}>Entrar para sincronizar seus dados com o Supabase.</p>
      <label style={{display:'grid',gap:6,fontSize:12,fontWeight:700,marginBottom:14}}>E-mail<input value={email} onChange={e=>setEmail(e.target.value)} type="email" required style={{height:42,border:'1px solid #d8d8d8',borderRadius:9,padding:'0 12px',font:'inherit'}}/></label>
      <label style={{display:'grid',gap:6,fontSize:12,fontWeight:700,marginBottom:18}}>Senha<input value={password} onChange={e=>setPassword(e.target.value)} type="password" required style={{height:42,border:'1px solid #d8d8d8',borderRadius:9,padding:'0 12px',font:'inherit'}}/></label>
      <button disabled={loading} style={{width:'100%',height:42,border:0,borderRadius:9,background:'#dc4c3e',color:'#fff',fontWeight:700,cursor:'pointer'}}>{loading?'Entrando…':'Entrar'}</button>
      {message && <p style={{fontSize:12,color:'#d1453b',margin:'12px 0 0'}}>{message}</p>}
    </form>
  </main>
}
