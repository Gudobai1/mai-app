'use client'

import type { RefObject } from 'react'
import type { MaiState, SyncStatus } from '../../lib/v2/state'
import styles from './unified.module.css'

type Calendar = { id: string; nome: string; cor: string; primary?: boolean }
const palettes = [
  { id:'sage', label:'Sálvia', colors:['#f7f7f8','#edf1eb','#687d62','#202225'] },
  { id:'blue', label:'Azul névoa', colors:['#f7f7f8','#edf2fc','#426fc5','#202225'] },
  { id:'graphite', label:'Grafite', colors:['#f7f7f8','#eef0f2','#666d78','#202225'] },
  { id:'sand', label:'Areia', colors:['#f7f7f8','#fbf1e5','#b47732','#202225'] },
  { id:'plum', label:'Ameixa', colors:['#f7f7f8','#f5ecfa','#8854aa','#202225'] },
  { id:'terracotta', label:'Terracota', colors:['#f7f7f8','#f9ece8','#bd5b43','#202225'] },
  { id:'teal', label:'Petróleo', colors:['#f7f7f8','#e7f4f4','#27838a','#202225'] },
  { id:'rose', label:'Rosa seco', colors:['#f7f7f8','#f8eaf0','#b95276','#202225'] },
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
  const active = String(props.state.configs.accentPalette || 'sage')
  return <div className={styles.modalLayer} onMouseDown={props.onClose}><section className={`${styles.modalCard} ${styles.settingsCard}`} onMouseDown={event => event.stopPropagation()}>
    <header className={styles.modalHeader}><div><h2>Ajustes</h2></div><button onClick={props.onClose}>×</button></header>
    <section><h3>Aparência</h3>
      <div className={styles.settingsRow}><span><strong>Tema</strong><small>Claro ou escuro</small></span><button onClick={() => props.commit(current => ({ ...current, configs: { ...current.configs, theme: current.configs.theme === 'dark' ? 'light' : 'dark' } }))}>{props.state.configs.theme === 'dark' ? 'Usar claro' : 'Usar escuro'}</button></div>
      <div className="mai-theme-setting"><div><strong>Paleta do MAI</strong><small>Cada paleta usa um destaque próprio; fundos permanecem neutros e limpos.</small></div><div className="mai-theme-palettes">{palettes.map(palette => <button key={palette.id} data-active={active === palette.id} onClick={() => props.commit(current => ({ ...current, configs:{ ...current.configs, accentPalette:palette.id } }))}><span>{palette.colors.map((color,index) => <i key={index} style={{background:color}}/>)}</span><strong>{palette.label}</strong>{active === palette.id ? <b>✓</b> : null}</button>)}</div></div>
      <div className={styles.settingsRow}><span><strong>Página Hoje</strong><small>Escolha os itens da lateral direita</small></span><button onClick={props.onPersonalizeToday}>Personalizar</button></div>
      <div className={styles.settingsRow}><span><strong>Notificações</strong><small>Lembretes dos itens com horário</small></span><button onClick={() => void props.requestNotifications()}>{props.state.configs.notificationsEnabled ? 'Desativar' : 'Ativar'}</button></div>
      {props.installPrompt ? <div className={styles.settingsRow}><span><strong>Instalar MAI</strong><small>Usar como aplicativo</small></span><button onClick={() => void props.install()}>Instalar</button></div> : null}
    </section>
    <section><h3>Google</h3>{props.googleConnected ? <><div className={styles.calendarPicker}>{props.calendars.map(calendar => <label key={calendar.id}><input type="checkbox" checked={props.calendarDraft.includes(calendar.id)} onChange={event => props.setCalendarDraft(event.target.checked ? [...props.calendarDraft, calendar.id] : props.calendarDraft.filter(id => id !== calendar.id))} /><i style={{ background: calendar.cor }} /><span>{calendar.nome}</span></label>)}</div><div className={styles.settingsButtons}><button onClick={() => void props.saveCalendars()} disabled={props.calendarBusy}>Salvar calendários</button><button className={styles.dangerButton} onClick={() => void props.disconnectGoogle()}>Desconectar</button></div></> : <div className={styles.settingsRow}><span><strong>Agenda e Drive</strong><small>Reconecte sua conta Google</small></span><a className={styles.primaryButton} href="/api/google/connect">Reconectar</a></div>}</section>
    <section><h3>Dados</h3><div className={styles.settingsButtons}><button onClick={props.exportData}>Exportar backup</button><label>Importar backup<input ref={props.importRef} hidden type="file" accept="application/json" onChange={event => void props.importData(event.target.files?.[0])} /></label><button onClick={() => void props.flushRemoteSync()}>Sincronizar agora</button></div></section>
    <section><h3>Conta</h3><div className={styles.settingsRow}><span><strong>{props.syncStatus.message}</strong><small>As atualizações continuam usando o mesmo MAI e os mesmos dados.</small></span><button className={styles.dangerButton} onClick={props.logout}>Sair</button></div></section>
  </section></div>
}
