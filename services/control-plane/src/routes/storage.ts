/**
 * Storage routes — file upload/download via IStorageAdapter
 *
 * POST /api/tenants/:tenantId/storage/upload   multipart upload
 * GET  /api/tenants/:tenantId/storage/:key     presigned download URL
 * DELETE /api/tenants/:tenantId/storage/:key   delete file
 * GET  /api/tenants/:tenantId/storage          list files + usage
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { checkStorageQuota, incrementStorageUsage, getStorageUsage } from '../store/storage-quota.js';
import { createStorageAdapter } from '@integrax/storage';

const router = Router({ mergeParams: true });
const storage = createStorageAdapter();

router.get(
  '/',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req: Request, res: Response) => {
    const { tenantId } = req.params;
    const prefix = `tenants/${tenantId}/`;
    const [files, usage] = await Promise.all([
      storage.list(prefix, 100),
      getStorageUsage(tenantId),
    ]);
    res.json({ success: true, data: { files, usage } });
  },
);

router.post(
  '/upload',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req: Request, res: Response) => {
    const { tenantId } = req.params;
    const { filename, contentType, size } = req.body as {
      filename?: string;
      contentType?: string;
      size?: number;
    };

    if (!filename || !size) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'filename and size required' } });
    }

    const { allowed, usage } = await checkStorageQuota(tenantId, size);
    if (!allowed) {
      return res.status(413).json({
        success: false,
        error: {
          code: 'STORAGE_QUOTA_EXCEEDED',
          message: `Storage quota exceeded. Used: ${(usage.usedBytes / 1e6).toFixed(1)} MB / ${(usage.limitBytes / 1e6).toFixed(0)} MB`,
        },
      });
    }

    // Generate presigned upload URL
    const key = `tenants/${tenantId}/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const uploadUrl = await storage.presignedUrl(key, 900); // 15 min to upload

    res.json({
      success: true,
      data: {
        uploadUrl,
        key,
        expiresIn: 900,
        note: 'Upload to uploadUrl, then call POST /storage/confirm with the key to track usage.',
      },
    });
  },
);

router.post(
  '/confirm',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req: Request, res: Response) => {
    const { tenantId } = req.params;
    const { key } = req.body as { key?: string };
    if (!key) return res.status(400).json({ success: false, error: { code: 'MISSING_KEY' } });

    const stat = await storage.stat(key);
    if (!stat) return res.status(404).json({ success: false, error: { code: 'FILE_NOT_FOUND' } });

    await incrementStorageUsage(tenantId, stat.size);
    res.json({ success: true, data: { key, size: stat.size, url: stat.url } });
  },
);

router.get(
  '/:key(*)',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req: Request, res: Response) => {
    const { tenantId } = req.params;
    const key = `tenants/${tenantId}/${req.params['key']}`;
    const url = await storage.presignedUrl(key, 3600);
    res.json({ success: true, data: { url, expiresIn: 3600 } });
  },
);

router.delete(
  '/:key(*)',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req: Request, res: Response) => {
    const { tenantId } = req.params;
    const key = `tenants/${tenantId}/${req.params['key']}`;

    const stat = await storage.stat(key);
    if (stat) await incrementStorageUsage(tenantId, -stat.size);
    await storage.delete(key);

    res.json({ success: true, data: { deleted: key } });
  },
);

export { router as storageRouter };
