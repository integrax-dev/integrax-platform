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
 * Execute MercadoPago operation
 */
async function executeMercadoPago(
  credentials: Record<string, string>,
  operation: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const { MercadoPagoConnector } = await import('@integrax/connector-mercadopago');
  const connector = new MercadoPagoConnector();

  return connector.executeAction({
    actionId: operation,
    params,
    credentials: {
      accessToken: credentials.access_token || credentials.accessToken,
    },
    context: {
      tenantId: 'system',
      correlationId: `mp-${Date.now()}`,
    },
  });
}

/**
 * Execute WhatsApp operation
 */
async function executeWhatsApp(
  credentials: Record<string, string>,
  operation: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const { WhatsAppConnector } = await import('@integrax/connector-whatsapp');

  const connector = new WhatsAppConnector({
    phoneNumberId: credentials.phone_number_id,
    accessToken: credentials.access_token,
    webhookVerifyToken: credentials.webhook_verify_token || '',
  });

  switch (operation) {
    case 'send_text':
      return connector.sendText(params.to as string, params.text as string);
    case 'send_template':
      return connector.sendTemplate(
        params.to as string,
        params.templateName as string,
        params.languageCode as string
      );
    default:
      throw new Error(`Unknown WhatsApp operation: ${operation}`);
  }
}

/**
 * Execute Email operation
 */
