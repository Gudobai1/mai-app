'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../ds'
import styles from './QuickMenu.module.css'

/**
 * Edição rápida: botão direito no computador, tocar e segurar no celular.
 * No computador abre um menu ao lado do cursor; no celular, uma folha que
 * sobe de baixo.
 */

export type QuickOption = {
  label: string
  icon?: string
  color?: string
  active?: boolean
  tone?: 'danger'
  onSelect: () => void | Promise<void>
}

/** Grupo em linha (datas, prioridade) ou lista de ações. */
export type QuickGroup = { label?: string; inline?: boolean; options: QuickOption[] }

export type QuickMenuConfig = { title: string; subtitle?: string; groups: QuickGroup[] }

type OpenMenu = QuickMenuConfig & { x: number; y: number; sheet: boolean }

const LONG_PRESS_MS = 450
const MOVE_TOLERANCE = 8

export function useQuickMenu() {
  const [menu, setMenu] = useState<OpenMenu | null>(null)
  const press = useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null)
  const suppressClick = useRef(false)

  const close = useCallback(() => setMenu(null), [])

  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer)
    press.current = null
  }

  /** Props para espalhar no elemento do item. `build` monta as opções na hora. */
  const bind = (build: () => QuickMenuConfig) => ({
    onContextMenu: (event: ReactMouseEvent) => {
      event.preventDefault()
      const touchLike = press.current?.fired
      cancelPress()
      if (touchLike) return
      setMenu({ ...build(), x: event.clientX, y: event.clientY, sheet: window.matchMedia('(max-width: 900px)').matches })
    },
    onPointerDown: (event: ReactPointerEvent) => {
      if (event.pointerType === 'mouse') return
      cancelPress()
      const x = event.clientX
      const y = event.clientY
      press.current = {
        x, y, fired: false,
        timer: window.setTimeout(() => {
          if (!press.current) return
          press.current.fired = true
          suppressClick.current = true
          try { window.getSelection()?.removeAllRanges() } catch {}
          try { navigator.vibrate?.(12) } catch {}
          setMenu({ ...build(), x, y, sheet: true })
        }, LONG_PRESS_MS),
      }
    },
    onPointerMove: (event: ReactPointerEvent) => {
      const current = press.current
      if (!current || current.fired) return
      if (Math.abs(event.clientX - current.x) > MOVE_TOLERANCE || Math.abs(event.clientY - current.y) > MOVE_TOLERANCE) cancelPress()
    },
    onPointerUp: () => {
      if (press.current && !press.current.fired) cancelPress()
      else if (press.current?.fired) window.setTimeout(cancelPress, 0)
    },
    onPointerCancel: cancelPress,
    onClickCapture: (event: ReactMouseEvent) => {
      if (!suppressClick.current) return
      suppressClick.current = false
      event.preventDefault()
      event.stopPropagation()
    },
  })

  const element = menu ? <QuickMenuView menu={menu} onClose={close} /> : null
  return { bind, element, close, isOpen: Boolean(menu) }
}

function QuickMenuView({ menu, onClose }: { menu: OpenMenu; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const openedAt = useRef(Date.now())
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (menu.sheet || !panelRef.current) return
    const rect = panelRef.current.getBoundingClientRect()
    const margin = 10
    const left = Math.max(margin, Math.min(menu.x, window.innerWidth - rect.width - margin))
    const top = Math.max(margin, Math.min(menu.y, window.innerHeight - rect.height - margin))
    setPosition({ left, top })
  }, [menu])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    const onScroll = () => { if (!menu.sheet) onClose() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [menu.sheet, onClose])

  useEffect(() => {
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  }, [])

  const run = (option: QuickOption) => {
    onClose()
    option.onSelect()
  }

  const body = (
    <div
      className={styles.layer}
      data-sheet={menu.sheet || undefined}
      // Fecha no clique (e não ao encostar), para o toque fora não chegar ao item de baixo.
      onClick={event => {
        event.stopPropagation()
        if (event.target !== event.currentTarget) return
        if (Date.now() - openedAt.current < 350) return
        onClose()
      }}
      onPointerDown={event => event.stopPropagation()}
      onContextMenu={event => { event.preventDefault(); onClose() }}
    >
      <div
        ref={panelRef}
        role="menu"
        aria-label={`Edição rápida: ${menu.title}`}
        className={styles.panel}
        style={menu.sheet ? undefined : position ? { left: position.left, top: position.top } : { left: menu.x, top: menu.y, visibility: 'hidden' }}
      >
        {menu.sheet ? <div className={styles.handle} aria-hidden="true" /> : null}
        <div className={styles.head}>
          <strong className={styles.title}>{menu.title}</strong>
          {menu.subtitle ? <span className={styles.subtitle}>{menu.subtitle}</span> : null}
        </div>
        {menu.groups.filter(group => group.options.length).map((group, index) => (
          <div key={group.label || index} className={styles.group}>
            {group.label ? <span className={styles.groupLabel}>{group.label}</span> : null}
            <div className={group.inline ? styles.inline : styles.list}>
              {group.options.map(option => (
                <button
                  key={option.label}
                  type="button"
                  role="menuitem"
                  className={`${group.inline ? styles.chip : styles.action} ${option.tone === 'danger' ? styles.danger : ''}`}
                  data-active={option.active || undefined}
                  onClick={() => run(option)}
                >
                  {option.icon ? <Icon name={option.icon} size={group.inline ? 16 : 19} style={option.color ? { color: option.color } : undefined} /> : null}
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return typeof document === 'undefined' ? null : createPortal(body, document.body)
}
