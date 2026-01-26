/**
 * Workflow Management API Routes
 */

import { Router } from 'express';
import { ulid } from 'ulid';
import {
  Workflow,
  WorkflowVersion,
  WorkflowRun,
  CreateWorkflowSchema,
  WorkflowStatus,
  RunStatus,
} from '../types';
import { requireAuth, requireRole, requireTenant } from '../middleware/auth';
import { audit } from '../middleware/audit';
import { validate } from '../middleware/validate';

const router = Router();

// In-memory stores
const workflows = new Map<string, Workflow>();
const workflowVersions = new Map<string, WorkflowVersion>();
const workflowRuns = new Map<string, WorkflowRun>();

/**
 * GET /workflows - List tenant's workflows
 */
router.get(
  '/',
  requireAuth,
  requireTenant,
  async (req, res) => {
    const tenantId = req.tenantId!;
    const status = req.query.status as WorkflowStatus | undefined;

    let tenantWorkflows = Array.from(workflows.values()).filter(
      (w) => w.tenantId === tenantId
    );

    if (status) {
      tenantWorkflows = tenantWorkflows.filter((w) => w.status === status);
    }

    // Sort by creation date (newest first)
    tenantWorkflows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    res.json({
      success: true,
      data: tenantWorkflows,
    });
  }
);

/**
 * POST /workflows - Create a new workflow
 */
router.post(
  '/',
  requireAuth,
  requireTenant,
  requireRole('tenant_admin', 'operator', 'platform_admin'),
  validate(CreateWorkflowSchema),
  audit('workflow.create'),
  async (req, res) => {
    const tenantId = req.tenantId!;
    const input = req.body;

    const workflowId = `wf_${ulid()}`;

    const workflow: Workflow = {
      id: workflowId,
      tenantId,
      name: input.name,
      description: input.description || '',
      status: 'draft',
      version: 0,
      trigger: input.trigger,
      steps: input.steps,
      createdAt: new Date(),
      updatedAt: new Date(),
      publishedAt: null,
    };

    workflows.set(workflowId, workflow);

    res.status(201).json({
      success: true,
      data: workflow,
    });
  }
);

/**
 * GET /workflows/:id - Get workflow details
 */
router.get(
  '/:id',
  requireAuth,
  requireTenant,
  async (req, res) => {
    const workflow = workflows.get(req.params.id);

    if (!workflow || workflow.tenantId !== req.tenantId) {
      return res.status(404).json({
        success: false,
        error: { code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found' },
      });
    }

    res.json({
      success: true,
      data: workflow,
    });
  }
);

/**
 * PATCH /workflows/:id - Update workflow
 */
router.patch(
  '/:id',
  requireAuth,
  requireTenant,
  requireRole('tenant_admin', 'operator', 'platform_admin'),
  audit('workflow.update'),
  async (req, res) => {
    const workflow = workflows.get(req.params.id);

    if (!workflow || workflow.tenantId !== req.tenantId) {
      return res.status(404).json({
        success: false,
        error: { code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found' },
      });
    }

    if (workflow.status === 'active') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'WORKFLOW_ACTIVE',
          message: 'Cannot edit active workflow. Pause it first or create a new version.',
        },
      });
    }

    const updates = req.body;

    if (updates.name) workflow.name = updates.name;
    if (updates.description !== undefined) workflow.description = updates.description;
    if (updates.trigger) workflow.trigger = updates.trigger;
    if (updates.steps) workflow.steps = updates.steps;

    workflow.updatedAt = new Date();
    workflows.set(workflow.id, workflow);

    res.json({
      success: true,
      data: workflow,
    });
  }
);

/**
 * POST /workflows/:id/publish - Publish workflow (create new version)
 */
