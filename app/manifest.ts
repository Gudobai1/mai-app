import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MAI — Meu Sistema',
    short_name: 'MAI',
    description: 'Seu sistema pessoal para organizar o dia.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#5f7257',
    orientation: 'any',
    icons: [{ src: '/mai-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  }
}
