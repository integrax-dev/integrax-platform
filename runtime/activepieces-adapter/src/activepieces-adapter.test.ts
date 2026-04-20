import { describe, it, expect } from 'vitest';
import { compileFlow } from './compiler.js';
import type { IntegraxFlow } from '@integrax/workflow-engine';

function baseFlow(overrides: Partial<IntegraxFlow> = {}): IntegraxFlow {
  return {
    id: 'flow-1',
    name: 'Test Flow',
    version: '1.0.0',
    trigger: { type: 'manual' },
    steps: [],
    ...overrides,
  };
}

describe('compileFlow — trigger types', () => {
  it('manual trigger', () => {
    const result = compileFlow(baseFlow());
    expect(result.trigger.type).toBe('MANUAL');
    expect(result.trigger.settings).toEqual({});
  });

  it('webhook trigger', () => {
    const result = compileFlow(baseFlow({
      trigger: { type: 'webhook', connectorId: 'mercadopago' },
    }));
    expect(result.trigger.type).toBe('WEBHOOK');
    expect(result.trigger.settings['connectorId']).toBe('mercadopago');
  });

  it('schedule trigger', () => {
    const result = compileFlow(baseFlow({
      trigger: { type: 'schedule', cron: '0 * * * *' },
    }));
    expect(result.trigger.type).toBe('SCHEDULE');
    expect(result.trigger.settings['cron']).toBe('0 * * * *');
  });

  it('event trigger compiles as synthetic webhook', () => {
    const result = compileFlow(baseFlow({
      trigger: { type: 'event', eventType: 'order.created' },
    }));
    expect(result.trigger.type).toBe('WEBHOOK');
    expect(result.trigger.settings['eventType']).toBe('order.created');
    expect(result.trigger.settings['synthetic']).toBe(true);
  });
});

describe('compileFlow — displayName', () => {
  it('uses flow name as displayName', () => {
    const result = compileFlow(baseFlow({ name: 'My Flow' }));
    expect(result.displayName).toBe('My Flow');
  });
});

describe('compileFlow — action step', () => {
  it('compiles action step', () => {
    const result = compileFlow(baseFlow({
      steps: [{
        id: 's1',
        type: 'action',
        node: 'send_email',
        params: { to: 'a@b.com' },
      }],
    }));
    const action = result.actions[0];
    expect(action.name).toBe('s1');
    expect(action.displayName).toBe('send_email');
    expect(action.type).toBe('CODE');
    expect(action.settings['node']).toBe('send_email');
    expect((action.settings['params'] as Record<string, unknown>)['to']).toBe('a@b.com');
  });

  it('defaults onError to fail', () => {
    const result = compileFlow(baseFlow({
      steps: [{ id: 's1', type: 'action', node: 'update_stock', params: {} }],
    }));
    expect(result.actions[0].settings['onError']).toBe('fail');
  });

  it('respects explicit onError and maxRetries', () => {
    const result = compileFlow(baseFlow({
      steps: [{ id: 's1', type: 'action', node: 'create_invoice', params: {}, onError: 'retry', maxRetries: 3 }],
    }));
    expect(result.actions[0].settings['onError']).toBe('retry');
    expect(result.actions[0].settings['maxRetries']).toBe(3);
  });
});

describe('compileFlow — condition step', () => {
  it('compiles condition with then branch', () => {
    const result = compileFlow(baseFlow({
      steps: [{
        id: 'c1',
        type: 'condition',
        expression: 'amount > 0',
        then: [{ id: 'a1', type: 'action', node: 'send_email', params: {} }],
      }],
    }));
    const cond = result.actions[0];
    expect(cond.type).toBe('BRANCH');
    expect(cond.settings['expression']).toBe('amount > 0');
    expect(cond.nextAction?.name).toBe('a1');
    expect(cond.onFailureAction).toBeUndefined();
  });

  it('compiles condition with else branch', () => {
    const result = compileFlow(baseFlow({
      steps: [{
        id: 'c1',
        type: 'condition',
        expression: 'ok',
        then: [{ id: 'yes', type: 'action', node: 'send_email', params: {} }],
        else: [{ id: 'no', type: 'action', node: 'notify_slack', params: {} }],
      }],
    }));
    const cond = result.actions[0];
    expect(cond.nextAction?.name).toBe('yes');
    expect(cond.onFailureAction?.name).toBe('no');
  });
});

describe('compileFlow — delay step', () => {
  it('compiles delay step', () => {
    const result = compileFlow(baseFlow({
      steps: [{ id: 'd1', type: 'delay', delayMs: 5000 }],
    }));
    const action = result.actions[0];
    expect(action.settings['node']).toBe('delay');
    expect((action.settings['params'] as Record<string, unknown>)['delayMs']).toBe(5000);
  });
});

describe('compileFlow — approval step', () => {
  it('compiles approval step with defaults', () => {
    const result = compileFlow(baseFlow({
      steps: [{ id: 'ap1', type: 'approval', message: 'Please review' }],
    }));
    const action = result.actions[0];
    expect(action.settings['node']).toBe('approval');
    const params = action.settings['params'] as Record<string, unknown>;
    expect(params['message']).toBe('Please review');
    expect(params['onTimeout']).toBe('fail');
  });
});

describe('compileFlow — branch step', () => {
  it('compiles branch with cases', () => {
    const result = compileFlow(baseFlow({
      steps: [{
        id: 'sw1',
        type: 'branch',
        expression: 'status',
        cases: [
          { value: 'approved', steps: [{ id: 'a1', type: 'action', node: 'create_invoice', params: {} }] },
          { value: 'rejected', steps: [{ id: 'a2', type: 'action', node: 'notify_slack', params: {} }] },
        ],
      }],
    }));
    const action = result.actions[0];
    expect(action.type).toBe('BRANCH');
    expect(action.settings['expression']).toBe('status');
    const cases = action.settings['cases'] as Array<{ value: string; actions: unknown[] }>;
    expect(cases).toHaveLength(2);
    expect(cases[0].value).toBe('approved');
  });

  it('branch with default compiles to onFailureAction', () => {
    const result = compileFlow(baseFlow({
      steps: [{
        id: 'sw1',
        type: 'branch',
        expression: 'x',
        cases: [],
        default: [{ id: 'def', type: 'action', node: 'send_email', params: {} }],
      }],
    }));
    expect(result.actions[0].onFailureAction?.name).toBe('def');
  });
});

describe('compileFlow — multiple steps', () => {
  it('preserves step order', () => {
    const result = compileFlow(baseFlow({
      steps: [
        { id: 's1', type: 'action', node: 'update_stock', params: {} },
        { id: 's2', type: 'delay', delayMs: 1000 },
        { id: 's3', type: 'action', node: 'send_email', params: {} },
      ],
    }));
    expect(result.actions.map(a => a.name)).toEqual(['s1', 's2', 's3']);
  });
});
