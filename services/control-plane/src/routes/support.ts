import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { eventBus } from '../platform/container.js';
import { ulid } from 'ulid';

export const supportRouter = Router();

// Allow access only to platform_admin or operator roles
supportRouter.use(requireAuth, requireRole('platform_admin', 'operator'));

function publishAuditEvent(
  action: string,
  tenantId: string | undefined,
  userId: string | undefined,
  details: Record<string, any>
) {
  // Push a security/audit event to the EventBus so the admin dashboard gets live notifications
  eventBus.publish({
    id: `aud_${ulid()}`,
    type: 'audit.security.warning',
    tenantId: tenantId ?? 'system',
    sourceSystem: 'support_api',
    entityType: 'action',
    occurredAt: new Date(),
    payload: {
      action,
      userId: userId ?? 'anonymous',
      details,
    },
  }).catch(err => console.error('[Support API] Failed to publish audit event:', err));
}

// ─── Support Actions ────────────────────────────────────────────────────────

supportRouter.post(
  '/retry-operation',
  audit('support.retry_operation'),
  async (req, res) => {
    const { operationId, tenantId } = req.body;
    if (!operationId) return res.status(400).json({ success: false, error: 'operationId required' });
    
    // Publish a generic framework event to trigger the engine
    await eventBus.publish({
      id: `evt_${ulid()}`,
      type: 'operation.retry.requested',
      tenantId: tenantId ?? 'system',
      sourceSystem: 'support_api',
      entityType: 'operation',
      entityId: operationId,
      occurredAt: new Date(),
      payload: { operationId, retriedBy: req.user?.id },
    });

    publishAuditEvent('retry_operation', tenantId, req.user?.id, { operationId });
    res.json({ success: true, message: 'Operation queued for retry' });
  }
);

supportRouter.post(
  '/replay-webhook',
  audit('support.replay_webhook'),
  async (req, res) => {
    const { webhookId, tenantId } = req.body;
    if (!webhookId) return res.status(400).json({ success: false, error: 'webhookId required' });
    
    await eventBus.publish({
      id: `evt_${ulid()}`,
      type: 'operation.replayed',
      tenantId: tenantId ?? 'system',
      sourceSystem: 'support_api',
      entityType: 'webhook',
      entityId: webhookId,
      occurredAt: new Date(),
      payload: { webhookId, replayedBy: req.user?.id },
    });

    publishAuditEvent('replay_webhook', tenantId, req.user?.id, { webhookId });
    res.json({ success: true, message: 'Webhook queued for replay' });
  }
);

supportRouter.post(
  '/approve-reconciliation',
  audit('support.approve_reconciliation'),
  async (req, res) => {
    const { reconciliationId, tenantId, resolutionDetails } = req.body;
    if (!reconciliationId) return res.status(400).json({ success: false, error: 'reconciliationId required' });

    await eventBus.publish({
      id: `evt_${ulid()}`,
      type: 'reconciliation.approved',
      tenantId: tenantId ?? 'system',
      sourceSystem: 'support_api',
      entityType: 'reconciliation',
      entityId: reconciliationId,
      occurredAt: new Date(),
      payload: { reconciliationId, approvedBy: req.user?.id, resolutionDetails },
    });

    publishAuditEvent('approve_reconciliation', tenantId, req.user?.id, { reconciliationId });
    res.json({ success: true, message: 'Reconciliation approved' });
  }
);

supportRouter.post(
  '/reject-reconciliation',
  audit('support.reject_reconciliation'),
  async (req, res) => {
    const { reconciliationId, tenantId, reason } = req.body;
    if (!reconciliationId) return res.status(400).json({ success: false, error: 'reconciliationId required' });

    await eventBus.publish({
      id: `evt_${ulid()}`,
      type: 'reconciliation.rejected',
      tenantId: tenantId ?? 'system',
      sourceSystem: 'support_api',
      entityType: 'reconciliation',
      entityId: reconciliationId,
      occurredAt: new Date(),
      payload: { reconciliationId, rejectedBy: req.user?.id, reason },
    });

    publishAuditEvent('reject_reconciliation', tenantId, req.user?.id, { reconciliationId });
    res.json({ success: true, message: 'Reconciliation rejected' });
  }
);

