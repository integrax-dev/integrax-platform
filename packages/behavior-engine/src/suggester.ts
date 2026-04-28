import type { BehaviorProfile, BehaviorProfileId } from './types.js';
import { BEHAVIOR_PROFILES } from './profiles.js';

export interface ProfileSuggestion {
  profileId: BehaviorProfileId;
  confidence: number;
  reasoning: string;
}

/**
 * Suggests a BehaviorProfile based on connector IDs and entity types present.
 * Returned suggestions are informational only — applying a profile requires
 * explicit confirmation from the tenant admin.
 */
export function suggestBehaviorProfile(opts: {
  connectorIds: string[];
  entityTypes: string[];
  country?: string;
}): ProfileSuggestion {
  const { connectorIds, entityTypes, country } = opts;
  const hasInvoice = entityTypes.includes('invoice');
  const hasStock = entityTypes.includes('stock');
  const hasOrder = entityTypes.includes('order');
  const hasCustomer = entityTypes.includes('customer');
  const isAr = country === 'AR';
  const hasAfip = connectorIds.some(c => c.includes('afip'));
  const hasContabilium = connectorIds.some(c => c.includes('contabilium'));

  if ((isAr || hasAfip || hasContabilium) && hasInvoice) {
    return {
      profileId: 'regulatory_ar',
      confidence: 0.90,
      reasoning: 'Argentine fiscal connectors detected with invoice entities. Regulatory locking is required.',
    };
  }

  if (hasInvoice && !hasStock) {
    return {
      profileId: 'accounting_locked',
      confidence: 0.80,
      reasoning: 'Invoice-centric integration without inventory. Accounting-locked profile prevents accidental mutations.',
    };
  }

  if (hasStock && hasOrder && connectorIds.length >= 2) {
    return {
      profileId: 'ecommerce_standard',
      confidence: 0.75,
      reasoning: 'Multiple connectors with stock + order entities. E-commerce standard profile fits channel-adjusted sync.',
    };
  }

  if (hasStock && !hasInvoice) {
    return {
      profileId: 'inventory_realtime',
      confidence: 0.70,
      reasoning: 'Stock-focused integration. Real-time inventory profile keeps WMS as authority.',
    };
  }

  if (hasCustomer && !hasOrder && !hasInvoice) {
    return {
      profileId: 'bidirectional_crm',
      confidence: 0.65,
      reasoning: 'Customer-centric integration without transactional entities. Bidirectional CRM allows both sides to update.',
    };
  }

  return {
    profileId: 'observe_only',
    confidence: 0.50,
    reasoning: 'No clear pattern detected. Observe-only profile is safe until more context is available.',
  };
}

export function getProfile(id: BehaviorProfileId): BehaviorProfile {
  const profile = BEHAVIOR_PROFILES[id];
  if (!profile) throw new Error(`Unknown behavior profile: '${id}'`);
  return profile;
}

export function listProfiles(): BehaviorProfile[] {
  return Object.values(BEHAVIOR_PROFILES);
}
