'use client'

import type { RefObject } from 'react'
import type { MaiState, SyncStatus } from '../../lib/v2/state'
import styles from './unified.module.css'

type Calendar = { id: string; nome: string; cor: string; primary?: boolean }
const palettes = [
  { id:'sage', label:'Sálvia', colors:['#f6f7f4','#e9eee5','#60765a','#202521'] },
  { id:'blue', label:'Azul névoa', colors:['#f4f7fa','#e5edf4','#486b8a','#1f2932'] },
  { id:'graphite', label:'Grafite', colors:['#f5f6f5','#e9eceb','#4f5b57','#222725'] },
  { id:'sand', label:'Areia', colors:['#faf7f3','#f1e8df','#9b7757','#302821'] },
  { id:'plum', label:'Ameixa', colors:['#f8f5f9','#eee7f1','#765d82','#2c2530'] },
  { id:'terracotta', label:'Terracota', colors:['#faf5f3','#f3e5e1','#a85f4f','#322522'] },
  { id:'teal', label:'Petróleo', colors:['#f3f8f7','#e1efed','#397b78','#1d2d2c'] },
  { id:'rose', label:'Rosa seco', colors:['#faf5f7','#f2e5ea','#a26373','#31252a'] },
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
    <header className={styles.modalHeader}><div><h2>Configurações</h2></div><button onClick={props.onClose}>×</button></header>
    <section><h3>Aparência</h3>
      <div className={styles.settingsRow}><span><strong>Tema</strong><small>Claro ou escuro</small></span><button onClick={() => props.commit(current => ({ ...current, configs: { ...current.configs, theme: current.configs.theme === 'dark' ? 'light' : 'dark' } }))}>{props.state.configs.theme === 'dark' ? 'Usar claro' : 'Usar escuro'}</button></div>
      <div className="mai-theme-setting"><div><strong>Paleta do MAI</strong><small>A paleta altera toda a interface: fundos, sidebar, cartões, bordas e destaques.</small></div><div className="mai-theme-palettes">{palettes.map(palette => <button key={palette.id} data-active={active === palette.id} onClick={() => props.commit(current => ({ ...current, configs:{ ...current.configs, accentPalette:palette.id } }))}><span>{palette.colors.map((color,index) => <i key={index} style={{background:color}}/>)}</span><strong>{palette.label}</strong>{active === palette.id ? <b>✓</b> : null}</button>)}</div></div>
      <div className={styles.settingsRow}><span><strong>Página Hoje</strong><small>Escolha os cartões da lateral direita</small></span><button onClick={props.onPersonalizeToday}>Personalizar</button></div>
      <div className={styles.settingsRow}><span><strong>Notificações</strong><small>Lembretes dos itens com horário</small></span><button onClick={() => void props.requestNotifications()}>{props.state.configs.notificationsEnabled ? 'Desativar' : 'Ativar'}</button></div>
      {props.installPrompt ? <div className={styles.settingsRow}><span><strong>Instalar MAI</strong><small>Usar como aplicativo</small></span><button onClick={() => void props.install()}>Instalar</button></div> : null}
    </section>
    <section><h3>Google</h3>{props.googleConnected ? <><div className={styles.calendarPicker}>{props.calendars.map(calendar => <label key={calendar.id}><input type="checkbox" checked={props.calendarDraft.includes(calendar.id)} onChange={event => props.setCalendarDraft(event.target.checked ? [...props.calendarDraft, calendar.id] : props.calendarDraft.filter(id => id !== calendar.id))} /><i style={{ background: calendar.cor }} /><span>{calendar.nome}</span></label>)}</div><div className={styles.settingsButtons}><button onClick={() => void props.saveCalendars()} disabled={props.calendarBusy}>Salvar calendários</button><button className={styles.dangerButton} onClick={() => void props.disconnectGoogle()}>Desconectar</button></div></> : <div className={styles.settingsRow}><span><strong>Agenda e Drive</strong><small>Conecte sua conta Google</small></span><a className={styles.primaryButton} href="/api/google/connect">Conectar Google</a></div>}</section>
    <section><h3>Dados</h3><div className={styles.settingsButtons}><button onClick={props.exportData}>Exportar backup</button><label>Importar backup<input ref={props.importRef} hidden type="file" accept="application/json" onChange={event => void props.importData(event.target.files?.[0])} /></label><button onClick={() => void props.flushRemoteSync()}>Sincronizar agora</button></div></section>
    <section><h3>Conta</h3><div className={styles.settingsRow}><span><strong>{props.syncStatus.message}</strong><small>As atualizações continuam usando o mesmo MAI e os mesmos dados.</small></span><button className={styles.dangerButton} onClick={props.logout}>Sair</button></div></section>
  </section></div>
}
