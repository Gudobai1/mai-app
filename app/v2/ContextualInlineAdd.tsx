'use client'

import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import type { AppView } from './app-types'
import styles from './ContextualInlineAdd.module.css'

type Props = {
  view: AppView
  onAdd: () => void
}

const labels: Partial<Record<AppView,string>> = {
  today: 'Adicionar',
  upcoming: 'Adicionar',
  tasks: 'Adicionar tarefa',
  habits: 'Adicionar hábito',
  goals: 'Adicionar meta',
  notes: 'Adicionar nota',
  finance: 'Adicionar lançamento',
  health: 'Adicionar registro',
  files: 'Adicionar arquivo',
}

function findAnchor(view: AppView): Element | null {
  if (view === 'today') return document.querySelector('.mai-v4-today-header-wrap')
  if (view === 'tasks') return document.querySelector('.mai-v4-tasks-module-head')
  if (view === 'upcoming') return document.querySelector('.mai-v3-upcoming-header')

  const workspace = document.querySelector('.mai-v3-workspace')
  if (!workspace) return null
  return workspace.querySelector('.mai-v3-area-tabs')
    || workspace.querySelector('.mai-v3-area-header')
    || workspace.querySelector('.mai-v3-advanced-banner')
}

// O host é inserido no fluxo do módulo para substituir o antigo FAB global.
export function ContextualInlineAdd({ view, onAdd }: Props) {
  const [host, setHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    let currentHost: HTMLElement | null = null
    let raf = 0

    const mount = () => {
      const anchor = findAnchor(view)
      if (!anchor) return false

      currentHost?.remove()
      currentHost = document.createElement('div')
      currentHost.className = 'mai-contextual-inline-add-host'
      currentHost.setAttribute('data-view', String(view))
      anchor.insertAdjacentElement('afterend', currentHost)
      setHost(currentHost)
      return true
    }

    raf = requestAnimationFrame(() => {
      if (mount()) return
      const observer = new MutationObserver(() => {
        if (mount()) observer.disconnect()
      })
      const workspace = document.querySelector('.mai-v3-workspace')
      if (workspace) observer.observe(workspace, { childList: true, subtree: true })
      window.setTimeout(() => observer.disconnect(), 1500)
    })

    return () => {
      cancelAnimationFrame(raf)
      currentHost?.remove()
      setHost(null)
    }
  }, [view])

  if (!host) return null

  return createPortal(
    <button type="button" className={styles.inlineAdd} onClick={onAdd}>
      <span className="material-symbols-rounded" aria-hidden="true">add</span>
      <span>{labels[view] || 'Adicionar'}</span>
    </button>,
    host,
  )
}
