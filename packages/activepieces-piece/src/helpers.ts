import type { NodeDefinition } from './types.js';

export const HELPERS: NodeDefinition[] = [
  {
    id: 'helper.find_entity',
    name: 'Find Entity',
    category: 'helper',
    description: 'Retrieve the last-known snapshot of an entity from IntegraX.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'entityType', label: 'Entity Type', type: 'string', required: true, description: 'e.g. product, order, customer, invoice' },
      { name: 'canonicalId', label: 'Canonical ID', type: 'string', required: true },
    ],
    outputFields: [
      { name: 'found', label: 'Found', type: 'boolean', required: true },
      { name: 'snapshot', label: 'Entity Snapshot', type: 'object', required: false },
      { name: 'externalIds', label: 'External IDs', type: 'array', required: false },
    ],
  },
  {
    id: 'helper.inspect_consistency',
    name: 'Inspect Consistency',
    category: 'helper',
    description: 'Run the consistency inspector for an entity type and return any issues found.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'entityType', label: 'Entity Type', type: 'string', required: true },
    ],
    outputFields: [
      { name: 'hasIssues', label: 'Has Issues', type: 'boolean', required: true },
      { name: 'issueCount', label: 'Issue Count', type: 'number', required: true },
      { name: 'report', label: 'Full Report', type: 'object', required: false },
    ],
  },
  {
    id: 'helper.get_timeline',
    name: 'Get Entity Timeline',
    category: 'helper',
    description: 'Retrieve the event timeline for an entity.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'entityType', label: 'Entity Type', type: 'string', required: true },
      { name: 'canonicalId', label: 'Canonical ID', type: 'string', required: true },
      { name: 'limit', label: 'Limit', type: 'number', required: false, default: 20 },
    ],
    outputFields: [
      { name: 'events', label: 'Timeline Events', type: 'array', required: true },
      { name: 'total', label: 'Total Events', type: 'number', required: true },
    ],
  },
  {
    id: 'helper.get_operation_status',
    name: 'Get Operation Status',
    category: 'helper',
    description: 'Poll the status of a submitted operation.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
    ],
    outputFields: [
      { name: 'status', label: 'Status', type: 'enum', required: true, enumValues: ['pending', 'running', 'success', 'failed', 'awaiting_approval', 'cancelled'] },
      { name: 'result', label: 'Result', type: 'object', required: false },
      { name: 'error', label: 'Error', type: 'string', required: false },
    ],
  },
  {
    id: 'helper.list_snapshots',
    name: 'List Snapshots',
    category: 'helper',
    description: 'List all known snapshots for an entity type in a tenant.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'entityType', label: 'Entity Type', type: 'string', required: true },
      { name: 'limit', label: 'Limit', type: 'number', required: false, default: 50 },
    ],
    outputFields: [
      { name: 'snapshots', label: 'Snapshots', type: 'array', required: true },
      { name: 'total', label: 'Total', type: 'number', required: true },
    ],
  },
];
