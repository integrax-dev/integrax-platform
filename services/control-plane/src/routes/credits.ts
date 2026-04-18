/**
 * API Credits routes
 * GET  /api/tenants/:tenantId/credits         current balance
 * GET  /api/tenants/:tenantId/credits/history  ledger
 * POST /api/tenants/:tenantId/credits/add      admin: grant credits
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getBalance, addCredits, getCreditHistory } from '../store/credits.js';

const router = Router({ mergeParams: true });

router.get(
  '/',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req: Request, res: Response) => {
    const { tenantId } = req.params;
    const balance = await getBalance(tenantId);
    res.json({ success: true, data: { tenantId, balance } });
  },
);

router.get(
  '/history',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin'),
  async (req: Request, res: Response) => {
    const { tenantId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const history = await getCreditHistory(tenantId, limit, offset);
    res.json({ success: true, data: history });
  },
);

// Platform admin can grant/adjust credits manually
router.post(
  '/add',
  requireAuth,
  requireRole('platform_admin'),
  async (req: Request, res: Response) => {
    const { tenantId } = req.params;
    const { amount, reason, refId } = req.body as { amount?: number; reason?: string; refId?: string };

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_AMOUNT' } });
    }

    const result = await addCredits(tenantId, amount, reason ?? 'manual_grant', refId);
    res.json({ success: true, data: { ...result, tenantId } });
  },
);

export { router as creditsRouter };
