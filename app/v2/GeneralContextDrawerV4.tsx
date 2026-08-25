'use client'

import { ComponentProps, useEffect, useRef } from 'react'
import { ContextDrawerV2 as GeneralContextDrawer } from './ContextDrawerV3'

type Props = ComponentProps<typeof GeneralContextDrawer>
type Row = Record<string, any>
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const dateKey = (value: unknown) => String(value || '').slice(0,10)
const paid = (value: unknown) => ['pago','paga','quitado','quitada','concluido','concluida'].includes(String(value || '').toLocaleLowerCase('pt-BR'))
const concluded = (value: unknown) => String(value || '').toLocaleLowerCase('pt-BR').includes('conclu')

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
  const item = props.item
  const autosaveTimer = useRef<number | null>(null)
  const itemDate = item?.date || (item?.kind === 'event' ? dateKey(item.raw.data_inicio) : item?.kind === 'finance' ? dateKey(item.raw.data) : props.today)

  const isCompleted = (() => {
    if (!item) return false
    if (item.kind === 'event') return rows(props.state.eventCompletions).some(entry => String(entry.evento_id || String(entry.chave || '').split('|')[0]) === item.sourceId && dateKey(entry.data || String(entry.chave || '').split('|')[1]) === itemDate && entry.concluida !== false)
    if (item.kind === 'habit') {
      const entry = rows(props.state.habitEntries).find(row => String(row.habito_id) === item.sourceId && dateKey(row.data) === itemDate)
      return Number(entry?.valor || 0) >= Math.max(1, Number(item.raw.meta || 1))
    }
    if (item.kind === 'finance') return paid(item.raw.status)
    if (item.kind === 'goal') return item.raw.concluida === true || concluded(item.raw.status)
    if (item.kind === 'note') return item.raw.concluida === true || concluded(item.raw.status)
    return false
  })()

  function toggleCompleted() {
    if (!item) return
    const now = new Date().toISOString()
    if (item.kind === 'event') {
      props.commit(current => {
        const currentRows = rows(current.eventCompletions)
        const filtered = currentRows.filter(entry => !(String(entry.evento_id || String(entry.chave || '').split('|')[0]) === item.sourceId && dateKey(entry.data || String(entry.chave || '').split('|')[1]) === itemDate))
        if (isCompleted) return { ...current, eventCompletions: filtered }
        const key = `${item.sourceId}|${itemDate}|${String(item.raw.hora_inicio || '')}`
        return { ...current, eventCompletions:[...filtered,{ id:`event-done-${crypto.randomUUID()}`, evento_id:item.sourceId, data:itemDate, chave:key, concluida:true, concluida_em:now }] }
      })
    } else if (item.kind === 'habit') {
      props.commit(current => {
        const currentRows = rows(current.habitEntries)
        const existing = currentRows.find(entry => String(entry.habito_id) === item.sourceId && dateKey(entry.data) === itemDate)
        const filtered = currentRows.filter(entry => !(String(entry.habito_id) === item.sourceId && dateKey(entry.data) === itemDate))
        if (isCompleted) return { ...current, habitEntries:filtered }
        return { ...current, habitEntries:[...filtered,{ id:existing?.id || `hr-${crypto.randomUUID()}`, habito_id:item.sourceId, data:itemDate, valor:Math.max(1,Number(item.raw.meta || 1)), criado_em:existing?.criado_em || now, concluida_em:now }] }
      })
    } else if (item.kind === 'finance') {
      props.commit(current => ({ ...current, finance:{ ...current.finance, transactions:rows(current.finance.transactions).map(tx => String(tx.id) === item.sourceId ? { ...tx, status:isCompleted?'pendente':'pago', valor_pago:isCompleted?0:Number(tx.valor || 0), concluida_em:isCompleted?'':now } : tx) } }))
    } else if (item.kind === 'goal') {
      props.commit(current => ({ ...current, goals:rows(current.goals).map(goal => String(goal.id) === item.sourceId ? { ...goal, status:isCompleted?'Em Andamento':'Concluída', concluida:!isCompleted, concluida_em:isCompleted?'':now } : goal) }))
    } else if (item.kind === 'note') {
      props.commit(current => ({ ...current, notes:rows(current.notes).map(note => String(note.id) === item.sourceId ? { ...note, concluida:!isCompleted, status:isCompleted?'':'Concluída', concluida_em:isCompleted?'':now } : note) }))
    }
    props.onClose()
  }

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

  useEffect(() => {
    if (!item || item.kind === 'task') return
    let button: HTMLButtonElement | null = null
    let cancelled = false
    const mount = () => {
      if (cancelled) return
      const footer = document.querySelector<HTMLElement>('.mai-context-v3-footer')
      const drawer = document.querySelector<HTMLElement>('.mai-context-v3-drawer')
      if (drawer) drawer.dataset.maiAutosave = 'true'
      if (!footer || footer.querySelector('.mai-context-v3-complete')) return
      button = document.createElement('button')
      button.type = 'button'
      button.className = 'mai-context-v3-complete'
      button.innerHTML = `<span class="material-symbols-rounded">${isCompleted ? 'undo' : 'check_circle'}</span><span>${isCompleted ? 'Reabrir' : 'Concluir'}</span>`
      button.addEventListener('click', toggleCompleted)
      footer.insertBefore(button, footer.firstChild)
    }
    const raf = requestAnimationFrame(mount)
    const observer = new MutationObserver(mount)
    observer.observe(document.body,{childList:true,subtree:true})
    return () => { cancelled = true; cancelAnimationFrame(raf); observer.disconnect(); if (button) { button.removeEventListener('click', toggleCompleted); button.remove() } }
  }, [item?.kind,item?.sourceId,itemDate,isCompleted])

  useEffect(() => {
    if (!item || item.kind === 'task') return

    const schedule = () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
      autosaveTimer.current = window.setTimeout(() => {
        const form = document.querySelector<HTMLFormElement>('.mai-context-v3-form')
        if (form) form.requestSubmit()
      }, item.kind === 'event' ? 650 : 280)
    }

    const insideDrawer = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('.mai-context-v3-drawer'))
    const onInput = (event: Event) => { if (insideDrawer(event.target)) schedule() }
    const onChange = (event: Event) => { if (insideDrawer(event.target)) schedule() }
    const onClick = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      if (target.closest('.mai-context-v3-delete')) {
        window.setTimeout(() => props.onClose(), 0)
        return
      }
      if (target.closest('.mai-context-v3-popover-body button')) window.setTimeout(schedule, 0)
      if (target.closest('.mai-context-v3-close')) props.onClose()
    }
    const onBackdrop = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.classList.contains('mai-context-v3-layer')) props.onClose()
    }

    document.addEventListener('input', onInput, true)
    document.addEventListener('change', onChange, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('mousedown', onBackdrop, true)

    return () => {
      if (autosaveTimer.current) {
        window.clearTimeout(autosaveTimer.current)
        const form = document.querySelector<HTMLFormElement>('.mai-context-v3-form')
        if (form) form.requestSubmit()
      }
      document.removeEventListener('input', onInput, true)
      document.removeEventListener('change', onChange, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('mousedown', onBackdrop, true)
    }
  }, [item?.kind,item?.sourceId])

  return <GeneralContextDrawer {...props} onClose={() => {}}/>
}
