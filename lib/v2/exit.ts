/** Guarda o último item (linha de lista) tocado, para animar a saída ao excluir/arquivar. */
let lastItem: { el: Element; at: number } | null = null

export function trackItems() {
  const remember = (event: Event) => {
    const target = event.target as Element | null
    const el = target?.closest?.('[role="listitem"]')
    if (el) lastItem = { el, at: Date.now() }
  }
  const burst = (event: Event) => {
    const box = (event.target as Element | null)?.closest?.('[role="checkbox"]') as HTMLElement | null
    if (!box || box.getAttribute('aria-checked') === 'true' || (box as HTMLButtonElement).disabled) return
    burstAt(box)
  }
  document.addEventListener('pointerdown', remember, true)
  document.addEventListener('contextmenu', remember, true)
  document.addEventListener('click', burst, true)
  return () => { document.removeEventListener('pointerdown', remember, true); document.removeEventListener('contextmenu', remember, true); document.removeEventListener('click', burst, true) }
}

/** Explosão minimalista: pontinhos que se afastam do círculo e somem. Vive no body, então sobrevive à saída do item. */
function burstAt(box: HTMLElement) {
  if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const rect = box.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const color = getComputedStyle(document.documentElement).getPropertyValue('--ds-accent').trim() || '#de4c4a'
  const count = 8
  const reach = rect.width * 0.95
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2
    const dot = document.createElement('i')
    Object.assign(dot.style, { position: 'fixed', left: `${cx - 2}px`, top: `${cy - 2}px`, width: '4px', height: '4px', borderRadius: '50%', background: color, pointerEvents: 'none', zIndex: '500' })
    document.body.appendChild(dot)
    const animation = dot.animate(
      [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(angle) * reach}px, ${Math.sin(angle) * reach}px) scale(0.3)`, opacity: 0 }],
      { duration: 420, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' },
    )
    animation.onfinish = () => dot.remove()
  }
  const ring = document.createElement('i')
  Object.assign(ring.style, { position: 'fixed', left: `${cx - rect.width / 2}px`, top: `${cy - rect.height / 2}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: '50%', border: `1.5px solid ${color}`, pointerEvents: 'none', zIndex: '500', boxSizing: 'border-box' })
  document.body.appendChild(ring)
  const out = ring.animate([{ transform: 'scale(1)', opacity: 0.7 }, { transform: 'scale(1.9)', opacity: 0 }], { duration: 380, easing: 'ease-out', fill: 'forwards' })
  out.onfinish = () => ring.remove()
}

/** Anima a saída do item que corresponde a um dos títulos; resolve quando a animação termina. */
export function animateExit(titles: string[]): Promise<void> {
  const item = lastItem
  if (!item || Date.now() - item.at > 60_000 || !item.el.isConnected) return Promise.resolve()
  const text = item.el.textContent || ''
  if (!titles.some(title => title && text.includes(title))) return Promise.resolve()
  lastItem = null
  item.el.setAttribute('data-exiting', '')
  return new Promise(resolve => window.setTimeout(resolve, 170))
}
