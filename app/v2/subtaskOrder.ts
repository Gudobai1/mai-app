type Row = Record<string, any>

/**
 * Ordem das subtarefas: abertas primeiro (na ordem em que foram criadas);
 * concluídas depois, com a última concluída no topo do grupo.
 */
export function compareSubtasks(a: Row, b: Row) {
  const doneA = Boolean(a.concluida)
  const doneB = Boolean(b.concluida)
  if (doneA !== doneB) return Number(doneA) - Number(doneB)
  if (doneA) return String(b.concluida_em || '').localeCompare(String(a.concluida_em || ''))
  return Number(a.ordem || 0) - Number(b.ordem || 0)
}
