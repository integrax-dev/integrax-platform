export const moduleManifest = {
  id: 'orders',
  name: 'Orders',
  version: '0.1.0',
  description: 'Order lifecycle management — create, confirm, cancel, refund',
  requiredEntities: ['order', 'customer'],
  requiredPackages: ['@integrax/snapshot-store', '@integrax/event-bus'],
  emittedEvents: ['order.created', 'order.updated', 'order.status_changed', 'order.cancelled'],
  consumedEvents: ['webhook.received'],
} as const;
