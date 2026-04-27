export const MERCADOPAGO_DECIDIR_SEEDS = [
  { sourcePath: 'transaction_amount', targetPath: 'amount',              connectorAId: 'mercadopago', connectorBId: 'decidir', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
  { sourcePath: 'currency_id',        targetPath: 'currency',            connectorAId: 'mercadopago', connectorBId: 'decidir', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
  { sourcePath: 'external_reference', targetPath: 'merchant_payment_id', connectorAId: 'mercadopago', connectorBId: 'decidir', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
  { sourcePath: 'date_last_updated',  targetPath: 'date',                connectorAId: 'mercadopago', connectorBId: 'decidir', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
];
