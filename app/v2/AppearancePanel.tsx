'use client'

import { DEFAULT_APPEARANCE, FONTS, ICON_PACKS, Icon, normalizeAppearance, type Appearance } from '../ds'
import styles from './AppearancePanel.module.css'

const SAMPLE = ['today', 'event_upcoming', 'task_alt', 'account_balance_wallet', 'repeat', 'flag', 'sticky_note_2', 'folder', 'search', 'settings']
const ACCENTS = ['#DE4C4A', '#D9782B', '#C9A227', '#3E8E5A', '#2F8F9D', '#246FE0', '#6B5BD2', '#B0488F', '#5B6470']

type Props = { value: unknown; onChange: (next: Appearance) => void }

/**
 * Aparência personalizável (único): pacote de ícones, grossura, cantos, fonte e cor de destaque.
 * Cada escolha vale para o app inteiro na hora e fica salva na conta. Ver docs/PADROES.md ("Aparência").
 */
export function AppearancePanel({ value, onChange }: Props) {
  const current = normalizeAppearance(value)
  const set = (patch: Partial<Appearance>) => onChange(normalizeAppearance({ ...current, ...patch }))
  const custom = JSON.stringify(current) !== JSON.stringify(DEFAULT_APPEARANCE)

  return (
    <div className={styles.panel}>
      <div className={styles.preview} aria-label="Prévia dos ícones">
        {SAMPLE.map(name => <Icon key={name} name={name} size={22} filled={false} />)}
      </div>

      <div className={styles.group}>
        <span className={styles.label}>Pacote de ícones</span>
        <div className={styles.packs} role="radiogroup" aria-label="Pacote de ícones">
          {ICON_PACKS.map(pack => (
            <button key={pack.id} type="button" role="radio" aria-checked={current.iconPack === pack.id} data-active={current.iconPack === pack.id || undefined} onClick={() => set({ iconPack: pack.id })}>
              <span className={styles.packIcons}>{['task_alt', 'flag', 'folder', 'settings'].map(name => <Icon key={name} name={name} size={20} filled={false} look={{ iconPack: pack.id, weight: current.weight, corners: current.corners }} />)}</span>
              <strong>{pack.label}</strong>
              <small>{pack.hint}</small>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <label className={styles.label} htmlFor="ap-weight">Grossura dos ícones <em>{current.weight.toFixed(2).replace(/\.?0+$/, '').replace('.', ',')}</em></label>
        <input id="ap-weight" className={styles.range} type="range" min={1} max={2.5} step={0.25} value={current.weight} onChange={event => set({ weight: Number(event.target.value) })} />
        <div className={styles.scale}><span>Fino</span><span>Normal</span><span>Forte</span></div>
      </div>

      <div className={styles.group} data-hidden={current.iconPack !== 'lucide' || undefined}>
        <span className={styles.label}>Pontas e cantos do traço</span>
        <div className={styles.segment} role="radiogroup" aria-label="Pontas e cantos">
          {([['square', 'Retos'], ['round', 'Arredondados']] as const).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={current.corners === id} data-active={current.corners === id || undefined} onClick={() => set({ corners: id })}>{label}</button>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <label className={styles.label} htmlFor="ap-font">Fonte</label>
        <select id="ap-font" className={styles.select} value={current.font} onChange={event => set({ font: event.target.value })}>
          {FONTS.map(font => <option key={font.id} value={font.id}>{font.label}</option>)}
        </select>
      </div>

      <div className={styles.group}>
        <span className={styles.label}>Cor de destaque</span>
        <div className={styles.swatches} role="radiogroup" aria-label="Cor de destaque">
          <button type="button" role="radio" aria-checked={!current.accent} data-active={!current.accent || undefined} className={styles.swatchAuto} onClick={() => set({ accent: '' })}>Tema</button>
          {ACCENTS.map(color => (
            <button key={color} type="button" role="radio" aria-checked={current.accent.toLowerCase() === color.toLowerCase()} aria-label={color} data-active={current.accent.toLowerCase() === color.toLowerCase() || undefined} className={styles.swatch} style={{ background: color }} onClick={() => set({ accent: color })} />
          ))}
          <label className={styles.swatchCustom} title="Outra cor">
            <input type="color" value={current.accent || '#DE4C4A'} onChange={event => set({ accent: event.target.value })} aria-label="Escolher outra cor" />
            <Icon name="palette" size={16} filled={false} />
          </label>
        </div>
      </div>

      {custom ? <button type="button" className={styles.reset} onClick={() => onChange(DEFAULT_APPEARANCE)}>Restaurar padrão</button> : null}
    </div>
  )
}
