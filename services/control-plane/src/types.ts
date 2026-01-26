/**
 * Control Plane Types
 */

import { z } from 'zod';

// ============ Tenant Types ============

export const TenantPlanSchema = z.enum(['free', 'starter', 'professional', 'enterprise']);
export type TenantPlan = z.infer<typeof TenantPlanSchema>;

export const TenantStatusSchema = z.enum(['active', 'suspended', 'pending', 'cancelled']);
export type TenantStatus = z.infer<typeof TenantStatusSchema>;

export const TenantLimitsSchema = z.object({
  requestsPerMinute: z.number().min(0).default(60),
  jobsPerMinute: z.number().min(0).default(100),
  maxConcurrentJobs: z.number().min(1).default(10),
  maxWorkflows: z.number().min(1).default(10),
  maxConnectors: z.number().min(1).default(5),
  dataRetentionDays: z.number().min(1).default(30),
});
export type TenantLimits = z.infer<typeof TenantLimitsSchema>;

export const CreateTenantSchema = z.object({
  name: z.string().min(1).max(100),
  plan: TenantPlanSchema.default('free'),
  ownerEmail: z.string().email(),
  ownerName: z.string().min(1).max(100),
  limits: TenantLimitsSchema.optional(),
  metadata: z.record(z.string()).optional(),
});
export type CreateTenantInput = z.infer<typeof CreateTenantSchema>;

export interface Tenant {
  id: string;
  name: string;
  plan: TenantPlan;
  status: TenantStatus;
  ownerId: string;
  limits: TenantLimits;
  metadata: Record<string, string>;
  apiKeyHash: string;
  webhookSecret: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============ User Types ============

export const UserRoleSchema = z.enum(['platform_admin', 'tenant_admin', 'operator', 'viewer']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: UserRoleSchema.default('viewer'),
  tenantId: z.string().optional(),
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string | null;
  passwordHash: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ Connector Types ============

export const ConnectorStatusSchema = z.enum(['available', 'configured', 'error', 'disabled']);
export type ConnectorStatus = z.infer<typeof ConnectorStatusSchema>;

export interface ConnectorDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  category: string;
  requiredCredentials: {
    name: string;
    type: 'string' | 'secret' | 'url' | 'file';
    description: string;
    required: boolean;
  }[];
  actions: {
    name: string;
    description: string;
    inputs: { name: string; type: string; required: boolean }[];
    outputs: { name: string; type: string }[];
  }[];
  triggers: {
    name: string;
    description: string;
    eventType: string;
  }[];
}

export interface TenantConnector {
  id: string;
  tenantId: string;
  connectorId: string;
  status: ConnectorStatus;
  credentials: Record<string, string>; // Encrypted
  lastTestedAt: Date | null;
  lastTestResult: 'success' | 'failed' | null;
  createdAt: Date;
  updatedAt: Date;
}

export const ConfigureConnectorSchema = z.object({
  connectorId: z.string(),
  credentials: z.record(z.string()),
});
export type ConfigureConnectorInput = z.infer<typeof ConfigureConnectorSchema>;

// ============ Workflow Types ============

export const WorkflowStatusSchema = z.enum(['draft', 'active', 'paused', 'archived']);
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

export const WorkflowTriggerSchema = z.object({
  type: z.enum(['webhook', 'schedule', 'event', 'manual']),
  connectorId: z.string().optional(),
  eventType: z.string().optional(),
  schedule: z.string().optional(), // cron expression
  webhookPath: z.string().optional(),
});
export type WorkflowTrigger = z.infer<typeof WorkflowTriggerSchema>;

export const WorkflowStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  connectorId: z.string(),
  action: z.string(),
  inputs: z.record(z.any()),
  retryPolicy: z.object({
    maxRetries: z.number().default(3),
    backoffMs: z.number().default(1000),
  }).optional(),
  condition: z.string().optional(), // JS expression
  onError: z.enum(['fail', 'continue', 'retry']).default('fail'),
});
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  trigger: WorkflowTriggerSchema,
  steps: z.array(WorkflowStepSchema).min(1),
});
export type CreateWorkflowInput = z.infer<typeof CreateWorkflowSchema>;

export interface Workflow {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  version: number;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  version: number;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  publishedAt: Date;
  publishedBy: string;
}

// ============ Workflow Run Types ============

export const RunStatusSchema = z.enum(['pending', 'running', 'success', 'failed', 'cancelled']);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export interface WorkflowRun {
  id: string;
  workflowId: string;
  tenantId: string;
  version: number;
  status: RunStatus;
  triggeredBy: string;
  input: Record<string, any>;
  output: Record<string, any> | null;
  steps: StepExecution[];
  error: string | null;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
}

export interface StepExecution {
  stepId: string;
  stepName: string;
  status: RunStatus;
  input: Record<string, any>;
  output: Record<string, any> | null;
  error: string | null;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
  retryCount: number;
}

// ============ Event Types ============

export const EventStatusSchema = z.enum(['pending', 'processing', 'processed', 'failed', 'dlq']);
export type EventStatus = z.infer<typeof EventStatusSchema>;

export interface IncomingEvent {
  id: string;
  tenantId: string;
  connectorId: string;
  eventType: string;
  payload: Record<string, any>;
  status: EventStatus;
  retryCount: number;
  lastError: string | null;
  receivedAt: Date;
  processedAt: Date | null;
}

export interface DLQEntry {
  id: string;
  tenantId: string;
  eventId: string;
  workflowId: string | null;
  error: string;
  payload: Record<string, any>;
  retryCount: number;
  createdAt: Date;
  expiresAt: Date;
}

// ============ Audit Types ============

export interface AuditEntry {
  id: string;
  tenantId: string | null;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  details: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
}

// ============ Metrics Types ============

export interface TenantMetrics {
  tenantId: string;
  period: string;
  eventsReceived: number;
  eventsProcessed: number;
  eventsFailed: number;
  workflowRuns: number;
  successfulRuns: number;
  failedRuns: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  apiCalls: number;
  rateLimitHits: number;
}

// ============ API Response Types ============

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}
