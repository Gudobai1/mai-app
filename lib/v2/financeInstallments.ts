/** Parcelas: intervalos 'diario' | 'semanal' | 'quinzenal' | 'mensal' | 'anual' | 'dias:N'. */

export const INTERVAL_CHOICES = [
  { value: 'diario', label: 'Diário' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quinzenal', label: 'Quinzenal' },
  { value: 'mensal', label: 'Mensal' },
  { value: 'anual', label: 'Anual' },
  { value: 'custom', label: 'Personalizado' },
]

export const intervalDays = (interval: string) => (interval.startsWith('dias:') ? Math.max(1, Number(interval.slice(5)) || 1) : 0)
/** Valor do seletor (agrupa 'dias:N' em 'custom'). */
export const intervalChoice = (interval: string) => (interval.startsWith('dias:') ? 'custom' : interval || 'mensal')

export function intervalLabel(interval: string) {
  if (interval.startsWith('dias:')) return `a cada ${intervalDays(interval)} dias`
  return { diario: 'por dia', semanal: 'por semana', quinzenal: 'por quinzena', anual: 'por ano' }[interval] || 'por mês'
}

export function shiftInstallment(key: string, index: number, interval: string) {
  const date = new Date(`${key}T12:00:00`)
  const day = date.getDate()
  const custom = intervalDays(interval)
  if (custom) date.setDate(day + index * custom)
  else if (interval === 'diario') date.setDate(day + index)
  else if (interval === 'semanal') date.setDate(day + index * 7)
  else if (interval === 'quinzenal') date.setDate(day + index * 15)
  else if (interval === 'anual') date.setFullYear(date.getFullYear() + index)
  else { date.setDate(1); date.setMonth(date.getMonth() + index); date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate())) }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
