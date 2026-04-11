import type { FlowTrigger } from './trigger.js';
import type { FlowStep } from './steps.js';

export type FlowStatus = 'active' | 'inactive' | 'draft' | 'error';

/**
 * Un flujo de Integrax: la definicion portable de una automatizacion.
 *
 * Este esquema es agnostico al runtime. `runtime/activepieces-adapter`
 * lo compila a JSON de Activepieces; otros adaptadores pueden apuntar a
 * n8n, Temporal u otros motores.
 */
export interface IntegraxFlow {
  /** ID estable del flujo (ulid). */
  id: string;
  name: string;
  description?: string;
  /** Cadena semver. Incrementarla cuando haya cambios incompatibles. */
  version: string;
  status: FlowStatus;
  trigger: FlowTrigger;
  /** Lista ordenada de pasos. Las referencias onSuccess/onFailure arman el DAG. */
  steps: FlowStep[];
  /** Tenant propietario del flujo. null = flujo a nivel plataforma. */
  tenantId: string | null;
  /** Perfil al que pertenece este flujo, si aplica. */
  profileId?: string;
  /** Metadata libre para mostrar en la UI. */
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** Una ejecucion individual de un flujo. */
export type FlowRunStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled' | 'waiting_approval';

export interface FlowRun {
  id: string;
  flowId: string;
  tenantId: string;
  status: FlowRunStatus;
  /** Evento disparador que inicio esta corrida. */
  triggerPayload?: unknown;
  /** Log de ejecucion por paso. */
  steps: FlowStepRun[];
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface FlowStepRun {
  stepId: string;
  node: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  attempt: number;
}
