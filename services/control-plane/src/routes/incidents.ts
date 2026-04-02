import { Router, Request, Response } from 'express';
import { requireAuth, requireTenant } from '../middleware/auth.js';
import { pool } from '../store/db.js';
import { audit } from '../middleware/audit.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { createDriftIncident, type ContractDiffSummary } from '../../../drift-engine/dist/index.js';
import { summarizeSchemaDiffReport, type RawSchemaDiffPayload } from '../../../contract-intelligence/dist/index.js';

const router: Router = Router();

type IncidentSeverity = 'critical' | 'major' | 'minor';
type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'dismissed';
interface ReportSummary {
  coveragePercent?: number;
  breakingCount?: number;
  nonBreakingCount?: number;
}

interface ReportRow {
  id: string;
  tenant_id: string;
  workflow_id: string | null;
  source_connector_id: string | null;
  target_connector_id: string | null;
  created_at: string;
  incident_status?: IncidentStatus | null;
  diff_payload: RawSchemaDiffPayload | null;
}

function countChanges(row: ReportRow): number {
  const mismatches = row.diff_payload?.mismatches;
  if (!mismatches) {
    const summary = row.diff_payload?.summary;
    return (summary?.breakingCount ?? 0) + (summary?.nonBreakingCount ?? 0);
  }

  return (mismatches.addedFields?.length ?? 0)
    + (mismatches.removedFields?.length ?? 0)
    + (mismatches.typeChanges?.length ?? 0)
    + (mismatches.renameCandidates?.length ?? 0);
}

function buildContractDiffSummary(row: ReportRow): ContractDiffSummary {
  return summarizeSchemaDiffReport({
    sourceConnectorId: row.source_connector_id ?? 'unknown',
    targetConnectorId: row.target_connector_id ?? 'unknown',
    sourceVersion: 'current',
    targetVersion: 'current',
    payload: row.diff_payload,
  });
}

function toIncident(row: ReportRow) {
  const summary = row.diff_payload?.summary;
  const sourceConnectorId = row.source_connector_id ?? 'unknown';
  const targetConnectorId = row.target_connector_id ?? 'unknown';
  const diff = buildContractDiffSummary(row);
  const incident = createDriftIncident({
    tenantId: row.tenant_id,
    connectorId: sourceConnectorId,
    targetConnectorId,
    workflowId: row.workflow_id ?? undefined,
    reportId: row.id,
    status: row.incident_status ?? 'open',
    detectedAt: row.created_at,
    title: `${sourceConnectorId} -> ${targetConnectorId} drift detected`,
    summary: `${countChanges(row)} change(s) detected for ${sourceConnectorId} -> ${targetConnectorId}`,
    diff,
  });

  return {
    ...incident,
    targetConnectorId,
    changeCount: countChanges(row),
    coveragePercent: summary?.coveragePercent ?? null,
  };
}

async function updateIncidentStatus(
  reportId: string,
  tenantId: string,
  status: IncidentStatus,
): Promise<void> {
  await pool.query(
    `INSERT INTO drift_incidents (id, report_id, tenant_id, status, detected_at, resolved_at, dismissed_at, updated_at)
     SELECT $1, sdr.id, sdr.tenant_id, $3, sdr.created_at,
            CASE WHEN $3 = 'resolved' THEN NOW() ELSE NULL END,
            CASE WHEN $3 = 'dismissed' THEN NOW() ELSE NULL END,
            NOW()
     FROM schema_diff_reports sdr
     WHERE sdr.id = $2 AND sdr.tenant_id = $4
     ON CONFLICT (report_id) DO UPDATE SET
       status = EXCLUDED.status,
       resolved_at = CASE WHEN EXCLUDED.status = 'resolved' THEN NOW() ELSE drift_incidents.resolved_at END,
       dismissed_at = CASE WHEN EXCLUDED.status = 'dismissed' THEN NOW() ELSE drift_incidents.dismissed_at END,
       updated_at = NOW()`,
    [`incident-${reportId}`, reportId, status, tenantId],
  );
}

