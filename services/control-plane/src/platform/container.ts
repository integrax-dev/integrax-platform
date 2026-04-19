/**
 * Platform Container
 *
 * Single-import façade over the sub-modules in ./container/.
 * All routes and middleware should import from this file, not from the sub-modules directly.
 *
 * Sub-module layout:
 *   container/event-bus.ts    — InMemoryEventBus singleton
 *   container/stores.ts       — All storage singletons (Postgres or InMemory)
 *   container/connectors.ts   — ConnectorManifestRegistry + FacadeResolver
 *   container/commands.ts     — CommandRegistry with built-in commands
 *   container/modules.ts      — Domain module singletons (Orders, Billing, etc.)
 *   container/orchestrator.ts — IntegrationOrchestrator + PollingScheduler
 *   container/engine.ts       — OperationEngine
 */

export { eventBus } from './container/event-bus.js';
export { snapshotStore, timelineStore, approvalStore, identityAliasStore } from './container/stores.js';
export { connectorRegistry, facadeResolver } from './container/connectors.js';
export { commandRegistry } from './container/commands.js';
export { ordersService, inventoryService, billingService, catalogService, paymentsService, consistencyInspector, ecommerceService } from './container/modules.js';
export { orchestrator, pollingScheduler, registerTenantPolling } from './container/orchestrator.js';
export { operationEngine } from './container/engine.js';
