export interface MappingSeed {
  connectorAId: string;
  connectorBId: string;
  sourcePath: string;
  targetPath: string;
  entityType?: string;
  state: 'candidate' | 'validated' | 'trusted' | 'ground_truth';
  confidence: number;
  acceptedCount: number;
  rejectedCount: number;
}

export const MAPPING_SEEDS: MappingSeed[] = [
  // ── mercadopago ↔ payway ──────────────────────────────────────────────────
  { connectorAId: 'mercadopago', connectorBId: 'payway', sourcePath: 'transaction_amount', targetPath: 'amount',             entityType: 'payment', state: 'ground_truth', confidence: 0.99, acceptedCount: 50, rejectedCount: 0 },
  { connectorAId: 'mercadopago', connectorBId: 'payway', sourcePath: 'currency_id',        targetPath: 'currency',           entityType: 'payment', state: 'ground_truth', confidence: 0.99, acceptedCount: 50, rejectedCount: 0 },
  { connectorAId: 'mercadopago', connectorBId: 'payway', sourcePath: 'status',             targetPath: 'status',             entityType: 'payment', state: 'ground_truth', confidence: 0.99, acceptedCount: 50, rejectedCount: 0 },
  { connectorAId: 'mercadopago', connectorBId: 'payway', sourcePath: 'external_reference', targetPath: 'external_reference', entityType: 'payment', state: 'ground_truth', confidence: 0.99, acceptedCount: 50, rejectedCount: 0 },
  { connectorAId: 'mercadopago', connectorBId: 'payway', sourcePath: 'installments',       targetPath: 'installments',       entityType: 'payment', state: 'ground_truth', confidence: 0.99, acceptedCount: 50, rejectedCount: 0 },

  // ── mercadopago ↔ mobbex ──────────────────────────────────────────────────
  { connectorAId: 'mercadopago', connectorBId: 'mobbex', sourcePath: 'transaction_amount', targetPath: 'total',      entityType: 'payment', state: 'ground_truth', confidence: 0.99, acceptedCount: 50, rejectedCount: 0 },
  { connectorAId: 'mercadopago', connectorBId: 'mobbex', sourcePath: 'currency_id',        targetPath: 'currency',   entityType: 'payment', state: 'ground_truth', confidence: 0.99, acceptedCount: 50, rejectedCount: 0 },
  { connectorAId: 'mercadopago', connectorBId: 'mobbex', sourcePath: 'status',             targetPath: 'status',     entityType: 'payment', state: 'ground_truth', confidence: 0.99, acceptedCount: 50, rejectedCount: 0 },
  { connectorAId: 'mercadopago', connectorBId: 'mobbex', sourcePath: 'external_reference', targetPath: 'reference',  entityType: 'payment', state: 'ground_truth', confidence: 0.99, acceptedCount: 50, rejectedCount: 0 },
  { connectorAId: 'mercadopago', connectorBId: 'mobbex', sourcePath: 'date_last_updated',  targetPath: 'updated_at', entityType: 'payment', state: 'ground_truth', confidence: 0.99, acceptedCount: 50, rejectedCount: 0 },

  // ── contabilium ↔ afip-wsfe ───────────────────────────────────────────────
  { connectorAId: 'contabilium', connectorBId: 'afip-wsfe', sourcePath: 'Total',              targetPath: 'ImpTotal',  entityType: 'invoice', state: 'ground_truth', confidence: 0.99, acceptedCount: 50, rejectedCount: 0 },
  { connectorAId: 'contabilium', connectorBId: 'afip-wsfe', sourcePath: 'Moneda',             targetPath: 'MonId',     entityType: 'invoice', state: 'ground_truth', confidence: 0.99, acceptedCount: 50, rejectedCount: 0 },
  { connectorAId: 'contabilium', connectorBId: 'afip-wsfe', sourcePath: 'Estado',             targetPath: 'Resultado', entityType: 'invoice', state: 'ground_truth', confidence: 0.99, acceptedCount: 50, rejectedCount: 0 },
  { connectorAId: 'contabilium', connectorBId: 'afip-wsfe', sourcePath: 'FechaModificacion',  targetPath: 'CbteFch',   entityType: 'invoice', state: 'ground_truth', confidence: 0.99, acceptedCount: 50, rejectedCount: 0 },
  { connectorAId: 'contabilium', connectorBId: 'afip-wsfe', sourcePath: 'NumeroCompleto',     targetPath: 'CbteDesde', entityType: 'invoice', state: 'ground_truth', confidence: 0.99, acceptedCount: 50, rejectedCount: 0 },
];
