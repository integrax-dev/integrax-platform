import { TenantService } from '../tenantService';

describe('TenantService', () => {
  let service: TenantService;

  beforeEach(() => {
    service = new TenantService();
  });

  it('crea un tenant', () => {
    const tenant = service.createTenant({
      name: 'TestTenant',
      plan: 'basic',
      ownerUserId: 'user1',
      limits: { rateLimit: 10, jobsPerMinute: 5, concurrency: 2 },
    });
    expect(tenant).toHaveProperty('id');
    expect(tenant.name).toBe('TestTenant');
    expect(tenant.status).toBe('active');
  });

  it('suspende y reanuda un tenant', () => {
    const tenant = service.createTenant({
      name: 'Tenant2',
      plan: 'pro',
      ownerUserId: 'user2',
      limits: { rateLimit: 20, jobsPerMinute: 10, concurrency: 5 },
    });
    expect(service.suspendTenant(tenant.id)).toBe(true);
    expect(service.getTenant(tenant.id)?.status).toBe('suspended');
    expect(service.resumeTenant(tenant.id)).toBe(true);
    expect(service.getTenant(tenant.id)?.status).toBe('active');
  });

  it('setea límites de un tenant', () => {
    const tenant = service.createTenant({
      name: 'Tenant3',
      plan: 'enterprise',
      ownerUserId: 'user3',
      limits: { rateLimit: 50, jobsPerMinute: 25, concurrency: 10 },
    });
    const newLimits = { rateLimit: 100, jobsPerMinute: 50, concurrency: 20 };
    expect(service.setLimits(tenant.id, newLimits)).toBe(true);
    expect(service.getTenant(tenant.id)?.limits).toEqual(newLimits);
  });

  it('lista tenants', () => {
    service.createTenant({
      name: 'TenantA',
      plan: 'basic',
      ownerUserId: 'userA',
      limits: { rateLimit: 5, jobsPerMinute: 2, concurrency: 1 },
    });
    service.createTenant({
      name: 'TenantB',
      plan: 'pro',
      ownerUserId: 'userB',
      limits: { rateLimit: 10, jobsPerMinute: 5, concurrency: 2 },
    });
    const tenants = service.listTenants();
    expect(tenants.length).toBe(2);
  });
});
