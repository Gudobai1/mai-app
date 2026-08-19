'use client'

import { useEffect, useState } from 'react'

export const MAI_COLOR_PRESETS = [
  { value: '#60765a', label: 'Sálvia' },
  { value: '#486b8a', label: 'Azul' },
  { value: '#4f5b57', label: 'Grafite' },
  { value: '#9b7757', label: 'Areia' },
  { value: '#765d82', label: 'Ameixa' },
  { value: '#a85f4f', label: 'Terracota' },
  { value: '#397b78', label: 'Petróleo' },
  { value: '#a26373', label: 'Rosa queimado' },
  { value: '#b28335', label: 'Mostarda' },
  { value: '#6d788e', label: 'Ardósia' },
] as const

type Target = { element: HTMLInputElement; left: number; top: number } | null

export function UxController() {
  const [target, setTarget] = useState<Target>(null)

  useEffect(() => {
    const open = (event: MouseEvent) => {
      const element = event.target as HTMLElement | null
      const input = element?.closest?.('input[type="color"]') as HTMLInputElement | null
      if (!input) return
      event.preventDefault(); event.stopPropagation()
      const rect = input.getBoundingClientRect()
      setTarget({ element: input, left: Math.min(window.innerWidth - 270, Math.max(12, rect.left)), top: Math.min(window.innerHeight - 190, rect.bottom + 7) })
    }
    document.addEventListener('click', open, true)
    return () => document.removeEventListener('click', open, true)
  }, [])

  function choose(value: string) {
    if (!target) return
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(target.element, value)
    target.element.dispatchEvent(new Event('input', { bubbles: true }))
    target.element.dispatchEvent(new Event('change', { bubbles: true }))
    setTarget(null)
  }

  if (!target) return null
  return <div className="mai-preset-layer" onMouseDown={() => setTarget(null)}>
    <section className="mai-preset-popover" style={{ left: target.left, top: target.top }} onMouseDown={event => event.stopPropagation()}>
      <header><strong>Escolha uma cor</strong><button type="button" onClick={() => setTarget(null)}>×</button></header>
      <div>{MAI_COLOR_PRESETS.map(color => <button type="button" key={color.value} title={color.label} data-active={target.element.value.toLowerCase() === color.value.toLowerCase()} onClick={() => choose(color.value)}><i style={{ background: color.value }} /><span>{color.label}</span></button>)}</div>
    </section>
  </div>
}
