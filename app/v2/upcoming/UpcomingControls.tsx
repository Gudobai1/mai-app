'use client'

import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Icon } from '../../ds'
import { Floating } from '../detail/Pickers'
import styles from './UpcomingControls.module.css'

/* Filtros e exibição do Em breve. Tudo é guardado como "o que está escondido",
 * assim projetos, agendas e categorias novos já aparecem por padrão. */

export type Kind = 'event' | 'task' | 'habit' | 'finance'

export type UpcomingFilters = {
  hiddenKinds: Kind[]
  hiddenProjects: string[]
  hiddenSources: string[]
  hiddenPriorities: number[]
  hiddenFinance: string[]
  hideDone: boolean
  hideLate: boolean
}

export type UpcomingDisplay = { group: 'kind' | 'project' | 'none'; sort: 'time' | 'priority' | 'name'; nextOnly: boolean }

export const EMPTY_FILTERS: UpcomingFilters = { hiddenKinds: [], hiddenProjects: [], hiddenSources: [], hiddenPriorities: [], hiddenFinance: [], hideDone: false, hideLate: false }
export const DEFAULT_DISPLAY: UpcomingDisplay = { group: 'kind', sort: 'time', nextOnly: false }

export const KINDS: { id: Kind; label: string; icon: string }[] = [
  { id: 'event', label: 'Compromissos', icon: 'event' },
  { id: 'task', label: 'Tarefas', icon: 'task_alt' },
  { id: 'habit', label: 'Hábitos', icon: 'autorenew' },
  { id: 'finance', label: 'Finanças', icon: 'payments' },
]

const PRIORITIES = [
  { id: 1, label: 'Prioridade 1', color: 'var(--ds-rose-fg)' },
  { id: 2, label: 'Prioridade 2', color: 'var(--ds-peach-fg)' },
  { id: 3, label: 'Prioridade 3', color: 'var(--ds-sky-fg)' },
  { id: 4, label: 'Sem prioridade', color: 'var(--ds-muted)' },
]

export const activeFilterCount = (filters: UpcomingFilters) =>
  filters.hiddenKinds.length + filters.hiddenProjects.length + filters.hiddenSources.length + filters.hiddenPriorities.length + filters.hiddenFinance.length + (filters.hideDone ? 1 : 0) + (filters.hideLate ? 1 : 0)

export const normalizeFilters = (value: unknown): UpcomingFilters => {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<UpcomingFilters>
  const list = <T,>(item: unknown): T[] => (Array.isArray(item) ? (item as T[]) : [])
  return {
    hiddenKinds: list<Kind>(raw.hiddenKinds),
    hiddenProjects: list<string>(raw.hiddenProjects).map(String),
    hiddenSources: list<string>(raw.hiddenSources).map(String),
    hiddenPriorities: list<number>(raw.hiddenPriorities).map(Number),
    hiddenFinance: list<string>(raw.hiddenFinance).map(String),
    hideDone: raw.hideDone === true,
    hideLate: raw.hideLate === true,
  }
}

type Option = { id: string; label: string; color?: string }

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className={styles.section}>
      <header><h4>{title}</h4>{action}</header>
      <div>{children}</div>
    </section>
  )
}

function Row({ checked, onToggle, label, color, icon }: { checked: boolean; onToggle: () => void; label: string; color?: string; icon?: string }) {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={checked} className={styles.row} data-on={checked || undefined} onClick={onToggle}>
      {icon ? <Icon name={icon} size={18} filled={false} className={styles.rowIcon} style={color ? { color } : undefined} /> : color ? <i className={styles.dot} style={{ background: color }} /> : null}
      <span>{label}</span>
      <span className={styles.tick}>{checked ? <Icon name="check" size={16} /> : null}</span>
    </button>
  )
}

type FilterProps = {
  filters: UpcomingFilters
  onChange: (next: UpcomingFilters) => void
  projects: Option[]
  sources: Option[]
}

