import { z } from 'zod';

// ============================================
// Core Types
// ============================================

export interface ConnectorMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  category: ConnectorCategory;
  status: ConnectorStatus;
  iconUrl?: string;
  documentationUrl?: string;
  supportedRegions?: string[];
}

export type ConnectorCategory =
  | 'payment'
  | 'ecommerce'
  | 'erp'
  | 'fiscal'
  | 'notification'
  | 'storage';

export type ConnectorStatus = 'active' | 'deprecated' | 'beta';

export type AuthType = 'api_key' | 'oauth2' | 'basic' | 'custom';

// ============================================
// Connector Specification
// ============================================

export interface ConnectorSpec {
  metadata: ConnectorMetadata;
  authType: AuthType;
  authSchema: z.ZodSchema;
  configSchema?: z.ZodSchema;
  actions: ActionDefinition[];
  triggers?: TriggerDefinition[];
}

export interface ActionDefinition {
  id: string;
  name: string;
  description?: string;
  inputSchema: z.ZodSchema;
  outputSchema: z.ZodSchema;
  idempotent?: boolean;
  rateLimit?: {
    requestsPerMinute: number;
  };
}

export interface TriggerDefinition {
  id: string;
  name: string;
  description?: string;
  eventType: string;
  payloadSchema: z.ZodSchema;
}

// ============================================
// Execution Context
// ============================================

export interface ExecutionContext {
  correlationId: string;
  tenantId: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  idempotencyKey?: string;
  timeout?: number;
}

export interface CredentialRef {
  type: 'vault' | 'env' | 'encrypted';
  key: string;
}

export interface ResolvedCredentials {
  [key: string]: string;
}

// ============================================
// Action Execution
// ============================================

export interface ActionInput<T = unknown> {
  actionId: string;
  params: T;
  context: ExecutionContext;
  credentials: ResolvedCredentials;
  config?: Record<string, unknown>;
}

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: ActionError;
  metadata: ActionMetadata;
}

export interface ActionError {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export interface ActionMetadata {
  executedAt: Date;
  latencyMs: number;
  attempts: number;
  idempotencyKey?: string;
}

// ============================================
// Webhook / Trigger
// ============================================

export interface WebhookPayload {
  headers: Record<string, string>;
  body: unknown;
  query?: Record<string, string>;
  rawBody?: string;
}

export interface NormalizedEvent {
  eventId: string;
  correlationId: string;
  tenantId: string;
  occurredAt: Date;
  eventType: string;
  version: string;
  source: string;
  payload: unknown;
}

// ============================================
// Test Connection
// ============================================

export interface TestConnectionResult {
  success: boolean;
  testedAt: Date;
  latencyMs: number;
  error?: {
    code: string;
    message: string;
  };
  details?: {
    permissions?: string[];
    accountInfo?: Record<string, unknown>;
  };
}

// ============================================
// Common Schemas (reusables)
// ============================================

export const MoneySchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().length(3).toUpperCase(),
});

export const IdentificationSchema = z.object({
  type: z.enum(['DNI', 'CUIT', 'CUIL', 'CPF', 'CNPJ', 'RUT', 'PASSPORT', 'OTHER']),
  number: z.string().min(1),
});

export const AddressSchema = z.object({
  street: z.string().optional(),
  streetNumber: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().length(2).toUpperCase().optional(),
});

export const CustomerSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  identification: IdentificationSchema.optional(),
  address: AddressSchema.optional(),
});

export const LineItemSchema = z.object({
  id: z.string(),
  sku: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});

export type Money = z.infer<typeof MoneySchema>;
export type Identification = z.infer<typeof IdentificationSchema>;
export type Address = z.infer<typeof AddressSchema>;
export type Customer = z.infer<typeof CustomerSchema>;
export type LineItem = z.infer<typeof LineItemSchema>;
