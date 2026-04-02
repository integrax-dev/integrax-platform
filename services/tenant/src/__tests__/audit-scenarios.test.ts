import { logAudit, getAuditLogs } from '../auditLogger';
import { describe, it, expect, beforeEach } from 'vitest';

// ─── Test isolation: each describe block uses unique tenantIds ────────────────

describe('audit-scenarios — event types', () => {
  it.each([
    { tenantId: 'evt-tenant-create', type: 'create', message: 'Tenant created', userId: 'u1' },
    { tenantId: 'evt-tenant-update', type: 'update', message: 'Tenant updated', userId: 'u2' },
    { tenantId: 'evt-tenant-delete', type: 'delete', message: 'Tenant deleted', userId: 'u3' },
    { tenantId: 'evt-tenant-suspend', type: 'suspend', message: 'Tenant suspended', userId: 'u4' },
    { tenantId: 'evt-tenant-resume', type: 'resume', message: 'Tenant resumed', userId: 'u5' },
    { tenantId: 'evt-connector-add', type: 'connector.add', message: 'Connector added', userId: 'u6' },
    { tenantId: 'evt-connector-remove', type: 'connector.remove', message: 'Connector removed', userId: 'u7' },
    { tenantId: 'evt-workflow-create', type: 'workflow.create', message: 'Workflow created', userId: 'u8' },
    { tenantId: 'evt-workflow-execute', type: 'workflow.execute', message: 'Workflow executed', userId: 'u9' },
    { tenantId: 'evt-workflow-cancel', type: 'workflow.cancel', message: 'Workflow cancelled', userId: 'u10' },
    { tenantId: 'evt-apikey-rotate', type: 'apikey.rotate', message: 'API key rotated', userId: 'u11' },
    { tenantId: 'evt-login', type: 'login', message: 'User logged in', userId: 'u12' },
    { tenantId: 'evt-logout', type: 'logout', message: 'User logged out', userId: 'u13' },
    { tenantId: 'evt-schema-diff', type: 'schema.diff', message: 'Schema diff started', userId: 'u14' },
    { tenantId: 'evt-feedback', type: 'schema.feedback', message: 'Feedback submitted', userId: 'u15' },
    { tenantId: 'evt-job-queued', type: 'job.queued', message: 'Job queued', userId: 'u16' },
    { tenantId: 'evt-job-failed', type: 'job.failed', message: 'Job failed', userId: 'u17' },
    { tenantId: 'evt-webhook-received', type: 'webhook.received', message: 'Webhook received', userId: undefined },
    { tenantId: 'evt-cdc-event', type: 'cdc.event', message: 'CDC event processed', userId: undefined },
    { tenantId: 'evt-plan-change', type: 'plan.change', message: 'Plan changed to enterprise', userId: 'u18' },
  ])(
    'logs event type "$type" for tenant $tenantId',
    ({ tenantId, type, message, userId }) => {
      logAudit({ tenantId, type, message, userId });
      const logs = getAuditLogs(tenantId);

      expect(logs.length).toBeGreaterThan(0);
      const log = logs.find(l => l.type === type && l.tenantId === tenantId);
      expect(log).toBeDefined();
      expect(log!.tenantId).toBe(tenantId);
      expect(log!.type).toBe(type);
      expect(log!.message).toBe(message);
      if (userId) {
        expect(log!.userId).toBe(userId);
      }
    }
  );
});

describe('audit-scenarios — tenant isolation', () => {
  it.each([
    { tenantA: 'iso-t1', tenantB: 'iso-t2' },
    { tenantA: 'iso-t3', tenantB: 'iso-t4' },
    { tenantA: 'iso-t5', tenantB: 'iso-t6' },
    { tenantA: 'iso-org-a', tenantB: 'iso-org-b' },
    { tenantA: 'iso-free', tenantB: 'iso-enterprise' },
  ])(
    'logs for tenant $tenantA are isolated from $tenantB',
    ({ tenantA, tenantB }) => {
      logAudit({ tenantId: tenantA, type: 'create', message: `Created in ${tenantA}`, userId: 'u1' });
      logAudit({ tenantId: tenantB, type: 'delete', message: `Deleted in ${tenantB}`, userId: 'u2' });

      const logsA = getAuditLogs(tenantA);
      const logsB = getAuditLogs(tenantB);

      expect(logsA.every(l => l.tenantId === tenantA)).toBe(true);
      expect(logsB.every(l => l.tenantId === tenantB)).toBe(true);

      const aCrossContaminated = logsA.some(l => l.tenantId === tenantB);
      const bCrossContaminated = logsB.some(l => l.tenantId === tenantA);
      expect(aCrossContaminated).toBe(false);
      expect(bCrossContaminated).toBe(false);
    }
  );

  it.each([
    'iso-unknown-1',
    'iso-unknown-2',
    'iso-never-logged',
    'iso-ghost-tenant',
  ])('getAuditLogs("%s") returns empty for tenant with no logs', (tenantId) => {
    const logs = getAuditLogs(tenantId);
    // Should return empty (no logs for this fresh tenantId)
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.filter(l => l.tenantId === tenantId)).toHaveLength(0);
  });
});

