/**
 * Catálogo curado de nodos disponibles en el workflow engine.
 *
 * Categorías:
 *   trigger   — puntos de entrada del flow
 *   action    — acciones de negocio contra conectores o servicios
 *   logic     — control de flujo
 *   helper    — transformación y búsqueda de datos
 *   advanced  — nodos de poder; requieren permisos elevados
 *   internal  — solo uso interno de la plataforma; no expuestos al tenant
 */

export type NodeCategory =
  | 'trigger'
  | 'action'
  | 'logic'
  | 'helper'
  | 'advanced'
  | 'internal';

export interface NodeParamDef {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'expression';
  required: boolean;
  description?: string;
  default?: unknown;
}

export interface NodeDefinition {
  id: string;
  label: string;
  category: NodeCategory;
  /** Solo accesible con role >= operator */
  restricted?: boolean;
  /** No expuesto en la UI del tenant */
  internalOnly?: boolean;
  params: NodeParamDef[];
}

// ─── Triggers ────────────────────────────────────────────────────────────────

const TRIGGER_NODES: NodeDefinition[] = [
  {
    id: 'trigger.order_created',
    label: 'Order Created',
    category: 'trigger',
    params: [{ name: 'sourceConnector', type: 'string', required: false }],
  },
  {
    id: 'trigger.product_updated',
    label: 'Product Updated',
    category: 'trigger',
    params: [{ name: 'sourceConnector', type: 'string', required: false }],
  },
  {
    id: 'trigger.stock_changed',
    label: 'Stock Changed',
    category: 'trigger',
    params: [
      { name: 'sku', type: 'string', required: false },
      { name: 'threshold', type: 'number', required: false },
    ],
  },
  {
    id: 'trigger.invoice_failed',
    label: 'Invoice Failed',
    category: 'trigger',
    params: [],
  },
  {
    id: 'trigger.conflict_detected',
    label: 'Conflict Detected',
    category: 'trigger',
    params: [{ name: 'entityType', type: 'string', required: false }],
  },
  {
    id: 'trigger.webhook_received',
    label: 'Webhook Received',
    category: 'trigger',
    params: [
      { name: 'connectorId', type: 'string', required: true },
      { name: 'eventType', type: 'string', required: false },
    ],
  },
  {
    id: 'trigger.scheduled',
    label: 'Scheduled Event',
    category: 'trigger',
    params: [{ name: 'cron', type: 'string', required: true, description: 'CRON expression (UTC)' }],
  },
  {
    id: 'trigger.approval_required',
    label: 'Approval Required',
    category: 'trigger',
    params: [{ name: 'message', type: 'string', required: true }],
  },
];

// ─── Actions ─────────────────────────────────────────────────────────────────

const ACTION_NODES: NodeDefinition[] = [
  {
    id: 'action.create_invoice',
    label: 'Create Invoice',
    category: 'action',
    params: [
      { name: 'connectorId', type: 'string', required: true },
      { name: 'invoiceData', type: 'object', required: true },
    ],
  },
  {
    id: 'action.update_stock',
    label: 'Update Stock',
    category: 'action',
    params: [
      { name: 'connectorId', type: 'string', required: true },
      { name: 'sku', type: 'string', required: true },
      { name: 'quantity', type: 'number', required: true },
    ],
  },
  {
    id: 'action.publish_product',
    label: 'Publish Product',
    category: 'action',
    params: [
      { name: 'connectorId', type: 'string', required: true },
      { name: 'productId', type: 'string', required: true },
    ],
  },
  {
    id: 'action.update_price',
    label: 'Update Price',
    category: 'action',
    params: [
      { name: 'connectorId', type: 'string', required: true },
      { name: 'sku', type: 'string', required: true },
      { name: 'price', type: 'number', required: true },
      { name: 'currency', type: 'string', required: false, default: 'ARS' },
    ],
  },
  {
    id: 'action.send_email',
    label: 'Send Email',
    category: 'action',
    params: [
      { name: 'to', type: 'string', required: true },
      { name: 'subject', type: 'string', required: true },
      { name: 'body', type: 'string', required: true },
    ],
  },
  {
    id: 'action.write_google_sheet_row',
    label: 'Write Google Sheet Row',
    category: 'action',
    params: [
      { name: 'connectorId', type: 'string', required: true },
      { name: 'spreadsheetId', type: 'string', required: true },
      { name: 'sheet', type: 'string', required: false, default: 'Sheet1' },
      { name: 'row', type: 'object', required: true },
    ],
  },
  {
    id: 'action.notify_slack',
    label: 'Notify Slack',
    category: 'action',
    params: [
      { name: 'channel', type: 'string', required: true },
      { name: 'message', type: 'string', required: true },
    ],
  },
];

// ─── Logic ───────────────────────────────────────────────────────────────────

