import type { IntegraxFlow, FlowStep, FlowTrigger, ValidationError, ValidationResult } from './types.js';
import { getNode } from './node-catalog.js';

// ─── Trigger validators ───────────────────────────────────────────────────────

function validateTrigger(trigger: FlowTrigger, errors: ValidationError[]): void {
  switch (trigger.type) {
    case 'event':
      if (!trigger.eventType) {
        errors.push({ path: 'trigger.eventType', message: 'eventType is required for event triggers' });
      }
      break;
    case 'schedule':
      if (!trigger.cron || !isValidCron(trigger.cron)) {
        errors.push({ path: 'trigger.cron', message: 'cron must be a valid 5-part CRON expression' });
      }
      break;
    case 'webhook':
      if (!trigger.connectorId) {
        errors.push({ path: 'trigger.connectorId', message: 'connectorId is required for webhook triggers' });
      }
      break;
    case 'manual':
      break;
    default: {
      // exhaustive check
      const _: never = trigger;
      errors.push({ path: 'trigger.type', message: `unknown trigger type: ${JSON.stringify(_)}` });
    }
  }
}

// ─── Step validators ─────────────────────────────────────────────────────────

function validateSteps(steps: FlowStep[], basePath: string, errors: ValidationError[]): void {
  for (let i = 0; i < steps.length; i++) {
    validateStep(steps[i], `${basePath}[${i}]`, errors);
  }
}

function validateStep(step: FlowStep, path: string, errors: ValidationError[]): void {
  if (!step.id) {
    errors.push({ path: `${path}.id`, message: 'step id is required' });
  }

  switch (step.type) {
    case 'action': {
      if (!step.node) {
        errors.push({ path: `${path}.node`, message: 'action node id is required' });
        break;
      }
      const nodeDef = getNode(step.node);
      if (!nodeDef) {
        errors.push({ path: `${path}.node`, message: `unknown node '${step.node}'` });
        break;
      }
      // Check required params
      for (const param of nodeDef.params) {
        if (param.required && step.params[param.name] === undefined) {
          errors.push({
            path: `${path}.params.${param.name}`,
            message: `required param '${param.name}' missing for node '${step.node}'`,
          });
        }
      }
      break;
    }
    case 'condition':
      if (!step.expression) {
        errors.push({ path: `${path}.expression`, message: 'condition expression is required' });
      }
      validateSteps(step.then, `${path}.then`, errors);
      if (step.else) validateSteps(step.else, `${path}.else`, errors);
      break;
    case 'delay':
      if (typeof step.delayMs !== 'number' || step.delayMs < 0) {
        errors.push({ path: `${path}.delayMs`, message: 'delayMs must be a non-negative number' });
      }
      break;
    case 'approval':
      if (!step.message) {
        errors.push({ path: `${path}.message`, message: 'approval message is required' });
      }
      break;
    case 'branch':
      if (!step.expression) {
        errors.push({ path: `${path}.expression`, message: 'branch expression is required' });
      }
      if (!step.cases || step.cases.length === 0) {
        errors.push({ path: `${path}.cases`, message: 'branch must have at least one case' });
      } else {
        for (let i = 0; i < step.cases.length; i++) {
          validateSteps(step.cases[i].steps, `${path}.cases[${i}].steps`, errors);
        }
      }
      if (step.default) validateSteps(step.default, `${path}.default`, errors);
      break;
    default: {
      const _: never = step;
      errors.push({ path, message: `unknown step type: ${JSON.stringify((_ as FlowStep).type)}` });
    }
  }
}

// ─── CRON validation ─────────────────────────────────────────────────────────

function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  // Each part must be a non-empty cron token (digits, *, /, -, ,)
  return parts.every(p => /^[\d*,\-/]+$/.test(p));
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function validateFlow(flow: IntegraxFlow): ValidationResult {
  const errors: ValidationError[] = [];

  if (!flow.id) errors.push({ path: 'id', message: 'flow id is required' });
  if (!flow.name) errors.push({ path: 'name', message: 'flow name is required' });
  if (!flow.version) errors.push({ path: 'version', message: 'flow version is required' });
  if (!flow.trigger) {
    errors.push({ path: 'trigger', message: 'flow trigger is required' });
  } else {
    validateTrigger(flow.trigger, errors);
  }
  if (!Array.isArray(flow.steps)) {
    errors.push({ path: 'steps', message: 'flow steps must be an array' });
  } else {
    validateSteps(flow.steps, 'steps', errors);
  }

  return { valid: errors.length === 0, errors };
}
