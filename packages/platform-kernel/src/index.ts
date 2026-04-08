// --- Motor de diff ----------------------------------------------------------
export type {
  ConflictCategory,
  Severity,
  GenericConflict,
  ComparisonResult,
  ComparisonRule,
  Snapshot,
  DuplicateGroup,
} from './diff/types.js';

export {
  compareEntities,
  detectMismatch,
  detectDrift,
  detectDuplicates,
} from './diff/compare.js';

// --- Resolucion de identidad ------------------------------------------------
export type {
  IdentityStrategy,
  IdentityCandidate,
  ResolvedIdentity,
  AliasEntry,
} from './identity/types.js';

export { IdentityResolver } from './identity/resolver.js';