export function UpcomingControls({ filters, onChange, projects, sources, display, onDisplay }: FilterProps & { display: UpcomingDisplay; onDisplay: (next: UpcomingDisplay) => void }) {
  const [open, setOpen] = useState<'' | 'filter' | 'display'>('')
  const filterRef = useRef<HTMLButtonElement | null>(null)
  const displayRef = useRef<HTMLButtonElement | null>(null)
  const count = activeFilterCount(filters)

  const toggle = <K extends keyof UpcomingFilters>(key: K, value: UpcomingFilters[K] extends (infer U)[] ? U : never) => {
    const current = filters[key] as unknown as unknown[]
    const next = current.includes(value) ? current.filter(item => item !== value) : [...current, value]
    onChange({ ...filters, [key]: next })
  }
  const setAll = (key: 'hiddenProjects' | 'hiddenSources', options: Option[], visible: boolean) => onChange({ ...filters, [key]: visible ? [] : options.map(item => item.id) })

  return (
    <>
      <button ref={filterRef} type="button" className={styles.control} data-active={count > 0 || undefined} onClick={() => setOpen('filter')}>
        <Icon name="filter_list" size={18} filled={false} /><span>Filtros</span>{count ? <b>{count}</b> : null}
      </button>
      <button ref={displayRef} type="button" className={styles.control} onClick={() => setOpen('display')}>
        <Icon name="tune" size={18} filled={false} /><span>Exibição</span>
      </button>

      {open === 'filter' ? (
        <Floating anchor={filterRef} title="Filtros" width={340} onClose={() => setOpen('')}>
          <div className={styles.panel}>
            <Section title="Tipos">
              {KINDS.map(kind => <Row key={kind.id} icon={kind.icon} label={kind.label} checked={!filters.hiddenKinds.includes(kind.id)} onToggle={() => toggle('hiddenKinds', kind.id)} />)}
            </Section>
            <Section title="Status">
              <Row label="Mostrar concluídos" checked={!filters.hideDone} onToggle={() => onChange({ ...filters, hideDone: !filters.hideDone })} />
              <Row label="Mostrar tarefas atrasadas" checked={!filters.hideLate} onToggle={() => onChange({ ...filters, hideLate: !filters.hideLate })} />
            </Section>
            <Section title="Prioridade">
              {PRIORITIES.map(item => <Row key={item.id} icon="flag" color={item.color} label={item.label} checked={!filters.hiddenPriorities.includes(item.id)} onToggle={() => toggle('hiddenPriorities', item.id)} />)}
            </Section>
            {projects.length ? (
              <Section title="Projetos" action={<button type="button" className={styles.link} onClick={() => setAll('hiddenProjects', projects, filters.hiddenProjects.length > 0)}>{filters.hiddenProjects.length ? 'Mostrar todos' : 'Esconder todos'}</button>}>
                {projects.map(item => <Row key={item.id} label={item.label} color={item.color} checked={!filters.hiddenProjects.includes(item.id)} onToggle={() => toggle('hiddenProjects', item.id)} />)}
              </Section>
            ) : null}
            {sources.length ? (
              <Section title="Agendas e categorias" action={<button type="button" className={styles.link} onClick={() => setAll('hiddenSources', sources, filters.hiddenSources.length > 0)}>{filters.hiddenSources.length ? 'Mostrar todas' : 'Esconder todas'}</button>}>
                {sources.map(item => <Row key={item.id} label={item.label} color={item.color} checked={!filters.hiddenSources.includes(item.id)} onToggle={() => toggle('hiddenSources', item.id)} />)}
              </Section>
            ) : null}
            <Section title="Finanças">
              <Row icon="trending_up" label="Receitas" checked={!filters.hiddenFinance.includes('receita')} onToggle={() => toggle('hiddenFinance', 'receita')} />
              <Row icon="trending_down" label="Despesas" checked={!filters.hiddenFinance.includes('despesa')} onToggle={() => toggle('hiddenFinance', 'despesa')} />
            </Section>
            {count ? <footer className={styles.footer}><button type="button" className={styles.link} onClick={() => onChange(EMPTY_FILTERS)}>Limpar filtros</button></footer> : null}
          </div>
        </Floating>
      ) : null}

      {open === 'display' ? (
        <Floating anchor={displayRef} title="Exibição" width={280} onClose={() => setOpen('')}>
          <div className={styles.panel}>
            <Section title="Agrupar por">
              {([['kind', 'Tipo'], ['project', 'Projeto'], ['none', 'Sem grupos']] as [UpcomingDisplay['group'], string][]).map(([id, label]) => (
                <button key={id} type="button" role="menuitemradio" aria-checked={display.group === id} className={styles.row} data-on={display.group === id || undefined} onClick={() => onDisplay({ ...display, group: id })}>
                  <span>{label}</span><span className={styles.tick}>{display.group === id ? <Icon name="check" size={16} /> : null}</span>
                </button>
              ))}
            </Section>
            <Section title="Ordenar por">
              {([['time', 'Horário'], ['priority', 'Prioridade'], ['name', 'Nome']] as [UpcomingDisplay['sort'], string][]).map(([id, label]) => (
                <button key={id} type="button" role="menuitemradio" aria-checked={display.sort === id} className={styles.row} data-on={display.sort === id || undefined} onClick={() => onDisplay({ ...display, sort: id })}>
                  <span>{label}</span><span className={styles.tick}>{display.sort === id ? <Icon name="check" size={16} /> : null}</span>
                </button>
              ))}
            </Section>
            <Section title="Eventos repetidos">
              {([[false, 'Todas as ocorrências'], [true, 'Somente a próxima']] as [boolean, string][]).map(([id, label]) => (
                <button key={String(id)} type="button" role="menuitemradio" aria-checked={display.nextOnly === id} className={styles.row} data-on={display.nextOnly === id || undefined} onClick={() => onDisplay({ ...display, nextOnly: id })}>
                  <span>{label}</span><span className={styles.tick}>{display.nextOnly === id ? <Icon name="check" size={16} /> : null}</span>
                </button>
              ))}
            </Section>
          </div>
        </Floating>
      ) : null}
    </>
  )
}

export type { CSSProperties }
