/*
 * Contextos ao digitar um lançamento: #categoria, @conta ou cartão, !receita / !despesa.
 * Recebe o texto e devolve o que entendeu, com a posição de cada trecho (para destacar)
 * e o título sem esses trechos.
 */

import { fold } from './nlp'

type Row = Record<string, any>

export type FinanceTagKind = 'category' | 'origin' | 'type'
export type FinanceTagToken = { kind: FinanceTagKind; start: number; end: number; text: string }
export type FinanceTagResult = {
  title: string
  tokens: FinanceTagToken[]
  /** Nome de categoria existente ou novo (se não houver correspondência). */
  category?: string
  categoryIsNew?: boolean
  /** id da conta ou `card|id` do cartão. */
  origin?: string
  type?: 'receita' | 'despesa'
}

const squash = (text: string) => fold(text).replace(/[^\p{L}\p{N}]/gu, '')

export function parseFinanceTags(text: string, ctx: { categories: Row[]; accounts: Row[]; cards: Row[] }, ignore: Iterable<FinanceTagKind> = []): FinanceTagResult {
  const muted = new Set(ignore)
  const tokens: FinanceTagToken[] = []
  const result: FinanceTagResult = { title: '', tokens }
  const pattern = /(^|\s)([#@!])([\p{L}\p{N}_-]+)/gu
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    const start = match.index + match[1].length
    const end = start + 1 + match[3].length
    const mark = match[2]
    const word = squash(match[3])
    if (!word) continue
    if (mark === '#' && !muted.has('category')) {
      const found = ctx.categories.find(item => squash(String(item.nome || '')) === word) || ctx.categories.find(item => squash(String(item.nome || '')).startsWith(word))
      result.category = found ? String(found.nome) : match[3].replace(/[-_]/g, ' ')
      result.categoryIsNew = !found
      tokens.push({ kind: 'category', start, end, text: text.slice(start, end) })
    } else if (mark === '@' && !muted.has('origin')) {
      const options = [...ctx.accounts.map(item => ({ id: String(item.id), name: String(item.nome || '') })), ...ctx.cards.map(item => ({ id: `card|${String(item.id)}`, name: String(item.nome || '') }))]
      const found = options.find(item => squash(item.name) === word) || options.find(item => squash(item.name).startsWith(word))
      if (found) { result.origin = found.id; tokens.push({ kind: 'origin', start, end, text: text.slice(start, end) }) }
    } else if (mark === '!' && !muted.has('type')) {
      if ('receita'.startsWith(word) && word.length >= 3) { result.type = 'receita'; tokens.push({ kind: 'type', start, end, text: text.slice(start, end) }) }
      else if ('despesa'.startsWith(word) && word.length >= 3) { result.type = 'despesa'; tokens.push({ kind: 'type', start, end, text: text.slice(start, end) }) }
    }
  }
  let title = text
  for (const token of [...tokens].sort((a, b) => b.start - a.start)) title = title.slice(0, token.start) + title.slice(token.end)
  result.title = title.replace(/\s{2,}/g, ' ').trim()
  return result
}

/** Sugestões ao digitar # ou @ ou ! no fim do texto. */
export function financeTagSuggestions(word: string, ctx: { categories: Row[]; accounts: Row[]; cards: Row[] }) {
  const query = squash(word.slice(1))
  const mark = word[0]
  const list: { label: string; insert: string; icon: string; color?: string }[] = []
  if (mark === '#') {
    for (const item of ctx.categories) { const name = String(item.nome || ''); if (!query || squash(name).includes(query)) list.push({ label: name, insert: `#${name.replace(/\s+/g, '')}`, icon: 'sell', color: item.cor ? String(item.cor) : undefined }) }
    if (query && !list.some(item => squash(item.label) === query)) list.push({ label: `Criar categoria “${word.slice(1)}”`, insert: word, icon: 'add' })
  } else if (mark === '@') {
    for (const item of ctx.accounts) { const name = String(item.nome || ''); if (!query || squash(name).includes(query)) list.push({ label: name, insert: `@${name.replace(/\s+/g, '')}`, icon: 'account_balance' }) }
    for (const item of ctx.cards) { const name = String(item.nome || ''); if (!query || squash(name).includes(query)) list.push({ label: name, insert: `@${name.replace(/\s+/g, '')}`, icon: 'credit_card' }) }
  } else if (mark === '!') {
    for (const item of [['receita', 'trending_up'], ['despesa', 'trending_down']]) if (!query || item[0].startsWith(query)) list.push({ label: item[0][0].toUpperCase() + item[0].slice(1), insert: `!${item[0]}`, icon: item[1] })
  }
  return list.slice(0, 6)
}
