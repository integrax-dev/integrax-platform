export const PAYWAY_DECIDIR_SEEDS = [
  { sourcePath: 'amount',   targetPath: 'amount',              connectorAId: 'payway', connectorBId: 'decidir', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
  { sourcePath: 'currency', targetPath: 'currency',            connectorAId: 'payway', connectorBId: 'decidir', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
  { sourcePath: 'external_reference', targetPath: 'merchant_payment_id', connectorAId: 'payway', connectorBId: 'decidir', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
];
