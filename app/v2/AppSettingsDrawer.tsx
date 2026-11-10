'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import type { MaiState, SyncStatus } from '../../lib/v2/state'
import { Icon } from '../ds'
import styles from './Settings.module.css'
import { AppearancePanel } from './AppearancePanel'
import { ThemePicker } from './ThemePicker'


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
  const [active, setActive] = useState('conta')
  const name = String(props.profile?.name || props.state.configs.profileName || props.state.configs.userName || 'Meu perfil')
  const email = props.profile?.email
  const sections = [
    { id: 'conta', label: 'Conta', icon: 'account_circle' },
    { id: 'tema', label: 'Aparência', icon: 'palette' },
    { id: 'notificacoes', label: 'Notificações', icon: 'notifications' },
    { id: 'calendarios', label: 'Calendários', icon: 'calendar_month' },
    { id: 'dados', label: 'Dados e backup', icon: 'cloud_upload' },
    ...(props.installPrompt ? [{ id: 'app', label: 'Aplicativo', icon: 'install_mobile' }] : []),
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
            <section className={styles.section} data-section="conta" hidden={active !== 'conta'}>
              <h3>Conta</h3>
              <div className={styles.profile}>
                <span className={styles.avatar}>{props.profile?.picture ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={props.profile.picture} alt="" referrerPolicy="no-referrer" /> : name.trim().slice(0, 1).toLocaleUpperCase('pt-BR')}</span>
                <div><strong>{name}</strong>{email ? <small>{email}</small> : null}</div>
              </div>
              <div className={styles.row}>
                <span><strong>{props.syncStatus.message}</strong><small>Seus dados ficam sincronizados entre os aparelhos.</small></span>
                <button type="button" className={styles.button} onClick={() => void props.flushRemoteSync()}>Sincronizar agora</button>
              </div>
              <div className={styles.row}>
                <span><strong>Sair</strong><small>Encerra a sessão neste aparelho.</small></span>
                <button type="button" className={`${styles.button} ${styles.danger}`} onClick={props.logout}>Sair</button>
              </div>
            </section>

            <section className={styles.section} data-section="tema" hidden={active !== 'tema'}>
              <h3>Aparência</h3>
              <ThemePicker
                mode={props.state.configs.theme}
                theme={props.state.configs.accentColor}
                onMode={mode => props.commit(current => ({ ...current, configs: { ...current.configs, theme: mode } }))}
                onTheme={theme => props.commit(current => ({ ...current, configs: { ...current.configs, accentColor: theme } }))}
              />
              <AppearancePanel value={props.state.configs.appearance} onChange={appearance => props.commit(current => ({ ...current, configs: { ...current.configs, appearance } }))} />
              <div className={styles.row}>
                <span><strong>Ocultar a barra lateral automaticamente</strong><small>A barra some quando o mouse sai dela e volta ao encostar na borda esquerda.</small></span>
                <button type="button" role="switch" aria-checked={Boolean(props.state.configs.sidebarAutoHide)} aria-label="Ocultar a barra lateral automaticamente" className={styles.switch} data-on={Boolean(props.state.configs.sidebarAutoHide) || undefined} onClick={() => props.commit(current => ({ ...current, configs: { ...current.configs, sidebarAutoHide: !current.configs.sidebarAutoHide, sidebarHidden: false } }))}><i /></button>
              </div>
              <div className={styles.row}>
                <span><strong>Ocultar Entrada</strong><small>Esconde a Entrada da lista de projetos no menu lateral.</small></span>
                <button type="button" role="switch" aria-checked={hideInbox} aria-label="Ocultar Entrada" className={styles.switch} data-on={hideInbox || undefined} onClick={() => props.commit(current => ({ ...current, configs: { ...current.configs, hideInbox: !current.configs.hideInbox } }))}><i /></button>
              </div>
            </section>

            <section className={styles.section} data-section="notificacoes" hidden={active !== 'notificacoes'}>
              <h3>Notificações</h3>
              <div className={styles.row}>
                <span><strong>Lembretes</strong><small>Avisos dos itens com horário.</small></span>
                <button type="button" role="switch" aria-checked={notifications} className={styles.switch} data-on={notifications || undefined} onClick={() => void props.requestNotifications()}><i /></button>
              </div>
            </section>

            <section className={styles.section} data-section="calendarios" hidden={active !== 'calendarios'}>
              <h3>Calendários</h3>
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

            {props.installPrompt ? (
              <section className={styles.section} data-section="app" hidden={active !== 'app'}>
                <h3>Aplicativo</h3>
                <div className={styles.row}>
                  <span><strong>Instalar Bukid</strong><small>Usar como aplicativo no aparelho.</small></span>
                  <button type="button" className={styles.button} onClick={() => void props.install()}>Instalar</button>
                </div>
              </section>
            ) : null}
            <div className={styles.end} />
          </div>
        </div>
      </section>
    </div>
  )
}
