export const moduleManifest = {
  id: 'catalog',
  name: 'Catalog',
  version: '0.1.0',
  description: 'Product catalog sync — publish, price updates, archival, and cross-connector price divergence detection',
  requiredEntities: ['product'],
  requiredPackages: ['@integrax/snapshot-store', '@integrax/event-bus', '@integrax/platform-kernel'],
  emittedEvents: ['product.created', 'product.updated', 'product.price_changed', 'product.archived', 'conflict.detected'],
  consumedEvents: ['webhook.received', 'snapshot.updated'],
} as const;
