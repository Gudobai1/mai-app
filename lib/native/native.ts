/**
 * Ponte com o app Android (Capacitor). No navegador comum tudo isto é inerte.
 * O Capacitor injeta `window.Capacitor` mesmo quando o app carrega o site pela internet,
 * então os plugins nativos são chamados por `Capacitor.Plugins.<Nome>` sem entrar no pacote do site.
 */
type CapacitorGlobal = { isNativePlatform?: () => boolean; Plugins?: Record<string, any> }
const capacitor = () => (typeof window === 'undefined' ? undefined : (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor)

export const isNativeApp = () => Boolean(capacitor()?.isNativePlatform?.())
export const nativePlugin = (name: string): any => capacitor()?.Plugins?.[name]

/** Abre o login do Google no navegador do sistema (o Google bloqueia login dentro de WebView). */
export async function openGoogleAuth(path: string) {
  const url = new URL(path, window.location.origin)
  url.searchParams.set('native', '1')
  const browser = nativePlugin('Browser')
  if (browser?.open) { await browser.open({ url: url.toString() }); return }
  window.location.assign(url.toString())
}

/** Link de volta do navegador: bukid://auth?mode=login|connect&token_hash=…&g=…  (ou &error=…) */
export function parseAuthLink(raw: string): { mode: string; tokenHash: string; sealed: string; error: string } | null {
  if (!raw.startsWith('bukid://auth')) return null
  const params = new URL(raw.replace('bukid://', 'https://bukid.invalid/')).searchParams
  return { mode: params.get('mode') || 'connect', tokenHash: params.get('token_hash') || '', sealed: params.get('g') || '', error: params.get('error') || '' }
}

/** Pinta as barras do sistema (status e navegação) com o fundo atual do app e escolhe ícones claros/escuros. */
export function syncSystemBars() {
  const plugin = nativePlugin('BukidNative')
  if (!isNativeApp() || !plugin?.setSystemBars) return
  const apply = () => {
    const match = getComputedStyle(document.body).backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/)
    if (!match || (match[4] !== undefined && Number(match[4]) === 0)) return
    const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])]
    const hex = `#${[r, g, b].map(value => value.toString(16).padStart(2, '0')).join('')}`
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    void Promise.resolve(plugin.setSystemBars({ color: hex, light: luminance > 0.5 })).catch(() => null)
  }
  window.requestAnimationFrame(() => window.setTimeout(apply, 60))
}
