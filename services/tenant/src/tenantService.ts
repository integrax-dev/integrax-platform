// Servicio base para gestión de tenants IntegraX
import { Tenant } from './types.js';

export class TenantService {
  private tenants: Map<string, Tenant> = new Map();
  private idCounter = 0;

  createTenant(data: Omit<Tenant, 'id' | 'createdAt' | 'updatedAt'>): Tenant {
    this.idCounter++;
    const id = `tenant_${Date.now()}_${this.idCounter}`;
    const now = new Date().toISOString();
    const tenant: Tenant = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      status: 'active',
    };
    this.tenants.set(id, tenant);
    return tenant;
  }

  suspendTenant(id: string): boolean {
    const tenant = this.tenants.get(id);
    if (!tenant) return false;
    tenant.status = 'suspended';
    tenant.updatedAt = new Date().toISOString();
    this.tenants.set(id, tenant);
    return true;
  }

  resumeTenant(id: string): boolean {
    const tenant = this.tenants.get(id);
    if (!tenant) return false;
    tenant.status = 'active';
    tenant.updatedAt = new Date().toISOString();
    this.tenants.set(id, tenant);
    return true;
  }

  setLimits(id: string, limits: Tenant['limits']): boolean {
    const tenant = this.tenants.get(id);
    if (!tenant) return false;
    tenant.limits = limits;
    tenant.updatedAt = new Date().toISOString();
    this.tenants.set(id, tenant);
    return true;
  }

  getTenant(id: string): Tenant | undefined {
    return this.tenants.get(id);
  }

  listTenants(): Tenant[] {
    return Array.from(this.tenants.values());
  }
}
