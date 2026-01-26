/**
 * Temporal Workflow Routes
 *
 * API para ejecutar y monitorear workflows de Temporal.
 */

import { Router } from 'express';
import { TemporalClientService } from '@integrax/temporal-workflows';
import { requireAuth, requireTenant } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';

const router = Router();

// Temporal client (singleton per worker)
let temporalClient: TemporalClientService | null = null;

async function getTemporalClient(): Promise<TemporalClientService> {
  if (!temporalClient) {
    temporalClient = new TemporalClientService();
    await temporalClient.connect();
  }
  return temporalClient;
}

// Schemas
const startPaymentSchema = z.object({
  orderId: z.string(),
  amount: z.number().positive(),
  currency: z.string().default('ARS'),
  provider: z.enum(['mercadopago', 'stripe', 'manual']),
  customerEmail: z.string().email(),
  metadata: z.record(z.unknown()).optional(),
});

const startOrderSchema = z.object({
  customerId: z.string(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().positive(),
    price: z.number().positive(),
  })),
  shippingAddress: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    country: z.string().default('AR'),
    postalCode: z.string(),
  }),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * POST /workflows/temporal/payment
 * Start a payment workflow
 */
router.post(
  '/payment',
  requireAuth,
  requireTenant,
  validate(startPaymentSchema),
  audit('workflow.start.payment'),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const client = await getTemporalClient();

      const handle = await client.startPayment(tenantId, {
        orderId: req.body.orderId,
        amount: req.body.amount,
        currency: req.body.currency,
        provider: req.body.provider,
        customerEmail: req.body.customerEmail,
        metadata: req.body.metadata,
      });

      res.status(201).json({
        success: true,
        data: {
          workflowId: handle.workflowId,
          runId: handle.firstExecutionRunId,
          status: 'RUNNING',
        },
      });
    } catch (error) {
      console.error('Error starting payment workflow:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'WORKFLOW_START_FAILED',
          message: error instanceof Error ? error.message : 'Failed to start workflow',
        },
      });
    }
  }
);

/**
 * POST /workflows/temporal/order
 * Start an order workflow
 */
router.post(
  '/order',
  requireAuth,
  requireTenant,
  validate(startOrderSchema),
  audit('workflow.start.order'),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const client = await getTemporalClient();

      const handle = await client.startOrder(tenantId, {
        customerId: req.body.customerId,
        items: req.body.items,
        shippingAddress: req.body.shippingAddress,
        metadata: req.body.metadata,
      });

      res.status(201).json({
        success: true,
        data: {
          workflowId: handle.workflowId,
          runId: handle.firstExecutionRunId,
          status: 'RUNNING',
        },
      });
    } catch (error) {
      console.error('Error starting order workflow:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'WORKFLOW_START_FAILED',
          message: error instanceof Error ? error.message : 'Failed to start workflow',
        },
      });
    }
  }
);

/**
 * GET /workflows/temporal/:workflowId
 * Get workflow status
 */
router.get(
  '/:workflowId',
  requireAuth,
  requireTenant,
  async (req, res) => {
    try {
      const { workflowId } = req.params;
      const tenantId = req.tenantId!;

      // Validate tenant owns this workflow
      if (!workflowId.startsWith(tenantId)) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have access to this workflow',
          },
        });
      }

      const client = await getTemporalClient();
      const status = await client.getWorkflowStatus(workflowId);

      res.json({
        success: true,
        data: {
          workflowId,
          ...status,
        },
      });
    } catch (error) {
      console.error('Error getting workflow status:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'WORKFLOW_STATUS_FAILED',
          message: error instanceof Error ? error.message : 'Failed to get workflow status',
        },
      });
    }
  }
);

/**
 * GET /workflows/temporal
 * List workflows for tenant
 */
router.get(
  '/',
  requireAuth,
  requireTenant,
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const status = req.query.status as 'Running' | 'Completed' | 'Failed' | undefined;

      const client = await getTemporalClient();
      const workflows = await client.listWorkflows(tenantId, status);

      res.json({
        success: true,
        data: workflows,
        pagination: {
          total: workflows.length,
        },
      });
    } catch (error) {
      console.error('Error listing workflows:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'WORKFLOW_LIST_FAILED',
          message: error instanceof Error ? error.message : 'Failed to list workflows',
        },
      });
    }
  }
);

/**
 * POST /workflows/temporal/:workflowId/cancel
 * Cancel a running workflow
 */
router.post(
  '/:workflowId/cancel',
  requireAuth,
  requireTenant,
  audit('workflow.cancel'),
  async (req, res) => {
    try {
      const { workflowId } = req.params;
      const tenantId = req.tenantId!;

      // Validate tenant owns this workflow
      if (!workflowId.startsWith(tenantId)) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have access to this workflow',
          },
        });
      }

      const client = await getTemporalClient();
      await client.cancelWorkflow(workflowId);

      res.json({
        success: true,
        data: {
          workflowId,
          status: 'CANCELLED',
        },
      });
    } catch (error) {
      console.error('Error cancelling workflow:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'WORKFLOW_CANCEL_FAILED',
          message: error instanceof Error ? error.message : 'Failed to cancel workflow',
        },
      });
    }
  }
);

/**
 * POST /workflows/temporal/:workflowId/signal
 * Send a signal to a workflow
 */
router.post(
  '/:workflowId/signal',
  requireAuth,
  requireTenant,
  audit('workflow.signal'),
  async (req, res) => {
    try {
      const { workflowId } = req.params;
      const { signalName, args } = req.body;
      const tenantId = req.tenantId!;

      if (!signalName) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'signalName is required',
          },
        });
      }

      // Validate tenant owns this workflow
      if (!workflowId.startsWith(tenantId)) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have access to this workflow',
          },
        });
      }

      const client = await getTemporalClient();
      await client.signalWorkflow(workflowId, signalName, ...(args || []));

      res.json({
        success: true,
        data: {
          workflowId,
          signalName,
          status: 'SIGNAL_SENT',
        },
      });
    } catch (error) {
      console.error('Error signalling workflow:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'WORKFLOW_SIGNAL_FAILED',
          message: error instanceof Error ? error.message : 'Failed to signal workflow',
        },
      });
    }
  }
);

/**
 * GET /workflows/temporal/:workflowId/result
 * Get workflow result (blocks until complete)
 */
router.get(
  '/:workflowId/result',
  requireAuth,
  requireTenant,
  async (req, res) => {
    try {
      const { workflowId } = req.params;
      const tenantId = req.tenantId!;

      // Validate tenant owns this workflow
      if (!workflowId.startsWith(tenantId)) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have access to this workflow',
          },
        });
      }

      const client = await getTemporalClient();
      const result = await client.getResult(workflowId);

      res.json({
        success: true,
        data: {
          workflowId,
          result,
        },
      });
    } catch (error) {
      console.error('Error getting workflow result:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'WORKFLOW_RESULT_FAILED',
          message: error instanceof Error ? error.message : 'Failed to get workflow result',
        },
      });
    }
  }
);

export { router as temporalWorkflowsRouter };
