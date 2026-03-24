import { Router, Request, Response } from 'express';
import { TemporalClientService } from '@integrax/temporal-workflows';
import { requireAuth, requireTenant } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import { pool } from '../store/db.js';

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
  async (req: Request, res: Response) => {
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
  async (req: Request, res: Response) => {
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

      let reportLink = null;
      if (status.status === 'Completed' || status.status === 'COMPLETED') {
         // Buscar el reporte generado por este flujo
         const dbResult = await pool.query(
           'SELECT id FROM schema_diff_reports WHERE id = $1',
           [workflowId.split('-').pop()] // Esto es frágil, mejor sería guardar el workflowId en la DB
         );
         // Alternativa: buscar el más reciente para este tenant y conector
         if (dbResult.rows.length > 0) {
           reportLink = `/api/schemas/diff/reports/${dbResult.rows[0].id}`;
         } else {
            // Fallback: último reporte del tenant
            const fallbackRes = await pool.query(
              'SELECT id FROM schema_diff_reports WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
              [tenantId]
            );
            if (fallbackRes.rows.length > 0) reportLink = `/api/schemas/diff/reports/${fallbackRes.rows[0].id}`;
         }
      }

      res.json({
        success: true,
        data: {
          workflowId,
          ...status,
          reportLink
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

/**
 * GET /api/schemas/diff/reports/:id
 * Recupera el resultado final persistido en Postgres
 */
router.get(
  '/reports/:id',
  requireAuth,
  requireTenant,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await pool.query(
        'SELECT * FROM schema_diff_reports WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Report not found' }
        });
      }

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_REPORT_FAILED',
          message: error instanceof Error ? error.message : 'Error retrieving report'
        }
      });
    }
  }
);

export { router as schemasRouter };
