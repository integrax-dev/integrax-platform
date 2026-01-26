/**
 * Connector Activities
 *
 * Activities para ejecutar operaciones de conectores multi-tenant.
 */

import { log, activityInfo } from '@temporalio/activity';

export interface ConnectorCallInput {
  tenantId: string;
  connectorId: string;
  operation: string;
  params: Record<string, unknown>;
  credentials?: Record<string, string>;
}

export interface ConnectorCallResult {
  success: boolean;
  data?: unknown;
  error?: string;
  duration: number;
}

export interface TransformDataInput {
  tenantId: string;
  sourceData: unknown;
  mapping: Record<string, string>;
}

export interface WebhookCallInput {
  tenantId: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

/**
 * Execute a connector operation
 */
export async function executeConnector(input: ConnectorCallInput): Promise<ConnectorCallResult> {
  const startTime = Date.now();
  const info = activityInfo();

  log.info('Executing connector', {
    tenantId: input.tenantId,
    connectorId: input.connectorId,
    operation: input.operation,
    attempt: info.attempt,
  });

  try {
    // In production: load connector from registry, validate credentials, execute
    // For now, simulate different connector behaviors

    await simulateConnectorCall(input.connectorId, input.operation);

    const duration = Date.now() - startTime;

    log.info('Connector executed successfully', {
      tenantId: input.tenantId,
      connectorId: input.connectorId,
      duration,
    });

    return {
      success: true,
      data: {
        connectorId: input.connectorId,
        operation: input.operation,
        result: { status: 'completed', timestamp: new Date().toISOString() },
      },
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    log.error('Connector execution failed', {
      tenantId: input.tenantId,
      connectorId: input.connectorId,
      error: errorMessage,
      duration,
    });

    return {
      success: false,
      error: errorMessage,
      duration,
    };
  }
}

/**
 * Transform data between connectors
 */
export async function transformData(input: TransformDataInput): Promise<unknown> {
  log.info('Transforming data', { tenantId: input.tenantId });

  const transformed: Record<string, unknown> = {};
  const source = input.sourceData as Record<string, unknown>;

  for (const [targetKey, sourceKey] of Object.entries(input.mapping)) {
    transformed[targetKey] = getNestedValue(source, sourceKey);
  }

  return transformed;
}

/**
 * Call an external webhook
 */
export async function callWebhook(input: WebhookCallInput): Promise<ConnectorCallResult> {
  const startTime = Date.now();

  log.info('Calling webhook', {
    tenantId: input.tenantId,
    url: input.url,
    method: input.method,
  });

  try {
    const response = await fetch(input.url, {
      method: input.method,
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': input.tenantId,
        ...input.headers,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: AbortSignal.timeout(input.timeout || 30000),
    });

    const duration = Date.now() - startTime;
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        data,
        duration,
      };
    }

    return {
      success: true,
      data,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Webhook call failed',
      duration,
    };
  }
}

/**
 * Validate tenant limits before executing operations
 */
export async function validateTenantLimits(tenantId: string): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  log.info('Validating tenant limits', { tenantId });

  // In production: check against Redis/database for rate limits, quotas, etc.
  // For now, always allow

  return { allowed: true };
}

/**
 * Record metrics for a tenant operation
 */
export async function recordMetrics(
  tenantId: string,
  operation: string,
  duration: number,
  success: boolean
): Promise<void> {
  log.info('Recording metrics', {
    tenantId,
    operation,
    duration,
    success,
  });

  // In production: send to Prometheus/CloudWatch/etc.
}

/**
 * Send notification to tenant
 */
export async function sendTenantNotification(
  tenantId: string,
  type: 'email' | 'webhook' | 'slack',
  payload: Record<string, unknown>
): Promise<boolean> {
  log.info('Sending tenant notification', { tenantId, type });

  // In production: integrate with notification services
  // For now, simulate success

  return true;
}

// Helper functions

async function simulateConnectorCall(connectorId: string, operation: string): Promise<void> {
  // Simulate different response times based on connector
  const delays: Record<string, number> = {
    mercadopago: 200,
    afip: 500,
    whatsapp: 100,
    shopify: 150,
    default: 100,
  };

  const delay = delays[connectorId.toLowerCase()] || delays.default;
  await new Promise((resolve) => setTimeout(resolve, delay));

  // Simulate occasional failures for testing retry logic
  if (Math.random() < 0.01) {
    throw new Error('Simulated connector failure');
  }
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}
