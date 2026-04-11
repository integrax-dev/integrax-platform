// --- Esquema de flujos ------------------------------------------------------
export type {
  IntegraxFlow,
  FlowStatus,
  FlowRun,
  FlowRunStatus,
  FlowStepRun,
} from './flow.js';

// --- Tipos de trigger -------------------------------------------------------
export type {
  FlowTrigger,
  EventTrigger,
  ScheduleTrigger,
  WebhookTrigger,
  ManualTrigger,
  ApprovalTrigger,
} from './trigger.js';

// --- Tipos de pasos ---------------------------------------------------------
export type {
  FlowStep,
  RetryConfig,
  NodeType,
  NodeDefinition,
  StepVisibility,
  PublicActionNode,
  LogicNode,
  HelperNode,
  RestrictedNode,
  InternalNode,
} from './steps.js';

export { NODE_CATALOG, publicNodes, nodesByVisibility } from './steps.js';