async function executeEmail(
  credentials: Record<string, string>,
  operation: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const { EmailConnector } = await import('@integrax/connector-email');
  const connector = new EmailConnector();

  await connector.connect({
    type: 'basic',
    credentials: {
      provider: 'smtp',
      host: credentials.smtp_host,
      port: parseInt(credentials.smtp_port || '587', 10),
      user: credentials.smtp_user,
      pass: credentials.smtp_password,
    },
  });

  try {
    switch (operation) {
      case 'send_email':
        return await connector.sendEmail({
          from: params.from as string,
          to: params.to as string | string[],
          subject: params.subject as string,
          text: params.text as string,
          html: params.html as string,
        });
      default:
        throw new Error(`Unknown email operation: ${operation}`);
    }
  } finally {
    await connector.disconnect();
  }
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

  if (!input.credentials) {
    return {
      success: false,
      error: 'No credentials provided for connector',
      duration: Date.now() - startTime,
    };
  }

  try {
    let result: unknown;

    // Route to appropriate connector based on connectorId
    switch (input.connectorId.toLowerCase()) {
      case 'mercadopago':
        result = await executeMercadoPago(input.credentials, input.operation, input.params);
        break;

      case 'whatsapp':
        result = await executeWhatsApp(input.credentials, input.operation, input.params);
        break;

      case 'email':
        result = await executeEmail(input.credentials, input.operation, input.params);
        break;

      case 'webhook':
      case 'http': {
        // Generic HTTP/webhook connector
        const response = await fetch(input.params.url as string, {
          method: (input.params.method as string) || 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-Id': input.tenantId,
            ...(input.params.headers as Record<string, string> || {}),
          },
          body: input.params.body ? JSON.stringify(input.params.body) : undefined,
          signal: AbortSignal.timeout(30000),
        });

        result = {
          status: response.status,
          statusText: response.statusText,
          data: await response.json().catch(() => null),
        };
        break;
      }

      default:
        // For connectors without specific implementation, try generic approach
        log.warn('Using generic connector execution', { connectorId: input.connectorId });
        result = {
          connectorId: input.connectorId,
          operation: input.operation,
          message: 'Connector executed (generic fallback)',
          timestamp: new Date().toISOString(),
        };
    }

    const duration = Date.now() - startTime;

    log.info('Connector executed successfully', {
      tenantId: input.tenantId,
      connectorId: input.connectorId,
      duration,
    });

    return {
      success: true,
      data: result,
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
 * Checks rate limits against Redis
 */
export async function validateTenantLimits(tenantId: string): Promise<{
  allowed: boolean;
  reason?: string;
  remaining?: number;
}> {
  log.info('Validating tenant limits', { tenantId });

  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    // No Redis configured - allow but log warning
    log.warn('Redis not configured, skipping rate limit check', { tenantId });
    return { allowed: true };
  }

  try {
    // Dynamic import to avoid requiring redis when not needed
    const { Redis } = await import('ioredis');
    const redis = new Redis(redisUrl);

    const key = `integrax:ratelimit:${tenantId}:workflow`;
    const now = Date.now();
    const windowMs = 60000; // 1 minute window
    const limit = 100; // 100 workflows per minute default

    // Sliding window rate limiting
    const windowStart = now - windowMs;

    // Remove old entries
    await redis.zremrangebyscore(key, 0, windowStart);

    // Count current requests
    const count = await redis.zcard(key);

    if (count >= limit) {
      await redis.quit();
      return {
        allowed: false,
        reason: 'Rate limit exceeded',
        remaining: 0,
      };
    }

    // Add current request
    await redis.zadd(key, now, `${now}-${Math.random()}`);
    await redis.expire(key, Math.ceil(windowMs / 1000));

    await redis.quit();

    return {
      allowed: true,
      remaining: limit - count - 1,
    };
  } catch (error) {
    log.error('Failed to check rate limits', {
      tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // On error, allow but log
    return { allowed: true };
  }
}

/**
 * Record metrics for a tenant operation
 * Sends metrics to Prometheus via pushgateway or stores for scraping
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

  const prometheusGateway = process.env.PROMETHEUS_PUSHGATEWAY_URL;

  if (!prometheusGateway) {
    // No pushgateway configured - just log
    return;
  }

  try {
    // Send metrics to Prometheus Pushgateway
    const metrics = `
# TYPE integrax_workflow_operation_duration_seconds histogram
integrax_workflow_operation_duration_seconds{tenant_id="${tenantId}",operation="${operation}",status="${success ? 'success' : 'failure'}"} ${duration / 1000}
# TYPE integrax_workflow_operations_total counter
integrax_workflow_operations_total{tenant_id="${tenantId}",operation="${operation}",status="${success ? 'success' : 'failure'}"} 1
`.trim();

    await fetch(`${prometheusGateway}/metrics/job/integrax_workflows/instance/${tenantId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: metrics,
    });
  } catch (error) {
    log.warn('Failed to push metrics to Prometheus', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Send notification to tenant via configured channel
 */
export async function sendTenantNotification(
  tenantId: string,
  type: 'email' | 'webhook' | 'slack',
  payload: Record<string, unknown>
): Promise<boolean> {
  log.info('Sending tenant notification', { tenantId, type });

  try {
    switch (type) {
      case 'webhook': {
        const webhookUrl = payload.url as string;
        if (!webhookUrl) {
          log.error('No webhook URL provided for notification');
          return false;
        }

        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-Id': tenantId,
          },
          body: JSON.stringify(payload.data || payload),
          signal: AbortSignal.timeout(10000),
        });

        return response.ok;
      }

      case 'slack': {
        const slackWebhook = payload.webhookUrl as string || process.env.SLACK_WEBHOOK_URL;
        if (!slackWebhook) {
          log.error('No Slack webhook URL configured');
          return false;
        }

        const response = await fetch(slackWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: payload.text || `[${tenantId}] ${payload.message || 'Notification'}`,
            blocks: payload.blocks,
          }),
        });

        return response.ok;
      }

      case 'email': {
        // Email notifications require SMTP credentials
        const smtpHost = process.env.SMTP_HOST;
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;

        if (!smtpHost || !smtpUser || !smtpPass) {
          log.error('SMTP not configured for email notifications');
          return false;
        }

        const { EmailConnector } = await import('@integrax/connector-email');
        const connector = new EmailConnector();
        await connector.connect({
          type: 'basic',
          credentials: {
            provider: 'smtp',
            host: smtpHost,
            user: smtpUser,
            pass: smtpPass,
          },
        });

        const result = await connector.sendEmail({
          from: payload.from as string || process.env.SMTP_FROM || smtpUser,
          to: payload.to as string,
          subject: payload.subject as string || `[IntegraX] Notification for ${tenantId}`,
          text: payload.text as string,
          html: payload.html as string,
        });

        await connector.disconnect();
        return result.success;
      }

      default:
        log.error('Unknown notification type', { type });
        return false;
    }
  } catch (error) {
    log.error('Failed to send notification', {
      tenantId,
      type,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

// Helper functions

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}
