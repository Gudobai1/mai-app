import { PALETTE } from './palette'
import { stateRows, type MaiState } from './state-model'

/** Categoria de compromisso: nome + cor. A lista fica salva em configs.categoriasEvento. */
export type EventCategory = { nome: string; cor: string }

export const EVENT_CATEGORY_COLORS = PALETTE.map(item => item.color)

const clean = (value: unknown) => String(value ?? '').trim()

/**
 * Lista de categorias: as salvas + as que já aparecem em compromissos
 * (assim as categorias digitadas antes continuam disponíveis).
 */
export function eventCategories(state: MaiState): EventCategory[] {
  const result: EventCategory[] = []
  const seen = new Set<string>()
  const push = (nome: string, cor: string) => {
    const key = nome.toLowerCase()
    if (!nome || seen.has(key)) return
    seen.add(key)
    result.push({ nome, cor: cor || EVENT_CATEGORY_COLORS[0] })
  }
  for (const item of stateRows(state.configs?.categoriasEvento) as Record<string, unknown>[]) push(clean(item?.nome), clean(item?.cor))
  for (const event of stateRows(state.events) as Record<string, unknown>[]) push(clean(event?.categoria), clean(event?.categoria_cor || event?.cor))
  return result
}

/** Devolve o estado com a categoria guardada na lista (sem duplicar pelo nome). */
export function withEventCategory(state: MaiState, category: EventCategory): MaiState {
  const nome = clean(category.nome)
  if (!nome) return state
  const saved = (stateRows(state.configs?.categoriasEvento) as Record<string, unknown>[]).map(item => ({ nome: clean(item?.nome), cor: clean(item?.cor) })).filter(item => item.nome)
  const index = saved.findIndex(item => item.nome.toLowerCase() === nome.toLowerCase())
  const next = index >= 0 ? saved.map((item, position) => (position === index ? { nome, cor: category.cor } : item)) : [...saved, { nome, cor: category.cor }]
  return { ...state, configs: { ...state.configs, categoriasEvento: next } }
}

/** Renomeia e/ou troca a cor de uma categoria, atualizando também os compromissos que a usam. */
export function updateEventCategory(state: MaiState, oldName: string, next: EventCategory): MaiState {
  const nome = clean(next.nome)
  if (!nome) return state
  const base = withEventCategory(state, { nome: clean(oldName), cor: next.cor })
  const saved = (stateRows(base.configs?.categoriasEvento) as Record<string, unknown>[]).map(item => ({ nome: clean(item?.nome), cor: clean(item?.cor) }))
  const categoriasEvento = saved.map(item => (item.nome.toLowerCase() === clean(oldName).toLowerCase() ? { nome, cor: next.cor } : item))
  const events = (stateRows(base.events) as Record<string, unknown>[]).map(event => clean(event?.categoria).toLowerCase() === clean(oldName).toLowerCase() ? { ...event, categoria: nome, categoria_cor: next.cor, cor: next.cor } : event)
  return { ...base, events: events as MaiState['events'], configs: { ...base.configs, categoriasEvento } }
}

/** Remove a categoria da lista e tira ela dos compromissos (eles continuam existindo, sem categoria). */
export function removeEventCategory(state: MaiState, name: string): MaiState {
  const key = clean(name).toLowerCase()
  const categoriasEvento = (stateRows(state.configs?.categoriasEvento) as Record<string, unknown>[]).filter(item => clean(item?.nome).toLowerCase() !== key)
  const events = (stateRows(state.events) as Record<string, unknown>[]).map(event => clean(event?.categoria).toLowerCase() === key ? { ...event, categoria: '', categoria_cor: '', cor: '' } : event)
  return { ...state, events: events as MaiState['events'], configs: { ...state.configs, categoriasEvento } }
}
