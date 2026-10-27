'use client'

import type { MaiState } from '../../../lib/v2/state'
import { Icon, IconButton } from '../../ds'
import type { AppView } from '../app-types'
import { COMPLETED_ITEM, NAV_GROUPS, todayCounts, type NavItem } from './nav'
import styles from './ModernShell.module.css'

type GoogleProfile = { name: string; picture?: string; email?: string } | null

type Props = {
  state: MaiState
  today: string
  view: AppView
  navigate: (view: AppView) => void
  onSearch: () => void
  onAdd: () => void
  onSettings: () => void
  profile?: GoogleProfile
}

export function ModernSidebar({ state, today, view, navigate, onSearch, onAdd, onSettings, profile }: Props) {
  const profileName = String(profile?.name || state.configs.profileName || state.configs.userName || 'Meu perfil')
  const profileInitial = profileName.trim().slice(0, 1).toLocaleUpperCase('pt-BR') || 'M'
  const counts = todayCounts(state, today)

  const renderItem = (item: NavItem) => {
    const active = view === item.id
    const badge = item.id === 'today' && counts.due > 0 ? counts.due : 0
    return (
      <button
        key={String(item.id)}
        type="button"
        className={styles.item}
        aria-current={active ? 'page' : undefined}
        onClick={() => navigate(item.id)}
      >
        <Icon name={item.icon} size={21} filled={active} />
        <span className={styles.itemLabel}>{item.label}</span>
        {badge ? (
          <span
            className={`${styles.badge} ${counts.overdue ? styles.badgeAlert : ''}`}
            title={counts.overdue ? `${counts.overdue} atrasada(s)` : undefined}
          >
            {badge}
          </span>
        ) : null}
      </button>
    )
  }

  return (
    <aside className={styles.sidebar} aria-label="Menu principal">
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden="true">M</span>
        <span className={styles.brandName}>MAI</span>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.search} onClick={onSearch}>
          <Icon name="search" size={20} filled={false} />
          <span>Buscar</span>
          <span className={styles.kbd}>Ctrl K</span>
        </button>
        <button type="button" className={styles.addButton} onClick={onAdd} aria-label="Adicionar" title="Adicionar (Q)">
          <Icon name="add" size={22} weight={600} />
        </button>
      </div>

      <nav className={styles.nav} aria-label="Áreas">
        {NAV_GROUPS.map(group => (
          <div key={group.label} className={styles.group}>
            <div className={styles.groupLabel}>{group.label}</div>
            {group.items.map(renderItem)}
          </div>
        ))}
      </nav>

      <div className={styles.footer}>
        {renderItem(COMPLETED_ITEM)}
        <div className={styles.profileRow}>
          <button type="button" className={styles.profile} onClick={onSettings} title={profile?.email || profileName}>
            <span className={styles.avatar}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {profile?.picture ? <img src={profile.picture} alt="" referrerPolicy="no-referrer" /> : profileInitial}
            </span>
            <span>{profileName}</span>
          </button>
          <IconButton icon="tune" label="Ajustes" variant="ghost" size={40} onClick={onSettings} />
        </div>
      </div>
    </aside>
  )
}