router.post(
  '/:id/publish',
  requireAuth,
  requireTenant,
  requireRole('tenant_admin', 'platform_admin'),
  audit('workflow.publish'),
  async (req, res) => {
    const workflow = workflows.get(req.params.id);

    if (!workflow || workflow.tenantId !== req.tenantId) {
      return res.status(404).json({
        success: false,
        error: { code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found' },
      });
    }

    // Create new version
    const newVersion = workflow.version + 1;
    const versionId = `wfv_${ulid()}`;

    const version: WorkflowVersion = {
      id: versionId,
      workflowId: workflow.id,
      version: newVersion,
      trigger: workflow.trigger,
      steps: workflow.steps,
      publishedAt: new Date(),
      publishedBy: req.user!.id,
    };

    workflowVersions.set(versionId, version);

    // Update workflow
    workflow.version = newVersion;
    workflow.status = 'active';
    workflow.publishedAt = new Date();
    workflow.updatedAt = new Date();
    workflows.set(workflow.id, workflow);

    res.json({
      success: true,
      data: {
        workflow,
        version,
      },
    });
  }
);

/**
 * POST /workflows/:id/pause - Pause workflow
 */
router.post(
  '/:id/pause',
  requireAuth,
  requireTenant,
  requireRole('tenant_admin', 'operator', 'platform_admin'),
  audit('workflow.pause'),
  async (req, res) => {
    const workflow = workflows.get(req.params.id);

    if (!workflow || workflow.tenantId !== req.tenantId) {
      return res.status(404).json({
        success: false,
        error: { code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found' },
      });
    }

    workflow.status = 'paused';
    workflow.updatedAt = new Date();
    workflows.set(workflow.id, workflow);

    res.json({
      success: true,
      data: workflow,
    });
  }
);

/**
 * POST /workflows/:id/resume - Resume paused workflow
 */
router.post(
  '/:id/resume',
  requireAuth,
  requireTenant,
  requireRole('tenant_admin', 'operator', 'platform_admin'),
  audit('workflow.resume'),
  async (req, res) => {
    const workflow = workflows.get(req.params.id);

    if (!workflow || workflow.tenantId !== req.tenantId) {
      return res.status(404).json({
        success: false,
        error: { code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found' },
      });
    }

    if (workflow.status !== 'paused') {
      return res.status(400).json({
        success: false,
        error: { code: 'NOT_PAUSED', message: 'Workflow is not paused' },
      });
    }

    workflow.status = 'active';
    workflow.updatedAt = new Date();
    workflows.set(workflow.id, workflow);

    res.json({
      success: true,
      data: workflow,
    });
  }
);

/**
 * POST /workflows/:id/rollback - Rollback to previous version
 */
router.post(
  '/:id/rollback',
  requireAuth,
  requireTenant,
  requireRole('tenant_admin', 'platform_admin'),
  audit('workflow.rollback'),
  async (req, res) => {
    const workflow = workflows.get(req.params.id);
    const targetVersion = parseInt(req.body.version);

    if (!workflow || workflow.tenantId !== req.tenantId) {
      return res.status(404).json({
        success: false,
        error: { code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found' },
      });
    }

    // Find the target version
    const version = Array.from(workflowVersions.values()).find(
      (v) => v.workflowId === workflow.id && v.version === targetVersion
    );

    if (!version) {
      return res.status(404).json({
        success: false,
        error: { code: 'VERSION_NOT_FOUND', message: 'Version not found' },
      });
    }

    // Restore from version
    workflow.trigger = version.trigger;
    workflow.steps = version.steps;
    workflow.version = workflow.version + 1; // New version with old content
    workflow.updatedAt = new Date();
    workflows.set(workflow.id, workflow);

    res.json({
      success: true,
      data: {
        message: `Rolled back to version ${targetVersion}`,
        workflow,
      },
    });
  }
);

/**
 * GET /workflows/:id/versions - List workflow versions
 */
router.get(
  '/:id/versions',
  requireAuth,
  requireTenant,
  async (req, res) => {
    const workflow = workflows.get(req.params.id);

    if (!workflow || workflow.tenantId !== req.tenantId) {
      return res.status(404).json({
        success: false,
        error: { code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found' },
      });
    }

    const versions = Array.from(workflowVersions.values())
      .filter((v) => v.workflowId === workflow.id)
      .sort((a, b) => b.version - a.version);

    res.json({
      success: true,
      data: versions,
    });
  }
);

/**
 * GET /workflows/:id/runs - List workflow runs
 */
router.get(
  '/:id/runs',
  requireAuth,
  requireTenant,
  async (req, res) => {
    const workflow = workflows.get(req.params.id);

    if (!workflow || workflow.tenantId !== req.tenantId) {
      return res.status(404).json({
        success: false,
        error: { code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found' },
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const status = req.query.status as RunStatus | undefined;

    let runs = Array.from(workflowRuns.values()).filter(
      (r) => r.workflowId === workflow.id
    );

    if (status) {
      runs = runs.filter((r) => r.status === status);
    }

    // Sort by start time (newest first)
    runs.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    // Paginate
    const start = (page - 1) * pageSize;
    const data = runs.slice(start, start + pageSize);

    // Mask sensitive data in input/output
    const maskedData = data.map((run) => ({
      ...run,
      input: maskSecrets(run.input),
      output: run.output ? maskSecrets(run.output) : null,
      steps: run.steps.map((s) => ({
        ...s,
        input: maskSecrets(s.input),
        output: s.output ? maskSecrets(s.output) : null,
      })),
    }));

    res.json({
      success: true,
      data: maskedData,
      pagination: {
        page,
        pageSize,
        totalItems: runs.length,
        totalPages: Math.ceil(runs.length / pageSize),
      },
    });
  }
);

/**
 * POST /workflows/:id/trigger - Manually trigger workflow
 */
router.post(
  '/:id/trigger',
  requireAuth,
  requireTenant,
  requireRole('tenant_admin', 'operator', 'platform_admin'),
  audit('workflow.trigger'),
  async (req, res) => {
    const workflow = workflows.get(req.params.id);

    if (!workflow || workflow.tenantId !== req.tenantId) {
      return res.status(404).json({
        success: false,
        error: { code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found' },
      });
    }

    if (workflow.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: { code: 'WORKFLOW_NOT_ACTIVE', message: 'Workflow must be active to trigger' },
      });
    }

    const runId = `run_${ulid()}`;
    const run: WorkflowRun = {
      id: runId,
      workflowId: workflow.id,
      tenantId: workflow.tenantId,
      version: workflow.version,
      status: 'pending',
      triggeredBy: req.user!.id,
      input: req.body.input || {},
      output: null,
      steps: [],
      error: null,
      startedAt: new Date(),
      completedAt: null,
      durationMs: null,
    };

    workflowRuns.set(runId, run);

    // TODO: Actually execute the workflow via Temporal or BullMQ

    res.status(202).json({
      success: true,
      data: {
        runId,
        status: 'pending',
        message: 'Workflow execution started',
      },
    });
  }
);

/**
 * DELETE /workflows/:id - Archive workflow
 */
router.delete(
  '/:id',
  requireAuth,
  requireTenant,
  requireRole('tenant_admin', 'platform_admin'),
  audit('workflow.archive'),
  async (req, res) => {
    const workflow = workflows.get(req.params.id);

    if (!workflow || workflow.tenantId !== req.tenantId) {
      return res.status(404).json({
        success: false,
        error: { code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found' },
      });
    }

    workflow.status = 'archived';
    workflow.updatedAt = new Date();
    workflows.set(workflow.id, workflow);

    res.json({
      success: true,
      data: { message: 'Workflow archived' },
    });
  }
);

// ============ Helpers ============

function maskSecrets(obj: Record<string, any>): Record<string, any> {
  const sensitiveKeys = ['password', 'secret', 'token', 'key', 'apikey', 'api_key', 'access_token'];
  const masked: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((s) => lowerKey.includes(s))) {
      masked[key] = '****';
    } else if (typeof value === 'object' && value !== null) {
      masked[key] = maskSecrets(value);
    } else {
      masked[key] = value;
    }
  }

  return masked;
}

export { router as workflowsRouter, workflows, workflowVersions, workflowRuns };
