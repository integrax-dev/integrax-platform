export type {
  FlowTrigger,
  FlowStep,
  ActionStep,
  ConditionStep,
  DelayStep,
  ApprovalStep,
  BranchStep,
  IntegraxFlow,
  ValidationError,
  ValidationResult,
} from './types.js';

export type { NodeCategory, NodeParamDef, NodeDefinition } from './node-catalog.js';
export { NODE_CATALOG, getNode, getNodesByCategory, getTenantNodes } from './node-catalog.js';

export { validateFlow } from './validator.js';
