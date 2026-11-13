'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import type { MaiState, SyncStatus } from '../../lib/v2/state'
import { Icon, normalizeAppearance } from '../ds'
import { restyleColors } from '../../lib/v2/palette'
import styles from './Settings.module.css'
import { AppearancePanel } from './AppearancePanel'
import { SidebarSettings } from './SidebarSettings'
import { ShortcutsSettings } from './ShortcutsSettings'
import { RemindersSettings } from './RemindersSettings'
import { normalizeMode } from './theme'


type Calendar = { id: string; nome: string; cor: string; primary?: boolean }

type Props = {
  profile?: { name: string; picture?: string; email?: string } | null
  state: MaiState
  commit: (change: (current: MaiState) => MaiState) => void
  onClose: () => void
  googleConnected: boolean | null
  calendars: Calendar[]
  calendarDraft: string[]
  setCalendarDraft: (value: string[]) => void
  calendarBusy: boolean
  saveCalendars: () => Promise<void>
  disconnectGoogle: () => Promise<void>
  requestNotifications: () => Promise<void>
  testReminder: () => Promise<void>
  installPrompt: unknown
  install: () => Promise<void>
  exportData: () => void
  importData: (file?: File) => Promise<void>
  importRef: RefObject<HTMLInputElement | null>
  syncStatus: SyncStatus
  flushRemoteSync: () => Promise<void>
  logout: () => void
}

