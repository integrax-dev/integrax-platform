import { describe, it, expect } from 'vitest';
import { validateFlow } from './validator.js';
import { getNode, getNodesByCategory, getTenantNodes, NODE_CATALOG } from './node-catalog.js';
import type { IntegraxFlow } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function minimalFlow(overrides: Partial<IntegraxFlow> = {}): IntegraxFlow {
  return {
    id: 'flow-1',
    name: 'Test Flow',
    version: '1.0.0',
    trigger: { type: 'manual' },
    steps: [],
    ...overrides,
  };
}

// ─── validateFlow ─────────────────────────────────────────────────────────────

describe('validateFlow — fields básicos', () => {
  it('acepta un flow mínimo válido', () => {
    const r = validateFlow(minimalFlow());
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('rechaza flow sin id', () => {
    const r = validateFlow(minimalFlow({ id: '' }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.path === 'id')).toBe(true);
  });

  it('rechaza flow sin name', () => {
    const r = validateFlow(minimalFlow({ name: '' }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.path === 'name')).toBe(true);
  });

  it('rechaza flow sin version', () => {
    const r = validateFlow(minimalFlow({ version: '' }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.path === 'version')).toBe(true);
  });
});

// ─── Triggers ────────────────────────────────────────────────────────────────

describe('validateFlow — triggers', () => {
  it('acepta trigger manual', () => {
    const r = validateFlow(minimalFlow({ trigger: { type: 'manual' } }));
    expect(r.valid).toBe(true);
  });

  it('acepta trigger event válido', () => {
    const r = validateFlow(minimalFlow({ trigger: { type: 'event', eventType: 'order.created' } }));
    expect(r.valid).toBe(true);
  });

  it('rechaza trigger event sin eventType', () => {
    const r = validateFlow(minimalFlow({ trigger: { type: 'event', eventType: '' as never } }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.path === 'trigger.eventType')).toBe(true);
  });

  it('acepta trigger schedule con cron válido', () => {
    const r = validateFlow(minimalFlow({ trigger: { type: 'schedule', cron: '0 9 * * 1' } }));
    expect(r.valid).toBe(true);
  });

  it('rechaza trigger schedule con cron inválido', () => {
    const r = validateFlow(minimalFlow({ trigger: { type: 'schedule', cron: 'not-a-cron' } }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.path === 'trigger.cron')).toBe(true);
  });

  it('acepta trigger webhook con connectorId', () => {
    const r = validateFlow(minimalFlow({ trigger: { type: 'webhook', connectorId: 'mercadopago' } }));
    expect(r.valid).toBe(true);
  });

  it('rechaza trigger webhook sin connectorId', () => {
    const r = validateFlow(minimalFlow({ trigger: { type: 'webhook', connectorId: '' } }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.path === 'trigger.connectorId')).toBe(true);
  });
});

// ─── Steps ───────────────────────────────────────────────────────────────────

describe('validateFlow — steps', () => {
  it('acepta action step con nodo conocido y params requeridos', () => {
    const r = validateFlow(minimalFlow({
      steps: [{
        id: 's1',
        type: 'action',
        node: 'action.send_email',
        params: { to: 'a@b.com', subject: 'Hi', body: 'Hello' },
      }],
    }));
    expect(r.valid).toBe(true);
  });

  it('rechaza action step con nodo desconocido', () => {
    const r = validateFlow(minimalFlow({
      steps: [{ id: 's1', type: 'action', node: 'action.nonexistent', params: {} }],
    }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.message.includes('unknown node'))).toBe(true);
  });

  it('rechaza action step cuando faltan params requeridos', () => {
    const r = validateFlow(minimalFlow({
      steps: [{ id: 's1', type: 'action', node: 'action.send_email', params: { to: 'a@b.com' } }],
    }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.path.includes('subject'))).toBe(true);
  });

  it('acepta condition step válido', () => {
    const r = validateFlow(minimalFlow({
      steps: [{
        id: 's1',
        type: 'condition',
        expression: '{{amount}} > 1000',
        then: [{ id: 's2', type: 'delay', delayMs: 100 }],
      }],
    }));
    expect(r.valid).toBe(true);
  });

  it('rechaza condition step sin expression', () => {
    const r = validateFlow(minimalFlow({
      steps: [{ id: 's1', type: 'condition', expression: '', then: [] }],
    }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.path === 'steps[0].expression')).toBe(true);
  });

  it('acepta delay step con delayMs válido', () => {
    const r = validateFlow(minimalFlow({
      steps: [{ id: 's1', type: 'delay', delayMs: 5000 }],
    }));
    expect(r.valid).toBe(true);
  });

  it('rechaza delay step con delayMs negativo', () => {
    const r = validateFlow(minimalFlow({
      steps: [{ id: 's1', type: 'delay', delayMs: -1 }],
    }));
    expect(r.valid).toBe(false);
  });

  it('acepta approval step con message', () => {
    const r = validateFlow(minimalFlow({
      steps: [{ id: 's1', type: 'approval', message: 'Approve this?' }],
    }));
    expect(r.valid).toBe(true);
  });

  it('acepta branch step con cases', () => {
    const r = validateFlow(minimalFlow({
      steps: [{
        id: 's1',
        type: 'branch',
        expression: '{{status}}',
        cases: [
          { value: 'approved', steps: [] },
          { value: 'rejected', steps: [] },
        ],
      }],
    }));
    expect(r.valid).toBe(true);
  });

  it('rechaza branch step sin cases', () => {
    const r = validateFlow(minimalFlow({
      steps: [{ id: 's1', type: 'branch', expression: '{{x}}', cases: [] }],
    }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.path === 'steps[0].cases')).toBe(true);
  });
});

// ─── Node catalog ────────────────────────────────────────────────────────────

describe('NODE_CATALOG', () => {
  it('tiene nodos en todas las categorías', () => {
    const cats = new Set(NODE_CATALOG.map(n => n.category));
    expect(cats.has('trigger')).toBe(true);
    expect(cats.has('action')).toBe(true);
    expect(cats.has('logic')).toBe(true);
    expect(cats.has('helper')).toBe(true);
    expect(cats.has('advanced')).toBe(true);
    expect(cats.has('internal')).toBe(true);
  });

  it('getNode devuelve la definición correcta', () => {
    const node = getNode('action.send_email');
    expect(node).toBeDefined();
    expect(node!.label).toBe('Send Email');
    expect(node!.params.some(p => p.name === 'to' && p.required)).toBe(true);
  });

  it('getNode devuelve undefined para nodo inexistente', () => {
    expect(getNode('nope')).toBeUndefined();
  });

  it('getNodesByCategory filtra correctamente', () => {
    const triggers = getNodesByCategory('trigger');
    expect(triggers.every(n => n.category === 'trigger')).toBe(true);
    expect(triggers.length).toBeGreaterThan(0);
  });

  it('getTenantNodes excluye nodos internalOnly', () => {
    const tenant = getTenantNodes();
    expect(tenant.every(n => !n.internalOnly)).toBe(true);
    // Hay nodos internal en el catálogo
    const allInternal = NODE_CATALOG.filter(n => n.internalOnly);
    expect(allInternal.length).toBeGreaterThan(0);
    // Ninguno aparece en la vista tenant
    for (const internal of allInternal) {
      expect(tenant.find(n => n.id === internal.id)).toBeUndefined();
    }
  });

  it('todos los IDs del catálogo son únicos', () => {
    const ids = NODE_CATALOG.map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
