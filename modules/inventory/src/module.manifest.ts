export const moduleManifest = {
  id: 'inventory',
  name: 'Inventory',
  version: '0.1.0',
  description: 'Stock sync, reservation, and cross-system divergence detection',
  requiredEntities: ['stock', 'product'],
  requiredPackages: ['@integrax/snapshot-store', '@integrax/event-bus', '@integrax/platform-kernel'],
  emittedEvents: ['stock.changed', 'stock.diverged', 'stock.depleted'],
  consumedEvents: ['order.created', 'order.cancelled'],
} as const;
