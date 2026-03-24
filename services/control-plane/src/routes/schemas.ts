/**
 * Schema Bridge Routes
 *
 * API para encolar detecciones asincrónicas de esquemas.
 */

import { Router } from 'express';
import { TemporalClientService } from '@integrax/temporal-workflows';
import { requireAuth, requireTenant } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';

const router: Router = Router();

// Inyección de cliente Temporal
let temporalClient: TemporalClientService | null = null;
async function getTemporalClient(): Promise<TemporalClientService> {
  if (!temporalClient) {
    temporalClient = new TemporalClientService();
    await temporalClient.connect();
  }
  return temporalClient;
}

const startSchemaDiffOpts = z.object({
  sourceSchemaId: z.string(),
  targetSchemaId: z.string(),
  samplesA: z.array(z.record(z.unknown())),
  samplesB: z.array(z.record(z.unknown())),
  options: z.object({
    renameSimilarityThreshold: z.number().optional(),
    enableLlmEscalation: z.boolean().optional(),
    forceRecalculate: z.boolean().optional(),
  }).optional(),
});

/**
 * POST /api/schemas/diff
 * Run cross-system mapping inference using Schema Bridge
 */
router.post(
  '/diff',
  requireAuth,
  requireTenant,
  validate(startSchemaDiffOpts),
  audit('schemas.diff.start'),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const client = await getTemporalClient();

      const { sourceSchemaId, targetSchemaId, samplesA, samplesB, options } = req.body;
      const workflowId = `schemaDiff-${tenantId}-${Date.now()}`;

      const handle = await client.startSchemaDiff(tenantId, {
        sourceSchemaId,
        targetSchemaId,
        samplesA,
        samplesB,
        tenantId,
        options,
      }, workflowId);

      res.status(202).json({
        success: true,
        data: {
          workflowId: handle.workflowId,
          status: 'ACCEPTED',
          pollUrl: `/api/schemas/diff/status/${handle.workflowId}`
        },
      });
    } catch (error) {
      console.error('Error starting schema diff workflow:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'WORKFLOW_START_FAILED',
          message: error instanceof Error ? error.message : 'Failed to start schema diff workflow',
        },
      });
    }
  }
);

/**
 * GET /api/schemas/diff/status/:workflowId
 */
router.get(
  '/status/:workflowId',
  requireAuth,
  requireTenant,
  async (req, res) => {
    try {
      const { workflowId } = req.params;
      const tenantId = req.tenantId!;

      if (!workflowId.includes(tenantId)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You do not own this workflow' }
        });
      }

      const client = await getTemporalClient();
      const status = await client.getWorkflowStatus(workflowId);

      res.json({
        success: true,
        data: {
          workflowId,
          ...status
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'WORKFLOW_STATUS_FAILED',
          message: error instanceof Error ? error.message : 'Error retrieving workflow'
        }
      });
    }
  }
);

export { router as schemasRouter };
