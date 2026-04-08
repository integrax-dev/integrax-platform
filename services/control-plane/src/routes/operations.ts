/**
 * Operations routes
 *
 * POST /api/tenants/:tenantId/operations          — submit an operation
 * GET  /api/tenants/:tenantId/operations          — list operations
 * GET  /api/tenants/:tenantId/operations/:id      — get operation by id
 * POST /api/tenants/:tenantId/operations/:id/resume  — resume after approval
 *
 * POST /api/tenants/:tenantId/approvals           — list pending approvals
 * POST /api/tenants/:tenantId/approvals/:id/decide — approve or reject
 */

import { Router } from 'express';
import { requireAuth, requireTenant } from '../middleware/auth.js';
import { operationEngine, approvalStore } from '../platform/container.js';
import type { OperationRequest } from '@integrax/operation-engine';
import { randomUUID } from 'node:crypto';

export const operationsRouter = Router({ mergeParams: true });

operationsRouter.use(requireAuth);
operationsRouter.use(requireTenant);

// ─── Submit operation ─────────────────────────────────────────────────────────

operationsRouter.post('/', async (req, res) => {
  const { tenantId } = req.params as Record<string, string>;
  const body = req.body as Record<string, unknown>;

  const request: OperationRequest = {
    operationId: (body['operationId'] as string) ?? randomUUID(),
    commandName: body['commandName'] as string,
    profileId: body['profileId'] as string | undefined,
    tenantId,
    actor: (body['actor'] as OperationRequest['actor']) ?? {
      type: 'user',
      id: req.user?.id,
      role: req.user?.role,
      tenantId,
    },
    target: (body['target'] as OperationRequest['target']) ?? {},
    payload: body['payload'],
    options: body['options'] as Record<string, unknown> | undefined,
    context: body['context'] as Record<string, unknown> | undefined,
    idempotencyKey: (req.headers['idempotency-key'] as string) ?? (body['idempotencyKey'] as string),
    correlationId: req.headers['x-correlation-id'] as string | undefined,
    requestedAt: new Date().toISOString(),
  };

  if (!request.commandName) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_FAILED', message: 'commandName is required' } });
    return;
  }

  const result = await operationEngine.submit(request);
  const httpStatus = result.status === 'succeeded' ? 200
    : result.status === 'awaiting_approval' ? 202
    : result.status === 'rejected' ? 422
    : result.errors.length > 0 ? 500
    : 202;

  res.status(httpStatus).json({ success: result.status === 'succeeded', data: result });
});

// ─── Get operation ────────────────────────────────────────────────────────────

operationsRouter.get('/:operationId', async (req, res) => {
  const { tenantId, operationId } = req.params as Record<string, string>;
  const record = await operationEngine.getOperation(tenantId, operationId);
  if (!record) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Operation not found' } });
    return;
  }
  res.json({ success: true, data: record });
});

// ─── Resume after approval ────────────────────────────────────────────────────

operationsRouter.post('/:operationId/resume', async (req, res) => {
  const { tenantId, operationId } = req.params as Record<string, string>;
  const result = await operationEngine.resume(tenantId, operationId);
  res.json({ success: result.status === 'succeeded', data: result });
});

// ─── Approvals ────────────────────────────────────────────────────────────────

operationsRouter.get('/approvals/pending', async (req, res) => {
  const { tenantId } = req.params as Record<string, string>;
  const pending = await approvalStore.listPending(tenantId);
  res.json({ success: true, data: pending });
});

operationsRouter.post('/approvals/:approvalId/decide', async (req, res) => {
  const { tenantId, approvalId } = req.params as Record<string, string>;
  const body = req.body as { decision: 'approved' | 'rejected'; note?: string };

  if (body.decision !== 'approved' && body.decision !== 'rejected') {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_FAILED', message: "decision must be 'approved' or 'rejected'" } });
    return;
  }

  const approvalService = (operationEngine as any)['approvalService'] as import('@integrax/operation-engine').ApprovalService;
  const result = await approvalService.decide({
    approvalId,
    tenantId,
    decision: body.decision,
    decidedBy: { type: 'user', id: req.user?.id, role: req.user?.role, tenantId },
    note: body.note,
  });

  if ('code' in result) {
    res.status(409).json({ success: false, error: result });
    return;
  }

  res.json({ success: true, data: result });
});
