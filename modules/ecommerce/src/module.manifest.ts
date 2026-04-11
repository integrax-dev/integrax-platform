export const moduleManifest = {
  id: 'ecommerce',
  version: '0.1.0',
  dependsOn: [
    '@integrax/entities',
    '@integrax/event-bus',
    '@integrax/snapshot-store',
    '@integrax/timeline',
    '@integrax/module-catalog',
    '@integrax/module-orders',
    '@integrax/module-inventory',
    '@integrax/module-payments',
  ],
  optionalDependencies: ['@medusajs/medusa'],
  emittedEvents: [
    'product.updated',
    'order.created',
    'shipment.created',
    'stock.changed',
  ],
  usedByProfiles: ['ecommerce'],
  medusaReuse: [
    'catalog',    // product/variant models + price lists
    'carts',      // cart state management
    'checkout',   // cart completion + payment session
    'promotions', // discount codes + rules
    'draft_orders',
    'fulfillment', // basic fulfillment primitives
  ],
  notReplacedByMedusa: [
    'operation-engine',
    'event-bus',
    'snapshot-store',
    'timeline',
    'reconciliation-engine',
    'schema-bridge',
    'payments-module',
    'profiles',
    'country-packs',
  ],
} as const;
