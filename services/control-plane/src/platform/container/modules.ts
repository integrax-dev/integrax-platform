/**
 * Domain module singletons
 *
 * Each module receives the shared stores and event bus so they share
 * the same state as the orchestrator.
 */

import { OrdersService } from '@integrax/module-orders';
import { InventoryService } from '@integrax/module-inventory';
import { BillingService } from '@integrax/module-billing';
import { CatalogService } from '@integrax/module-catalog';
import { SnapshotConsistencyInspector } from '@integrax/module-consistency-inspector';
import { PaymentsService } from '@integrax/module-payments';
import { snapshotStore, timelineStore } from './stores.js';
import { eventBus } from './event-bus.js';

export const ordersService = new OrdersService(snapshotStore, eventBus, timelineStore);
export const inventoryService = new InventoryService(snapshotStore, eventBus, timelineStore);
export const billingService = new BillingService(snapshotStore, eventBus, timelineStore);
export const catalogService = new CatalogService(snapshotStore, eventBus, timelineStore);
export const paymentsService = new PaymentsService(snapshotStore, eventBus, timelineStore);
export const consistencyInspector = new SnapshotConsistencyInspector(
  snapshotStore,
  eventBus,
  timelineStore,
);
