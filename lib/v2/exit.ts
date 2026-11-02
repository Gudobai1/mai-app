/** Guarda o último item (linha de lista) tocado, para animar a saída ao excluir/arquivar. */
let lastItem: { el: Element; at: number } | null = null

export function trackItems() {
  const remember = (event: Event) => {
    const target = event.target as Element | null
    const el = target?.closest?.('[role="listitem"]')
    if (el) lastItem = { el, at: Date.now() }
  }
  document.addEventListener('pointerdown', remember, true)
  document.addEventListener('contextmenu', remember, true)
  return () => { document.removeEventListener('pointerdown', remember, true); document.removeEventListener('contextmenu', remember, true) }
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
