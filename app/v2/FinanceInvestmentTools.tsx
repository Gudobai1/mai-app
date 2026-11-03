'use client'

import type { Dispatch, SetStateAction } from 'react'
import s from './FinanceItemCard.module.css'

type Row = Record<string, any>
export type Tax = { id: string; nome: string; aliquota: number; base: 'rendimento' | 'ano' }

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const num = (value: unknown) => Number(value || 0) || 0
const dateKey = (value: unknown) => String(value || '').slice(0, 10)
export const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const round2 = (value: number) => Math.round(value * 100) / 100

const dayDiff = (from: string, to: string) => Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000)
const addDays = (key: string, amount: number) => { const date = new Date(`${key}T12:00:00`); date.setDate(date.getDate() + amount); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
const monthOf = (key: string) => key.slice(0, 7)
const shift = (month: string, amount: number) => { const date = new Date(`${month}-15T12:00:00`); date.setMonth(date.getMonth() + amount); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` }
const dayInMonth = (month: string, day: number) => { const max = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate(); return `${month}-${String(Math.min(max, Math.max(1, day))).padStart(2, '0')}` }

export const defaultTaxes: Tax[] = [{ id: 'ir', nome: 'IR', aliquota: 15, base: 'rendimento' }]

export function firstApplication(inv: Row) {
  const own = dateKey(inv.data_inicio)
  if (own) return own
  const dates = rows(inv.movimentos).filter(mov => mov.tipo === 'aporte').map(mov => dateKey(mov.data)).filter(Boolean).sort()
  return dates[0] || ''
}

export function investmentTaxes(inv: Row, today: string): Tax[] {
  const mode = String(inv.impostos_modo || 'fixa')
  if (mode === 'isento') return []
  if (mode === 'regressiva') {
    const start = firstApplication(inv)
    const days = start ? dayDiff(start, today) : 0
    const rate = days <= 180 ? 22.5 : days <= 360 ? 20 : days <= 720 ? 17.5 : 15
    return [{ id: 'ir', nome: 'IR (tabela regressiva)', aliquota: rate, base: 'rendimento' }]
  }
  const list = Array.isArray(inv.impostos) ? inv.impostos as Tax[] : defaultTaxes
  return list.filter(tax => tax.base === 'rendimento')
}

export function redeemPreview(inv: Row, amount: number, today: string) {
  const current = num(inv.valor_atual)
  const applied = num(inv.aportado)
  const value = Math.min(Math.max(0, amount), current)
  const gain = current > 0 ? Math.max(0, value * (current - applied) / current) : 0
  const lines = investmentTaxes(inv, today).map(tax => ({ ...tax, valor: round2(gain * num(tax.aliquota) / 100) }))
  const taxTotal = round2(lines.reduce((sum, line) => sum + line.valor, 0))
  const principal = current > 0 ? value * applied / current : 0
  return { value, gain: round2(gain), lines, taxTotal, net: round2(value - taxTotal), principal }
}

/** Rentabilidade diária/mensal estimada e aporte automático. Idempotente: devolve null se nada mudou. */
export function applyInvestmentAutomation(inv: Row, today: string): Row | null {
  let next: Row = inv
  let changed = false
  const rate = num(inv.rent_taxa)
  const freq = String(inv.rent_freq || 'dia')
  if (rate > 0 && freq !== 'manual') {
    const last = dateKey(inv.rent_ultima)
    if (!last) { next = { ...next, rent_ultima: today }; changed = true } else {
      const step = freq === 'mes' ? 30 : 1
      const periods = Math.floor(dayDiff(last, today) / step)
      if (periods >= 1) {
        const days = periods * step
        next = { ...next, valor_atual: round2(num(next.valor_atual) * Math.pow(1 + rate / 100, days / 365)), rent_ultima: addDays(last, days) }
        changed = true
      }
    }
  }
  const auto = num(inv.aporte_auto_valor)
  if (auto > 0) {
    const day = Math.min(31, Math.max(1, num(inv.aporte_auto_dia) || 1))
    const lastMonth = String(inv.aporte_auto_ultimo || '')
    if (!lastMonth) {
      next = { ...next, aporte_auto_ultimo: Number(today.slice(8)) >= day ? monthOf(today) : shift(monthOf(today), -1) }
      changed = true
    } else {
      let cursor = lastMonth
      const movements = [...rows(next.movimentos)]
      let applied = num(next.aportado)
      let current = num(next.valor_atual)
      for (let guard = 0; guard < 120; guard += 1) {
        const month = shift(cursor, 1)
        const date = dayInMonth(month, day)
        if (month > monthOf(today) || date > today) break
        movements.unshift({ id: `mov-${crypto.randomUUID()}`, data: `${date}T12:00:00.000Z`, tipo: 'aporte', valor: auto, auto: true })
        applied += auto
        current += auto
        cursor = month
      }
      if (cursor !== lastMonth) { next = { ...next, movimentos: movements, aportado: round2(applied), valor_atual: round2(current), aporte_auto_ultimo: cursor }; changed = true }
    }
  }
  return changed ? next : null
}

export const rentSummary = (inv: Row) => num(inv.rent_taxa) > 0 ? `${String(num(inv.rent_taxa)).replace('.', ',')}% ao ano · ${inv.rent_freq === 'mes' ? 'todo mês' : inv.rent_freq === 'manual' ? 'só manual' : 'todo dia'}` : 'Não configurada'
export const autoSummary = (inv: Row) => num(inv.aporte_auto_valor) > 0 ? `${brl.format(num(inv.aporte_auto_valor))} · dia ${num(inv.aporte_auto_dia) || 1}` : 'Desligado'
export const taxSummary = (inv: Row) => {
  const mode = String(inv.impostos_modo || 'fixa')
  if (mode === 'isento') return 'Isento'
  if (mode === 'regressiva') return 'Tabela regressiva'
  const list = (Array.isArray(inv.impostos) ? inv.impostos as Tax[] : defaultTaxes)
  return list.length ? list.map(tax => `${tax.nome} ${String(tax.aliquota).replace('.', ',')}%`).join(' · ') : 'Sem impostos'
}

type EditorProps = { draft: Row; setDraft: Dispatch<SetStateAction<Row | null>> }
const patchOf = (setDraft: EditorProps['setDraft']) => (value: Row) => setDraft(current => current ? { ...current, ...value } : current)

export function RentEditor({ draft, setDraft }: EditorProps) {
  const patch = patchOf(setDraft)
  return <div className={s.mini}>
    <label><span>Taxa (% ao ano)</span><input type="number" step="0.01" min="0" value={draft.rent_taxa || 0} onChange={event => patch({ rent_taxa: Number(event.target.value), rent_ultima: draft.rent_ultima || '' })} /></label>
    <label><span>Atualizar</span><select value={draft.rent_freq || 'dia'} onChange={event => patch({ rent_freq: event.target.value })}><option value="dia">Todo dia</option><option value="mes">Todo mês</option><option value="manual">Só manual</option></select></label>
    <p className={s.note}>O valor atual é estimado pela taxa configurada; você pode corrigir quando quiser.</p>
  </div>
}

export function AutoEditor({ draft, setDraft }: EditorProps) {
  const patch = patchOf(setDraft)
  return <div className={s.mini}>
    <label><span>Valor do aporte</span><input type="number" step="0.01" min="0" value={draft.aporte_auto_valor || 0} onChange={event => patch({ aporte_auto_valor: Number(event.target.value) })} /></label>
    <label><span>Dia do mês</span><input type="number" min="1" max="31" value={draft.aporte_auto_dia || 1} onChange={event => patch({ aporte_auto_dia: Number(event.target.value) })} /></label>
    <p className={s.note}>Use valor 0 para desligar. O aporte entra na lista de lançamentos no dia escolhido.</p>
  </div>
}

export function TaxEditor({ draft, setDraft }: EditorProps) {
  const patch = patchOf(setDraft)
  const mode = String(draft.impostos_modo || 'fixa')
  const list: Tax[] = Array.isArray(draft.impostos) ? draft.impostos as Tax[] : defaultTaxes
  const update = (index: number, value: Partial<Tax>) => patch({ impostos: list.map((tax, position) => position === index ? { ...tax, ...value } : tax) })
  return <div className={s.mini}>
    <div className={s.chips}>{[['fixa', 'Alíquota fixa'], ['regressiva', 'Tabela regressiva'], ['isento', 'Isento']].map(([id, label]) => <button key={id} type="button" data-active={mode === id} onClick={() => patch({ impostos_modo: id, impostos: Array.isArray(draft.impostos) ? draft.impostos : defaultTaxes })}>{label}</button>)}</div>
    {mode === 'fixa' ? <>
      {list.map((tax, index) => <div className={s.taxRow} key={tax.id}>
        <input value={tax.nome} aria-label="Nome" onChange={event => update(index, { nome: event.target.value })} />
        <input type="number" step="0.01" min="0" value={tax.aliquota} aria-label="Alíquota (%)" onChange={event => update(index, { aliquota: Number(event.target.value) })} />
        <select value={tax.base} aria-label="Base" onChange={event => update(index, { base: event.target.value as Tax['base'] })}><option value="rendimento">% s/ rendimento</option><option value="ano">% ao ano</option></select>
        <button type="button" aria-label="Remover" onClick={() => patch({ impostos: list.filter((_, position) => position !== index) })}>×</button>
      </div>)}
      <button type="button" className={s.addTax} onClick={() => patch({ impostos: [...list, { id: `tax-${crypto.randomUUID()}`, nome: 'Imposto', aliquota: 0, base: 'rendimento' }] })}>+ Adicionar imposto ou taxa</button>
    </> : null}
    {mode === 'regressiva' ? <p className={s.note}>IR de 22,5% até 180 dias, 20% até 360, 17,5% até 720 e 15% depois, sobre o rendimento.</p> : null}
    <p className={s.note}>Os valores são estimativas. Confira o imposto real na sua corretora. Taxas “ao ano” não entram no cálculo do resgate.</p>
  </div>
}
