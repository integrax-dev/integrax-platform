export const BR_TAX_ID_PROVIDERS = [
  { id: 'br-cnpj', format: 'br-cnpj', detect: ({ value, fieldPath }: { value: string; fieldPath: string }) =>
    /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(value) ||
    (/^\d{14}$/.test(value.replace(/\D/g, '')) && /cnpj|empresa|razao|razão|fiscal/i.test(fieldPath))
  },
  { id: 'br-cpf', format: 'br-cpf', detect: ({ value }: { value: string; fieldPath: string }) => /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(value) },
];

export const BR_TAX_ID_WEIGHTS: Record<string, number> = {
  'br-cnpj': 0.9,
  'br-cpf':  0.9,
};
