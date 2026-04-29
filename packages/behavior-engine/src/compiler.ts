import type {
  IntentStatement,
  PolicyGraph,
  PolicyNode,
  PolicyEdge,
  ExecutionPlan,
  ExecutionStep,
  BehaviorProfileId,
  PropagationIntentTree,
} from './types.js';
import { ENTITY_LEVEL_KEY, sortedConnectorKey } from './types.js';
import { BEHAVIOR_PROFILES } from './profiles.js';

export class PolicyCompilationError extends Error {
  constructor(
    message: string,
    public readonly intentId?: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'PolicyCompilationError';
  }
}

/**
 * Compiles an array of IntentStatements into a PolicyGraph.
 *
 * The compiler:
 *   1. Validates all intents (catches conflicts, missing authority connectors, etc.)
 *   2. Translates intents to PolicyNodes
 *   3. Wires dependency edges
 *   4. Produces a deterministic ExecutionPlan
 *
 * Throws PolicyCompilationError on any violation.
 */
export class ConsistencyPolicyCompiler {
  compile(
    tenantId: string,
    intents: IntentStatement[],
    profileId?: BehaviorProfileId,
  ): PolicyGraph {
    this.validate(intents);

    const profile = profileId ? BEHAVIOR_PROFILES[profileId] : undefined;
    const nodes: PolicyNode[] = [];
    const edges: PolicyEdge[] = [];

    for (const intent of intents) {
      if (!intent.enabled) continue;

      const entityDefault = profile?.entityDefaults[intent.entityType];
      const authorityMode =
        entityDefault?.authorityMode ??
        profile?.defaultAuthorityMode ??
        this.propagationToAuthorityMode(intent);

      const node: PolicyNode = {
        id: `node_${intent.id}`,
        intentId: intent.id,
        entityType: intent.entityType,
        field: intent.field,
        connectors: intent.connectors,
        authorityMode,
        propagation: intent.propagation,
        divergenceMode: intent.divergenceMode,
        toleranceSpec: intent.toleranceSpec,
      };
      nodes.push(node);
    }

    // Wire simple edges: entity-level node → field-level nodes
    for (const node of nodes) {
      if (!node.field) continue;
      const parentNode = nodes.find(
        n => n.entityType === node.entityType && !n.field && n.intentId !== node.intentId,
      );
      if (parentNode) {
        edges.push({ from: parentNode.id, to: node.id, reason: 'field_inherits_entity_policy' });
      }
    }

    const executionPlan = this.buildExecutionPlan(nodes);
    const intentTree = this.buildIntentTree(nodes);

    return { tenantId, nodes, edges, executionPlan, intentTree, compiledAt: new Date(), profileId };
  }

  private validate(intents: IntentStatement[]): void {
    const seen = new Set<string>();

    for (const intent of intents) {
      if (!intent.tenantId) {
        throw new PolicyCompilationError('IntentStatement must have a tenantId', intent.id);
      }
      if (!intent.entityType) {
        throw new PolicyCompilationError('IntentStatement must specify entityType', intent.id);
      }
      if (intent.connectors.length < 1) {
        throw new PolicyCompilationError('IntentStatement must name at least one connector', intent.id);
      }

      // propagation=mirror/adjust requires an authority connector when >1 connectors
      if (
        (intent.propagation === 'mirror' || intent.propagation === 'adjust') &&
        intent.connectors.length > 1 &&
        !intent.authorityConnector
      ) {
        throw new PolicyCompilationError(
          `Propagation '${intent.propagation}' with multiple connectors requires authorityConnector`,
          intent.id,
          intent.field,
        );
      }

      // authorityConnector must be in the connectors list
      if (
        intent.authorityConnector &&
        !intent.connectors.includes(intent.authorityConnector)
      ) {
        throw new PolicyCompilationError(
          `authorityConnector '${intent.authorityConnector}' is not in connectors list`,
          intent.id,
          intent.field,
        );
      }

      // detect exact duplicates (same entityType + field + connectors)
      const key = `${intent.entityType}::${intent.field ?? '*'}::${[...intent.connectors].sort().join(',')}`;
      if (seen.has(key)) {
        throw new PolicyCompilationError(
          `Duplicate intent for entityType='${intent.entityType}' field='${intent.field ?? '*'}' connectors='${intent.connectors.join(',')}'`,
          intent.id,
          intent.field,
        );
      }
      seen.add(key);
    }
  }

  private propagationToAuthorityMode(intent: IntentStatement): import('./types.js').AuthorityMode {
    switch (intent.propagation) {
      case 'mirror':   return intent.authorityConnector ? 'prefer_a' : 'latest_wins';
      case 'adjust':   return 'suggest';
      case 'lock':     return 'manual_resolution';
      case 'approve':  return 'manual_resolution';
      case 'ignore':   return 'observe_only';
      case 'derive':   return 'suggest';
      default:         return 'observe_only';
    }
  }

  private buildExecutionPlan(nodes: PolicyNode[]): ExecutionPlan {
    const steps: ExecutionStep[] = [];
    let order = 0;

    // Entity-level nodes first, then field-level
    const sorted = [...nodes].sort((a, b) => {
      if (!a.field && b.field) return -1;
      if (a.field && !b.field) return 1;
      return 0;
    });

    for (const node of sorted) {
      const action = this.nodeToAction(node);
      steps.push({ order: order++, nodeId: node.id, action });
    }

    const complexity: ExecutionPlan['estimatedComplexity'] =
      steps.length <= 5 ? 'low' : steps.length <= 15 ? 'medium' : 'high';

    return { steps, estimatedComplexity: complexity };
  }

  private buildIntentTree(nodes: PolicyNode[]): PropagationIntentTree {
    const tree: PropagationIntentTree = {};
    for (const node of nodes) {
      const entityBucket = (tree[node.entityType] ??= {});
      const fieldKey = node.field ?? ENTITY_LEVEL_KEY;
      const fieldBucket = (entityBucket[fieldKey] ??= {});
      fieldBucket[sortedConnectorKey(node.connectors)] = node;
    }
    return tree;
  }

  private nodeToAction(node: PolicyNode): ExecutionStep['action'] {
    if (node.propagation === 'ignore') return 'skip';
    if (node.propagation === 'lock') return 'lock';
    if (node.divergenceMode === 'regulatory_locked') return 'lock';
    if (node.authorityMode === 'manual_resolution') return 'escalate';
    if (node.propagation === 'mirror' || node.propagation === 'adjust') return 'propagate';
    return 'evaluate';
  }
}
