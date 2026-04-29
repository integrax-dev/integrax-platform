import { describe, it, expect } from 'vitest';
import { TenantSyncHealthService } from './service.js';

describe('TenantSyncHealthService — upsert', () => {
  it('creates a new health record for an unknown tenant', () => {
    const svc = new TenantSyncHealthService();
    const h = svc.upsert('ten1', {});
    expect(h.tenantId).toBe('ten1');
    expect(h.criticalityTier).toBe('low');
  });

  it('merges connector snapshots by connectorId', () => {
    const svc = new TenantSyncHealthService();
    svc.upsert('ten1', { connectors: [{ connectorId: 'mp', status: 'healthy' }] });
    svc.upsert('ten1', { connectors: [{ connectorId: 'pw', status: 'degraded' }] });
    const h = svc.get('ten1')!;
    expect(h.connectors).toHaveLength(2);
    expect(h.connectors.find(c => c.connectorId === 'mp')?.status).toBe('healthy');
    expect(h.connectors.find(c => c.connectorId === 'pw')?.status).toBe('degraded');
  });

  it('updates existing connector snapshot', () => {
    const svc = new TenantSyncHealthService();
    svc.upsert('ten1', { connectors: [{ connectorId: 'mp', status: 'degraded' }] });
    svc.upsert('ten1', { connectors: [{ connectorId: 'mp', status: 'healthy' }] });
    const h = svc.get('ten1')!;
    expect(h.connectors).toHaveLength(1);
    expect(h.connectors[0].status).toBe('healthy');
  });
});

describe('TenantSyncHealthService — criticality', () => {
  it('is critical when any connector is failing', () => {
    const svc = new TenantSyncHealthService();
    const h = svc.upsert('ten1', {
      connectors: [{ connectorId: 'mp', status: 'failing' }],
    });
    expect(h.criticalityTier).toBe('critical');
  });

  it('is critical when driftDetectedFlag is true', () => {
    const svc = new TenantSyncHealthService();
    const h = svc.upsert('ten1', { driftDetectedFlag: true });
    expect(h.criticalityTier).toBe('critical');
  });

  it('is high when mapping validity score is below 0.5', () => {
    const svc = new TenantSyncHealthService();
    const h = svc.upsert('ten1', { mappingValidityScore: 0.4 });
    expect(h.criticalityTier).toBe('high');
  });

  it('is medium when open case count is 2+', () => {
    const svc = new TenantSyncHealthService();
    const h = svc.upsert('ten1', { openCaseCount: 2 });
    expect(h.criticalityTier).toBe('medium');
  });

  it('is low when everything is nominal', () => {
    const svc = new TenantSyncHealthService();
    const h = svc.upsert('ten1', {
      connectors: [{ connectorId: 'mp', status: 'healthy' }],
      mappingValidityScore: 1.0,
      openCaseCount: 0,
    });
    expect(h.criticalityTier).toBe('low');
  });
});

describe('TenantSyncHealthService — recordSyncResult', () => {
  it('marks connector healthy on success', () => {
    const svc = new TenantSyncHealthService();
    svc.recordSyncResult('ten1', 'mp', { success: true });
    const h = svc.get('ten1')!;
    expect(h.connectors[0].status).toBe('healthy');
    expect(h.connectors[0].consecutiveFailures).toBe(0);
  });

  it('increments consecutive failures on failure', () => {
    const svc = new TenantSyncHealthService();
    svc.recordSyncResult('ten1', 'mp', { success: false });
    svc.recordSyncResult('ten1', 'mp', { success: false });
    const h = svc.get('ten1')!;
    expect(h.connectors[0].consecutiveFailures).toBe(2);
  });

  it('marks failing after 5 consecutive failures', () => {
    const svc = new TenantSyncHealthService();
    for (let i = 0; i < 5; i++) svc.recordSyncResult('ten1', 'mp', { success: false });
    expect(svc.get('ten1')!.connectors[0].status).toBe('failing');
  });

  it('resets failures on success', () => {
    const svc = new TenantSyncHealthService();
    for (let i = 0; i < 3; i++) svc.recordSyncResult('ten1', 'mp', { success: false });
    svc.recordSyncResult('ten1', 'mp', { success: true });
    expect(svc.get('ten1')!.connectors[0].consecutiveFailures).toBe(0);
  });
});

describe('TenantSyncHealthService — listByCriticality', () => {
  it('returns tenants at or above the given tier', () => {
    const svc = new TenantSyncHealthService();
    svc.upsert('tenA', { connectors: [{ connectorId: 'x', status: 'failing' }] });
    svc.upsert('tenB', { openCaseCount: 0, mappingValidityScore: 1.0 });
    const critical = svc.listByCriticality('critical');
    expect(critical.some(h => h.tenantId === 'tenA')).toBe(true);
    expect(critical.some(h => h.tenantId === 'tenB')).toBe(false);
  });
});
