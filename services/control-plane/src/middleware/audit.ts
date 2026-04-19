/**
 * Middleware de logging de auditoría
 */

import { Request, Response, NextFunction } from 'express';
import { ulid } from 'ulid';
import { AuditEntry } from '../types.js';

// Log de auditoría en memoria (reemplazar por base de datos en producción)
const auditLog: AuditEntry[] = [];

/**
 * Crea el middleware de auditoría para una acción
 */
export function audit(action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Guardar el res.json original para capturar la respuesta
    const originalJson = res.json.bind(res);

    res.json = (body: unknown) => {
      // Registrar la entrada de auditoría
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

      auditLog.push(entry);

      // Conservar solo las últimas 10.000 entradas en memoria
      if (auditLog.length > 10000) {
        auditLog.splice(0, auditLog.length - 10000);
      }

      return originalJson(body);
    };

    next();
  };
}

/**
 * Enmascara datos sensibles del body del request para auditoría
 */
function maskSensitiveData<T extends object>(obj: T): T {
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

  const masked: Record<string, unknown> = {};

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

  return masked as unknown as T;
}

/**
 * Obtiene los logs de auditoría (para la API de admin)
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
    filtered = filtered.filter((e) => e.action.includes(options.action as string));
  }
  if (options.startDate) {
    filtered = filtered.filter((e) => e.createdAt >= options.startDate!);
  }
  if (options.endDate) {
    filtered = filtered.filter((e) => e.createdAt <= options.endDate!);
  }

  // Ordenar por fecha descendente
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
