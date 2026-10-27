'use client'

import { useEffect, useState } from 'react'
import { Icon, IconButton, IconTile, type Tone } from '../../ds'
import type { AppView } from '../app-types'
import { COMPLETED_ITEM, NAV_GROUPS } from './nav'
import styles from './ModernShell.module.css'

type Props = {
  view: AppView
  navigate: (view: AppView) => void
  onSearch: () => void
  onAdd: () => void
  onSettings: () => void
}

/** Áreas que ficam fora da barra e aparecem na folha "Mais". */
const sheetTones: Partial<Record<string, Tone>> = {
  habits: 'mint',
  goals: 'lilac',
  health: 'rose',
  notes: 'peach',
  finance: 'sky',
  files: 'accent',
}

const barViews = new Set(['today', 'tasks', 'upcoming'])

export function ModernBottomNav({ view, navigate, onSearch, onAdd, onSettings }: Props) {
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
    const active = view === id && !sheetOpen
    return (
      <button type="button" className={styles.tab} aria-current={active ? 'page' : undefined} onClick={() => go(id)}>
        <Icon name={icon} size={24} filled={active} />
        <span>{label}</span>
      </button>
    )
  }

  const moreActive = sheetOpen || !barViews.has(String(view))
  const sheetGroups = NAV_GROUPS.map(group => ({ ...group, items: group.items.filter(item => !barViews.has(String(item.id))) })).filter(group => group.items.length)

  return (
    <>
      {sheetOpen ? (
        <div className={styles.sheetLayer}>
          <button type="button" className={styles.scrim} aria-label="Fechar" onClick={() => setSheetOpen(false)} />
          <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="mai-more-title">
            <div className={styles.handle} aria-hidden="true" />
            <header className={styles.sheetHeader}>
              <h2 id="mai-more-title" className={styles.sheetTitle}>Mais</h2>
              <IconButton icon="close" label="Fechar" size={40} onClick={() => setSheetOpen(false)} />
            </header>

            <button type="button" className={`${styles.search} ${styles.sheetSearch}`} onClick={() => { setSheetOpen(false); onSearch() }}>
              <Icon name="search" size={20} filled={false} />
              <span>Buscar em tudo</span>
            </button>

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
              <button type="button" className={styles.sheetRow} aria-current={view === COMPLETED_ITEM.id ? 'page' : undefined} onClick={() => go(COMPLETED_ITEM.id)}>
                <Icon name={COMPLETED_ITEM.icon} size={22} filled={false} />
                <span>{COMPLETED_ITEM.label}</span>
                <Icon name="chevron_right" size={20} />
              </button>
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
        {tab('tasks', 'Tarefas', 'checklist')}
        <button type="button" className={`${styles.tab} ${styles.tabAdd}`} aria-label="Adicionar" onClick={() => { setSheetOpen(false); onAdd() }}>
          <Icon name="add" size={28} weight={600} />
        </button>
        {tab('upcoming', 'Em breve', 'event_upcoming')}
        <button type="button" className={styles.tab} aria-expanded={sheetOpen} aria-current={moreActive && !sheetOpen ? 'page' : undefined} onClick={() => setSheetOpen(value => !value)}>
          <Icon name="grid_view" size={24} filled={moreActive} />
          <span>Mais</span>
        </button>
      </nav>
    </>
  )
}
