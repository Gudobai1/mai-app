'use client'

import type { MaiState } from '../../lib/v2/state'
import type { TodayBlock } from './app-types'
import { TODAY_BLOCKS } from './TodayBlocks'
import styles from './unified.module.css'

type Props = { state: MaiState; commit: (change: (current: MaiState) => MaiState) => void; onClose: () => void }

export function TodaySettingsDrawer({ state, commit, onClose }: Props) {
  const side = (Array.isArray(state.configs.todaySideSections) ? state.configs.todaySideSections : ['habits','goals','notes','finance','health']).map(String)
  const hidden = (Array.isArray(state.configs.todayHiddenSections) ? state.configs.todayHiddenSections : []).map(String)

  function toggle(id: TodayBlock, visible: boolean) {
    commit(current => {
      const currentSide = (Array.isArray(current.configs.todaySideSections) ? current.configs.todaySideSections : ['habits','goals','notes','finance','health']).map(String).filter(item => item !== id)
      const currentHidden = (Array.isArray(current.configs.todayHiddenSections) ? current.configs.todayHiddenSections : []).map(String).filter(item => item !== id)
      if (visible) currentSide.push(id); else currentHidden.push(id)
      return { ...current, configs:{ ...current.configs, todaySideSections:currentSide, todayHiddenSections:currentHidden } }
    })
  }

  function reorder(id: TodayBlock, delta: number) {
    commit(current => {
      const list = (Array.isArray(current.configs.todaySideSections) ? current.configs.todaySideSections : ['habits','goals','notes','finance','health']).map(String)
      const index = list.indexOf(id)
      if (index < 0) return current
      const target = Math.max(0, Math.min(list.length - 1, index + delta))
      if (target === index) return current
      const next = [...list]; const [moved] = next.splice(index,1); next.splice(target,0,moved)
      return { ...current, configs:{ ...current.configs, todaySideSections:next } }
    })
  }

  return <div className={styles.modalLayer} onMouseDown={onClose}><section className={styles.modalCard} onMouseDown={event => event.stopPropagation()}><header className={styles.modalHeader}><div><h2>Personalizar Hoje</h2><p>Compromissos e tarefas permanecem fixos. Escolha os cartões da lateral.</p></div><button onClick={onClose}>×</button></header><div className="mai-today-settings-v2">{TODAY_BLOCKS.map(block => { const visible = side.includes(block.id) && !hidden.includes(block.id); return <div key={block.id}><label><input type="checkbox" checked={visible} onChange={event => toggle(block.id,event.target.checked)}/><span><strong>{block.label}</strong><small>{visible ? 'Visível na lateral direita' : 'Oculto'}</small></span></label><div><button disabled={!visible} onClick={() => reorder(block.id,-1)}>↑</button><button disabled={!visible} onClick={() => reorder(block.id,1)}>↓</button></div></div> })}</div><footer><span/><button className={styles.primaryButton} onClick={onClose}>Concluir</button></footer></section></div>
}
