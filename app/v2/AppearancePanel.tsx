'use client'

import { useEffect } from 'react'
import { DEFAULT_APPEARANCE, FONTS, ICON_PACKS, Icon, hasStrokeWeight, loadIconPack, normalizeAppearance, type Appearance } from '../ds'
import { LAYOUTS, PALETTES, SHAPE_AREAS } from '../ds/appearance'
import { COLOR_STYLES, styleColor, PALETTE } from '../../lib/v2/palette'
import styles from './AppearancePanel.module.css'
import type { ThemeMode } from './theme'

const ACCENTS = ['#DE4C4A', '#D9782B', '#C9A227', '#3E8E5A', '#2F8F9D', '#246FE0', '#6B5BD2', '#B0488F', '#5B6470']

type Props = { value: unknown; onChange: (next: Appearance) => void; mode: ThemeMode; onMode: (mode: ThemeMode) => void }

/**
 * Aparência personalizável (único): pacote de ícones, grossura, cantos, fonte e cor de destaque.
 * Cada escolha vale para o app inteiro na hora e fica salva na conta. Ver docs/PADROES.md ("Aparência").
 */
export function AppearancePanel({ value, onChange, mode, onMode }: Props) {
  const current = normalizeAppearance(value)
  const set = (patch: Partial<Appearance>) => onChange(normalizeAppearance({ ...current, ...patch }))
  // Carrega os pacotes externos para as prévias dos cartões aparecerem já desenhadas.
  useEffect(() => { for (const pack of ICON_PACKS) void loadIconPack(pack.id) }, [])
  const fixedWeight = !hasStrokeWeight(current.iconPack)
  const families = [...new Set(ICON_PACKS.map(pack => pack.family))]
  const custom = JSON.stringify(current) !== JSON.stringify(DEFAULT_APPEARANCE)

  return (
    <div className={styles.panel}>
      <h4 className={styles.sub}>Cores</h4>
      <div className={styles.group}>
        <span className={styles.label}>Modo</span>
        <div className={styles.segment} role="radiogroup" aria-label="Modo">
          {([['light', 'Claro'], ['dark', 'Escuro'], ['system', 'Sistema']] as const).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={mode === id} data-active={mode === id || undefined} onClick={() => onMode(id)}>{label}</button>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <span className={styles.label}>Paleta de cores do app</span>
        <div className={styles.palettes} role="radiogroup" aria-label="Paleta de cores">
          {PALETTES.map(palette => (
            <button key={palette.id} type="button" role="radio" aria-checked={current.palette === palette.id} data-active={current.palette === palette.id || undefined} onClick={() => set({ palette: palette.id })}>
              <span className={styles.paletteChips} aria-hidden="true">{palette.swatch.map((color, index) => <i key={index} style={{ background: color }} />)}</span>
              <strong>{palette.label}</strong>
            </button>
          ))}
        </div>
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

      <div className={styles.group}>
        <span className={styles.label}>Estilo das cores de escolha</span>
        <div className={styles.packs} role="radiogroup" aria-label="Estilo das cores">
          {COLOR_STYLES.map(style => (
            <button key={style.id} type="button" role="radio" aria-checked={current.colorStyle === style.id} data-active={current.colorStyle === style.id || undefined} onClick={() => set({ colorStyle: style.id })}>
              <strong>{style.label}</strong>
              <small>{style.hint}</small>
              <span className={styles.dots}>{[0, 3, 6, 9, 11, 12, 15].map(index => <i key={index} style={{ background: styleColor(PALETTE[index].color, style.id) }} />)}</span>
            </button>
          ))}
        </div>
      </div>

      <h4 className={styles.sub}>Ícones</h4>
      <div className={styles.group}>
        <span className={styles.label}>Pacote de ícones</span>
        {families.map(family => (
          <div key={family} className={styles.family}>
            <span className={styles.familyName}>{family}</span>
            <div className={styles.packs} role="radiogroup" aria-label={`Pacote de ícones: ${family}`}>
              {ICON_PACKS.filter(pack => pack.family === family).map(pack => (
                <button key={pack.id} type="button" role="radio" aria-checked={current.iconPack === pack.id} data-active={current.iconPack === pack.id || undefined} onClick={() => set({ iconPack: pack.id })}>
                  <span className={styles.packIcons}>{['task_alt', 'flag', 'folder', 'settings'].map(name => <Icon key={name} name={name} size={20} filled={false} look={{ iconPack: pack.id, weight: current.weight, corners: current.corners, iconScale: 1 }} />)}</span>
                  <strong>{pack.label}</strong>
                  <small>{pack.hint}</small>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.group}>
        <span className={styles.label}>Tamanho dos ícones</span>
        <div className={styles.segment} role="radiogroup" aria-label="Tamanho dos ícones">
          {([[0.75, 'Mínimo'], [0.875, 'Pequeno'], [1, 'Normal'], [1.15, 'Grande'], [1.3, 'Extra']] as const).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={current.iconScale === id} data-active={current.iconScale === id || undefined} onClick={() => set({ iconScale: id })}>{label}</button>
          ))}
        </div>
      </div>

      <div className={styles.group} data-hidden={fixedWeight || undefined}>
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

      <h4 className={styles.sub}>Texto</h4>
      <div className={styles.group}>
        <label className={styles.label} htmlFor="ap-font">Fonte</label>
        <select id="ap-font" className={styles.select} value={current.font} onChange={event => set({ font: event.target.value })}>
          {FONTS.map(font => <option key={font.id} value={font.id}>{font.label}</option>)}
        </select>
      </div>

      <h4 className={styles.sub}>Layout</h4>
      <div className={styles.group}>
        <span className={styles.label}>Menu no computador</span>
        <div className={styles.layouts} role="radiogroup" aria-label="Layout do desktop">
          {LAYOUTS.map(layout => (
            <button key={layout.id} type="button" role="radio" aria-checked={current.layout === layout.id} data-active={current.layout === layout.id || undefined} onClick={() => set({ layout: layout.id })}>
              <span className={styles.layoutThumb} data-layout={layout.id} aria-hidden="true"><i /><b /></span>
              <strong>{layout.label}</strong>
              <small>{layout.hint}</small>
            </button>
          ))}
        </div>
      </div>

      <h4 className={styles.sub}>Formas</h4>
      <div className={styles.group}>
        <span className={styles.label}>Formato dos marcadores</span>
        {SHAPE_AREAS.map(area => (
          <div key={area.id} className={styles.shapeRow}>
            <span><strong>{area.label}</strong><small>{area.hint}</small></span>
            <div className={styles.segment} role="radiogroup" aria-label={`Formato: ${area.label}`}>
              {([['round', 'Redondo'], ['square', 'Quadrado']] as const).map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={current.shapes[area.id] === id} data-active={current.shapes[area.id] === id || undefined} onClick={() => set({ shapes: { ...current.shapes, [area.id]: id } })}>{label}</button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {custom ? <button type="button" className={styles.reset} onClick={() => onChange(DEFAULT_APPEARANCE)}>Restaurar padrão</button> : null}
    </div>
  )
}
