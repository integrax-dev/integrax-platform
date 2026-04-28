/**
 * Consistency Control Plane singletons.
 *
 * All engines are in-memory and load their state from Postgres on startup.
 * Routes should call the engines directly and persist changes via the pg-* stores.
 */

import { ToleranceRegistry } from '@integrax/tolerance-engine';
import { AuthorityRegistry, ConnectorTrustEngine } from '@integrax/authority-engine';
import { ConsistencyPolicyCompiler } from '@integrax/behavior-engine';
import { ConsistencySignalService } from '@integrax/consistency-signals';
import { MappingGovernanceEngine } from '@integrax/mapping-governance';

export const toleranceRegistry = new ToleranceRegistry();
export const authorityRegistry = new AuthorityRegistry();
export const trustEngine = new ConnectorTrustEngine();
export const policyCompiler = new ConsistencyPolicyCompiler();
export const signalService = new ConsistencySignalService();
export const mappingGovernance = new MappingGovernanceEngine();
