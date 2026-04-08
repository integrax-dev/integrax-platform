export const moduleManifest = {
  id: 'billing',
  name: 'Billing',
  version: '0.1.0',
  description: 'Invoice generation, CAE tracking, payment status, and cross-system comparison',
  requiredEntities: ['invoice', 'customer', 'order'],
  requiredPackages: ['@integrax/snapshot-store', '@integrax/event-bus', '@integrax/reconciliation-engine'],
  emittedEvents: ['invoice.created', 'invoice.authorized', 'invoice.failed', 'invoice.voided'],
  consumedEvents: ['order.status_changed'],
} as const;
