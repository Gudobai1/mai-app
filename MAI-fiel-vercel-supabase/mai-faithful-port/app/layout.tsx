import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'MAI — Meu Sistema',
  description: 'Port fiel do MAI para Vercel + Supabase',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  )
}
