'use client'

import { useEffect, useState } from 'react'

const errors: Record<string,string> = {
  unauthorized_google_account: 'Esta conta Google não tem permissão para acessar o MAI.',
  invalid_state: 'Não foi possível validar o login. Tente novamente.',
  google_token_error: 'O Google não concluiu a autenticação. Tente novamente.',
  supabase_not_configured: 'A conexão com os dados do MAI não está configurada.',
  supabase_session_error: 'Não foi possível conectar sua conta Google aos dados do MAI.',
}

export default function LoginPage() {
  const [message, setMessage] = useState('')
  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get('error') || ''
    setMessage(errors[error] || '')
  }, [])

  return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',fontFamily:'Inter,system-ui,sans-serif',background:'#f7f8f6',color:'#202420',padding:20,boxSizing:'border-box'}}>
    <section style={{width:'min(390px,100%)',background:'#fff',border:'1px solid #e4e8e2',borderRadius:20,padding:28,boxShadow:'0 18px 55px rgba(35,45,33,.08)'}}>
      <div style={{width:42,height:42,borderRadius:13,display:'grid',placeItems:'center',background:'#60765a',color:'#fff',fontWeight:800,marginBottom:20}}>M</div>
      <h1 style={{margin:'0 0 7px',fontSize:25,letterSpacing:'-.03em'}}>Entrar no MAI</h1>
      <p style={{margin:'0 0 24px',fontSize:13,lineHeight:1.55,color:'#747d72'}}>Seus dados ficam vinculados à sua conta e aparecem nos seus dispositivos.</p>
      <a href="/api/google/connect?mode=login" style={{height:46,border:'1px solid #dfe4dd',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',gap:10,textDecoration:'none',color:'#283027',fontSize:13,fontWeight:650,background:'#fff'}}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.33 2.98-7.39Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.38l-3.24-2.53c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.6-4.12H3.05v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.93A6 6 0 0 1 6.08 12c0-.67.11-1.32.32-1.93v-2.6H3.05A10 10 0 0 0 2 12c0 1.61.39 3.14 1.05 4.53l3.35-2.6Z"/><path fill="#EA4335" d="M12 5.95c1.47 0 2.78.5 3.81 1.49l2.87-2.87A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.95 5.47l3.35 2.6c.8-2.36 3-4.12 5.6-4.12Z"/></svg>
        Continuar com Google
      </a>
      {message ? <p style={{margin:'14px 0 0',padding:'11px 12px',borderRadius:10,background:'#fff3f1',color:'#9a453d',fontSize:11.5,lineHeight:1.45}}>{message}</p> : null}
      <p style={{margin:'18px 0 0',fontSize:10.5,color:'#9aa198',lineHeight:1.5}}>O acesso é restrito à conta Google autorizada do MAI.</p>
    </section>
  </main>
}
