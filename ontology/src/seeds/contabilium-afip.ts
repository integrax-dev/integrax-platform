export const CONTABILIUM_AFIP_SEEDS = [
  { sourcePath: 'Total',               targetPath: 'ImpTotal',          connectorAId: 'contabilium', connectorBId: 'afip-wsfe', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
  { sourcePath: 'Moneda',              targetPath: 'MonId',             connectorAId: 'contabilium', connectorBId: 'afip-wsfe', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
  { sourcePath: 'Estado',              targetPath: 'Resultado',         connectorAId: 'contabilium', connectorBId: 'afip-wsfe', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
  { sourcePath: 'FechaModificacion',   targetPath: 'CbteFch',           connectorAId: 'contabilium', connectorBId: 'afip-wsfe', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
  { sourcePath: 'NumeroCompleto',      targetPath: 'CbteDesde',         connectorAId: 'contabilium', connectorBId: 'afip-wsfe', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
  { sourcePath: 'Cliente.NumeroDocumento', targetPath: 'DocNro',        connectorAId: 'contabilium', connectorBId: 'afip-wsfe', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
  { sourcePath: 'Id',                  targetPath: 'CAE',               connectorAId: 'contabilium', connectorBId: 'afip-wsfe', acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true },
];
