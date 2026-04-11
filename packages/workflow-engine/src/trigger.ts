import type { IntegraxEventType } from '@integrax/event-bus';

/**
 * Definiciones de trigger: que es lo que arranca un flujo.
 *
 * Disparadores publicos del catalogo:
 *   OrderCreated, ProductUpdated, StockChanged, InvoiceFailed,
 *   ConflictDetected, WebhookReceived, ScheduledEvent, ApprovalRequired
 */

export type FlowTrigger =
  | EventTrigger
  | ScheduleTrigger
  | WebhookTrigger
  | ManualTrigger
  | ApprovalTrigger;

export interface EventTrigger {
  type: 'event';
  /** Tipo de evento de plataforma que dispara este flujo. */
  eventType: IntegraxEventType;
  /** Filtro opcional: solo dispara cuando el payload coincide. */
  filter?: Record<string, unknown>;
}

export interface ScheduleTrigger {
  type: 'schedule';
  /** Expresion cron (UTC), por ejemplo '0 * * * *' = cada hora. */
  cron: string;
  /** Zona horaria opcional. Por defecto es UTC. */
  timezone?: string;
}

export interface WebhookTrigger {
  type: 'webhook';
  /** Que webhook de conector dispara este flujo. */
  connectorId: string;
  /** Filtro opcional por tipo de evento dentro del stream de webhook. */
  eventType?: string;
}

export interface ManualTrigger {
  type: 'manual';
  /** Schema de entrada definido por el operador para el formulario manual. */
  inputSchema?: Record<string, unknown>;
}

export interface ApprovalTrigger {
  type: 'approval_required';
  /** Tipo de entidad pendiente de aprobacion. */
  entityType: string;
  /** Rol minimo requerido para aprobar. */
  minRole?: 'operator' | 'tenant_admin' | 'platform_admin';
}
