'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../ds'
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
}

type Request = ConfirmOptions & { resolve: (value: boolean) => void }

let show: ((request: Request) => void) | null = null

export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise(resolve => {
    if (!show) {
      // Sem o anfitrião montado (não deveria acontecer): segue o caminho seguro.
      resolve(options.cancelLabel === null ? true : window.confirm(options.title))
      return
    }
    show({ ...options, resolve })
  })
}

export function notify(title: string, message?: string) {
  return askConfirm({ title, message, cancelLabel: null, confirmLabel: 'Entendi', icon: 'error', tone: 'default' })
}

export function ConfirmHost() {
  const [request, setRequest] = useState<Request | null>(null)
  const confirmRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    show = next => setRequest(current => {
      current?.resolve(false)
      return next
    })
    return () => { show = null }
  }, [])

  useEffect(() => {
    if (!request) return
    confirmRef.current?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [request]) // eslint-disable-line react-hooks/exhaustive-deps

  function finish(value: boolean) {
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
        <div className={styles.buttons}>
          {request.cancelLabel === null ? null : <button type="button" className={styles.cancel} onClick={() => finish(false)}>{request.cancelLabel || 'Cancelar'}</button>}
          <button ref={confirmRef} type="button" className={styles.confirm} data-danger={danger || undefined} onClick={() => finish(true)}>{request.confirmLabel || (danger ? 'Excluir' : 'Confirmar')}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
