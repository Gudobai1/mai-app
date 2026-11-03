type Row = Record<string, any>

/**
 * Valor de uma fatura quando existe o lançamento "Fatura do cartão" (ajuste ou pagamento).
 * Com `ajuste_delta`, a fatura continua somando as compras: compras + ajuste.
 * Sem ele (registros antigos), vale o valor guardado.
 */
export function invoiceValue(manual: Row, purchases: number) {
  if (manual.ajuste_delta !== undefined && manual.ajuste_delta !== null) return Math.max(0, purchases + (Number(manual.ajuste_delta) || 0))
  return Math.max(0, Number(manual.valor || 0) || 0)
}
