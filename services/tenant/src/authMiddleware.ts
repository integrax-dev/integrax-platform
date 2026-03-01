// Middleware de autenticación multi-tenant
import { User } from './types.js';

export function authMiddleware(req: any, res: any, next: any) {
  // Ejemplo: extraer tenantId y userId de header/token
  const tenantId = req.headers['x-tenant-id'];
  const userId = req.headers['x-user-id'];
  if (!tenantId || !userId) {
    return res.status(401).json({ error: 'Missing tenant or user' });
  }
  // Attach context
  req.tenantId = tenantId;
  req.userId = userId;
  next();
}
