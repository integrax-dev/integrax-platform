/**
 * IntegraX Control Plane
 *
 * API de administración para gestionar:
 * - Tenants (crear, suspender, límites)
 * - Conectores (configurar, testear, aprender)
 * - Workflows (crear, versionar, pausar)
 * - Eventos (DLQ, replay)
 * - Auditoría (logs, compliance)
 * - Métricas (monitoreo, alertas)
 */

// Servidor
export { app } from './server.js';

// Rutas
export { tenantsRouter } from './routes/tenants.js';
export { getTenant, saveTenant, listTenants } from './store/tenants.js';
export { connectorsRouter, CONNECTOR_CATALOG } from './routes/connectors.js';
export { workflowsRouter, workflows, workflowVersions, workflowRuns } from './routes/workflows.js';

// Middleware
export { requireAuth, requireRole, requireTenant, generateToken, verifyWebhookSignature } from './middleware/auth.js';
export { audit, getAuditLogs, auditLog } from './middleware/audit.js';
export { validate, validateQuery, validateParams } from './middleware/validate.js';

// Tipos
export type {
  // Tenant
  Tenant,
  TenantPlan,
  TenantStatus,
  TenantLimits,
  CreateTenantInput,

  // Usuario
  User,
  UserRole,
  CreateUserInput,

  // Conector
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

  // Ejecución de Workflow
  WorkflowRun,
  StepExecution,
  RunStatus,

  // Evento
  IncomingEvent,
  EventStatus,
  DLQEntry,

  // Auditoría
  AuditEntry,

  // Métricas
  TenantMetrics,

  // API
  PaginatedResponse,
  APIResponse,
} from './types.js';