export function AppSettingsDrawer(props: Props) {
  const calendarReady = useRef(false)
  const lastCalendars = useRef('')
  const saveCalendarsRef = useRef(props.saveCalendars)
  useEffect(() => { saveCalendarsRef.current = props.saveCalendars }, [props.saveCalendars])
  useEffect(() => {
    if (!props.googleConnected) { calendarReady.current = false; lastCalendars.current = ''; return }
    const snapshot = JSON.stringify([...props.calendarDraft].sort())
    if (!calendarReady.current) { calendarReady.current = true; lastCalendars.current = snapshot; return }
    if (snapshot === lastCalendars.current) return
    const timer = window.setTimeout(() => {
      lastCalendars.current = snapshot
      void saveCalendarsRef.current()
    }, 320)
    return () => window.clearTimeout(timer)
  }, [props.calendarDraft, props.googleConnected])

  const scroller = useRef<HTMLDivElement | null>(null)
  const [active, setActive] = useState('geral')
  const name = String(props.profile?.name || props.state.configs.profileName || props.state.configs.userName || 'Meu perfil')
  const email = props.profile?.email
  const sections = [
    { id: 'geral', label: 'Visão geral', icon: 'monitor_heart' },
    { id: 'conta', label: 'Conta', icon: 'account_circle' },
    { id: 'tema', label: 'Aparência', icon: 'palette' },
    { id: 'barra', label: 'Barra lateral', icon: 'menu' },
    { id: 'notificacoes', label: 'Notificações', icon: 'notifications' },
    { id: 'atalhos', label: 'Atalhos', icon: 'keyboard' },
    { id: 'google', label: 'Google', icon: 'calendar_month' },
    { id: 'dados', label: 'Dados e backup', icon: 'cloud_upload' },
  ]

  const go = (id: string) => {
    setActive(id)
    scroller.current?.scrollTo({ top: 0 })
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') props.onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  const notifications = Boolean(props.state.configs.notificationsEnabled)
  const permission = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  const standalone = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches
  const phase = props.syncStatus.phase
  const updatedAt = String(props.state.meta?.updatedAt || '')
  const updatedLabel = updatedAt && !Number.isNaN(Date.parse(updatedAt)) ? new Date(updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''
  type Health = { id: string; tone: 'ok' | 'warn' | 'bad' | 'off'; title: string; detail: string; action?: { label: string; run: () => void } }
  const health: Health[] = [
    { id: 'sync', tone: phase === 'synced' ? 'ok' : phase === 'error' ? 'bad' : phase === 'offline' ? 'warn' : phase === 'local' ? 'warn' : 'ok', title: 'Sincronização', detail: props.syncStatus.message + (updatedLabel ? ` · última alteração ${updatedLabel}` : ''), action: { label: 'Sincronizar agora', run: () => void props.flushRemoteSync() } },
    { id: 'google', tone: props.googleConnected === null ? 'off' : props.googleConnected ? 'ok' : 'bad', title: 'Google Agenda e Drive', detail: props.googleConnected === null ? 'Verificando…' : props.googleConnected ? `Conectado · ${props.calendarDraft.length} calendário(s) em uso` : 'Desconectado: agenda e anexos não funcionam', action: props.googleConnected === false ? { label: 'Reconectar', run: () => { window.location.href = '/api/google/connect' } } : props.googleConnected ? { label: 'Ver', run: () => go('google') } : undefined },
    { id: 'notif', tone: permission === 'denied' ? 'bad' : notifications && permission === 'granted' ? 'ok' : permission === 'unsupported' ? 'off' : 'warn', title: 'Notificações', detail: permission === 'denied' ? 'Bloqueadas no navegador: libere nas permissões do site' : notifications && permission === 'granted' ? 'Lembretes ativos' : permission === 'unsupported' ? 'Neste aparelho só funciona com o Bukid instalado (iPhone: Compartilhar → Adicionar à Tela de Início)' : 'Lembretes desligados', action: permission === 'denied' || permission === 'unsupported' ? undefined : { label: notifications ? 'Ver' : 'Ativar', run: () => (notifications ? go('notificacoes') : void props.requestNotifications()) } },
    { id: 'app', tone: standalone ? 'ok' : props.installPrompt ? 'warn' : 'off', title: 'Aplicativo', detail: standalone ? 'Rodando como aplicativo instalado' : props.installPrompt ? 'Pode ser instalado neste aparelho' : 'Aberto no navegador', action: props.installPrompt ? { label: 'Instalar', run: () => void props.install() } : undefined },
  ]
  const attention = health.filter(item => item.tone === 'bad' || item.tone === 'warn').length
  const hideInbox = Boolean(props.state.configs.hideInbox)

  return (
    <div className={styles.layer} onMouseDown={props.onClose}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-label="Configurações" onMouseDown={event => event.stopPropagation()}>
        <div className={styles.content}>
          <header className={styles.top}>
            <h2>Configurações</h2>
            <button type="button" className={styles.close} onClick={props.onClose} aria-label="Fechar"><Icon name="close" size={22} filled={false} /></button>
          </header>
          <div className={styles.tabs} role="tablist" aria-label="Seções">
            {sections.map(item => (
              <button key={item.id} type="button" role="tab" aria-selected={active === item.id} data-active={active === item.id || undefined} onClick={() => go(item.id)}>
                <Icon name={item.icon} size={18} filled={false} /><span>{item.label}</span>
              </button>
            ))}
          </div>
          <div className={styles.scroll} ref={scroller}>
            <section className={styles.section} data-section="geral" hidden={active !== 'geral'}>
              <h3>Visão geral</h3>
              <p className={styles.summary} data-attention={attention || undefined}>{attention ? `${attention} ponto(s) pedem atenção` : 'Tudo funcionando'}</p>
              {health.map(item => (
                <div key={item.id} className={styles.row}>
                  <span className={styles.health}><i data-tone={item.tone} aria-hidden="true" /><span><strong>{item.title}</strong><small>{item.detail}</small></span></span>
                  {item.action ? <button type="button" className={styles.button} onClick={item.action.run}>{item.action.label}</button> : null}
                </div>
              ))}
            </section>

            <section className={styles.section} data-section="conta" hidden={active !== 'conta'}>
              <h3>Conta</h3>
              <div className={styles.profile}>
                <span className={styles.avatar}>{props.profile?.picture ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={props.profile.picture} alt="" referrerPolicy="no-referrer" /> : name.trim().slice(0, 1).toLocaleUpperCase('pt-BR')}</span>
                <div><strong>{name}</strong>{email ? <small>{email}</small> : null}</div>
              </div>
              <div className={styles.row}>
                <span><strong>Sair</strong><small>Encerra a sessão neste aparelho.</small></span>
                <button type="button" className={`${styles.button} ${styles.danger}`} onClick={props.logout}>Sair</button>
              </div>
            </section>

            <section className={styles.section} data-section="tema" hidden={active !== 'tema'}>
              <h3>Aparência</h3>
              <AppearancePanel mode={normalizeMode(props.state.configs.theme)} onMode={mode => props.commit(current => ({ ...current, configs: { ...current.configs, theme: mode } }))} value={props.state.configs.appearance} onChange={appearance => props.commit(current => {
                const before = normalizeAppearance(current.configs.appearance)
                const base = before.colorStyle !== appearance.colorStyle ? restyleColors(current, appearance.colorStyle) : current
                return { ...base, configs: { ...base.configs, appearance } }
              })} />
            </section>

            <section className={styles.section} data-section="barra" hidden={active !== 'barra'}>
              <h3>Barra lateral</h3>
              <div className={styles.row}>
                <span><strong>Ocultar a barra lateral automaticamente</strong><small>A barra some quando o mouse sai dela e volta ao encostar na borda esquerda.</small></span>
                <button type="button" role="switch" aria-checked={Boolean(props.state.configs.sidebarAutoHide)} aria-label="Ocultar a barra lateral automaticamente" className={styles.switch} data-on={Boolean(props.state.configs.sidebarAutoHide) || undefined} onClick={() => props.commit(current => ({ ...current, configs: { ...current.configs, sidebarAutoHide: !current.configs.sidebarAutoHide, sidebarHidden: false } }))}><i /></button>
              </div>
              <SidebarSettings value={props.state.configs.sidebar} legacyHideInbox={hideInbox} onChange={sidebar => props.commit(current => ({ ...current, configs: { ...current.configs, sidebar, hideInbox: false } }))} />
            </section>

            <section className={styles.section} data-section="atalhos" hidden={active !== 'atalhos'}>
              <h3>Atalhos de teclado</h3>
              <ShortcutsSettings value={props.state.configs.shortcuts} onChange={shortcuts => props.commit(current => ({ ...current, configs: { ...current.configs, shortcuts } }))} />
            </section>

            <section className={styles.section} data-section="notificacoes" hidden={active !== 'notificacoes'}>
              <h3>Notificações</h3>
              <RemindersSettings value={props.state.configs.reminders} enabled={notifications} permission={permission} onToggle={() => void props.requestNotifications()} onTest={() => void props.testReminder()} onChange={reminders => props.commit(current => ({ ...current, configs: { ...current.configs, reminders } }))} />
            </section>

            <section className={styles.section} data-section="google" hidden={active !== 'google'}>
              <h3>Google Agenda e Drive</h3>
              {props.googleConnected ? (
                <>
                  <div className={styles.calendars}>
                    {props.calendars.map(calendar => (
                      <label key={calendar.id}>
                        <input type="checkbox" checked={props.calendarDraft.includes(calendar.id)} onChange={event => props.setCalendarDraft(event.target.checked ? [...props.calendarDraft, calendar.id] : props.calendarDraft.filter(id => id !== calendar.id))} />
                        <i style={{ background: calendar.cor }} /><span>{calendar.nome}</span>
                      </label>
                    ))}
                  </div>
                  <div className={styles.row}>
                    <span><strong>Google Agenda e Drive</strong><small>Calendários salvos automaticamente.</small></span>
                    <button type="button" className={`${styles.button} ${styles.danger}`} onClick={() => void props.disconnectGoogle()}>Desconectar</button>
                  </div>
                </>
              ) : (
                <div className={styles.row}>
                  <span><strong>Google Agenda e Drive</strong><small>Reconecte sua conta Google.</small></span>
                  <a className={styles.button} href="/api/google/connect">Reconectar</a>
                </div>
              )}
            </section>

            <section className={styles.section} data-section="dados" hidden={active !== 'dados'}>
              <h3>Dados e backup</h3>
              <div className={styles.row}>
                <span><strong>Exportar backup</strong><small>Baixa todos os seus dados em um arquivo.</small></span>
                <button type="button" className={styles.button} onClick={props.exportData}>Exportar</button>
              </div>
              <div className={styles.row}>
                <span><strong>Importar backup</strong><small>Restaura dados de um arquivo exportado.</small></span>
                <label className={styles.button}>Importar<input ref={props.importRef} hidden type="file" accept="application/json" onChange={event => void props.importData(event.target.files?.[0])} /></label>
              </div>
            </section>

            <div className={styles.end} />
          </div>
        </div>
      </section>
    </div>
  )
}
