export {}

/**
 * O estado do MAI preserva objetos JSON vindos do legado. Em alguns spreads,
 * o TypeScript perde a assinatura dinâmica de Record<string, any> e mantém
 * somente as chaves acrescentadas no literal. Estas propriedades são o
 * contrato histórico compartilhado por lançamentos/ocorrências financeiras.
 */
declare global {
  interface Object {
    id?: any
    titulo?: any
    nome?: any
    categoria?: any
    conta_id?: any
    tipo?: any
    valor?: any
    valor_pago?: any
    status?: any
    recorrencia?: any
    parcelas?: any
    intervalo_parcelas?: any
    dividir_total?: any
    dia_mes?: any
    occurrenceKey?: any
    data_real?: any
    valor_real?: any
    competencia?: any
    chave?: any
    fixo_id?: any
    valor_override?: any
    data_override?: any
    ignorado?: any
    pagamentos?: any
    lote_id?: any
    parcela_numero?: any
    parcelas_total?: any
    mes_inicio?: any
    mes_fim?: any
    ativo?: any
    limite?: any
    fechamento?: any
    vencimento?: any
    cor?: any
  }
}
