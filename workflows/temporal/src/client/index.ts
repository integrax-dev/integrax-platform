import { logger } from '../utils/logger.js';
/**
 * Temporal Client Service
 *
 * Cliente para iniciar workflows desde el Control Plane y LLM Orchestrator.
 */

import { Client, Connection, WorkflowHandle } from '@temporalio/client';
import type {
  MultiTenantWorkflowInput,
  MultiTenantWorkflowOutput,
  PaymentWorkflowInput,
  OrderWorkflowInput,
} from '../workflows/index.js';

export interface TemporalClientConfig {
  address?: string;
  namespace?: string;
  taskQueue?: string;
}

export class TemporalClientService {
  private client: Client | null = null;
  private connection: Connection | null = null;
  private readonly config: Required<TemporalClientConfig>;

  constructor(config: TemporalClientConfig = {}) {
    if (!config.address && !process.env.TEMPORAL_ADDRESS) {
      throw new Error('TEMPORAL_ADDRESS environment variable is required');
    }

    this.config = {
      address: (config.address || process.env.TEMPORAL_ADDRESS) as string,
      namespace: config.namespace || process.env.TEMPORAL_NAMESPACE || 'default',
      taskQueue: config.taskQueue || process.env.TEMPORAL_TASK_QUEUE || 'integrax-workflows',
    };
  }

  async connect(): Promise<void> {
    if (this.client) return;

    this.connection = await Connection.connect({
      address: this.config.address,
    });

    this.client = new Client({
      connection: this.connection,
      namespace: this.config.namespace,
    });

    logger.info(`[Temporal] Connected to ${this.config.address}`);
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
      this.client = null;
    }
  }

  private ensureConnected(): Client {
    if (!this.client) {
      throw new Error('Temporal client not connected. Call connect() first.');
    }
    return this.client;
  }

  /**
   * Start a multi-tenant workflow
   */
  async startWorkflow(
    tenantId: string,
    workflowType: 'order' | 'payment',
    payload: OrderWorkflowInput | PaymentWorkflowInput,
    workflowId?: string
  ): Promise<WorkflowHandle<() => Promise<MultiTenantWorkflowOutput>>> {
    const client = this.ensureConnected();

    const input: MultiTenantWorkflowInput = {
      tenantId,
      workflowType,
      payload,
    };

    const id = workflowId || `${tenantId}-${workflowType}-${Date.now()}`;

    const handle = await client.workflow.start('multiTenantWorkflow', {
      taskQueue: this.config.taskQueue,
      workflowId: id,
      args: [input],
    });

    logger.info(`[Temporal] Started workflow ${id} for tenant ${tenantId}`);
    return handle;
  }

  /**
   * Start a payment workflow
   */
  async startPayment(
    tenantId: string,
    input: PaymentWorkflowInput,
    workflowId?: string
  ): Promise<WorkflowHandle<() => Promise<MultiTenantWorkflowOutput>>> {
    return this.startWorkflow(tenantId, 'payment', input, workflowId);
  }

  /**
   * Start an order workflow
   */
  async startOrder(
    tenantId: string,
    input: OrderWorkflowInput,
    workflowId?: string
  ): Promise<WorkflowHandle<() => Promise<MultiTenantWorkflowOutput>>> {
    return this.startWorkflow(tenantId, 'order', input, workflowId);
  }

  /**
   * Get workflow handle by ID
   */
  getHandle(workflowId: string): WorkflowHandle {
    const client = this.ensureConnected();
    return client.workflow.getHandle(workflowId);
  }

  /**
   * Get workflow result
   */
  async getResult<T>(workflowId: string): Promise<T> {
    const handle = this.getHandle(workflowId);
    return await handle.result() as T;
  }

  /**
   * Cancel a workflow
   */
  async cancelWorkflow(workflowId: string): Promise<void> {
    const handle = this.getHandle(workflowId);
    await handle.cancel();
    logger.info(`[Temporal] Cancelled workflow ${workflowId}`);
  }

  /**
   * Send a signal to a workflow
   */
  async signalWorkflow(workflowId: string, signalName: string, arg?: unknown): Promise<void> {
    const handle = this.getHandle(workflowId);
    if (arg !== undefined) {
      await handle.signal(signalName, arg);
    } else {
      await handle.signal(signalName);
    }
    logger.info(`[Temporal] Sent signal ${signalName} to workflow ${workflowId}`);
  }

  /**
   * Query a workflow
   */
  async queryWorkflow<T>(workflowId: string, queryName: string): Promise<T> {
    const handle = this.getHandle(workflowId);
    return await handle.query<T>(queryName);
  }

  /**
   * List workflows for a tenant
   */
  async listWorkflows(tenantId: string, status?: 'Running' | 'Completed' | 'Failed'): Promise<string[]> {
    const client = this.ensureConnected();

    let query = `WorkflowId STARTS_WITH "${tenantId}"`;
    if (status) {
      query += ` AND ExecutionStatus = "${status}"`;
    }

    const workflows: string[] = [];
    const iterator = client.workflow.list({ query });

    for await (const workflow of iterator) {
      workflows.push(workflow.workflowId);
    }

    return workflows;
  }

  /**
   * Get workflow status
   */
  async getWorkflowStatus(workflowId: string): Promise<{
    status: string;
    startTime?: Date;
    closeTime?: Date;
  }> {
    const handle = this.getHandle(workflowId);
    const description = await handle.describe();

    return {
      status: description.status.name,
      startTime: description.startTime,
      closeTime: description.closeTime,
    };
  }
}

// Singleton instance
let instance: TemporalClientService | null = null;

export function getTemporalClient(config?: TemporalClientConfig): TemporalClientService {
  if (!instance) {
    instance = new TemporalClientService(config);
  }
  return instance;
}

export type { WorkflowHandle };
