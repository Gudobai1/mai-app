'use client'

import { useEffect, useRef } from 'react'
import type { AppView } from './app-types'
import styles from './SectionInlineAdd.module.css'

type Props = {
  view: AppView
  onAdd: (type?: string) => void
}

type SectionAction = { type: string; label: string }

const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

function fromText(value: string): SectionAction | null {
  const text = normalized(value)
  if (/compromisso|evento/.test(text)) return { type: 'event', label: 'Adicionar compromisso' }
  if (/tarefa/.test(text)) return { type: 'task', label: 'Adicionar tarefa' }
  if (/habito|rotina/.test(text)) return { type: 'habits', label: 'Adicionar hábito' }
  if (/meta/.test(text)) return { type: 'goals', label: 'Adicionar meta' }
  if (/lancamento|transacao|movimentacao|receita|despesa/.test(text)) return { type: 'finance', label: 'Adicionar lançamento' }
  if (/nota/.test(text)) return { type: 'notes', label: 'Adicionar nota' }
  if (/arquivo/.test(text)) return { type: 'files', label: 'Adicionar arquivo' }
  if (/registro|bem-estar|saude/.test(text)) return { type: 'health', label: 'Adicionar registro' }
  if (/nada programado|nada planejado|nenhum item/.test(text)) return { type: 'context', label: 'Adicionar' }
  return null
}

function fallback(view: AppView, scope?: HTMLElement | null): SectionAction | null {
  const text = String(view)
  if (text === 'tasks' || text === 'completed') return null
  if (text === 'habits') return { type: 'habits', label: 'Adicionar hábito' }
  if (text === 'goals') return { type: 'goals', label: 'Adicionar meta' }
  if (text === 'notes') return { type: 'notes', label: 'Adicionar nota' }
  if (text === 'finance') return scope?.querySelector('.mai-v3-finance-rows') || scope?.classList.contains('mai-v3-finance-rows') ? { type: 'finance', label: 'Adicionar lançamento' } : null
  if (text === 'health') return { type: 'health', label: 'Adicionar registro' }
  if (text === 'files') return { type: 'files', label: 'Adicionar arquivo' }
  if (text === 'upcoming') return { type: 'context', label: 'Adicionar' }
  return null
}

const listSelectors = [
  '.mai-today-unified-list',
  '.mai-v3-task-list',
  '.mai-v3-simple-list',
  '.mai-v3-finance-rows',
  '.mai-v3-note-list',
  '.mai-v3-file-list',
  '.mai-v3-file-grid',
  '.mai-v3-health-rows',
  '.mai-v3-week-grid',
  '.mai-v3-report-list',
  '.mai-v3-goal-groups section > div',
]

function listIn(section: HTMLElement): HTMLElement | null {
  for (const selector of listSelectors) {
    const node = section.querySelector<HTMLElement>(selector)
    if (node) return node
  }

  const directRows = Array.from(section.children).filter((child): child is HTMLElement => child instanceof HTMLElement && (child.classList.contains('mai-item-row-v2') || child.classList.contains('mai-v3-upcoming-item')))
  if (directRows.length) return directRows[directRows.length - 1]

  if (section.parentElement?.classList.contains('mai-v3-month-list') || section.parentElement?.classList.contains('mai-v3-upcoming-scroll')) {
    return section.querySelector<HTMLElement>('header')
  }

  return null
}

function actionFor(section: HTMLElement, view: AppView): SectionAction | null {
  if (view === 'tasks' || view === 'completed') return null
  const heading = section.querySelector('h2,h3')?.textContent || section.querySelector('header')?.textContent || ''
  const byHeading = fromText(heading)
  if (byHeading) return byHeading

  const empty = section.querySelector<HTMLElement>('.mai-v3-empty-line,.mai-empty-day')
  const byEmpty = empty ? fromText(empty.textContent || '') : null
  if (byEmpty && byEmpty.type !== 'context') return byEmpty

  return fallback(view, section) || byEmpty
}

export function SectionInlineAdd({ view, onAdd }: Props) {
  const addRef = useRef(onAdd)
  useEffect(() => { addRef.current = onAdd }, [onAdd])

  useEffect(() => {
    if (view === 'tasks' || view === 'completed') return
    const workspace = document.querySelector('.mai-v3-workspace') as HTMLElement | null
    if (!workspace) return

    const hosts = new Set<HTMLElement>()
    const handledAnchors = new Set<HTMLElement>()
    let observer: MutationObserver | null = null

    const clear = () => {
      hosts.forEach(host => host.remove())
      hosts.clear()
      handledAnchors.clear()
      workspace.querySelectorAll<HTMLElement>('[data-mai-empty-hidden="true"]').forEach(node => {
        node.removeAttribute('data-mai-empty-hidden')
      })
    }

    const makeHost = (anchor: HTMLElement, action: SectionAction) => {
      if (handledAnchors.has(anchor)) return
      handledAnchors.add(anchor)

      const host = document.createElement('div')
      host.className = `${styles.host} mai-section-inline-add-host`
      host.dataset.kind = action.type

      const button = document.createElement('button')
      button.type = 'button'
      button.className = styles.button
      button.setAttribute('aria-label', action.label)

      const icon = document.createElement('span')
      icon.className = 'material-symbols-rounded'
      icon.setAttribute('aria-hidden', 'true')
      icon.textContent = 'add'

      const label = document.createElement('span')
      label.textContent = action.label

      button.append(icon, label)
      button.addEventListener('click', event => {
        event.preventDefault()
        event.stopPropagation()
        addRef.current(action.type)
      })
      host.appendChild(button)
      anchor.insertAdjacentElement('afterend', host)
      hosts.add(host)
    }

    const decorate = () => {
      clear()

      workspace.querySelectorAll<HTMLElement>('section').forEach(section => {
        const anchor = listIn(section)
        if (!anchor) return
        const action = actionFor(section, view)
        if (!action) return

        section.querySelectorAll<HTMLElement>('.mai-v3-empty-line,.mai-empty-day').forEach(node => {
          node.dataset.maiEmptyHidden = 'true'
        })
        makeHost(anchor, action)
      })

      for (const selector of listSelectors) {
        workspace.querySelectorAll<HTMLElement>(selector).forEach(list => {
          if (list.closest('section')) return
          const action = fallback(view, list)
          if (!action) return
          list.querySelectorAll<HTMLElement>('.mai-v3-empty-line,.mai-empty-day').forEach(node => {
            node.dataset.maiEmptyHidden = 'true'
          })
          makeHost(list, action)
        })
      }

      workspace.querySelectorAll<HTMLElement>('.mai-v3-empty-line').forEach(empty => {
        if (empty.dataset.maiEmptyHidden === 'true' || empty.closest('section')) return
        const action = fromText(empty.textContent || '') || fallback(view, empty.parentElement)
        if (!action) return
        empty.dataset.maiEmptyHidden = 'true'
        makeHost(empty, action)
      })
    }

    const observe = () => observer?.observe(workspace, { childList: true, subtree: true })
    observer = new MutationObserver(() => {
      observer?.disconnect()
      decorate()
      observe()
    })

    decorate()
    observe()

    return () => {
      observer?.disconnect()
      clear()
    }
  }, [view])

  return null
}
