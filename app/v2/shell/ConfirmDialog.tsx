'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IonIcon as Icon } from '../../ds'
import { CreateCalendarPicker } from '../CreateDrawerTools'
import { MoneyPad } from '../MoneyInput'
import styles from './ConfirmDialog.module.css'

/**
 * Confirmações e avisos do próprio MAI (no lugar das caixas do navegador).
 * Uso: `if (!(await askConfirm({ title: 'Excluir tarefa?' }))) return`
 */

export type ConfirmOptions = {
  title: string
  message?: string
  confirmLabel?: string
  /** `null` mostra só um botão (aviso). */
  cancelLabel?: string | null
  tone?: 'danger' | 'default'
  icon?: string
  /** Terceira opção (ex.: Descartar), entre cancelar e confirmar. */
  extraLabel?: string
  /** Campo de texto, número ou data (calendário do app). */
  input?: { value?: string; placeholder?: string; kind?: 'text' | 'money' | 'date'; today?: string }
}

type Answer = boolean | 'extra' | string
type Request = ConfirmOptions & { resolve: (value: Answer) => void }

let show: ((request: Request) => void) | null = null

/** Três saídas: 'confirm', 'extra' (ex.: descartar) ou 'cancel' (continuar editando). */
export async function askChoice(options: ConfirmOptions): Promise<'confirm' | 'extra' | 'cancel'> {
  const answer = await new Promise<Answer>(resolve => {
    if (!show) { resolve(window.confirm(options.title)); return }
    show({ ...options, resolve })
  })
  return answer === 'extra' ? 'extra' : answer ? 'confirm' : 'cancel'
}

export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise(resolve => {
    if (!show) {
      // Sem o anfitrião montado (não deveria acontecer): segue o caminho seguro.
      resolve(options.cancelLabel === null ? true : window.confirm(options.title))
      return
    }
    show({ ...options, resolve: value => resolve(value === true) })
  })
}

/** Pergunta um texto, valor ou data no diálogo do app. `null` se cancelar. */
export function askText(options: ConfirmOptions): Promise<string | null> {
  return new Promise(resolve => {
    if (!show) { resolve(null); return }
    show({ ...options, resolve: value => resolve(typeof value === 'string' ? value : null) })
  })
}

export function notify(title: string, message?: string) {
  return askConfirm({ title, message, cancelLabel: null, confirmLabel: 'Entendi', icon: 'error', tone: 'default' })
}

export function ConfirmHost() {
  const [request, setRequest] = useState<Request | null>(null)
  const confirmRef = useRef<HTMLButtonElement | null>(null)
  const [text, setText] = useState('')

  useEffect(() => {
    show = next => setRequest(current => {
      current?.resolve(false)
      setText(next.input?.value ?? '')
      return next
    })
    return () => { show = null }
  }, [])

  useEffect(() => {
    if (!request) return
    if (!request.input) confirmRef.current?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [request]) // eslint-disable-line react-hooks/exhaustive-deps

  function finish(value: Answer) {
    if (!request) return
    request.resolve(value)
    setRequest(null)
  }

  if (!request || typeof document === 'undefined') return null
  const danger = request.tone !== 'default'
  const icon = request.icon || (danger ? 'delete' : 'help')

  return createPortal(
    <div className={styles.layer} onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) finish(false) }} onPointerDown={event => event.stopPropagation()}>
      <div className={styles.card} role="alertdialog" aria-modal="true" aria-labelledby="mai-confirm-title" aria-describedby={request.message ? 'mai-confirm-message' : undefined}>
        <span className={styles.icon} data-danger={danger || undefined}><Icon name={icon} size={22} /></span>
        <h2 id="mai-confirm-title" className={styles.title}>{request.title}</h2>
        {request.message ? <p id="mai-confirm-message" className={styles.message}>{request.message}</p> : null}
        {request.input?.kind === 'date' ? <CreateCalendarPicker allowEmpty={false} value={text} today={request.input.today || text} onChange={value => finish(value)} close={() => undefined} /> : request.input?.kind === 'money' ? <MoneyPad value={Number(text.replace(/\./g, '').replace(',', '.')) || 0} onChange={value => setText(value ? value.toFixed(2).replace('.', ',') : '')} onEnter={() => finish(text)} /> : request.input ? <input className={styles.field} autoFocus value={text} placeholder={request.input.placeholder} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); finish(text) } }} /> : null}
        <div className={styles.buttons}>
          {request.cancelLabel === null ? null : <button type="button" className={styles.cancel} onClick={() => finish(false)}>{request.cancelLabel || 'Cancelar'}</button>}
          {request.extraLabel ? <button type="button" className={styles.cancel} data-extra="" onClick={() => finish('extra')}>{request.extraLabel}</button> : null}
          <button ref={confirmRef} type="button" className={styles.confirm} data-danger={danger || undefined} onClick={() => finish(request.input ? text : true)}>{request.confirmLabel || (danger ? 'Excluir' : 'Confirmar')}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
