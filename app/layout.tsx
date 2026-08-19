import type { Metadata } from 'next'
import { PwaRegister } from './PwaRegister'
import './ux-polish.css'
import './ux-shell.css'
import './ux-navigation-v2.css'
import './ux-final-overrides.css'
import './project-settings.css'

export const metadata: Metadata = {
  title: 'MAI — Meu Sistema',
  description: 'Organize tarefas, compromissos, rotinas, finanças, notas e bem-estar.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'MAI', statusBarStyle: 'default' },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..24,400,0,0&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0 }}><PwaRegister />{children}</body>
    </html>
  )
}
