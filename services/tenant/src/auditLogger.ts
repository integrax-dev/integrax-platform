// Audit Logger multi-tenant
import { Log } from './types';

const logs: Log[] = [];

export function logAudit({ tenantId, type, message, userId }: { tenantId: string; type: string; message: string; userId?: string }) {
  logs.push({
    id: 'log_' + Date.now(),
    tenantId,
    type,
    message,
    level: 'info',
    createdAt: new Date().toISOString(),
    userId,
  });
}

export function getAuditLogs(tenantId: string): Log[] {
  return logs.filter(l => l.tenantId === tenantId);
}
