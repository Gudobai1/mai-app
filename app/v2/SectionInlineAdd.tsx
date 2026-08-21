'use client'

import { useEffect, useRef } from 'react'
import type { AppView } from './app-types'
import styles from './ContextualInlineAdd.module.css'

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
  return null
}

function fallback(view: AppView): SectionAction | null {
  const text = String(view)
  if (text === 'tasks') return { type: 'task', label: 'Adicionar tarefa' }
  if (text === 'habits') return { type: 'habits', label: 'Adicionar hábito' }
  if (text === 'goals') return { type: 'goals', label: 'Adicionar meta' }
  if (text === 'notes') return { type: 'notes', label: 'Adicionar nota' }
  if (text === 'finance') return { type: 'finance', label: 'Adicionar lançamento' }
  if (text === 'health') return { type: 'health', label: 'Adicionar registro' }
  if (text === 'files') return { type: 'files', label: 'Adicionar arquivo' }
  if (text === 'upcoming') return { type: 'context', label: 'Adicionar' }
  return null
}

function listIn(section: HTMLElement): HTMLElement | null {
  const selectors = [
    '.mai-today-unified-list',
    '.mai-v3-task-list',
    '.mai-v3-simple-list',
    '.mai-v3-finance-rows',
    '.mai-v3-note-list',
    '.mai-v3-file-list',
    '.mai-v3-health-list',
    '.mai-v3-month-list',
  ]
  for (const selector of selectors) {
    const node = section.querySelector<HTMLElement>(selector)
    if (node) return node
  }
  return null
}

function actionFor(section: HTMLElement, view: AppView): SectionAction | null {
  const heading = section.querySelector('h2,h3')?.textContent || ''
  const byHeading = fromText(heading)
  if (byHeading) return byHeading

  const empty = section.querySelector<HTMLElement>('.mai-v3-empty-line')
  const byEmpty = empty ? fromText(empty.textContent || '') : null
  if (byEmpty) return byEmpty

  return fallback(view)
}

export function SectionInlineAdd({ view, onAdd }: Props) {
  const addRef = useRef(onAdd)
  useEffect(() => { addRef.current = onAdd }, [onAdd])

  useEffect(() => {
    const workspace = document.querySelector('.mai-v3-workspace') as HTMLElement | null
    if (!workspace) return

    const hosts = new Set<HTMLElement>()

    const clear = () => {
      hosts.forEach(host => host.remove())
      hosts.clear()
      workspace.querySelectorAll<HTMLElement>('.mai-v3-empty-line[data-mai-empty-hidden="true"]').forEach(node => {
        node.removeAttribute('data-mai-empty-hidden')
      })
    }

    const decorate = () => {
      clear()

      workspace.querySelectorAll<HTMLElement>('section').forEach(section => {
        const list = listIn(section)
        if (!list) return
        const action = actionFor(section, view)
        if (!action) return

        list.querySelectorAll<HTMLElement>('.mai-v3-empty-line').forEach(node => {
          node.dataset.maiEmptyHidden = 'true'
        })

        const host = document.createElement('div')
        host.className = 'mai-section-inline-add-host'
        host.dataset.kind = action.type

        const button = document.createElement('button')
        button.type = 'button'
        button.className = styles.inlineAdd
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
        list.insertAdjacentElement('afterend', host)
        hosts.add(host)
      })
    }

    decorate()
    const observer = new MutationObserver(() => decorate())
    observer.observe(workspace, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      clear()
    }
  }, [view])

  return null
}
