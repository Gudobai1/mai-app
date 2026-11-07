'use client'

import { useEffect, useState } from 'react'
import { DayIcon, IonIcon, IconButton } from '../../ds'
import type { AppView } from '../app-types'
import { NAV_ALIAS, NAV_GROUPS } from './nav'
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

/** Áreas com botão próprio na barra; as demais ficam no popup "Mais" (nunca folha de baixo). */
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
        {id === 'today' ? <DayIcon size={22} active={active} /> : <IonIcon name={icon} size={24} filled={active} />}
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
            <header className={styles.sheetHeader}>
              <h2 id="mai-modules-title" className={styles.sheetTitle}>Mais</h2>
              <div className={styles.sheetHeaderActions}>
                <IconButton icon={dark ? 'light_mode' : 'dark_mode'} label={dark ? 'Usar tema claro' : 'Usar tema escuro'} size={40} onClick={onToggleTheme} aria-pressed={dark} />
                <IconButton icon="close" label="Fechar" size={40} onClick={() => setSheetOpen(false)} />
              </div>
            </header>

            {sheetGroups.map((group, index) => (
              <div key={index} className={styles.sheetGroup}>
                {group.label ? <h3 className={styles.sheetGroupLabel}>{group.label}</h3> : null}
                {group.items.map(item => {
                  const current = (NAV_ALIAS[view] ?? view) === item.id
                  return (
                    <button key={String(item.id)} type="button" className={styles.sheetItem} aria-current={current ? 'page' : undefined} onClick={() => go(item.id)}>
                      <span>{item.label}</span>
                      <IonIcon name={item.icon} size={20} filled={current} />
                    </button>
                  )
                })}
              </div>
            ))}

            <div className={styles.sheetGroup}>
              <button type="button" className={styles.sheetItem} onClick={() => { setSheetOpen(false); onSettings() }}>
                <span>Ajustes</span>
                <IonIcon name="tune" size={20} />
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <nav className={styles.mobileNav} aria-label="Navegação principal">
        {tab('today', 'Hoje', 'today')}
        {tab('upcoming', 'Em breve', 'event_upcoming')}
        <button type="button" className={styles.tab} aria-current={searchOpen && !sheetOpen ? 'page' : undefined} onClick={() => { setSheetOpen(false); onSearch() }}>
          <IonIcon name="search" size={24} filled={searchOpen} />
          <span>Pesquisar</span>
        </button>
        <button type="button" className={styles.tab} aria-expanded={sheetOpen} aria-current={modulesActive && !sheetOpen ? 'page' : undefined} onClick={() => setSheetOpen(value => !value)}>
          <IonIcon name="more_horiz" size={24} />
          <span>Mais</span>
        </button>
      </nav>
    </>
  )
}