supportRouter.post(
  '/incidents/:id/investigate',
  audit('support.investigate_incident'),
  async (req, res) => {
    const { id } = req.params;
    const { tenantId } = req.body;

    await eventBus.publish({
      id: `evt_${ulid()}`,
      type: 'incident.updated',
      tenantId: tenantId ?? 'system',
      sourceSystem: 'support_api',
      entityType: 'incident',
      entityId: id,
      occurredAt: new Date(),
      payload: { status: 'investigating', updatedBy: req.user?.id },
    });

    publishAuditEvent('investigate_incident', tenantId, req.user?.id, { incidentId: id });
    res.json({ success: true, message: 'Incident marked as investigating' });
  }
);

supportRouter.post(
  '/incidents/:id/resolve',
  audit('support.resolve_incident'),
  async (req, res) => {
    const { id } = req.params;
    const { tenantId, resolutionDetails } = req.body;

    await eventBus.publish({
      id: `evt_${ulid()}`,
      type: 'incident.updated',
      tenantId: tenantId ?? 'system',
      sourceSystem: 'support_api',
      entityType: 'incident',
      entityId: id,
      occurredAt: new Date(),
      payload: { status: 'resolved', updatedBy: req.user?.id, resolutionDetails },
    });

    publishAuditEvent('resolve_incident', tenantId, req.user?.id, { incidentId: id });
    res.json({ success: true, message: 'Incident marked as resolved' });
  }
);

supportRouter.post(
  '/incidents/:id/dismiss',
  audit('support.dismiss_incident'),
  async (req, res) => {
    const { id } = req.params;
    const { tenantId } = req.body;

    await eventBus.publish({
      id: `evt_${ulid()}`,
      type: 'incident.updated',
      tenantId: tenantId ?? 'system',
      sourceSystem: 'support_api',
      entityType: 'incident',
      entityId: id,
      occurredAt: new Date(),
      payload: { status: 'dismissed', updatedBy: req.user?.id },
    });

    publishAuditEvent('dismiss_incident', tenantId, req.user?.id, { incidentId: id });
    res.json({ success: true, message: 'Incident marked as dismissed' });
  }
);

supportRouter.post(
  '/connectors/:id/health-check',
  audit('support.check_connector_health'),
  async (req, res) => {
    const { id } = req.params;
    const { tenantId } = req.body;

    // Trigger health change status generically
    await eventBus.publish({
      id: `evt_${ulid()}`,
      type: 'connector.health.changed',
      tenantId: tenantId ?? 'system',
      sourceSystem: 'support_api',
      entityType: 'connector',
      entityId: id,
      occurredAt: new Date(),
      payload: { status: 'checking', requestedBy: req.user?.id },
    });

    publishAuditEvent('check_connector_health', tenantId, req.user?.id, { connectorId: id });
    res.json({ success: true, message: 'Health check queued for connector' });
  }
);

supportRouter.post(
  '/schema-bridge/rerun',
  audit('support.rerun_schema_bridge'),
  async (req, res) => {
    const { tenantId, entityType } = req.body;

    publishAuditEvent('rerun_schema_bridge', tenantId, req.user?.id, { entityType });
    res.json({ success: true, message: 'Schema bridge execution requested' });
  }
);

supportRouter.post(
  '/reconciliation/rerun',
  audit('support.rerun_reconciliation'),
  async (req, res) => {
    const { tenantId, entityType } = req.body;

    publishAuditEvent('rerun_reconciliation', tenantId, req.user?.id, { entityType });
    res.json({ success: true, message: 'Reconciliation execution requested' });
  }
);
