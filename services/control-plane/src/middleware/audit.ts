import { Request, Response, NextFunction } from 'express';
import { ulid } from 'ulid';
import { AuditEntry } from '../types.js';
import { saveAuditEntry, queryAuditLog } from '../store/pg-audit-store.js';

export function audit(action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = (body: unknown) => {
      const entry: AuditEntry = {
        id: `aud_${ulid()}`,
        tenantId: req.tenantId || null,
        userId: req.user?.id || 'anonymous',
        action,
        resource: req.baseUrl + req.path,
        resourceId: req.params.id || '',
        details: {
          method: req.method,
          query: req.query,
          body: maskSensitiveData(req.body),
          responseStatus: res.statusCode,
          success: (body as Record<string, unknown>)?.['success'] ?? res.statusCode < 400,
        },
        ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || '',
        userAgent: req.headers['user-agent'] || '',
        createdAt: new Date(),
      };

      saveAuditEntry(entry).catch(err =>
        console.error('[Audit] Failed to persist entry:', err),
      );

      return originalJson(body);
    };

    next();
  };
}

function maskSensitiveData<T extends object>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;

  const sensitiveKeys = [
    'password', 'secret', 'token', 'key', 'apikey', 'api_key',
    'access_token', 'private_key', 'certificate', 'credentials',
  ];

  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(s => lowerKey.includes(s))) {
      masked[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      masked[key] = maskSensitiveData(value);
    } else {
      masked[key] = value;
    }
  }
  return masked as unknown as T;
}

export { queryAuditLog as getAuditLogs };
