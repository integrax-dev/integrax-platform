export const MERCADOPAGO_MOBBEX_SEEDS = [
  { sourcePath: 'transaction_amount', targetPath: 'total',     connectorAId: 'mercadopago', connectorBId: 'mobbex', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
  { sourcePath: 'currency_id',        targetPath: 'currency',  connectorAId: 'mercadopago', connectorBId: 'mobbex', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
  { sourcePath: 'external_reference', targetPath: 'reference', connectorAId: 'mercadopago', connectorBId: 'mobbex', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
  { sourcePath: 'date_last_updated',  targetPath: 'updated_at', connectorAId: 'mercadopago', connectorBId: 'mobbex', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
];
