/**
 * Mostra uma notificação no navegador.
 * No Chrome do Android (e em apps instalados) `new Notification()` não funciona: só o service worker pode mostrar.
 * Por isso tenta o service worker primeiro e usa o construtor só como reserva (computador).
 */
export async function showWebNotification(title: string, options: NotificationOptions): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registration = (await navigator.serviceWorker.getRegistration()) || (await Promise.race([navigator.serviceWorker.ready, new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), 2500))]))
      if (registration?.showNotification) {
        await registration.showNotification(title, options)
        return true
      }
    }
  } catch { /* cai para o construtor */ }
  try {
    new Notification(title, options)
    return true
  } catch {
    return false
  }
}

/** Explica por que as notificações não podem ser ativadas neste aparelho (ou '' se podem). */
export function notificationBlocker(): string {
  if (typeof window === 'undefined') return ''
  const ua = navigator.userAgent || ''
  const ios = /iPhone|iPad|iPod/i.test(ua)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (!('Notification' in window)) return ios && !standalone
    ? 'No iPhone, as notificações só funcionam com o Bukid instalado: toque em Compartilhar → "Adicionar à Tela de Início", abra o app pelo ícone e ative de novo.'
    : 'Este navegador não oferece notificações. Use o Chrome ou o app do Bukid.'
  if (Notification.permission === 'denied') return 'As notificações estão bloqueadas para este site. Toque no cadeado (ou nos três pontinhos → Configurações do site) ao lado do endereço, libere Notificações e tente de novo.'
  return ''
}
