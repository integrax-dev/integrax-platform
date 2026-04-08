import type { IntegraxFlow, FlowStep, FlowTrigger } from '@integrax/workflow-engine';

/**
 * Forma JSON de un flujo Activepieces (subconjunto minimo que necesitamos).
 * No importamos el SDK de AP para mantener la dependencia en un solo sentido.
 */
export interface ActivepiecesFlowJSON {
  displayName: string;
  trigger: ApTrigger;
  actions: ApAction[];
}

interface ApTrigger {
  name: string;
  type: string;
  settings: Record<string, unknown>;
  nextAction?: ApAction;
}

interface ApAction {
  name: string;
  type: string;
  displayName: string;
  settings: Record<string, unknown>;
  nextAction?: ApAction;
  onFailureAction?: ApAction;
}

/**
 * Compila un IntegraxFlow a un JSON compatible con Activepieces.
 *
 * La compilacion es intencionalmente simple: mapea cada paso de Integrax a
 * una accion de Activepieces usando el nombre del nodo. Los DAG complejos
 * (ramas, paralelismo) por ahora se aplanan en cadenas secuenciales; una
 * compilacion mas sofisticada queda para otra iteracion.
 */
export function compileFlow(flow: IntegraxFlow): ActivepiecesFlowJSON {
  const trigger = compileTrigger(flow.trigger, flow.id);
  const actions = flow.steps.map(compileStep);

  // Encadenado secuencial: trigger -> action[0] -> action[1] -> ...
  chainActions(trigger, actions);

  return {
    displayName: flow.name,
    trigger,
    actions,
  };
}

function compileTrigger(trigger: FlowTrigger, flowId: string): ApTrigger {
  switch (trigger.type) {
    case 'event':
      return {
        name: 'integrax_event_trigger',
        type: 'PIECE_TRIGGER',
        settings: {
          pieceName: '@integrax/connector-platform',
          triggerName: 'on_event',
          input: {
            eventType: trigger.eventType,
            filter: trigger.filter ?? {},
          },
        },
      };
    case 'schedule':
      return {
        name: 'schedule_trigger',
        type: 'SCHEDULE',
        settings: { cronExpression: trigger.cron },
      };
    case 'webhook':
      return {
        name: 'webhook_trigger',
        type: 'WEBHOOK',
        settings: {
          connectorId: trigger.connectorId,
          eventType: trigger.eventType ?? '*',
        },
      };
    case 'manual':
      return {
        name: 'manual_trigger',
        type: 'EMPTY',
        settings: { flowId },
      };
    case 'approval_required':
      return {
        name: 'approval_trigger',
        type: 'PIECE_TRIGGER',
        settings: {
          pieceName: '@integrax/connector-platform',
          triggerName: 'on_approval_required',
          input: { entityType: trigger.entityType },
        },
      };
  }
}

function compileStep(step: FlowStep): ApAction {
  return {
    name: step.id,
    type: 'PIECE',
    displayName: step.label ?? step.node,
    settings: {
      pieceName: `@integrax/node-${step.node.toLowerCase().replace(/_/g, '-')}`,
      actionName: toActionName(step.node),
      input: step.config,
    },
  };
}

/** Encadena acciones de forma secuencial: a -> b -> c */
function chainActions(trigger: ApTrigger, actions: ApAction[]): void {
  if (actions.length === 0) return;
  trigger.nextAction = actions[0];
  for (let i = 0; i < actions.length - 1; i++) {
    actions[i].nextAction = actions[i + 1];
  }
}

function toActionName(node: string): string {
  // PascalCase -> snake_case
  return node.replace(/([A-Z])/g, (_, c, i) => (i === 0 ? c.toLowerCase() : `_${c.toLowerCase()}`));
}
