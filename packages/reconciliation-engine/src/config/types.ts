/**
 * Configuration types for reconciliation engine.
 * Allows tenant-specific overrides of policy rules and action metadata.
 */

import type { PolicyAction, ConflictRoutingTarget } from '../shared/types.js';
import type { InvoiceConflictType } from '../entities/invoice/diff.js';
import type { CustomerConflictType } from '../entities/customer/diff.js';
import type { ProductConflictType } from '../entities/product/diff.js';

export interface PolicyRule<TConflictType extends string> {
  conflictType: TConflictType;
  action: PolicyAction;
  reason: string;
}

export interface ConflictActionConfig {
  suggestedAction: string;
  routeTo?: ConflictRoutingTarget;
  operationCommand?: string;
}

export interface ReconciliationConfig {
  invoicePolicy?: PolicyRule<InvoiceConflictType>[];
  customerPolicy?: PolicyRule<CustomerConflictType>[];
  productPolicy?: PolicyRule<ProductConflictType>[];
  conflictActions?: Record<string, ConflictActionConfig>;
  tolerances?: {
    invoice?: {
      amountPct?: number;
    };
    product?: {
      pricePct?: number;
      stockPct?: number;
    };
  };
}
