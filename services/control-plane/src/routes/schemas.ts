import { Router, Request, Response } from 'express';
import { TemporalClientService } from '@integrax/temporal-workflows';
import { requireAuth, requireTenant } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import { pool } from '../store/db.js';
import { loadMappingMemory, upsertEntry } from '../store/mapping-memory-repository.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { createLogger } from '@integrax/logger';

const router: Router = Router();
const logger = createLogger({ service: 'control-plane:schemas', version: '0.1.0' });

// Lock basado en Promise: requests concurrentes comparten la misma Promise de init
// en vez de crear múltiples clientes (lo que filtraría conexiones).
// Si la Promise rechaza (Temporal caído), se nullea para que el próximo request vuelva a intentarlo.
let _temporalClientPromise: Promise<TemporalClientService> | null = null;

function getTemporalClient(): Promise<TemporalClientService> {
  if (!_temporalClientPromise) {
    _temporalClientPromise = (async () => {
      const c = new TemporalClientService();
      await c.connect();
      return c;
    })().catch(err => {
      _temporalClientPromise = null; // permite reintentar en la próxima request
      throw err;
    });
  }
  return _temporalClientPromise;
}

const startSchemaDiffOpts = z.object({
  sourceSchemaId: z.string(),
  targetSchemaId: z.string(),
  samplesA: z.array(z.record(z.unknown())).max(2000).optional(),
  samplesB: z.array(z.record(z.unknown())).max(2000).optional(),
  options: z.object({
    renameSimilarityThreshold: z.number().optional(),
    enableLlmEscalation: z.boolean().optional(),
    forceRecalculate: z.boolean().optional(),
    useSampleReservoir: z.boolean().optional(),
    sampleLimit: z.number().int().min(1).max(2000).optional(),
  }).optional(),
}).refine(
  value =>
    ((value.samplesA?.length ?? 0) > 0 && (value.samplesB?.length ?? 0) > 0) ||
    value.options?.useSampleReservoir === true,
  {
    message: 'Provide samplesA/samplesB or enable options.useSampleReservoir',
    path: ['samplesA'],
  },
);

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
          pollUrl: `/api/schemas/status/${handle.workflowId}`,
        },
      });
    } catch (error) {
      logger.error({ err: error, tenantId: req.tenantId }, 'Error starting schema diff workflow');
      res.status(500).json({
        success: false,
        error: {
          code: 'WORKFLOW_START_FAILED',
          message: error instanceof Error ? error.message : 'Failed to start schema diff workflow',
        },
      });
    }
  },
);

router.get(
  '/status/:workflowId',
  requireAuth,
  requireTenant,
  async (req: Request, res: Response) => {
    try {
      const { workflowId } = req.params;
      const tenantId = req.tenantId!;

      // Formato del workflowId: schemaDiff-{tenantId}-{timestamp}
      // El dash al final en startsWith evita que "tenant-abc" eluda el check de "tenant-a"
      if (!workflowId.startsWith(`schemaDiff-${tenantId}-`)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You do not own this workflow' },
        });
      }

      const client = await getTemporalClient();
      const status = await client.getWorkflowStatus(workflowId);

      let reportLink: string | null = null;
      if (status.status === 'Completed' || status.status === 'COMPLETED') {
        const dbResult = await pool.query(
          'SELECT id FROM schema_diff_reports WHERE workflow_id = $1 AND tenant_id = $2',
          [workflowId, tenantId],
        );

        if (dbResult.rows.length > 0) {
          reportLink = `/api/schemas/reports/${dbResult.rows[0].id}`;
        }
      }

      res.json({
        success: true,
        data: {
          workflowId,
          ...status,
          reportLink,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'WORKFLOW_STATUS_FAILED',
          message: error instanceof Error ? error.message : 'Error retrieving workflow',
        },
      });
    }
  },
);

router.get(
  '/reports/:id',
  requireAuth,
  requireTenant,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;
      const result = await pool.query(
        'SELECT * FROM schema_diff_reports WHERE id = $1 AND tenant_id = $2',
        [id, tenantId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Report not found' },
        });
      }

      res.json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_REPORT_FAILED',
          message: error instanceof Error ? error.message : 'Error retrieving report',
        },
      });
    }
  },
);

// ─── Schema: feedback body ────────────────────────────────────────────────────

const feedbackBodySchema = z.object({
  sourcePath: z.string().min(1),
  targetPath: z.string().min(1),
  accepted: z.boolean(),
  /**
   * Confianza del modelo en el momento de la sugerencia (0–1).
   * Si no se provee, se usa 0.80 como valor neutral.
   */
  confidence: z.number().min(0).max(1).default(0.80),
});

/**
 * POST /api/schemas/reports/:reportId/feedback
 *
 * Registra la decisión del operador (aceptar / rechazar) sobre un par de campos
 * sugerido en un reporte de diff. Actualiza la memoria de mappings en Postgres.
 *
 * El reportId se usa para obtener el par de conectores (source/target) del reporte,
 * garantizando que el feedback quede correctamente scopeado.
 */
router.post(
  '/reports/:reportId/feedback',
  requireAuth,
  requireTenant,
  rateLimit({ maxRequests: 120, windowMs: 60_000 }),
  validate(feedbackBodySchema),
  audit('schemas.feedback'),
  async (req: Request, res: Response) => {
    try {
      const { reportId } = req.params;
      const tenantId = req.tenantId!;
      const { sourcePath, targetPath, accepted, confidence } = req.body as z.infer<typeof feedbackBodySchema>;

      // Resolver el par de conectores desde el reporte para scopear el feedback.
      const reportResult = await pool.query<{
        source_connector_id: string;
        target_connector_id: string;
      }>(
        'SELECT source_connector_id, target_connector_id FROM schema_diff_reports WHERE id = $1 AND tenant_id = $2',
        [reportId, tenantId],
      );

      if (reportResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Report not found' },
        });
      }

      const { source_connector_id, target_connector_id } = reportResult.rows[0];

      await upsertEntry(
        tenantId,
        source_connector_id,
        target_connector_id,
        sourcePath,
        targetPath,
        accepted,
        confidence,
      );

      res.json({
        success: true,
        data: {
          reportId,
          sourcePath,
          targetPath,
          accepted,
          confidence,
          connectorAId: source_connector_id,
          connectorBId: target_connector_id,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'FEEDBACK_FAILED',
          message: error instanceof Error ? error.message : 'Error saving feedback',
        },
      });
    }
  },
);

/**
 * GET /api/schemas/memory
 *
 * Devuelve la memoria de mappings para un par de conectores del tenant.
 * Útil para inspección / debug desde el panel de admin.
 *
 * Query params: connectorAId, connectorBId (ambos requeridos)
 */
router.get(
  '/memory',
  requireAuth,
  requireTenant,
  async (req: Request, res: Response) => {
    const { connectorAId, connectorBId } = req.query;

    if (typeof connectorAId !== 'string' || typeof connectorBId !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'connectorAId and connectorBId are required query params' },
      });
    }

    try {
      const entries = await loadMappingMemory(req.tenantId!, connectorAId, connectorBId);
      res.json({ success: true, data: entries });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'MEMORY_FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Error fetching mapping memory',
        },
      });
    }
  },
);

export { router as schemasRouter };
