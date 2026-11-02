/*
 * Linguagem natural (português do Brasil) para adicionar e buscar.
 * Lê uma frase e separa o que é data, horário, prioridade, repetição,
 * lembrete, projeto e valor. O que sobra é o título.
 *
 * Não depende de tela: recebe o texto e devolve o que entendeu, com a posição
 * de cada trecho (para destacar) e o texto final sem esses trechos.
 */

import { addDays } from './planner'

type Row = Record<string, any>

export type NlKind = 'date' | 'time' | 'end' | 'priority' | 'repeat' | 'reminder' | 'project' | 'amount' | 'range'

export type NlToken = { kind: NlKind; start: number; end: number; text: string; value: string }

export type NlResult = {
  title: string
  tokens: NlToken[]
  date?: string
  time?: string
  end?: string
  priority?: number
  repeat?: string
  reminder?: string
  projectId?: string
  section?: string
  amount?: number
  /** Só na busca: "esta semana", "este mês". */
  range?: { from: string; to: string }
  overdue?: boolean
}

export type NlOptions = {
  today: string
  projects?: Row[]
  /** Tipos que o usuário desfez: ficam no texto. */
  ignore?: Iterable<NlKind>
  /** Tipos que esta tela entende (padrão: todos, menos valor e período). */
  kinds?: NlKind[]
}

const DEFAULT_KINDS: NlKind[] = ['date', 'time', 'priority', 'repeat', 'reminder', 'project']

const WEEKDAYS: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 }
const WD = '(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?s?'
const MONTHS: Record<string, number> = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 }

/** Minúsculas e sem acento, mantendo o mesmo tamanho (as posições continuam valendo). */
export function fold(text: string) {
  return text.replace(/[À-ſ]/g, char => char.normalize('NFD')[0]).toLowerCase()
}

const B = '(?<![\\p{L}\\p{N}_])'
const E = '(?![\\p{L}\\p{N}_])'
const re = (pattern: string, flags = 'giu') => new RegExp(pattern, flags)

