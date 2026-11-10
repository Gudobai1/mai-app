'use client'

import { LEAD_OPTIONS, REMINDER_KINDS, leadLabel, normalizeReminders, type ReminderConfig } from '../../lib/v2/reminders'
import styles from './RemindersSettings.module.css'

type Props = { value: unknown; enabled: boolean; permission: string; onToggle: () => void; onTest: () => void; onChange: (next: ReminderConfig) => void }

function Switch({ on, label, onClick, disabled }: { on: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={styles.switch} data-on={on || undefined} onClick={onClick}><i /></button>
}
function Segment<T extends string>({ value, options, label, onChange }: { value: T; options: readonly (readonly [T, string])[]; label: string; onChange: (value: T) => void }) {
  return (
    <div className={styles.segment} role="radiogroup" aria-label={label}>
      {options.map(([id, text]) => <button key={id} type="button" role="radio" aria-checked={value === id} data-active={value === id || undefined} onClick={() => onChange(id)}>{text}</button>)}
    </div>
  )
}

/** Configurações → Notificações: o que avisa, quando avisa e como aparece (desktop e celular usam a mesma regra, lib/v2/reminders.ts). */
export function RemindersSettings({ value, enabled, permission, onToggle, onTest, onChange }: Props) {
  const config = normalizeReminders(value)
  const set = (patch: Partial<ReminderConfig>) => onChange({ ...config, ...patch })
  const look = (patch: Partial<ReminderConfig['look']>) => set({ look: { ...config.look, ...patch } })
  const active = enabled && permission === 'granted'
  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <span><strong>Lembretes</strong><small>{permission === 'denied' ? 'Bloqueados no navegador: libere nas permissões do site.' : active ? 'Ativos neste aparelho.' : 'Desligados neste aparelho.'}</small></span>
        <Switch on={active} label="Lembretes" onClick={onToggle} />
      </div>
      <div className={styles.row}>
        <span><strong>Testar aviso</strong><small>Mostra um aviso agora, com o texto e a aparência abaixo.</small></span>
        <button type="button" className={styles.button} disabled={!active} onClick={onTest}>Testar</button>
      </div>

      <h4 className={styles.sub}>O que avisa</h4>
      {REMINDER_KINDS.map(kind => (
        <div key={kind.id} className={styles.row}>
          <span><strong>{kind.label}</strong><small>{kind.hint}</small></span>
          <Switch on={config.kinds[kind.id]} label={kind.label} onClick={() => set({ kinds: { ...config.kinds, [kind.id]: !config.kinds[kind.id] } })} />
        </div>
      ))}

      <h4 className={styles.sub}>Quando avisa</h4>
      <div className={styles.row}>
        <span><strong>Na hora do item</strong><small>Aviso no horário marcado.</small></span>
        <Switch on={config.atTime} label="Avisar na hora" onClick={() => set({ atTime: !config.atTime })} />
      </div>
      <div className={styles.row}>
        <span><strong>Antecedência padrão</strong><small>Vale para itens sem lembrete próprio.</small></span>
        <select className={styles.select} value={config.lead} aria-label="Antecedência padrão" onChange={event => set({ lead: Number(event.target.value) })}>
          {LEAD_OPTIONS.map(minutes => <option key={minutes} value={minutes}>{leadLabel(minutes)}</option>)}
        </select>
      </div>
      <div className={styles.row}>
        <span><strong>Resumo do dia</strong><small>Um aviso por dia com o que está pendente.</small></span>
        <span className={styles.inline}>
          {config.digest.on ? <input type="time" className={styles.time} value={config.digest.time} aria-label="Horário do resumo" onChange={event => event.target.value && set({ digest: { ...config.digest, time: event.target.value } })} /> : null}
          <Switch on={config.digest.on} label="Resumo do dia" onClick={() => set({ digest: { ...config.digest, on: !config.digest.on } })} />
        </span>
      </div>
      <div className={styles.row}>
        <span><strong>Horário de silêncio</strong><small>Sem avisos dentro desta janela.</small></span>
        <span className={styles.inline}>
          {config.quiet.on ? (
            <>
              <input type="time" className={styles.time} value={config.quiet.from} aria-label="Início do silêncio" onChange={event => event.target.value && set({ quiet: { ...config.quiet, from: event.target.value } })} />
              <span aria-hidden="true">até</span>
              <input type="time" className={styles.time} value={config.quiet.to} aria-label="Fim do silêncio" onChange={event => event.target.value && set({ quiet: { ...config.quiet, to: event.target.value } })} />
            </>
          ) : null}
          <Switch on={config.quiet.on} label="Horário de silêncio" onClick={() => set({ quiet: { ...config.quiet, on: !config.quiet.on } })} />
        </span>
      </div>

      <h4 className={styles.sub}>Aparência do aviso</h4>
      <div className={styles.row}>
        <span><strong>Nome do app no título</strong><small>“Bukid · Pagar conta”.</small></span>
        <Switch on={config.look.appName} label="Nome do app no título" onClick={() => look({ appName: !config.look.appName })} />
      </div>
      <div className={styles.row}>
        <span><strong>Mostrar projeto ou lista</strong><small>Na linha de baixo do aviso.</small></span>
        <Switch on={config.look.project} label="Mostrar projeto" onClick={() => look({ project: !config.look.project })} />
      </div>
      <div className={styles.row}>
        <span><strong>Mostrar horário</strong><small>“às 14:30”.</small></span>
        <Switch on={config.look.time} label="Mostrar horário" onClick={() => look({ time: !config.look.time })} />
      </div>
      <div className={styles.row}>
        <span><strong>Aviso silencioso</strong><small>Sem som no computador. No celular segue o canal do sistema.</small></span>
        <Switch on={config.look.silent} label="Aviso silencioso" onClick={() => look({ silent: !config.look.silent })} />
      </div>

      <h4 className={styles.sub}>Sino e painel</h4>
      <div className={styles.row}>
        <span><strong>Indicador do sino</strong><small>Quando há vencidos ou lembretes disparados.</small></span>
        <Segment value={config.look.bell} label="Indicador do sino" options={[['dot', 'Ponto'], ['count', 'Número'], ['none', 'Nenhum']] as const} onChange={bell => look({ bell })} />
      </div>
      <div className={styles.row}>
        <span><strong>Densidade do painel</strong></span>
        <Segment value={config.look.panel} label="Densidade do painel" options={[['comfortable', 'Confortável'], ['compact', 'Compacta']] as const} onChange={panel => look({ panel })} />
      </div>
      {([['overdue', 'Mostrar vencidos'], ['reminder', 'Mostrar lembretes'], ['today', 'Mostrar “para hoje”']] as const).map(([id, label]) => (
        <div key={id} className={styles.row}>
          <span><strong>{label}</strong></span>
          <Switch on={config.look.groups[id]} label={label} onClick={() => look({ groups: { ...config.look.groups, [id]: !config.look.groups[id] } })} />
        </div>
      ))}
    </div>
  )
}
