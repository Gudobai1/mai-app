'use client'

import { useEffect, useState } from 'react'
import styles from './ui.module.css'

const cx = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(' ')

/* Ícone de "Hoje": quadradinho com o dia do mês (muda sozinho a cada dia). Ativo = cheio. */
export function DayIcon({ size = 22, active = false, className }: { size?: number; active?: boolean; className?: string }) {
  const [day, setDay] = useState('')
  useEffect(() => {
    const update = () => setDay(String(new Date().getDate()))
    update()
    const timer = window.setInterval(update, 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <span aria-hidden="true" className={cx(styles.dayIcon, active && styles.dayIconOn, className)} style={{ width: size, height: size, fontSize: Math.round(size * 0.5), borderRadius: Math.max(4, Math.round(size / 5)) }}>
      {day}
    </span>
  )
}
