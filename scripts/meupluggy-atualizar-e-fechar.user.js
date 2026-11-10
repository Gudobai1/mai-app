// ==UserScript==
// @name         Bukid · MeuPluggy: atualizar e fechar
// @namespace    https://github.com/Gudobai1/mai-app
// @version      1.0.0
// @description  Quando o Bukid abre a página da conexão no MeuPluggy (botão Sincronizar), clica em "Atualizar", espera terminar e fecha a janela.
// @match        https://meu.pluggy.ai/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
 * Como usar: instale a extensão Tampermonkey (ou Violentmonkey), crie um script novo e cole este arquivo.
 * Só age na janela aberta pelo Bukid (o nome da janela começa com "meu-pluggy-"); se você abrir o MeuPluggy
 * por conta própria, nada acontece. Para ver o passo a passo no console: localStorage.setItem('bukid-debug', '1').
 */
(function () {
  'use strict'
  if (!/^meu-pluggy-/.test(window.name)) return

  const DEBUG = (() => { try { return localStorage.getItem('bukid-debug') === '1' } catch { return false } })()
  const log = (...args) => { if (DEBUG) console.log('[Bukid]', ...args) }

  const CLICK_TEXT = /^(atualizar|sincronizar|atualizar agora|sincronizar agora|atualizar dados|atualizar conexão|refresh|update|sync)\b/i
  const DONE_TEXT = /(atualizad[oa]s?\b|sincronizad[oa]s?\b|dados atualizados|updated|up to date|conclu[ií]d[oa])/i
  const NEEDS_YOU = /(c[oó]digo|token|senha|autoriz|consentimento|verifica[cç][aã]o|login|entrar|2fa|mfa|captcha)/i
  const MIN_WAIT_MS = 5000
  const MAX_WAIT_MS = 180000

  const norm = value => String(value || '').replace(/\s+/g, ' ').trim()
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }
  const label = el => norm(el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent)

  const banner = document.createElement('div')
  banner.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;padding:10px 12px;border-radius:8px;background:#222;color:#fff;font:13px system-ui;opacity:.92'
  const say = text => { banner.textContent = `Bukid: ${text}`; if (!banner.isConnected) document.body.appendChild(banner); log(text) }

  const findButton = () => [...document.querySelectorAll('button, [role="button"], a')]
    .filter(el => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true')
    .find(el => CLICK_TEXT.test(label(el)))

  let clickedAt = 0
  let button = null
  const started = Date.now()

  const finish = reason => {
    say(`${reason} Fechando…`)
    setTimeout(() => { window.close(); setTimeout(() => say('Pronto. Pode fechar esta janela.'), 500) }, 800)
  }

  const tick = () => {
    const now = Date.now()
    if (!clickedAt) {
      const found = findButton()
      if (found) { button = found; clickedAt = now; log('clicando em', label(found)); say('atualizando…'); found.click(); return }
      if (now - started > 30000) { clearInterval(timer); say('não achei o botão de atualizar. Clique nele manualmente (veja o console com bukid-debug).') }
      else say('procurando o botão de atualizar…')
      return
    }
    const text = norm(document.body.innerText)
    if (now - clickedAt > 2000 && NEEDS_YOU.test(text) && !DONE_TEXT.test(text)) { say('o banco pediu algo (código/autorização). Conclua aqui; depois feche a janela.'); clearInterval(timer); return }
    const busy = document.querySelector('[role="progressbar"], [aria-busy="true"], .spinner, [class*="loading" i], [class*="spinner" i]')
    const buttonBack = !button.isConnected || (!button.disabled && button.getAttribute('aria-disabled') !== 'true' && !(busy && visible(busy)))
    if (now - clickedAt > MIN_WAIT_MS && buttonBack && (DONE_TEXT.test(text) || !busy)) { clearInterval(timer); finish('Atualizado.'); return }
    if (now - clickedAt > MAX_WAIT_MS) { clearInterval(timer); say('demorou demais. Confira a janela e feche quando terminar.') }
  }

  const timer = setInterval(tick, 1000)
})()
