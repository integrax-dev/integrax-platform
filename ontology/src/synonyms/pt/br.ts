/** Portuguese synonyms specific to Brazil (NF-e, CNPJ, CPF). */
export const PT_BR_SYNONYM_PAIRS: Array<[string, string]> = [
  ['nota_fiscal', 'invoice'], ['nota_fiscal', 'factura'],
  ['fatura', 'invoice'], ['fatura', 'factura'],
  ['criado_em', 'created_at'], ['criado_em', 'fecha_creacion'],
  ['atualizado_em', 'updated_at'], ['atualizado_em', 'fecha_actualizacion'],
  ['cnpj', 'tax_id'], ['cnpj', 'fiscal_id'],
  ['cpf', 'tax_id'], ['cpf', 'fiscal_id'],
];