describe('audit-scenarios — multiple logs per tenant', () => {
  it.each([
    {
      tenantId: 'multi-t1',
      events: [
        { type: 'create', message: 'M1', userId: 'u1' },
        { type: 'update', message: 'M2', userId: 'u2' },
        { type: 'delete', message: 'M3', userId: 'u3' },
      ],
    },
    {
      tenantId: 'multi-t2',
      events: [
        { type: 'login', message: 'L1', userId: 'user-a' },
        { type: 'workflow.create', message: 'W1', userId: 'user-a' },
        { type: 'workflow.execute', message: 'W2', userId: 'user-a' },
        { type: 'logout', message: 'L2', userId: 'user-a' },
      ],
    },
    {
      tenantId: 'multi-t3',
      events: Array.from({ length: 10 }, (_, i) => ({
        type: `action-${i}`,
        message: `Message ${i}`,
        userId: `user-${i}`,
      })),
    },
  ])('tenant $tenantId accumulates $events.length logs', ({ tenantId, events }) => {
    events.forEach(ev => logAudit({ tenantId, ...ev }));

    const logs = getAuditLogs(tenantId).filter(l => l.tenantId === tenantId);
    expect(logs.length).toBeGreaterThanOrEqual(events.length);
    for (const ev of events) {
      expect(logs.some(l => l.type === ev.type && l.message === ev.message)).toBe(true);
    }
  });
});

describe('audit-scenarios — log structure', () => {
  it.each([
    { tenantId: 'struct-t1', type: 'create', message: 'Test 1', userId: 'user-x' },
    { tenantId: 'struct-t2', type: 'update', message: 'Test 2', userId: undefined },
    { tenantId: 'struct-t3', type: 'delete', message: 'Long message with special chars éàü', userId: 'user-y' },
  ])('log entry has all required fields (tenant=$tenantId)', ({ tenantId, type, message, userId }) => {
    logAudit({ tenantId, type, message, userId });
    const logs = getAuditLogs(tenantId);
    const log = logs.find(l => l.tenantId === tenantId && l.type === type);

    expect(log).toBeDefined();
    expect(log!.id).toBeDefined();
    expect(log!.id).toMatch(/^log_/);
    expect(log!.tenantId).toBe(tenantId);
    expect(log!.type).toBe(type);
    expect(log!.message).toBe(message);
    expect(log!.level).toBe('info');
    expect(log!.createdAt).toBeDefined();
    expect(typeof log!.createdAt).toBe('string');
    // createdAt should be a valid ISO date string
    expect(new Date(log!.createdAt).getTime()).not.toBeNaN();
  });

  it.each([
    'log_10000',
    'log_20000',
    'log_30000',
  ])('log IDs are prefixed with "log_"', (expectedPrefix) => {
    // Simply verify the prefix pattern holds for fresh logs
    logAudit({ tenantId: 'prefix-test', type: 'test', message: 'Testing prefix' });
    const logs = getAuditLogs('prefix-test');
    const latestLog = logs[logs.length - 1];
    expect(latestLog.id).toMatch(/^log_\d+/);
  });
});

describe('audit-scenarios — without userId', () => {
  it.each([
    { tenantId: 'no-user-t1', type: 'webhook.received', message: 'Webhook arrived' },
    { tenantId: 'no-user-t2', type: 'system.event', message: 'System event triggered' },
    { tenantId: 'no-user-t3', type: 'cdc.change', message: 'CDC change detected' },
  ])('logs $type without userId for tenant $tenantId', ({ tenantId, type, message }) => {
    logAudit({ tenantId, type, message });
    const logs = getAuditLogs(tenantId);
    const log = logs.find(l => l.tenantId === tenantId && l.type === type);
    expect(log).toBeDefined();
    expect(log!.userId).toBeUndefined();
  });
});
