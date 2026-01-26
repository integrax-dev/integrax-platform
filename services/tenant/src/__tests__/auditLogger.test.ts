import { logAudit, getAuditLogs } from '../auditLogger';
import { describe, it, expect } from 'vitest';

describe('auditLogger', () => {
  it('registra y recupera logs por tenant', () => {
    logAudit({ tenantId: 't1', type: 'create', message: 'Creado', userId: 'u1' });
    logAudit({ tenantId: 't2', type: 'update', message: 'Actualizado', userId: 'u2' });
    const logsT1 = getAuditLogs('t1');
    const logsT2 = getAuditLogs('t2');
    expect(logsT1.length).toBeGreaterThan(0);
    expect(logsT2.length).toBeGreaterThan(0);
    expect(logsT1[0].tenantId).toBe('t1');
    expect(logsT2[0].tenantId).toBe('t2');
  });
});
