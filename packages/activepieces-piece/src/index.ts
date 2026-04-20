export type { NodeDefinition, NodeField, NodeCategory, FieldType } from './types.js';
export { TRIGGERS } from './triggers.js';
export { ACTIONS } from './actions.js';
export { HELPERS } from './helpers.js';

import { TRIGGERS } from './triggers.js';
import { ACTIONS } from './actions.js';
import { HELPERS } from './helpers.js';
import type { NodeDefinition } from './types.js';

export const ALL_NODES: NodeDefinition[] = [...TRIGGERS, ...ACTIONS, ...HELPERS];

export function getNodeById(id: string): NodeDefinition | undefined {
  return ALL_NODES.find(n => n.id === id);
}

export function getNodesByCategory(category: NodeDefinition['category']): NodeDefinition[] {
  return ALL_NODES.filter(n => n.category === category);
}

export function getTriggerByEventType(eventType: string): NodeDefinition | undefined {
  return TRIGGERS.find(t => t.eventType === eventType);
}

export function getActionByCommand(commandName: string): NodeDefinition | undefined {
  return ACTIONS.find(a => a.commandName === commandName);
}
