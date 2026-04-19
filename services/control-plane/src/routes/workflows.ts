import { Router, type Response } from 'express';
import { createEngine, IntegrationEngineError } from '@integrax/integration-engine';
import type { IntegrationEngine } from '@integrax/integration-engine';
import { requireAuth, requireRole, requireTenant } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';

const router: Router = Router();

// Singleton del engine — se inicializa lazy la primera vez que llega un request.
// Si las env vars no están seteadas, cada request recibe 503.
let _engine: IntegrationEngine | null = null;

function getEngine(): IntegrationEngine | null {
  if (!_engine) {
    try {
      _engine = createEngine();
    } catch {
      return null;
    }
  }
  return _engine;
}

function engineUnavailable(res: Response) {
  return res.status(503).json({
    success: false,
    error: {
      code: 'ENGINE_UNAVAILABLE',
      message: 'Integration engine not configured. Set INTEGRATION_ENGINE_URL and INTEGRATION_ENGINE_API_KEY.',
    },
  });
}

/**
 * GET /workflows
 * Lista todos los flows habilitados para el tenant.
 */
router.get('/', requireAuth, requireTenant, async (req, res) => {
  const engine = getEngine();
  if (!engine) return engineUnavailable(res);

  try {
    const flows = await engine.listFlows(req.tenantId!);
    res.json({ success: true, data: flows });
  } catch (err) {
    const status = err instanceof IntegrationEngineError ? err.statusCode : 500;
    res.status(status).json({
      success: false,
      error: { code: 'ENGINE_ERROR', message: err instanceof Error ? err.message : String(err) },
    });
  }
});

/**
 * POST /workflows/:id/trigger
 * Dispara un flow manualmente con un payload arbitrario.
 */
router.post(
  '/:id/trigger',
  requireAuth,
  requireTenant,
  requireRole('tenant_admin', 'operator', 'platform_admin'),
  audit('workflow.trigger'),
  async (req, res) => {
    const engine = getEngine();
    if (!engine) return engineUnavailable(res);

    try {
      const run = await engine.triggerFlow({
        flowId: req.params.id,
        tenantId: req.tenantId!,
        payload: req.body ?? {},
      });
      res.status(202).json({ success: true, data: run });
    } catch (err) {
      const status = err instanceof IntegrationEngineError ? err.statusCode : 500;
      res.status(status).json({
        success: false,
        error: { code: 'ENGINE_ERROR', message: err instanceof Error ? err.message : String(err) },
      });
    }
  },
);

/**
 * GET /workflows/:id/runs/:runId
 * Consulta el estado de un run.
 */
router.get('/:id/runs/:runId', requireAuth, requireTenant, async (req, res) => {
  const engine = getEngine();
  if (!engine) return engineUnavailable(res);

  try {
    const run = await engine.getRunStatus(req.tenantId!, req.params.runId);
    res.json({ success: true, data: run });
  } catch (err) {
    const status = err instanceof IntegrationEngineError ? err.statusCode : 500;
    res.status(status).json({
      success: false,
      error: { code: 'ENGINE_ERROR', message: err instanceof Error ? err.message : String(err) },
    });
  }
});

/**
 * POST /workflows/:id/runs/:runId/cancel
 * Cancela un run en ejecución.
 */
router.post(
  '/:id/runs/:runId/cancel',
  requireAuth,
  requireTenant,
  requireRole('tenant_admin', 'operator', 'platform_admin'),
  audit('workflow.cancel'),
  async (req, res) => {
    const engine = getEngine();
    if (!engine) return engineUnavailable(res);

    try {
      await engine.cancelRun(req.tenantId!, req.params.runId);
      res.json({ success: true, data: { runId: req.params.runId, status: 'cancelled' } });
    } catch (err) {
      const status = err instanceof IntegrationEngineError ? err.statusCode : 500;
      res.status(status).json({
        success: false,
        error: { code: 'ENGINE_ERROR', message: err instanceof Error ? err.message : String(err) },
      });
    }
  },
);

/**
 * PATCH /workflows/:id/enable
 * Activa un flow.
 */
router.patch(
  '/:id/enable',
  requireAuth,
  requireTenant,
  requireRole('tenant_admin', 'platform_admin'),
  audit('workflow.enable'),
  async (req, res) => {
    const engine = getEngine();
    if (!engine) return engineUnavailable(res);

    try {
      await engine.enableFlow(req.tenantId!, req.params.id);
      res.json({ success: true, data: { flowId: req.params.id, enabled: true } });
    } catch (err) {
      const status = err instanceof IntegrationEngineError ? err.statusCode : 500;
      res.status(status).json({
        success: false,
        error: { code: 'ENGINE_ERROR', message: err instanceof Error ? err.message : String(err) },
      });
    }
  },
);

/**
 * PATCH /workflows/:id/disable
 * Desactiva un flow.
 */
router.patch(
  '/:id/disable',
  requireAuth,
  requireTenant,
  requireRole('tenant_admin', 'platform_admin'),
  audit('workflow.disable'),
  async (req, res) => {
    const engine = getEngine();
    if (!engine) return engineUnavailable(res);

    try {
      await engine.disableFlow(req.tenantId!, req.params.id);
      res.json({ success: true, data: { flowId: req.params.id, enabled: false } });
    } catch (err) {
      const status = err instanceof IntegrationEngineError ? err.statusCode : 500;
      res.status(status).json({
        success: false,
        error: { code: 'ENGINE_ERROR', message: err instanceof Error ? err.message : String(err) },
      });
    }
  },
);

export { router as workflowsRouter };
