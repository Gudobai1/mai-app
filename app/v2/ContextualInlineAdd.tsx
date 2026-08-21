'use client'

import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import type { AppView } from './app-types'
import styles from './ContextualInlineAdd.module.css'

type Props = {
  view: AppView
  onAdd: (type?: string) => void
}

type EmptyAction = { type: string; label: string }

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

function normalized(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function actionFromText(value: string): EmptyAction | null {
  const text = normalized(value)
  if (/tarefa/.test(text)) return { type: 'task', label: 'Adicionar tarefa' }
  if (/compromisso|evento/.test(text)) return { type: 'event', label: 'Adicionar compromisso' }
  if (/habito|rotina/.test(text)) return { type: 'habits', label: 'Adicionar hábito' }
  if (/meta/.test(text)) return { type: 'goals', label: 'Adicionar meta' }
  if (/lancamento|transacao|movimentacao|receita|despesa/.test(text)) return { type: 'finance', label: 'Adicionar lançamento' }
  if (/nota/.test(text)) return { type: 'notes', label: 'Adicionar nota' }
  if (/arquivo/.test(text)) return { type: 'files', label: 'Adicionar arquivo' }
  if (/registro|bem-estar|saude/.test(text)) return { type: 'health', label: 'Adicionar registro' }
  if (/nada programado|nada planejado/.test(text)) return { type: 'context', label: 'Adicionar' }
  return null
}

function actionForEmpty(node: HTMLElement): EmptyAction | null {
  const direct = actionFromText(node.textContent || '')
  if (direct) return direct
  const section = node.closest('section')
  const heading = section?.querySelector('h2,h3')?.textContent || ''
  return actionFromText(heading)
}

// O host é inserido no fluxo do módulo para substituir o antigo FAB global.
// Estados vazios conhecidos também viram uma ação local de adicionar, sem mensagem negativa.
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

  useEffect(() => {
    const workspace = document.querySelector('.mai-v3-workspace') as HTMLElement | null
    if (!workspace) return

    const decorate = () => {
      workspace.querySelectorAll<HTMLElement>('.mai-v3-empty-line').forEach(node => {
        const action = actionForEmpty(node)
        if (!action) {
          delete node.dataset.maiEmptyKind
          delete node.dataset.maiEmptyLabel
          node.removeAttribute('role')
          node.removeAttribute('tabindex')
          node.removeAttribute('aria-label')
          return
        }
        node.dataset.maiEmptyKind = action.type
        node.dataset.maiEmptyLabel = action.label
        node.setAttribute('role', 'button')
        node.setAttribute('tabindex', '0')
        node.setAttribute('aria-label', action.label)
      })
    }

    const activate = (target: EventTarget | null) => {
      const node = target instanceof Element ? target.closest<HTMLElement>('.mai-v3-empty-line[data-mai-empty-kind]') : null
      if (!node || !workspace.contains(node)) return false
      onAdd(node.dataset.maiEmptyKind || undefined)
      return true
    }

    const click = (event: Event) => {
      if (activate(event.target)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    const keydown = (event: Event) => {
      const keyboard = event as KeyboardEvent
      if (keyboard.key !== 'Enter' && keyboard.key !== ' ') return
      if (activate(keyboard.target)) {
        keyboard.preventDefault()
        keyboard.stopPropagation()
      }
    }

    decorate()
    const observer = new MutationObserver(decorate)
    observer.observe(workspace, { childList: true, subtree: true, characterData: true })
    workspace.addEventListener('click', click, true)
    workspace.addEventListener('keydown', keydown, true)
    return () => {
      observer.disconnect()
      workspace.removeEventListener('click', click, true)
      workspace.removeEventListener('keydown', keydown, true)
    }
  }, [view, onAdd])

  if (!host) return null

  return createPortal(
    <button type="button" className={styles.inlineAdd} onClick={() => onAdd()}>
      <span className="material-symbols-rounded" aria-hidden="true">add</span>
      <span>{labels[view] || 'Adicionar'}</span>
    </button>,
    host,
  )
}
