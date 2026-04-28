/** Sample signal seeds for smoke-testing the consistency pipeline */
export interface SignalSeed {
  kind: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  entityType: string;
  fieldPath?: string;
  connectorA: string;
  connectorB?: string;
  tags: Record<string, string>;
}

export const SIGNAL_SEEDS: SignalSeed[] = [
  {
    kind: 'field_mismatch',
    severity: 'HIGH',
    entityType: 'payment',
    fieldPath: 'transaction_amount',
    connectorA: 'mercadopago',
    connectorB: 'payway',
    tags: { category: 'financial' },
  },
  {
    kind: 'state_divergence',
    severity: 'MEDIUM',
    entityType: 'order',
    fieldPath: 'status',
    connectorA: 'tiendanube',
    connectorB: 'contabilium',
    tags: { category: 'lifecycle' },
  },
  {
    kind: 'field_missing',
    severity: 'LOW',
    entityType: 'invoice',
    fieldPath: 'authorizationCode',
    connectorA: 'contabilium',
    connectorB: 'afip-wsfe',
    tags: { category: 'regulatory', country: 'AR' },
  },
  {
    kind: 'schema_drift',
    severity: 'CRITICAL',
    entityType: 'payment',
    connectorA: 'mercadopago',
    tags: { category: 'schema' },
  },
];
