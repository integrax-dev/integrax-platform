import type { BehaviorProfile } from './types.js';

export const BEHAVIOR_PROFILES: Record<string, BehaviorProfile> = {
  ecommerce_standard: {
    id: 'ecommerce_standard',
    name: 'E-commerce Standard',
    description: 'Channel-adjusted sync for ecommerce platforms. Prices may differ by channel; stock is real-time.',
    defaultDivergenceMode: 'channel_adjusted',
    defaultPropagation: 'adjust',
    defaultAuthorityMode: 'suggest',
    entityDefaults: {
      stock:   { divergenceMode: 'strict_sync',      propagation: 'mirror',  authorityMode: 'latest_wins' },
      order:   { divergenceMode: 'strict_sync',      propagation: 'mirror',  authorityMode: 'prefer_a' },
      invoice: { divergenceMode: 'regulatory_locked', propagation: 'lock',   authorityMode: 'manual_resolution' },
    },
  },

  marketplace_strict: {
    id: 'marketplace_strict',
    name: 'Marketplace Strict',
    description: 'All entity fields are strictly synced. Any divergence is an error.',
    defaultDivergenceMode: 'strict_sync',
    defaultPropagation: 'mirror',
    defaultAuthorityMode: 'prefer_a',
    entityDefaults: {
      product: { divergenceMode: 'strict_sync', propagation: 'mirror', authorityMode: 'prefer_a' },
      stock:   { divergenceMode: 'strict_sync', propagation: 'mirror', authorityMode: 'latest_wins' },
    },
  },

  accounting_locked: {
    id: 'accounting_locked',
    name: 'Accounting Locked',
    description: 'Financial records are immutable after creation. Divergence is an audit event, never auto-resolved.',
    defaultDivergenceMode: 'regulatory_locked',
    defaultPropagation: 'lock',
    defaultAuthorityMode: 'manual_resolution',
    entityDefaults: {
      invoice:     { divergenceMode: 'regulatory_locked', propagation: 'lock',   authorityMode: 'manual_resolution' },
      transaction: { divergenceMode: 'regulatory_locked', propagation: 'lock',   authorityMode: 'manual_resolution' },
      order:       { divergenceMode: 'strict_sync',       propagation: 'mirror', authorityMode: 'prefer_a' },
    },
  },

  inventory_realtime: {
    id: 'inventory_realtime',
    name: 'Inventory Real-Time',
    description: 'Stock values are authoritative from the WMS. All other systems receive updates.',
    defaultDivergenceMode: 'strict_sync',
    defaultPropagation: 'mirror',
    defaultAuthorityMode: 'latest_wins',
    entityDefaults: {
      stock:   { divergenceMode: 'strict_sync', propagation: 'mirror', authorityMode: 'latest_wins' },
      product: { divergenceMode: 'channel_adjusted', propagation: 'adjust', authorityMode: 'suggest' },
    },
  },

  regulatory_ar: {
    id: 'regulatory_ar',
    name: 'Regulatory AR (Argentina)',
    description: 'Argentine fiscal rules: invoices locked by AFIP/CAE. Tax IDs must match across systems.',
    defaultDivergenceMode: 'regulatory_locked',
    defaultPropagation: 'lock',
    defaultAuthorityMode: 'manual_resolution',
    entityDefaults: {
      invoice:  { divergenceMode: 'regulatory_locked', propagation: 'lock',   authorityMode: 'manual_resolution' },
      customer: { divergenceMode: 'strict_sync',       propagation: 'mirror', authorityMode: 'prefer_a' },
      order:    { divergenceMode: 'strict_sync',       propagation: 'mirror', authorityMode: 'prefer_a' },
      stock:    { divergenceMode: 'channel_adjusted',  propagation: 'adjust', authorityMode: 'latest_wins' },
    },
  },

  bidirectional_crm: {
    id: 'bidirectional_crm',
    name: 'Bidirectional CRM',
    description: 'Both CRM and ERP can update customer records. Conflicts go to human queue.',
    defaultDivergenceMode: 'bidirectional_sync',
    defaultPropagation: 'adjust',
    defaultAuthorityMode: 'manual_resolution',
    entityDefaults: {
      customer: { divergenceMode: 'bidirectional_sync', propagation: 'adjust', authorityMode: 'manual_resolution' },
      order:    { divergenceMode: 'strict_sync',        propagation: 'mirror', authorityMode: 'prefer_a' },
    },
  },

  observe_only: {
    id: 'observe_only',
    name: 'Observe Only',
    description: 'Never act on divergence. Record everything, resolve nothing automatically.',
    defaultDivergenceMode: 'observe_only',
    defaultPropagation: 'ignore',
    defaultAuthorityMode: 'observe_only',
    entityDefaults: {},
  },
};
