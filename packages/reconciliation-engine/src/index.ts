// ─── Shared primitives ─────────────────────────────────────────────────────
export type {
  Severity,
  PolicyAction,
  MatchDecision,
  MatchResult,
  FieldDiff,
  EntityConflict,
  PolicyEvaluationResult,
  ReconciliationResult,
} from './shared/types.js';

export {
  severityFromScore,
  maxSeverity,
  aggregateAction,
} from './shared/types.js';
export type { ConflictRoutingTarget } from './shared/types.js';

export {
  enrichWithActionability,
  suggestOperationCommand,
  classifyReconciliationSeverity,
} from './shared/actionability.js';

export { normalizeSku, normalizeTitle, normalizeTaxId } from './shared/normalize.js';
export { levenshteinSimilarity, jaccardSimilarity, combinedSimilarity } from './shared/similarity.js';
export type { ConnectorManifestShape, EntityManifestShape } from './shared/manifest.js';
export type { ManualLink } from './shared/entity-helpers.js';
export { makeFieldDiff, hasManualLink, findExternalIdOverlap } from './shared/entity-helpers.js';

// ─── Product entity ─────────────────────────────────────────────────────────
export type { CanonicalProduct } from './entities/product/canonical.js';
export type { ProductConflictType, DiffTolerances } from './entities/product/diff.js';
export type { ProductPolicyRule } from './entities/product/policy.js';
// ManualLink is shared — exported once from shared/entity-helpers.js above

export { matchProduct } from './entities/product/identity.js';
export { diffProducts } from './entities/product/diff.js';
export {
  evaluateProductConflicts,
  productRecommendation,
} from './entities/product/policy.js';

// ─── Customer entity ─────────────────────────────────────────────────────────
export type { CanonicalCustomer } from './entities/customer/canonical.js';
export type { CustomerConflictType } from './entities/customer/diff.js';
export type { CustomerPolicyRule } from './entities/customer/policy.js';

export { matchCustomer } from './entities/customer/identity.js';
export { diffCustomers } from './entities/customer/diff.js';
export {
  evaluateCustomerConflicts,
  customerRecommendation,
} from './entities/customer/policy.js';

// ─── Invoice entity ───────────────────────────────────────────────────────────
export type { CanonicalInvoice } from './entities/invoice/canonical.js';
export type { InvoiceConflictType, InvoiceDiffTolerances } from './entities/invoice/diff.js';
export type { InvoicePolicyRule } from './entities/invoice/policy.js';

export { matchInvoice } from './entities/invoice/identity.js';
export { diffInvoices } from './entities/invoice/diff.js';
export {
  evaluateInvoiceConflicts,
  invoiceRecommendation,
} from './entities/invoice/policy.js';

// ─── Configuration ──────────────────────────────────────────────────────────
export type {
  PolicyRule,
  ConflictActionConfig,
  ReconciliationConfig,
} from './config/types.js';

export {
  loadDefaultConfig,
  mergeConfig,
  clearConfigCache,
} from './config/loader.js';

// ─── Registry ───────────────────────────────────────────────────────────────
export { ConnectorRegistry } from './registry/connector-registry.js';