router.get(
  '/',
  requireAuth,
  requireTenant,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const result = await pool.query<ReportRow>(
        `SELECT
           sdr.id,
           sdr.tenant_id,
           sdr.workflow_id,
           sdr.source_connector_id,
           sdr.target_connector_id,
           sdr.created_at,
           sdr.diff_payload,
           di.status AS incident_status
         FROM schema_diff_reports sdr
         LEFT JOIN drift_incidents di ON di.report_id = sdr.id
         WHERE sdr.tenant_id = $1
         ORDER BY sdr.created_at DESC
         LIMIT 50`,
        [tenantId],
      );

      res.json({
        success: true,
        data: result.rows.map(toIncident),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_INCIDENTS_FAILED',
          message: error instanceof Error ? error.message : 'Error retrieving incidents',
        },
      });
    }
  },
);

router.get(
  '/:id',
  requireAuth,
  requireTenant,
  async (req: Request, res: Response) => {
    try {
      const reportId = req.params.id.startsWith('incident-')
        ? req.params.id.slice('incident-'.length)
        : req.params.id;
      const tenantId = req.tenantId!;
      const result = await pool.query<ReportRow>(
        `SELECT
           sdr.id,
           sdr.tenant_id,
           sdr.workflow_id,
           sdr.source_connector_id,
           sdr.target_connector_id,
           sdr.created_at,
           sdr.diff_payload,
           di.status AS incident_status
         FROM schema_diff_reports sdr
         LEFT JOIN drift_incidents di ON di.report_id = sdr.id
         WHERE sdr.id = $1 AND sdr.tenant_id = $2`,
        [reportId, tenantId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Incident not found' },
        });
      }

      res.json({
        success: true,
        data: toIncident(result.rows[0]),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_INCIDENT_FAILED',
          message: error instanceof Error ? error.message : 'Error retrieving incident',
        },
      });
    }
  },
);

router.post(
  '/:id/investigating',
  requireAuth,
  requireTenant,
  rateLimit({ maxRequests: 60, windowMs: 60_000 }),
  audit('incidents.investigating'),
  async (req: Request, res: Response) => {
    try {
      const reportId = req.params.id.startsWith('incident-')
        ? req.params.id.slice('incident-'.length)
        : req.params.id;
      const tenantId = req.tenantId!;

      const exists = await pool.query<{ id: string }>(
        'SELECT id FROM schema_diff_reports WHERE id = $1 AND tenant_id = $2',
        [reportId, tenantId],
      );

      if (exists.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Incident not found' },
        });
      }

      await updateIncidentStatus(reportId, tenantId, 'investigating');
      res.json({ success: true, data: { id: `incident-${reportId}`, status: 'investigating' } });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'UPDATE_INCIDENT_FAILED',
          message: error instanceof Error ? error.message : 'Error updating incident',
        },
      });
    }
  },
);

router.post(
  '/:id/resolve',
  requireAuth,
  requireTenant,
  rateLimit({ maxRequests: 60, windowMs: 60_000 }),
  audit('incidents.resolve'),
  async (req: Request, res: Response) => {
    try {
      const reportId = req.params.id.startsWith('incident-')
        ? req.params.id.slice('incident-'.length)
        : req.params.id;
      const tenantId = req.tenantId!;

      const exists = await pool.query<{ id: string }>(
        'SELECT id FROM schema_diff_reports WHERE id = $1 AND tenant_id = $2',
        [reportId, tenantId],
      );

      if (exists.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Incident not found' },
        });
      }

      await updateIncidentStatus(reportId, tenantId, 'resolved');
      res.json({ success: true, data: { id: `incident-${reportId}`, status: 'resolved' } });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'RESOLVE_INCIDENT_FAILED',
          message: error instanceof Error ? error.message : 'Error resolving incident',
        },
      });
    }
  },
);

router.post(
  '/:id/dismiss',
  requireAuth,
  requireTenant,
  rateLimit({ maxRequests: 60, windowMs: 60_000 }),
  audit('incidents.dismiss'),
  async (req: Request, res: Response) => {
    try {
      const reportId = req.params.id.startsWith('incident-')
        ? req.params.id.slice('incident-'.length)
        : req.params.id;
      const tenantId = req.tenantId!;

      const exists = await pool.query<{ id: string }>(
        'SELECT id FROM schema_diff_reports WHERE id = $1 AND tenant_id = $2',
        [reportId, tenantId],
      );

      if (exists.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Incident not found' },
        });
      }

      await updateIncidentStatus(reportId, tenantId, 'dismissed');
      res.json({ success: true, data: { id: `incident-${reportId}`, status: 'dismissed' } });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'DISMISS_INCIDENT_FAILED',
          message: error instanceof Error ? error.message : 'Error dismissing incident',
        },
      });
    }
  },
);

export { router as incidentsRouter };
