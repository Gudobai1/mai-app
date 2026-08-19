'use client'

import type { MaiState } from '../../lib/v2/state'
import type { TodayBlock } from './app-types'
import { TODAY_BLOCKS } from './TodayBlocks'
import styles from './unified.module.css'

type Props = { state: MaiState; commit: (change: (current: MaiState) => MaiState) => void; onClose: () => void }

export function TodaySettingsDrawer({ state, commit, onClose }: Props) {
  const main = (Array.isArray(state.configs.todayMainSections) ? state.configs.todayMainSections : ['flow']).map(String)
  const side = (Array.isArray(state.configs.todaySideSections) ? state.configs.todaySideSections : ['goals', 'notes', 'health', 'finance']).map(String)
  const hidden = (Array.isArray(state.configs.todayHiddenSections) ? state.configs.todayHiddenSections : []).map(String)

  function position(id: TodayBlock) { return hidden.includes(id) ? 'hidden' : main.includes(id) ? 'main' : 'side' }
  function moveTo(id: TodayBlock, target: 'main' | 'side' | 'hidden') {
    commit(current => {
      const nextMain = (Array.isArray(current.configs.todayMainSections) ? current.configs.todayMainSections : ['flow']).map(String).filter(item => item !== id)
      const nextSide = (Array.isArray(current.configs.todaySideSections) ? current.configs.todaySideSections : ['goals', 'notes', 'health', 'finance']).map(String).filter(item => item !== id)
      const nextHidden = (Array.isArray(current.configs.todayHiddenSections) ? current.configs.todayHiddenSections : []).map(String).filter(item => item !== id)
      if (target === 'main') nextMain.push(id)
      if (target === 'side') nextSide.push(id)
      if (target === 'hidden') nextHidden.push(id)
      return { ...current, configs: { ...current.configs, todayMainSections: nextMain, todaySideSections: nextSide, todayHiddenSections: nextHidden } }
    })
  }
  function reorder(id: TodayBlock, delta: number) {
    commit(current => {
      const currentMain = (Array.isArray(current.configs.todayMainSections) ? current.configs.todayMainSections : ['flow']).map(String)
      const isMain = currentMain.includes(id)
      const key = isMain ? 'todayMainSections' : 'todaySideSections'
      const fallback = isMain ? ['flow'] : ['goals', 'notes', 'health', 'finance']
      const list = (Array.isArray(current.configs[key]) ? current.configs[key] : fallback).map(String)
      const index = list.indexOf(id)
      const target = Math.max(0, Math.min(list.length - 1, index + delta))
      if (index < 0 || index === target) return current
      const next = [...list]; const [moved] = next.splice(index, 1); next.splice(target, 0, moved)
      return { ...current, configs: { ...current.configs, [key]: next } }
    })
  }

  return <div className={styles.modalLayer} onMouseDown={onClose}><section className={styles.modalCard} onMouseDown={event => event.stopPropagation()}><header className={styles.modalHeader}><div><h2>Personalizar Hoje</h2><p>Escolha posição, visibilidade e ordem.</p></div><button onClick={onClose}>×</button></header><div style={{ padding: 14 }}><div className="mai-today-config">{TODAY_BLOCKS.map(block => <div key={block.id}><strong>{block.label}</strong><select value={position(block.id)} onChange={event => moveTo(block.id, event.target.value as 'main' | 'side' | 'hidden')}><option value="main">Principal</option><option value="side">Lateral direita</option><option value="hidden">Oculto</option></select><span><button onClick={() => reorder(block.id, -1)}>↑</button><button onClick={() => reorder(block.id, 1)}>↓</button></span></div>)}</div></div><footer><span /><button className={styles.primaryButton} onClick={onClose}>Concluir</button></footer></section></div>
}
