'use client'

import { useEffect, useState } from 'react'
import { Icon, IconButton, IconTile, type Tone } from '../../ds'
import type { AppView } from '../app-types'
import { NAV_GROUPS } from './nav'
import styles from './ModernShell.module.css'

type Props = {
  view: AppView
  searchOpen: boolean
  navigate: (view: AppView) => void
  onSearch: () => void
  onAdd: () => void
  onSettings: () => void
  onToggleTheme: () => void
  dark: boolean
}

const sheetTones: Partial<Record<string, Tone>> = {
  tasks: 'accent',
  completed: 'mint',
  habits: 'mint',
  goals: 'lilac',
  health: 'rose',
  notes: 'peach',
  finance: 'sky',
  files: 'accent',
}

/** Áreas com botão próprio na barra; as demais ficam na folha de módulos. */
const barViews = new Set(['today', 'upcoming'])

export function ModernBottomNav({ view, searchOpen, navigate, onSearch, onAdd, onSettings, onToggleTheme, dark }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    setSheetOpen(false)
  }, [view])

  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSheetOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetOpen])

  const go = (next: AppView) => {
    setSheetOpen(false)
    navigate(next)
  }

  const tab = (id: AppView, label: string, icon: string) => {
    const active = view === id && !sheetOpen && !searchOpen
    return (
      <button type="button" className={styles.tab} aria-current={active ? 'page' : undefined} onClick={() => go(id)}>
        <Icon name={icon} size={24} filled={active} />
        <span>{label}</span>
      </button>
    )
  }

  const modulesActive = sheetOpen || (!barViews.has(String(view)) && !searchOpen)
  const sheetGroups = NAV_GROUPS.map(group => ({ ...group, items: group.items.filter(item => !barViews.has(String(item.id))) })).filter(group => group.items.length)

  return (
    <>
      {sheetOpen ? (
        <div className={styles.sheetLayer}>
          <button type="button" className={styles.scrim} aria-label="Fechar" onClick={() => setSheetOpen(false)} />
          <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="mai-modules-title">
            <div className={styles.handle} aria-hidden="true" />
            <header className={styles.sheetHeader}>
              <h2 id="mai-modules-title" className={styles.sheetTitle}>Módulos</h2>
              <div className={styles.sheetHeaderActions}>
                <IconButton icon={dark ? 'dark_mode' : 'light_mode'} label={dark ? 'Usar tema claro' : 'Usar tema escuro'} size={40} onClick={onToggleTheme} aria-pressed={dark} />
                <IconButton icon="close" label="Fechar" size={40} onClick={() => setSheetOpen(false)} />
              </div>
            </header>

            {sheetGroups.map(group => (
              <div key={group.label}>
                <h3 className={styles.sheetGroupLabel}>{group.label}</h3>
                <div className={styles.sheetGrid}>
                  {group.items.map(item => (
                    <button key={String(item.id)} type="button" className={styles.sheetItem} aria-current={view === item.id ? 'page' : undefined} onClick={() => go(item.id)}>
                      <IconTile icon={item.icon} tone={sheetTones[String(item.id)] || 'accent'} solid={view === item.id} size={44} />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className={styles.sheetRows}>
              <button type="button" className={styles.sheetRow} onClick={() => { setSheetOpen(false); onSettings() }}>
                <Icon name="tune" size={22} filled={false} />
                <span>Ajustes</span>
                <Icon name="chevron_right" size={20} />
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <nav className={styles.mobileNav} aria-label="Navegação principal">
        {tab('today', 'Hoje', 'today')}
        {tab('upcoming', 'Em breve', 'event_upcoming')}
        <button type="button" className={`${styles.tab} ${styles.tabAdd}`} aria-label="Adicionar" onClick={() => { setSheetOpen(false); onAdd() }}>
          <Icon name="add" size={30} weight={600} />
        </button>
        <button type="button" className={styles.tab} aria-current={searchOpen && !sheetOpen ? 'page' : undefined} onClick={() => { setSheetOpen(false); onSearch() }}>
          <Icon name="search" size={24} filled={searchOpen} weight={searchOpen ? 600 : 400} />
          <span>Pesquisa</span>
        </button>
        <button type="button" className={styles.tab} aria-expanded={sheetOpen} aria-current={modulesActive && !sheetOpen ? 'page' : undefined} onClick={() => setSheetOpen(value => !value)}>
          <Icon name="grid_view" size={24} filled={modulesActive} />
          <span>Módulos</span>
        </button>
      </nav>
    </>
  )
}
