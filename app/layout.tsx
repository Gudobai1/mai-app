import type { Metadata } from 'next'
import { PwaRegister } from './PwaRegister'

export const metadata: Metadata = {
  title: 'MAI — Meu Sistema',
  description: 'Organize tarefas, agenda, rotinas, finanças, notas e bem-estar.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'MAI', statusBarStyle: 'default' },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0 }}><PwaRegister />{children}</body>
    </html>
  )
}
