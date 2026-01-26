/**
 * Audit Logging Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { ulid } from 'ulid';
import { AuditEntry } from '../types';

// In-memory audit log (replace with database in production)
const auditLog: AuditEntry[] = [];

/**
 * Create audit middleware for an action
 */
export function audit(action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Store original res.json to capture response
    const originalJson = res.json.bind(res);

    res.json = (body: any) => {
      // Log audit entry
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
          success: body?.success ?? res.statusCode < 400,
        },
        ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || '',
        userAgent: req.headers['user-agent'] || '',
        createdAt: new Date(),
      };

      auditLog.push(entry);

      // Keep only last 10000 entries in memory
      if (auditLog.length > 10000) {
        auditLog.splice(0, auditLog.length - 10000);
      }

      return originalJson(body);
    };

    next();
  };
}

/**
 * Mask sensitive data in request body for audit
 */
function maskSensitiveData(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;

  const sensitiveKeys = [
    'password',
    'secret',
    'token',
    'key',
    'apikey',
    'api_key',
    'access_token',
    'private_key',
    'certificate',
    'credentials',
  ];

  const masked: any = Array.isArray(obj) ? [] : {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();

    if (sensitiveKeys.some((s) => lowerKey.includes(s))) {
      masked[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      masked[key] = maskSensitiveData(value);
    } else {
      masked[key] = value;
    }
  }

  return masked;
}

/**
 * Get audit logs (for admin API)
 */
export function getAuditLogs(options: {
  tenantId?: string;
  userId?: string;
  action?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}): { entries: AuditEntry[]; total: number } {
  let filtered = [...auditLog];

  if (options.tenantId) {
    filtered = filtered.filter((e) => e.tenantId === options.tenantId);
  }
  if (options.userId) {
    filtered = filtered.filter((e) => e.userId === options.userId);
  }
  if (options.action) {
    filtered = filtered.filter((e) => e.action.includes(options.action));
  }
  if (options.startDate) {
    filtered = filtered.filter((e) => e.createdAt >= options.startDate!);
  }
  if (options.endDate) {
    filtered = filtered.filter((e) => e.createdAt <= options.endDate!);
  }

  // Sort by date descending
  filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const total = filtered.length;
  const limit = options.limit || 50;
  const offset = options.offset || 0;

  return {
    entries: filtered.slice(offset, offset + limit),
    total,
  };
}

export { auditLog };
