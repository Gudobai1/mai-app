'use client'

import { useEffect, useState } from 'react'
import type { AppView } from './app-types'
import { MaiIcon } from './MaiIcons'

type Props = {
  view: AppView
  searchOpen: boolean
  navigate: (view: AppView) => void
  onSearch: () => void
  onSettings: () => void
}

type AreaItem = { id: AppView; label: string; icon: string }

const areas: AreaItem[] = [
  { id: 'tasks', label: 'Tarefas', icon: 'inbox' },
  { id: 'habits', label: 'Hábitos', icon: 'habits' },
  { id: 'goals', label: 'Metas', icon: 'goals' },
  { id: 'notes', label: 'Notas', icon: 'notes' },
  { id: 'finance', label: 'Finanças', icon: 'finance' },
  { id: 'health', label: 'Bem-estar', icon: 'health' },
  { id: 'files', label: 'Arquivos', icon: 'files' },
  { id: 'completed', label: 'Concluídos', icon: 'completed' },
]

const areaViews = new Set(areas.map(item => String(item.id)))

export function MobileBottomNav({ view, searchOpen, navigate, onSearch, onSettings }: Props) {
  const [areasOpen, setAreasOpen] = useState(false)

  useEffect(() => {
    setAreasOpen(false)
  }, [view])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAreasOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const go = (next: AppView) => {
    setAreasOpen(false)
    navigate(next)
  }

  const openSearch = () => {
    setAreasOpen(false)
    onSearch()
  }

  const areasActive = areasOpen || areaViews.has(String(view))

  return <>
    {areasOpen ? <>
      <button className="mai-mobile-areas-scrim" aria-label="Fechar áreas" onClick={() => setAreasOpen(false)} />
      <section className="mai-mobile-areas-sheet" role="dialog" aria-modal="true" aria-label="Áreas">
        <div className="mai-mobile-areas-handle" aria-hidden="true" />
        <header><div><strong>Áreas</strong><small>Escolha onde deseja entrar</small></div><button type="button" onClick={() => setAreasOpen(false)} aria-label="Fechar"><span className="material-symbols-rounded">close</span></button></header>
        <nav className="mai-mobile-areas-list">
          {areas.map(item => <button type="button" key={String(item.id)} data-active={view === item.id || undefined} onClick={() => go(item.id)}>
            <span className="mai-mobile-area-icon"><MaiIcon name={item.icon} size={18}/></span>
            <span>{item.label}</span>
            {view === item.id ? <span className="material-symbols-rounded mai-mobile-area-check">check</span> : null}
          </button>)}
        </nav>
        <button type="button" className="mai-mobile-settings-row" onClick={() => { setAreasOpen(false); onSettings() }}><span className="material-symbols-rounded">tune</span><span>Ajustes</span></button>
      </section>
    </> : null}

    <nav className="mai-mobile-bottom-nav" aria-label="Navegação principal">
      <button type="button" data-active={view === 'today' || undefined} onClick={() => go('today')}><MaiIcon name="today" size={21}/><span>Hoje</span></button>
      <button type="button" data-active={view === 'upcoming' || undefined} onClick={() => go('upcoming')}><MaiIcon name="upcoming" size={21}/><span>Em breve</span></button>
      <button type="button" data-active={searchOpen || undefined} onClick={openSearch}><MaiIcon name="search" size={21}/><span>Pesquisar</span></button>
      <button type="button" data-active={areasActive || undefined} aria-expanded={areasOpen} onClick={() => setAreasOpen(value => !value)}><span className="material-symbols-rounded">grid_view</span><span>Áreas</span></button>
    </nav>
  </>
}
