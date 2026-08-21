'use client'

import { ComponentProps, useEffect } from 'react'
import { ContextDrawerV2 as GeneralContextDrawer } from './ContextDrawerV3'

type Props = ComponentProps<typeof GeneralContextDrawer>

const COLORS: Record<string,string> = {
  Data: '#4f7cac',
  Prazo: '#4f7cac',
  Termina: '#5d79b8',
  Horário: '#875fb2',
  Duração: '#c27a3d',
  'Dia inteiro': '#388a83',
  Local: '#b85c76',
  Repetir: '#2f8a83',
  Meta: '#6d8a55',
  Unidade: '#75808b',
  Realizado: '#4c8b68',
  Valor: '#4b8b6c',
  Status: '#5779a6',
  Categoria: '#b27a35',
  Atual: '#438a8a',
  Alvo: '#7b63ad',
}

function normalizeValue(label: string, value: string, today: string) {
  const clean = value.trim()
  if (!clean || /^Sem (data|horário|local|unidade|categoria|prioridade)$/i.test(clean) || clean === 'Não repetir') return 'Não selecionado'
  if (label === 'Data' || label === 'Prazo' || label === 'Termina') {
    const todayLabel = new Date(`${today}T12:00:00`).toLocaleDateString('pt-BR', { day:'numeric', month:'short', year:'numeric' })
    if (clean === todayLabel) return 'Hoje'
  }
  return clean
}

export function GeneralContextDrawerV4(props: Props) {
  useEffect(() => {
    const update = () => {
      document.querySelectorAll<HTMLButtonElement>('.mai-context-v3-tool-button').forEach(button => {
        const title = button.getAttribute('title') || ''
        const parts = title.split(' · ')
        const label = parts.shift()?.trim() || ''
        const value = parts.join(' · ')
        button.dataset.value = normalizeValue(label, value, props.today)
        button.dataset.toolLabel = label
        button.style.setProperty('--mai-tool-color', COLORS[label] || '#687d62')
      })
    }

    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, { subtree:true, childList:true, attributes:true, attributeFilter:['title'] })
    return () => observer.disconnect()
  }, [props.today, props.item?.kind, props.item?.sourceId])

  return <GeneralContextDrawer {...props}/>
}
