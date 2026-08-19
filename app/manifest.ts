import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'MAI — Meu Sistema',
    short_name: 'MAI',
    description: 'Seu sistema pessoal para organizar o dia.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#60765a',
    orientation: 'any',
    icons: [{ src: '/mai-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  }
}