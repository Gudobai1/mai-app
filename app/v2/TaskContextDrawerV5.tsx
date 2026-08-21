'use client'

import { useEffect } from 'react'
import type { ComponentProps } from 'react'
import { TaskContextDrawerV4 } from './TaskContextDrawerV4'

type Props = ComponentProps<typeof TaskContextDrawerV4>

function normalizeToolTitle(title: string, today: string) {
  if (!title.includes(' · ')) return title || 'Não selecionado'
  const [label, ...parts] = title.split(' · ')
  let value = parts.join(' · ').trim()

  if (value === 'Sem data' || value === 'Sem horário' || value === 'Sem prioridade' || value === 'Não repetir' || !value) {
    return 'Não selecionado'
  }

  if (label === 'Data') {
    const todayLabel = new Date(`${today}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
    if (value === todayLabel) return 'Hoje'
  }

  return value
}

export function TaskContextDrawerV5(props: Props) {
  useEffect(() => {
    const updateLabels = () => {
      document.querySelectorAll<HTMLButtonElement>('.mai-task-v4-tool-button').forEach(button => {
        const current = button.getAttribute('title') || ''
        const normalized = normalizeToolTitle(current, props.today)
        if (current !== normalized) button.setAttribute('title', normalized)
      })
    }

    updateLabels()
    const observer = new MutationObserver(updateLabels)
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] })
    return () => observer.disconnect()
  }, [props.today, props.item?.sourceId])

  return <TaskContextDrawerV4 {...props} />
}
