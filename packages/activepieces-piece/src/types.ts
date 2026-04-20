export type NodeCategory =
  | 'trigger'
  | 'action'
  | 'logic'
  | 'helper'
  | 'internal';

export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'enum';

export interface NodeField {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  description?: string;
  enumValues?: string[];
  default?: unknown;
}

export interface NodeDefinition {
  id: string;
  name: string;
  category: NodeCategory;
  description: string;
  /** For triggers: the IntegraxEventType that fires this trigger. */
  eventType?: string;
  /** For actions: the commandName sent to the operation engine. */
  commandName?: string;
  inputFields: NodeField[];
  outputFields: NodeField[];
}
