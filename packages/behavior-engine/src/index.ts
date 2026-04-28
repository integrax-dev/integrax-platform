export type {
  AuthorityMode,
  ToleranceStrategy,
  PropagationIntent,
  DivergenceMode,
  IntentTrigger,
  ToleranceRef,
  IntentStatement,
  PolicyNode,
  PolicyEdge,
  ExecutionStep,
  ExecutionPlan,
  PolicyGraph,
  BehaviorProfileId,
  BehaviorProfile,
} from './types.js';
export { BEHAVIOR_PROFILES } from './profiles.js';
export { ConsistencyPolicyCompiler, PolicyCompilationError } from './compiler.js';
export { suggestBehaviorProfile, getProfile, listProfiles } from './suggester.js';
export type { ProfileSuggestion } from './suggester.js';
