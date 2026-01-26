/**
 * IntegraX Control Plane
 *
 * Admin API for managing:
 * - Tenants (create, suspend, limits)
 * - Connectors (configure, test, learn)
 * - Workflows (create, version, pause)
 * - Events (DLQ, replay)
 * - Audit (logs, compliance)
 * - Metrics (monitoring, alerts)
 */

// Server
export { app } from './server';

// Routes
export { tenantsRouter, tenants } from './routes/tenants';
export { connectorsRouter, CONNECTOR_CATALOG, tenantConnectors } from './routes/connectors';
export { workflowsRouter, workflows, workflowVersions, workflowRuns } from './routes/workflows';

// Middleware
export { requireAuth, requireRole, requireTenant, generateToken, verifyWebhookSignature } from './middleware/auth';
export { audit, getAuditLogs, auditLog } from './middleware/audit';
export { validate, validateQuery, validateParams } from './middleware/validate';

// Types
export type {
  // Tenant
  Tenant,
  TenantPlan,
  TenantStatus,
  TenantLimits,
  CreateTenantInput,

  // User
  User,
  UserRole,
  CreateUserInput,

  // Connector
  ConnectorDefinition,
  TenantConnector,
  ConnectorStatus,
  ConfigureConnectorInput,

  // Workflow
  Workflow,
  WorkflowStatus,
  WorkflowTrigger,
  WorkflowStep,
  WorkflowVersion,
  CreateWorkflowInput,

  // Workflow Run
  WorkflowRun,
  StepExecution,
  RunStatus,

  // Event
  IncomingEvent,
  EventStatus,
  DLQEntry,

  // Audit
  AuditEntry,

  // Metrics
  TenantMetrics,

  // API
  PaginatedResponse,
  APIResponse,
} from './types';
