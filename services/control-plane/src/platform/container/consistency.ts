/**
 * Consistency Control Plane singletons.
 *
 * All computation engines are in-memory; state is loaded from / persisted to
 * Postgres by the pg-* store modules. Never use InMemoryTimelineStore in
 * production — PgTimelineStore is the only durable implementation.
 */

import { ToleranceRegistry } from '@integrax/tolerance-engine';
import { AuthorityRegistry, ConnectorTrustEngine } from '@integrax/authority-engine';
import { ConsistencyPolicyCompiler } from '@integrax/behavior-engine';
import { ConsistencySignalService } from '@integrax/consistency-signals';
import { MappingGovernanceEngine } from '@integrax/mapping-governance';
import { ConnectorContractRegistry } from '@integrax/connector-contract';
import { ConsistencyTimelineService } from '@integrax/consistency-timeline';
import { PgTimelineStore } from '../../store/pg-timeline-store.js';
import { listAllContractBaselines } from '../../store/pg-contract-store.js';
import { listAuthorityRules } from '../../store/pg-authority-store.js';
import { listTolerancePolicies } from '../../store/pg-tolerance-store.js';

export const toleranceRegistry = new ToleranceRegistry();
export const authorityRegistry = new AuthorityRegistry();
export const trustEngine = new ConnectorTrustEngine();
export const policyCompiler = new ConsistencyPolicyCompiler();
export const signalService = new ConsistencySignalService();
export const mappingGovernance = new MappingGovernanceEngine();
export const contractRegistry = new ConnectorContractRegistry();
export const consistencyTimelineStore = new PgTimelineStore();
export const consistencyTimeline = new ConsistencyTimelineService(consistencyTimelineStore);

/** Load all rules + trust scores + tolerance policies + contract baselines from pg. Call once at startup. */
export async function bootstrapConsistencyEngines(): Promise<void> {
  const [rules, policies, baselines] = await Promise.all([
    listAuthorityRules(),
    listTolerancePolicies(),
    listAllContractBaselines(),
  ]);
  authorityRegistry.registerAll(rules);
  toleranceRegistry.registerAll(policies);
  for (const b of baselines) contractRegistry.registerBaseline(b);
}

/** @deprecated Use bootstrapConsistencyEngines() instead */
export async function bootstrapContractRegistry(): Promise<void> {
  await bootstrapConsistencyEngines();
}
