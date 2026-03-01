// Middleware RBAC multi-tenant
import { User } from './types.js';

export function rbacMiddleware(requiredRole: User['role']) {
  return (req: any, res: any, next: any) => {
    const userRole = req.userRole;
    if (!userRole) return res.status(401).json({ error: 'Missing user role' });
    const roles = ['platform-admin', 'tenant-admin', 'operator', 'viewer'];
    if (roles.indexOf(userRole) > roles.indexOf(requiredRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
