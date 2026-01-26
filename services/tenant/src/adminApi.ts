// Admin API base (mock, para Express)
import { TenantService } from './tenantService';
import { authMiddleware } from './authMiddleware';
import { rateLimiter } from './rateLimiter';
import { rbacMiddleware } from './rbacMiddleware';
import { logAudit } from './auditLogger';

const tenantService = new TenantService();

// Ejemplo de endpoints
export function setupAdminApi(app: any) {
  app.post('/tenants', authMiddleware, rbacMiddleware('platform-admin'), (req: any, res: any) => {
    const tenant = tenantService.createTenant(req.body);
    logAudit({ tenantId: tenant.id, type: 'create-tenant', message: 'Tenant creado', userId: req.userId });
    res.json(tenant);
  });

  app.post('/tenants/:id/suspend', authMiddleware, rbacMiddleware('platform-admin'), (req: any, res: any) => {
    const ok = tenantService.suspendTenant(req.params.id);
    logAudit({ tenantId: req.params.id, type: 'suspend-tenant', message: 'Tenant suspendido', userId: req.userId });
    res.json({ success: ok });
  });

  app.post('/tenants/:id/resume', authMiddleware, rbacMiddleware('platform-admin'), (req: any, res: any) => {
    const ok = tenantService.resumeTenant(req.params.id);
    logAudit({ tenantId: req.params.id, type: 'resume-tenant', message: 'Tenant reactivado', userId: req.userId });
    res.json({ success: ok });
  });

  app.get('/tenants', authMiddleware, rbacMiddleware('platform-admin'), (req: any, res: any) => {
    res.json(tenantService.listTenants());
  });
}
