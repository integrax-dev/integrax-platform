export const moduleManifest = {
  id: 'consistency-inspector',
  name: 'Consistency Inspector',
  version: '0.1.0',
  description: 'Detect cross-system divergence in stock, prices, invoices, customers, and state',
  requiredEntities: ['product', 'order', 'invoice', 'customer', 'stock'],
  requiredPackages: ['@integrax/snapshot-store', '@integrax/event-bus', '@integrax/platform-kernel', '@integrax/timeline'],
  emittedEvents: ['conflict.detected'],
  consumedEvents: [],
} as const;
