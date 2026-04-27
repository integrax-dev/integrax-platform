export const AR_TAX_ID_PROVIDERS = [
  { id: 'ar-cuit', format: 'ar-cuit', detect: ({ value }: { value: string; fieldPath: string }) => /^\d{2}-\d{8}-\d{1}$/.test(value) },
  { id: 'ar-cuil', format: 'ar-cuil', detect: ({ value, fieldPath }: { value: string; fieldPath: string }) => /^\d{2}-\d{8}-\d{1}$/.test(value) && /cuil/i.test(fieldPath) },
];

export const AR_TAX_ID_WEIGHTS: Record<string, number> = {
  'ar-cuit': 0.9,
  'ar-cuil': 0.9,
};
