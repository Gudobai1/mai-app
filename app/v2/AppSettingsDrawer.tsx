'use client'

import type { RefObject } from 'react'
import type { MaiState, SyncStatus } from '../../lib/v2/state'
import styles from './unified.module.css'

type Calendar = { id: string; nome: string; cor: string; primary?: boolean }
const palettes = [
  ['sage', '#60765a', 'Sálvia'], ['blue', '#486b8a', 'Azul'], ['graphite', '#4f5b57', 'Grafite'], ['sand', '#9b7757', 'Areia'],
  ['plum', '#765d82', 'Ameixa'], ['terracotta', '#a85f4f', 'Terracota'], ['teal', '#397b78', 'Petróleo'], ['rose', '#a26373', 'Rosa queimado'],
] as const

type Props = {
  state: MaiState
  commit: (change: (current: MaiState) => MaiState) => void
  onClose: () => void
  onPersonalizeToday: () => void
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
  return <div className={styles.modalLayer} onMouseDown={props.onClose}><section className={`${styles.modalCard} ${styles.settingsCard}`} onMouseDown={event => event.stopPropagation()}>
    <header className={styles.modalHeader}><div><h2>Configurações</h2></div><button onClick={props.onClose}>×</button></header>
    <section><h3>Aparência</h3>
      <div className={styles.settingsRow}><span><strong>Tema</strong><small>Claro ou escuro</small></span><button onClick={() => props.commit(current => ({ ...current, configs: { ...current.configs, theme: current.configs.theme === 'dark' ? 'light' : 'dark' } }))}>{props.state.configs.theme === 'dark' ? 'Usar claro' : 'Usar escuro'}</button></div>
      <div className={styles.settingsRow}><span><strong>Paleta</strong><small>Cores prontas, sem RGB</small></span><div className="mai-app-palettes">{palettes.map(([id, color, label]) => <button key={id} title={label} data-active={String(props.state.configs.accentPalette || 'sage') === id} onClick={() => props.commit(current => ({ ...current, configs: { ...current.configs, accentPalette: id } }))}><i style={{ background: color }} /></button>)}</div></div>
      <div className={styles.settingsRow}><span><strong>Hoje</strong><small>Escolha posição e ordem dos blocos</small></span><button onClick={props.onPersonalizeToday}>Personalizar</button></div>
      <div className={styles.settingsRow}><span><strong>Notificações</strong><small>Lembretes dos itens com horário</small></span><button onClick={() => void props.requestNotifications()}>{props.state.configs.notificationsEnabled ? 'Desativar' : 'Ativar'}</button></div>
      {props.installPrompt ? <div className={styles.settingsRow}><span><strong>Instalar MAI</strong><small>Usar como aplicativo</small></span><button onClick={() => void props.install()}>Instalar</button></div> : null}
    </section>
    <section><h3>Google</h3>{props.googleConnected ? <><div className={styles.calendarPicker}>{props.calendars.map(calendar => <label key={calendar.id}><input type="checkbox" checked={props.calendarDraft.includes(calendar.id)} onChange={event => props.setCalendarDraft(event.target.checked ? [...props.calendarDraft, calendar.id] : props.calendarDraft.filter(id => id !== calendar.id))} /><i style={{ background: calendar.cor }} /><span>{calendar.nome}</span></label>)}</div><div className={styles.settingsButtons}><button onClick={() => void props.saveCalendars()} disabled={props.calendarBusy}>Salvar calendários</button><button className={styles.dangerButton} onClick={() => void props.disconnectGoogle()}>Desconectar</button></div></> : <div className={styles.settingsRow}><span><strong>Agenda e Drive</strong><small>Conecte sua conta Google</small></span><a className={styles.primaryButton} href="/api/google/connect">Conectar Google</a></div>}</section>
    <section><h3>Dados</h3><div className={styles.settingsButtons}><button onClick={props.exportData}>Exportar backup</button><label>Importar backup<input ref={props.importRef} hidden type="file" accept="application/json" onChange={event => void props.importData(event.target.files?.[0])} /></label><button onClick={() => void props.flushRemoteSync()}>Sincronizar agora</button></div></section>
    <section><h3>Conta</h3><div className={styles.settingsRow}><span><strong>{props.syncStatus.message}</strong><small>Atualizações mudam o código, não a identidade do MAI nem os seus dados.</small></span><button className={styles.dangerButton} onClick={props.logout}>Sair</button></div></section>
  </section></div>
}
