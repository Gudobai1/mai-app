type Row = Record<string, any>

const TOKENS = ['var(--ds-rose-fg)', 'var(--ds-peach-fg)', 'var(--ds-sky-fg)', 'var(--ds-lilac-fg)', 'var(--ds-mint-fg)', 'var(--ds-teal-fg)', 'var(--ds-accent)', 'var(--ds-success)']

/** Cor da categoria: a própria, ou uma fixa pelo nome (sempre a mesma em todas as telas). */
export function categoryColorOf(name: string, categories: Row[]) {
  const own = categories.find(category => String(category.nome || '') === name)?.cor
  if (own) return String(own)
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return TOKENS[hash % TOKENS.length]
}