const pad = (n: number) => String(n).padStart(2, '0')
const weekdayOf = (key: string) => new Date(`${key}T12:00:00`).getDay()
const monthKey = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`
const validDay = (year: number, month: number, day: number) => {
  const date = new Date(`${monthKey(year, month, day)}T12:00:00`)
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day
}

function nextWeekday(today: string, target: number, includeToday = false) {
  const diff = (target - weekdayOf(today) + 7) % 7
  return addDays(today, diff === 0 && !includeToday ? 7 : diff)
}

function nextMonday(today: string) {
  return addDays(today, ((8 - weekdayOf(today)) % 7) || 7)
}

function clock(hour: number, minute: number) {
  if (hour > 23 || minute > 59) return ''
  return `${pad(hour)}:${pad(minute)}`
}

function projectMatch(folded: string, from: number, projects: Row[]) {
  const named = projects
    .filter(project => project.ativo !== false)
    .map(project => ({ project, name: fold(String(project.nome || '')) }))
    .filter(item => item.name)
  const rest = folded.slice(from)
  const boundary = (value: string, length: number) => !/[\p{L}\p{N}_]/u.test(value.charAt(length))

  let found: { project: Row; length: number } | null = null
  for (const item of [...named].sort((a, b) => b.name.length - a.name.length)) {
    if (rest.startsWith(item.name) && boundary(rest, item.name.length)) { found = { project: item.project, length: item.name.length }; break }
  }
  if (!found) {
    // Começo do nome, uma palavra só e sem ambiguidade (ex.: #trab → Trabalho).
    const word = /^[\p{L}\p{N}_-]+/u.exec(rest)?.[0] || ''
    if (word.length < 2) return null
    const starts = named.filter(item => item.name.startsWith(word))
    if (starts.length !== 1) return null
    found = { project: starts[0].project, length: word.length }
  }

  let project = found.project
  let length = found.length
  let section = ''
  // #Projeto/Subprojeto ou #Projeto/Seção
  if (rest.charAt(length) === '/') {
    const after = rest.slice(length + 1)
    const child = named.find(item => String(item.project.parent_id || '') === String(project.id) && after.startsWith(item.name) && boundary(after, item.name.length))
    if (child) { project = child.project; length += 1 + child.name.length }
    else {
      const sections: string[] = Array.isArray(project.secoes) ? project.secoes.map(String) : []
      const hit = sections.find(name => after.startsWith(fold(name)) && boundary(after, fold(name).length))
      if (hit) { section = hit; length += 1 + fold(hit).length }
    }
  }
  return { projectId: String(project.id), section, length }
}

export function parseNatural(text: string, options: NlOptions): NlResult {
  const { today } = options
  const ignore = new Set<NlKind>(options.ignore || [])
  const kinds = new Set<NlKind>((options.kinds || DEFAULT_KINDS).filter(kind => !ignore.has(kind)))
  const folded = fold(text)
  const lower = text.toLowerCase()
  const tokens: NlToken[] = []
  const result: NlResult = { title: '', tokens }

  const covered = (start: number, end: number) => tokens.some(token => start < token.end && end > token.start)
  const add = (kind: NlKind, start: number, end: number, value: string) => {
    if (!kinds.has(kind) || covered(start, end)) return false
    tokens.push({ kind, start, end, text: text.slice(start, end), value })
    return true
  }
  const scan = (source: string, pattern: string, handler: (match: RegExpMatchArray, start: number, end: number) => boolean | void, flags?: string) => {
    for (const match of source.matchAll(re(pattern, flags))) {
      const start = match.index ?? 0
      if (handler(match, start, start + match[0].length)) return
    }
  }

  // ---- Projeto: #Nome, #Projeto/Seção
  if (kinds.has('project')) {
    scan(folded, `${B}#`, (_match, start) => {
      const hit = projectMatch(folded, start + 1, options.projects || [])
      if (!hit) return
      if (add('project', start, start + 1 + hit.length, `${hit.projectId}|${hit.section}`)) {
        result.projectId = hit.projectId
        result.section = hit.section
        return true
      }
    })
  }

  // ---- Prioridade: !1 !2 !3 !alta !média !baixa
  if (kinds.has('priority')) {
    scan(folded, `${B}!(1|2|3|4|alta|media|baixa|nenhuma)${E}`, (match, start, end) => {
      const word = match[1]
      const level = ({ alta: 1, media: 2, baixa: 3, nenhuma: 4 } as Record<string, number>)[word] || Number(word)
      if (add('priority', start, end, String(level))) { result.priority = level; return true }
    })
  }

  // ---- Lembrete: @30min @1h @2d
  if (kinds.has('reminder')) {
    scan(folded, `${B}@(\\d{1,3})\\s*(minutos?|min|m|horas?|h|dias?|d)${E}`, (match, start, end) => {
      const unit = match[2].startsWith('m') ? 'm' : match[2].startsWith('h') ? 'h' : 'd'
      const value = `${Number(match[1])}${unit}`
      if (add('reminder', start, end, value)) { result.reminder = value; return true }
    })
  }

  // ---- Valor (lançamentos): R$ 85,90 · 85,90 · 20 reais
  if (kinds.has('amount')) {
    const take = (match: RegExpMatchArray, start: number, end: number) => {
      const number = Number(String(match[1]).replace(/\./g, '').replace(',', '.'))
      if (Number.isFinite(number) && add('amount', start, end, String(number))) { result.amount = number; return true }
    }
    scan(folded, `${B}r\\$\\s*(\\d[\\d.]*(?:,\\d{1,2})?)`, take)
    if (result.amount === undefined) scan(folded, `${B}(\\d+(?:\\.\\d{3})*,\\d{2})${E}`, take)
    if (result.amount === undefined) scan(folded, `${B}(\\d+(?:,\\d{1,2})?)\\s*reais${E}`, take)
  }

  // ---- Repetir
  if (kinds.has('repeat')) {
    const rules: Array<[string, (match: RegExpMatchArray) => string]> = [
      [`${B}(?:todos os dias uteis|todo dia util|dias uteis)${E}`, () => 'semanal:1,2,3,4,5'],
      [`${B}a cada\\s+(\\d{1,3})\\s*(dias?|semanas?)${E}`, match => `intervalo:${Number(match[1]) * (match[2].startsWith('s') ? 7 : 1)}`],
      [`${B}(?:todos os dias|todo dia|todo santo dia|diariamente)${E}`, () => 'diariamente'],
      [`${B}(?:toda semana|semanalmente)${E}`, () => 'semanalmente'],
      [`${B}(?:todo mes|todos os meses|mensalmente)${E}`, () => 'mensalmente'],
      [`${B}(?:todo ano|todos os anos|anualmente)${E}`, () => 'anualmente'],
      [`${B}(?:toda|todas as|todos os|todo|cada)\\s+(${WD}(?:\\s*(?:,|e)\\s*${WD})*)${E}`, match => {
        const days = [...match[0].matchAll(re(`${B}${WD}${E}`))].map(item => WEEKDAYS[item[1]]).filter(day => day !== undefined)
        return `semanal:${[...new Set(days)].sort((a, b) => a - b).join(',')}`
      }],
    ]
    for (const [pattern, valueOf] of rules) {
      let done = false
      scan(folded, pattern, (match, start, end) => {
        const value = valueOf(match)
        if (add('repeat', start, end, value)) { result.repeat = value; done = true; return true }
      })
      if (done) break
    }
  }

  // ---- Horário: das 14h às 15h30 · às 14h · 14:30 · 9h · de manhã
  if (kinds.has('time') || kinds.has('end')) {
    const part = '(\\d{1,2})(?:h(\\d{2})?|:(\\d{2}))?'
    const hm = (hour: string, a?: string, b?: string) => clock(Number(hour), Number(a || b || 0))
    let ranged = false
    scan(folded, `${B}(?:das|de)\\s+${part}\\s*(?:as|ate|a|-)\\s*${part}${E}`, (match, start, end) => {
      const from = hm(match[1], match[2], match[3])
      const to = hm(match[4], match[5], match[6])
      if (!from || !to) return
      if (kinds.has('end')) {
        if (add('time', start, end, from)) { result.time = from; result.end = to; ranged = true; tokens[tokens.length - 1].value = `${from}|${to}`; return true }
      } else if (add('time', start, end, from)) { result.time = from; ranged = true; return true }
    })
    if (!ranged) {
      let found = false
      // "às 9" (com acento: sem risco de ser o artigo "as")
      scan(lower, `${B}às\\s+${part}${E}`, (match, start, end) => {
        const value = hm(match[1], match[2], match[3])
        if (value && add('time', start, end, value)) { result.time = value; found = true; return true }
      })
      if (!found) scan(folded, `${B}as\\s+(\\d{1,2})(?:h(\\d{2})?|:(\\d{2}))${E}`, (match, start, end) => {
        const value = hm(match[1], match[2], match[3])
        if (value && add('time', start, end, value)) { result.time = value; found = true; return true }
      })
      if (!found) scan(folded, `${B}(\\d{1,2})h(\\d{2})?${E}`, (match, start, end) => {
        const value = hm(match[1], match[2])
        if (value && add('time', start, end, value)) { result.time = value; found = true; return true }
      })
      if (!found) scan(folded, `${B}(\\d{1,2}):(\\d{2})${E}`, (match, start, end) => {
        const value = hm(match[1], match[2])
        if (value && add('time', start, end, value)) { result.time = value; found = true; return true }
      })
      if (!found) {
        const parts: Array<[string, string]> = [['meio[- ]dia', '12:00'], ['(?:de|pela|a) manha', '08:00'], ['(?:de|a) tarde', '14:00'], ['(?:de|a) noite', '20:00']]
        for (const [pattern, value] of parts) {
          scan(folded, `${B}${pattern}${E}`, (_match, start, end) => { if (add('time', start, end, value)) { result.time = value; found = true; return true } })
          if (found) break
        }
      }
    }
  }

  // ---- Período (só na busca)
  if (kinds.has('range')) {
    const week = (offset: number) => {
      const monday = addDays(today, -((weekdayOf(today) + 6) % 7) + offset * 7)
      return { from: monday, to: addDays(monday, 6) }
    }
    const month = (offset: number) => {
      const base = new Date(`${today.slice(0, 7)}-01T12:00:00`)
      base.setMonth(base.getMonth() + offset)
      const y = base.getFullYear()
      const m = base.getMonth() + 1
      const last = new Date(y, m, 0).getDate()
      return { from: monthKey(y, m, 1), to: monthKey(y, m, last) }
    }
    const ranges: Array<[string, () => { from: string; to: string }]> = [
      [`${B}(?:esta|essa|nesta|nessa) semana${E}`, () => week(0)],
      [`${B}(?:semana passada|ultima semana)${E}`, () => week(-1)],
      [`${B}(?:este|esse|neste|nesse) mes${E}`, () => month(0)],
      [`${B}(?:mes passado|ultimo mes)${E}`, () => month(-1)],
    ]
    for (const [pattern, getRange] of ranges) {
      let done = false
      scan(folded, pattern, (_match, start, end) => {
        const value = getRange()
        if (add('range', start, end, `${value.from}|${value.to}`)) { result.range = value; done = true; return true }
      })
      if (done) break
    }
    scan(folded, `${B}atrasad[oa]s?${E}`, (_match, start, end) => { if (add('range', start, end, 'atrasadas')) { result.overdue = true; return true } })
  }

  // ---- Data
  if (kinds.has('date') && !result.range) {
    const date = (key: string, start: number, end: number) => {
      if (add('date', start, end, key)) { result.date = key; return true }
    }
    const simple: Array<[string, () => string]> = [
      [`${B}depois de amanha${E}`, () => addDays(today, 2)],
      [`${B}amanha${E}`, () => addDays(today, 1)],
      [`${B}hoje${E}`, () => today],
      [`${B}ontem${E}`, () => addDays(today, -1)],
      [`${B}(?:semana que vem|proxima semana|na proxima semana)${E}`, () => nextMonday(today)],
    ]
    for (const [pattern, valueOf] of simple) {
      scan(folded, pattern, (_match, start, end) => date(valueOf(), start, end))
      if (result.date) break
    }
    if (!result.date) scan(folded, `${B}em\\s+(\\d{1,3})\\s*(dias?|semanas?)${E}`, (match, start, end) => date(addDays(today, Number(match[1]) * (match[2].startsWith('s') ? 7 : 1)), start, end))
    if (!result.date) scan(folded, `${B}(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?${E}`, (match, start, end) => {
      const day = Number(match[1])
      const month = Number(match[2])
      let year = match[3] ? Number(match[3]) : Number(today.slice(0, 4))
      if (year < 100) year += 2000
      if (!validDay(year, month, day)) return
      let key = monthKey(year, month, day)
      if (!match[3] && key < today) key = monthKey(year + 1, month, day)
      return date(key, start, end)
    })
    if (!result.date) scan(folded, `${B}(\\d{1,2})\\s+de\\s+(${Object.keys(MONTHS).join('|')})(?:\\s+de\\s+(\\d{4}))?${E}`, (match, start, end) => {
      const day = Number(match[1])
      const month = MONTHS[match[2]]
      const year = match[3] ? Number(match[3]) : Number(today.slice(0, 4))
      if (!validDay(year, month, day)) return
      let key = monthKey(year, month, day)
      if (!match[3] && key < today) key = monthKey(year + 1, month, day)
      return date(key, start, end)
    })
    if (!result.date) scan(folded, `${B}dia\\s+(\\d{1,2})${E}`, (match, start, end) => {
      const day = Number(match[1])
      if (day < 1 || day > 31) return
      let year = Number(today.slice(0, 4))
      let month = Number(today.slice(5, 7))
      if (monthKey(year, month, day) < today || !validDay(year, month, day)) {
        month += 1
        if (month > 12) { month = 1; year += 1 }
      }
      if (!validDay(year, month, day)) return
      return date(monthKey(year, month, day), start, end)
    })
    if (!result.date) scan(folded, `${B}(?:(?:na|no|proxima|proximo)\\s+)?${WD}(?:\\s+que\\s+vem)?${E}`, (match, start, end) => date(nextWeekday(today, WEEKDAYS[match[1]]), start, end))
  }

  // "toda segunda" sem data: a primeira ocorrência vira a data.
  if (kinds.has('date') && !result.date && result.repeat?.startsWith('semanal:')) {
    const days = result.repeat.split(':')[1].split(',').map(Number)
    const next = days.map(day => nextWeekday(today, day, true)).sort()[0]
    if (next) result.date = next
  }

  // Horário sem data: vale hoje.
  tokens.sort((a, b) => a.start - b.start)
  let title = ''
  let cursor = 0
  for (const token of tokens) {
    title += text.slice(cursor, token.start)
    cursor = token.end
  }
  title += text.slice(cursor)
  result.title = title.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').trim().replace(/^[,.;:\-\s]+|[,.;:\-\s]+$/g, '')
  return result
}

/** Troca um trecho (por exemplo, completa um #projeto). */
export function replaceRange(text: string, start: number, end: number, replacement: string) {
  return `${text.slice(0, start)}${replacement}${text.slice(end)}`
}
