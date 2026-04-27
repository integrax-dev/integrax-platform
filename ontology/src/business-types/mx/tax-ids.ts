export const MX_TAX_ID_PROVIDERS = [
  { id: 'mx-rfc',  format: 'mx-rfc',  detect: ({ value }: { value: string; fieldPath: string }) => /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(value.trim()) },
  { id: 'mx-curp', format: 'mx-curp', detect: ({ value }: { value: string; fieldPath: string }) => /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/i.test(value.trim()) },
];

export const MX_TAX_ID_WEIGHTS: Record<string, number> = {
  'mx-rfc':  0.9,
  'mx-curp': 0.9,
};
