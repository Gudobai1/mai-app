/** Unidades abreviadas padrão dos hábitos (o valor guardado é a abreviação). */
export const UNIT_GROUPS: { label: string; units: { value: string; name: string }[] }[] = [
  { label: 'Tempo', units: [
    { value: 'min', name: 'minutos' }, { value: 'h', name: 'horas' }, { value: 's', name: 'segundos' }, { value: 'dia', name: 'dias' }, { value: 'sem', name: 'semanas' },
  ] },
  { label: 'Volume', units: [
    { value: 'L', name: 'litros' }, { value: 'mL', name: 'mililitros' }, { value: 'cp', name: 'copos' }, { value: 'xíc', name: 'xícaras' }, { value: 'cs', name: 'colheres de sopa' }, { value: 'cc', name: 'colheres de chá' }, { value: 'gl', name: 'galões' },
  ] },
  { label: 'Distância', units: [
    { value: 'km', name: 'quilômetros' }, { value: 'm', name: 'metros' }, { value: 'cm', name: 'centímetros' }, { value: 'mi', name: 'milhas' }, { value: 'pas', name: 'passos' }, { value: 'vlt', name: 'voltas' },
  ] },
  { label: 'Peso', units: [
    { value: 'kg', name: 'quilos' }, { value: 'g', name: 'gramas' }, { value: 'mg', name: 'miligramas' }, { value: 'lb', name: 'libras' },
  ] },
  { label: 'Energia e saúde', units: [
    { value: 'kcal', name: 'calorias' }, { value: 'bpm', name: 'batimentos por minuto' }, { value: 'cáp', name: 'cápsulas' }, { value: 'cmp', name: 'comprimidos' }, { value: 'gt', name: 'gotas' }, { value: 'dos', name: 'doses' },
  ] },
  { label: 'Treino e estudo', units: [
    { value: 'rep', name: 'repetições' }, { value: 'sér', name: 'séries' }, { value: 'pág', name: 'páginas' }, { value: 'cap', name: 'capítulos' }, { value: 'liç', name: 'lições' }, { value: 'ex', name: 'exercícios' }, { value: 'pal', name: 'palavras' },
  ] },
  { label: 'Dinheiro e contagem', units: [
    { value: 'R$', name: 'reais' }, { value: '%', name: 'por cento' }, { value: 'pts', name: 'pontos' }, { value: 'un', name: 'unidades' }, { value: 'x', name: 'vezes' }, { value: 'ref', name: 'refeições' }, { value: 'pç', name: 'porções' },
  ] },
]

const ALIASES: Record<string, string> = {}
for (const group of UNIT_GROUPS) for (const unit of group.units) ALIASES[unit.name.toLocaleLowerCase('pt-BR')] = unit.value
Object.assign(ALIASES, { minuto: 'min', hora: 'h', segundo: 's', litro: 'L', copo: 'cp', quilômetro: 'km', quilometros: 'km', quilômetros: 'km', quilo: 'kg', grama: 'g', página: 'pág', paginas: 'pág', páginas: 'pág', vez: 'x', vezes: 'x', repetição: 'rep', série: 'sér', capítulo: 'cap', passo: 'pas', real: 'R$', unidade: 'un', refeição: 'ref', dose: 'dos', caloria: 'kcal', calorias: 'kcal', litros: 'L', horas: 'h', minutos: 'min' })

/** Abreviação de uma unidade (nomes por extenso conhecidos viram a sigla). */
export function abbreviateUnit(unit: unknown): string {
  const raw = String(unit || '').trim()
  if (!raw) return ''
  return ALIASES[raw.toLocaleLowerCase('pt-BR')] || raw
}

export const isPresetUnit = (unit: string) => UNIT_GROUPS.some(group => group.units.some(item => item.value === unit))
