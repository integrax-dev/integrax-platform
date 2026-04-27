export const PAYWAY_MOBBEX_SEEDS = [
  { sourcePath: 'amount',   targetPath: 'total',      connectorAId: 'payway', connectorBId: 'mobbex', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
  { sourcePath: 'currency', targetPath: 'currency',   connectorAId: 'payway', connectorBId: 'mobbex', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
  { sourcePath: 'date_last_updated', targetPath: 'updated_at', connectorAId: 'payway', connectorBId: 'mobbex', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
];
