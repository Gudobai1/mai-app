import type { Metadata } from 'next'
import { PwaRegister } from './PwaRegister'
import './ux-polish.css'
import './ux-shell.css'
import './ux-navigation-v2.css'
import './ux-final-overrides.css'
import './project-settings.css'
import './mai-minimal-v3.css'
import './mai-minimal-v3-panels.css'
import './mai-minimal-v3-modules.css'
import './mai-minimal-v3-tasks.css'
import './mai-production-polish.css'
import './mai-clean-v4.css'
import './mai-clean-v4-fixes.css'
import './mai-clean-v4-modules.css'
import './mai-today-unified.css'
import './mai-todoist-system.css'
import './mai-event-rows.css'
import './mai-today-single-list.css'
import './mai-item-anatomy-v2.css'
import './mai-global-shell-v2.css'

export const metadata: Metadata = {
  title: 'MAI — Meu Sistema',
  description: 'Organize tarefas, compromissos, hábitos, finanças, notas e bem-estar.',
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
