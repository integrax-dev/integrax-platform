// Rate limiter por tenant (mock, usar Redis/Temporal en prod)
import { Tenant } from './types';

const tenantUsage: Record<string, { requests: number; lastReset: number }> = {};

export function rateLimiter(req: any, res: any, next: any) {
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(401).json({ error: 'Missing tenant' });
  const now = Date.now();
  if (!tenantUsage[tenantId] || now - tenantUsage[tenantId].lastReset > 60000) {
    tenantUsage[tenantId] = { requests: 0, lastReset: now };
  }
  tenantUsage[tenantId].requests++;
  // TODO: obtener límites reales del tenant
  const limit = 100; // mock
  if (tenantUsage[tenantId].requests > limit) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }
  next();
}
