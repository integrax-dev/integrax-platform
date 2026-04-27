export const MERCADOPAGO_PAYWAY_SEEDS = [
  { sourcePath: 'transaction_amount', targetPath: 'amount',           connectorAId: 'mercadopago', connectorBId: 'payway', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
  { sourcePath: 'currency_id',        targetPath: 'currency',         connectorAId: 'mercadopago', connectorBId: 'payway', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
  { sourcePath: 'external_reference', targetPath: 'external_reference', connectorAId: 'mercadopago', connectorBId: 'payway', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
  { sourcePath: 'date_last_updated',  targetPath: 'date_last_updated', connectorAId: 'mercadopago', connectorBId: 'payway', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
];
