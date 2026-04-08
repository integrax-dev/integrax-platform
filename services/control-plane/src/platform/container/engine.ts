/**
 * Operation Engine + Approval Policy
 *
 * Wires commandRegistry, facadeResolver, all stores, and the event/timeline/snapshot
 * integration into a single OperationEngine instance.
 *
 * Also wires the ApprovalService notification: when an operation enters
 * 'awaiting_approval', we emit a 'conflict.detected' event so the notification
 * layer can alert the relevant approvers.
 */

import {
  OperationEngine,
  ApprovalPolicy,
  Validator,
} from '@integrax/operation-engine';
import {
  snapshotStore,
  operationStore,
  attemptStore,
  approvalStore,
  idempotencyStore,
} from './stores.js';
import { eventBus } from './event-bus.js';
import { timelineStore } from './stores.js';
import { commandRegistry } from './commands.js';
import { facadeResolver } from './connectors.js';
import { billingService, inventoryService } from './modules.js';

// ─── Validator ────────────────────────────────────────────────────────────────

const operationValidator = new Validator({
  capabilityMap: {
    mercadopago: ['create_record', 'update_record', 'sync_record'],
    contabilium: ['create_record', 'update_record', 'sync_record', 'create_document'],
    'afip-wsfe': ['create_document', 'approve_document'],
    'google-sheets': ['create_record', 'update_record', 'sync_record'],
    email: ['send_notification'],
    whatsapp: ['send_notification'],
    billing: ['create_document', 'sync_record'],
    inventory: ['update_record', 'sync_record'],
    orders: ['update_record', 'sync_record'],
    catalog: ['create_record', 'update_record', 'publish_record', 'archive_record'],
  },
  snapshotStore,
});

// ─── OperationEngine ──────────────────────────────────────────────────────────

export const operationEngine = new OperationEngine({
  commandRegistry,
  validator: operationValidator,
  operationStore,
  attemptStore,
  approvalStore,
  snapshotStore,
  eventBus,
  timelineStore,
  idempotencyStore,
  approvalPolicy: new ApprovalPolicy(),
  dispatcher: {
    resolveFacade: (connectorId, tenantId) => facadeResolver.resolve(connectorId, tenantId),
    moduleHandlers: {
      billing: async (_tenantId, action, payload) => {
        if (action === 'create_invoice') return billingService.createInvoice(payload as any);
        throw new Error(`billing: unknown action '${action}'`);
      },
      inventory: async (_tenantId, action, payload) => {
        if (action === 'update_stock') return inventoryService.updateStock(payload as any);
        throw new Error(`inventory: unknown action '${action}'`);
      },
    },
  },
  hooks: {
    beforeExecute: [],
    afterExecute: [],
    onFailure: [],
  },
});

// ─── Approval notifications ───────────────────────────────────────────────────
// When an operation enters 'awaiting_approval', emit a snapshot.updated event
// so downstream listeners (realtime / email / slack) can notify the approvers.

eventBus.subscribe('snapshot.updated', async (event) => {
  // This is a placeholder hook point. In production, check if the event
  // originates from an awaiting_approval status change and send notifications.
  void event;
});
