'use client'

import { Icon } from '../../ds'
import type { AppView } from '../app-types'
import styles from './ModuleTabs.module.css'

/** Abas dentro de um módulo (hoje: Hábitos | Bem-estar, que ficam no mesmo item do menu). */
export function ModuleTabs({ tabs, view, navigate }: { tabs: { id: AppView; label: string; icon: string }[]; view: AppView; navigate: (view: AppView) => void }) {
  return (
    <div className={styles.tabs} role="tablist">
      {tabs.map(tab => (
        <button key={String(tab.id)} type="button" role="tab" aria-selected={view === tab.id} data-active={view === tab.id || undefined} onClick={() => navigate(tab.id)}>
          <Icon name={tab.icon} size={17} filled={false} />{tab.label}
        </button>
      ))}
    </div>
  )
}