const LOGIC_NODES: NodeDefinition[] = [
  {
    id: 'logic.if_else',
    label: 'If / Else',
    category: 'logic',
    params: [{ name: 'expression', type: 'expression', required: true }],
  },
  {
    id: 'logic.delay',
    label: 'Delay',
    category: 'logic',
    params: [{ name: 'delayMs', type: 'number', required: true }],
  },
  {
    id: 'logic.retry',
    label: 'Retry',
    category: 'logic',
    params: [
      { name: 'maxAttempts', type: 'number', required: true, default: 3 },
      { name: 'backoffMs', type: 'number', required: false, default: 1000 },
    ],
  },
  {
    id: 'logic.switch',
    label: 'Switch',
    category: 'logic',
    params: [{ name: 'expression', type: 'expression', required: true }],
  },
  {
    id: 'logic.branch',
    label: 'Branch',
    category: 'logic',
    params: [{ name: 'expression', type: 'expression', required: true }],
  },
  {
    id: 'logic.approval',
    label: 'Approval Gate',
    category: 'logic',
    params: [
      { name: 'message', type: 'string', required: true },
      { name: 'timeoutMs', type: 'number', required: false },
      { name: 'onTimeout', type: 'string', required: false, default: 'fail' },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const HELPER_NODES: NodeDefinition[] = [
  {
    id: 'helper.find_entity',
    label: 'Find Entity',
    category: 'helper',
    params: [
      { name: 'entityType', type: 'string', required: true },
      { name: 'query', type: 'object', required: true },
    ],
  },
  {
    id: 'helper.map_fields',
    label: 'Map Fields',
    category: 'helper',
    params: [
      { name: 'source', type: 'expression', required: true },
      { name: 'mapping', type: 'object', required: true, description: '{ targetField: "sourceExpression" }' },
    ],
  },
  {
    id: 'helper.validate_data',
    label: 'Validate Data',
    category: 'helper',
    params: [
      { name: 'schema', type: 'object', required: true, description: 'JSON Schema' },
      { name: 'data', type: 'expression', required: true },
    ],
  },
  {
    id: 'helper.resolve_identity',
    label: 'Resolve Identity',
    category: 'helper',
    params: [
      { name: 'entityType', type: 'string', required: true },
      { name: 'externalId', type: 'string', required: true },
      { name: 'system', type: 'string', required: true },
    ],
  },
  {
    id: 'helper.deduplicate_records',
    label: 'Deduplicate Records',
    category: 'helper',
    params: [
      { name: 'records', type: 'expression', required: true },
      { name: 'keyField', type: 'string', required: true },
    ],
  },
];

// ─── Advanced ────────────────────────────────────────────────────────────────

const ADVANCED_NODES: NodeDefinition[] = [
  {
    id: 'advanced.http_request',
    label: 'HTTP Request',
    category: 'advanced',
    restricted: true,
    params: [
      { name: 'url', type: 'string', required: true },
      { name: 'method', type: 'string', required: false, default: 'GET' },
      { name: 'headers', type: 'object', required: false },
      { name: 'body', type: 'object', required: false },
    ],
  },
  {
    id: 'advanced.transform_json',
    label: 'Transform JSON',
    category: 'advanced',
    restricted: true,
    params: [
      { name: 'expression', type: 'expression', required: true, description: 'JSONata expression' },
      { name: 'input', type: 'expression', required: true },
    ],
  },
];

// ─── Internal ────────────────────────────────────────────────────────────────

const INTERNAL_NODES: NodeDefinition[] = [
  {
    id: 'internal.match_entities',
    label: 'Match Entities',
    category: 'internal',
    internalOnly: true,
    params: [
      { name: 'entityType', type: 'string', required: true },
      { name: 'systems', type: 'array', required: true },
    ],
  },
  {
    id: 'internal.apply_policy',
    label: 'Apply Policy',
    category: 'internal',
    internalOnly: true,
    params: [{ name: 'policyId', type: 'string', required: true }],
  },
  {
    id: 'internal.replay_sync_event',
    label: 'Replay Sync Event',
    category: 'internal',
    internalOnly: true,
    params: [{ name: 'eventId', type: 'string', required: true }],
  },
  {
    id: 'internal.snapshot_update',
    label: 'Snapshot Update',
    category: 'internal',
    internalOnly: true,
    params: [
      { name: 'entityType', type: 'string', required: true },
      { name: 'canonicalId', type: 'string', required: true },
      { name: 'payload', type: 'object', required: true },
    ],
  },
  {
    id: 'internal.country_pack_validation',
    label: 'Country Pack Validation',
    category: 'internal',
    internalOnly: true,
    params: [
      { name: 'countryCode', type: 'string', required: true },
      { name: 'validationType', type: 'string', required: true },
      { name: 'value', type: 'expression', required: true },
    ],
  },
];

// ─── Registry ────────────────────────────────────────────────────────────────

export const NODE_CATALOG: NodeDefinition[] = [
  ...TRIGGER_NODES,
  ...ACTION_NODES,
  ...LOGIC_NODES,
  ...HELPER_NODES,
  ...ADVANCED_NODES,
  ...INTERNAL_NODES,
];

const _catalogById = new Map(NODE_CATALOG.map(n => [n.id, n]));

export function getNode(id: string): NodeDefinition | undefined {
  return _catalogById.get(id);
}

export function getNodesByCategory(category: NodeCategory): NodeDefinition[] {
  return NODE_CATALOG.filter(n => n.category === category);
}

/** Returns all nodes visible to tenant users (excludes internalOnly). */
export function getTenantNodes(): NodeDefinition[] {
  return NODE_CATALOG.filter(n => !n.internalOnly);
}
