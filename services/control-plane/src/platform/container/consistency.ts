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

export const toleranceRegistry = new ToleranceRegistry();
export const authorityRegistry = new AuthorityRegistry();
export const trustEngine = new ConnectorTrustEngine();
export const policyCompiler = new ConsistencyPolicyCompiler();
export const signalService = new ConsistencySignalService();
export const mappingGovernance = new MappingGovernanceEngine();
export const contractRegistry = new ConnectorContractRegistry();
export const consistencyTimelineStore = new PgTimelineStore();
export const consistencyTimeline = new ConsistencyTimelineService(consistencyTimelineStore);

/** Load contract baselines from Postgres into the in-memory registry. Call once at startup. */
export async function bootstrapContractRegistry(): Promise<void> {
  const baselines = await listAllContractBaselines();
  for (const b of baselines) contractRegistry.registerBaseline(b);
}
