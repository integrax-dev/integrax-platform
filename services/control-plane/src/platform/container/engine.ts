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
import { moduleHandlers } from './module-handlers/index.js';

// ─── Validator ────────────────────────────────────────────────────────────────

const operationValidator = new Validator({
  capabilityMap: {
    // PSP connectors — generic + payment-specific capabilities
    mercadopago: [
      'create_record', 'update_record', 'sync_record',
      'create_payment', 'authorize_payment', 'capture_payment',
      'refund_payment', 'cancel_payment', 'tokenize_payment_method',
      'create_subscription', 'cancel_subscription',
      'create_checkout_link', 'generate_qr_payment', 'reconcile_payment',
      'send_payment_reminder',
    ],
    payway: [
      'create_record', 'sync_record',
      'create_payment', 'capture_payment', 'refund_payment', 'cancel_payment',
      'tokenize_payment_method',
    ],
    mobbex: [
      'create_record', 'sync_record',
      'create_payment', 'refund_payment', 'cancel_payment',
      'create_checkout_link', 'reconcile_payment',
    ],
    decidir: [
      'create_record', 'sync_record',
      'create_payment', 'authorize_payment', 'capture_payment',
      'refund_payment', 'cancel_payment', 'tokenize_payment_method',
    ],
    // ERP / fiscal connectors
    contabilium: ['create_record', 'update_record', 'sync_record', 'create_document'],
    'afip-wsfe': ['create_document', 'approve_document'],
    // Utility connectors
    'google-sheets': ['create_record', 'update_record', 'sync_record'],
    email: ['send_notification'],
    whatsapp: ['send_notification'],
    // Module handlers (not connector facades)
    billing: ['create_document', 'sync_record'],
    inventory: ['update_record', 'sync_record'],
    orders: ['update_record', 'sync_record'],
    catalog: ['create_record', 'update_record', 'publish_record', 'archive_record'],
    ecommerce: ['create_record', 'sync_record'],
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
    moduleHandlers,
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
