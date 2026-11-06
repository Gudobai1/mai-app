'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../ds'
import { MaiIcon } from './MaiIcons'
import type { OpenFinanceController } from './OpenFinance'
import styles from './ConnectionDialog.module.css'

type Props = {
  banco: string
  itemId: string
  ctl: OpenFinanceController
  /** Conta/cartão já salvo no app (só então dá para torná-lo manual). */
  persisted: boolean
  onClose: () => void
  onManual: () => void
  onConnect: () => void
  onAddId: () => void
  onDisconnect: () => void
}

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (next: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={styles.switch} data-on={on || undefined} onClick={() => onChange(!on)}><i /></button>
}

/** Número de dias com − e +; grava ao sair do campo, ao apertar Enter ou nos botões. */
function Days({ value, label, onChange }: { value: number; label: string; onChange: (next: number) => void }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const commit = (next: number) => onChange(Math.max(0, Math.min(365, Math.round(Number.isFinite(next) ? next : value))))
  return <div className={styles.days}>
    <button type="button" aria-label={`Menos um dia: ${label}`} disabled={value <= 0} onClick={() => commit(value - 1)}><Icon name="remove" size={16} filled={false} /></button>
    <input type="number" min={0} max={365} inputMode="numeric" aria-label={label} value={text} onChange={event => setText(event.target.value)} onBlur={() => commit(Number(text))} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
    <button type="button" aria-label={`Mais um dia: ${label}`} disabled={value >= 365} onClick={() => commit(value + 1)}><Icon name="add" size={16} filled={false} /></button>
    <span>dias</span>
  </div>
}

/** Janela de configuração da conexão de um banco (Open Finance / MeuPluggy). Tudo grava na hora, só para este banco. */
export function ConnectionDialog({ banco, itemId, ctl, persisted, onClose, onManual, onConnect, onAddId, onDisconnect }: Props) {
  const match = ctl.matchOf(itemId)
  const link = ctl.linkOf(itemId)
  const [url, setUrl] = useState(link)
  const [error, setError] = useState('')
  useEffect(() => setUrl(link), [link])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  const saveUrl = () => { const reason = ctl.saveLink(itemId, url); setError(reason); if (!reason) setUrl(url.trim()) }
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className={styles.layer} onMouseDown={onClose}>
      <section className={styles.panel} role="dialog" aria-modal="true" aria-label={`Conexão ${banco}`} onMouseDown={event => event.stopPropagation()}>
        <header className={styles.head}>
          <span><small>Open Finance</small><strong>{banco}</strong></span>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar"><Icon name="close" size={20} filled={false} /></button>
        </header>
        <div className={styles.body}>
          <section className={styles.section}>
            <h3>MeuPluggy</h3>
            <label className={styles.field}>
              <span><strong>Link da conexão</strong><small>Abre ao sincronizar, para você clicar em atualizar.</small></span>
              <input type="url" inputMode="url" value={url} placeholder="https://meu.pluggy.ai/connections/…" aria-invalid={error ? true : undefined} onChange={event => { setUrl(event.target.value); setError('') }} onBlur={saveUrl} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
              {error ? <em role="alert">{error}</em> : null}
            </label>
          </section>

          <section className={styles.section}>
            <h3>Vínculo automático</h3>
            <p className={styles.hint}>Junta seu lançamento ao do banco quando o valor é igual e não há dúvida entre os dois.</p>
            <div className={styles.row}>
              <span><strong>Vincular automaticamente</strong><small>Ao sincronizar, só neste banco.</small></span>
              <Switch on={match.ligado} label="Vincular automaticamente" onChange={ligado => ctl.setMatch(itemId, { ligado })} />
            </div>
            <div className={styles.row} data-off={!match.ligado || undefined}>
              <span><strong>Exigir palavra em comum</strong><small>O título dos dois precisa ter uma palavra igual (ex.: “amazon”).</small></span>
              <Switch on={match.palavra} label="Exigir palavra em comum no título" onChange={palavra => ctl.setMatch(itemId, { palavra })} />
            </div>
            <div className={styles.row} data-off={!match.ligado || undefined}>
              <span><strong>Dinheiro cai depois</strong><small>Até quantos dias após o seu lançamento.</small></span>
              <Days value={match.depois} label="Dias depois do lançamento" onChange={depois => ctl.setMatch(itemId, { depois })} />
            </div>
            <div className={styles.row} data-off={!match.ligado || undefined}>
              <span><strong>Dinheiro caiu antes</strong><small>Até quantos dias antes do seu lançamento.</small></span>
              <Days value={match.antes} label="Dias antes do lançamento" onChange={antes => ctl.setMatch(itemId, { antes })} />
            </div>
          </section>

          <section className={styles.section}>
            <h3>Conexão</h3>
            <button type="button" className={styles.action} onClick={onConnect}><MaiIcon name="add_link" size={18} />Conectar outro banco…</button>
            <button type="button" className={styles.action} onClick={onAddId}><MaiIcon name="key" size={18} />Usar ID do MeuPluggy…</button>
            {persisted ? <button type="button" className={styles.action} onClick={onManual}><MaiIcon name="edit" size={18} />Tornar manual</button> : null}
            <button type="button" className={styles.action} data-danger="true" onClick={onDisconnect}><MaiIcon name="link_off" size={18} />Desconectar banco</button>
          </section>
        </div>
      </section>
    </div>,
    document.body,
  )
}
