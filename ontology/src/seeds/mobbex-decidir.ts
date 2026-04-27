export const MOBBEX_DECIDIR_SEEDS = [
  { sourcePath: 'total',     targetPath: 'amount',              connectorAId: 'mobbex', connectorBId: 'decidir', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
  { sourcePath: 'currency',  targetPath: 'currency',            connectorAId: 'mobbex', connectorBId: 'decidir', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
  { sourcePath: 'reference', targetPath: 'merchant_payment_id', connectorAId: 'mobbex', connectorBId: 'decidir', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
  { sourcePath: 'updated_at', targetPath: 'date',               connectorAId: 'mobbex', connectorBId: 'decidir', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
];
