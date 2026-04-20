import type { IntegraxFlow, FlowStep, FlowTrigger } from '@integrax/workflow-engine';
import type {
  ActivepiecesFlowJSON,
  ActivepiecesTrigger,
  ActivepiecesAction,
} from './types.js';

/**
 * Compiles an IntegraX flow spec into Activepieces-compatible flow JSON.
 *
 * The Activepieces AP API expects a flat linked-list of actions (nextAction chaining)
 * while IntegraX steps are an array with nested condition/branch sub-steps.
 * This compiler translates the tree into AP's linked structure.
 */
export function compileFlow(flow: IntegraxFlow): ActivepiecesFlowJSON {
  return {
    displayName: flow.name,
    trigger: compileTrigger(flow.trigger),
    actions: compileSteps(flow.steps),
  };
}

function compileTrigger(trigger: FlowTrigger): ActivepiecesTrigger {
  switch (trigger.type) {
    case 'webhook':
      return {
        type: 'WEBHOOK',
        settings: { connectorId: trigger.connectorId },
      };
    case 'schedule':
      return {
        type: 'SCHEDULE',
        settings: { cron: trigger.cron },
      };
    case 'event':
      return {
        type: 'WEBHOOK',
        settings: { eventType: trigger.eventType, synthetic: true },
      };
    case 'manual':
      return { type: 'MANUAL', settings: {} };
  }
}

function compileSteps(steps: FlowStep[]): ActivepiecesAction[] {
  return steps.map(compileStep);
}

function compileStep(step: FlowStep): ActivepiecesAction {
  switch (step.type) {
    case 'action':
      return {
        name: step.id,
        displayName: step.node,
        type: 'CODE',
        settings: {
          node: step.node,
          params: step.params,
          onError: step.onError ?? 'fail',
          maxRetries: step.maxRetries ?? 0,
        },
      };

    case 'condition':
      return {
        name: step.id,
        displayName: `if: ${step.expression}`,
        type: 'BRANCH',
        settings: { expression: step.expression },
        nextAction: step.then.length > 0 ? compileStep(step.then[0]) : undefined,
        onFailureAction: step.else && step.else.length > 0 ? compileStep(step.else[0]) : undefined,
      };

    case 'delay':
      return {
        name: step.id,
        displayName: `delay: ${step.delayMs}ms`,
        type: 'CODE',
        settings: { node: 'delay', params: { delayMs: step.delayMs } },
      };

    case 'approval':
      return {
        name: step.id,
        displayName: `approval: ${step.message}`,
        type: 'CODE',
        settings: {
          node: 'approval',
          params: {
            message: step.message,
            timeoutMs: step.timeoutMs,
            onTimeout: step.onTimeout ?? 'fail',
          },
        },
      };

    case 'branch': {
      const defaultAction = step.default && step.default.length > 0
        ? compileStep(step.default[0])
        : undefined;
      return {
        name: step.id,
        displayName: `switch: ${step.expression}`,
        type: 'BRANCH',
        settings: {
          expression: step.expression,
          cases: step.cases.map(c => ({
            value: c.value,
            actions: compileSteps(c.steps),
          })),
        },
        onFailureAction: defaultAction,
      };
    }
  }
}
