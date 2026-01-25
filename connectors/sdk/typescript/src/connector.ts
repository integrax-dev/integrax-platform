import { z } from 'zod';
import type {
  ConnectorSpec,
  ActionInput,
  ActionResult,
  TestConnectionResult,
  WebhookPayload,
  NormalizedEvent,
  ExecutionContext,
  ResolvedCredentials,
  ActionDefinition,
} from './types/index.js';
import { ConnectorError, ValidationError } from './errors.js';
import { createLogger, type Logger } from './observability.js';

/**
 * Base class for all IntegraX connectors.
 * Extend this class to implement a new connector.
 */
export abstract class BaseConnector {
  protected logger: Logger;
  private actionHandlers: Map<string, ActionHandler> = new Map();

  constructor() {
    this.logger = createLogger(this.getSpec().metadata.id);
    this.registerActions();
  }

  /**
   * Returns the connector specification including metadata, auth, and actions.
   */
  abstract getSpec(): ConnectorSpec;

  /**
   * Register all action handlers. Called during construction.
   */
  protected abstract registerActions(): void;

  /**
   * Test the connection with the provided credentials.
   */
  abstract testConnection(
    credentials: ResolvedCredentials,
    config?: Record<string, unknown>
  ): Promise<TestConnectionResult>;

  /**
   * Register an action handler.
   */
  protected registerAction<TInput, TOutput>(
    actionId: string,
    handler: (input: TInput, context: ActionContext) => Promise<TOutput>
  ): void {
    const spec = this.getSpec();
    const actionDef = spec.actions.find(a => a.id === actionId);

    if (!actionDef) {
      throw new Error(`Action ${actionId} not found in connector spec`);
    }

    this.actionHandlers.set(actionId, {
      definition: actionDef,
      handler: handler as ActionHandler['handler'],
    });
  }

  /**
   * Execute an action.
   */
  async executeAction<TOutput = unknown>(
    input: ActionInput
  ): Promise<ActionResult<TOutput>> {
    const startTime = Date.now();
    const { actionId, params, context, credentials, config } = input;

    const actionHandler = this.actionHandlers.get(actionId);
    if (!actionHandler) {
      return {
        success: false,
        error: {
          code: 'ACTION_NOT_FOUND',
          message: `Action ${actionId} not found`,
          retryable: false,
        },
        metadata: {
          executedAt: new Date(),
          latencyMs: Date.now() - startTime,
          attempts: 1,
        },
      };
    }

    // Validate input
    const validationResult = actionHandler.definition.inputSchema.safeParse(params);
    if (!validationResult.success) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input parameters',
          retryable: false,
          details: { errors: validationResult.error.errors },
        },
        metadata: {
          executedAt: new Date(),
          latencyMs: Date.now() - startTime,
          attempts: 1,
        },
      };
    }

    const actionContext: ActionContext = {
      ...context,
      credentials,
      config: config ?? {},
      logger: this.logger.child({ actionId, correlationId: context.correlationId }),
    };

    try {
      const result = await actionHandler.handler(validationResult.data, actionContext);

      // Validate output
      const outputValidation = actionHandler.definition.outputSchema.safeParse(result);
      if (!outputValidation.success) {
        this.logger.warn({ actionId, errors: outputValidation.error.errors }, 'Output validation failed');
      }

      return {
        success: true,
        data: result as TOutput,
        metadata: {
          executedAt: new Date(),
          latencyMs: Date.now() - startTime,
          attempts: 1,
          idempotencyKey: context.idempotencyKey,
        },
      };
    } catch (error) {
      const connectorError = this.normalizeError(error);

      this.logger.error(
        { actionId, error: connectorError, correlationId: context.correlationId },
        'Action execution failed'
      );

      return {
        success: false,
        error: {
          code: connectorError.code,
          message: connectorError.message,
          retryable: connectorError.retryable,
          details: connectorError.details,
        },
        metadata: {
          executedAt: new Date(),
          latencyMs: Date.now() - startTime,
          attempts: 1,
          idempotencyKey: context.idempotencyKey,
        },
      };
    }
  }

  /**
   * Parse and normalize an incoming webhook payload.
   * Override this method to handle webhooks for this connector.
   */
  async parseWebhook(
    payload: WebhookPayload,
    context: Omit<ExecutionContext, 'correlationId'>
  ): Promise<NormalizedEvent | null> {
    throw new Error('Webhook parsing not implemented for this connector');
  }

  /**
   * Verify webhook signature if applicable.
   */
  async verifyWebhookSignature(
    payload: WebhookPayload,
    secret: string
  ): Promise<boolean> {
    return true; // Override in subclass
  }

  /**
   * Get list of available actions.
   */
  getActions(): ActionDefinition[] {
    return this.getSpec().actions;
  }

  /**
   * Normalize errors to ConnectorError format.
   */
  private normalizeError(error: unknown): ConnectorError {
    if (error instanceof ConnectorError) {
      return error;
    }

    if (error instanceof ValidationError) {
      return new ConnectorError(
        'VALIDATION_ERROR',
        error.message,
        false,
        { errors: error.errors }
      );
    }

    if (error instanceof Error) {
      // Check for common retryable errors
      const retryable = this.isRetryableError(error);
      return new ConnectorError(
        'CONNECTOR_ERROR',
        error.message,
        retryable
      );
    }

    return new ConnectorError(
      'UNKNOWN_ERROR',
      'An unknown error occurred',
      false
    );
  }

  /**
   * Determine if an error should trigger a retry.
   */
  private isRetryableError(error: Error): boolean {
    const retryablePatterns = [
      /timeout/i,
      /ECONNRESET/,
      /ECONNREFUSED/,
      /ETIMEDOUT/,
      /rate limit/i,
      /too many requests/i,
      /503/,
      /502/,
      /504/,
    ];

    return retryablePatterns.some(pattern =>
      pattern.test(error.message) || pattern.test(error.name)
    );
  }
}

interface ActionHandler {
  definition: ActionDefinition;
  handler: (input: unknown, context: ActionContext) => Promise<unknown>;
}

export interface ActionContext extends ExecutionContext {
  credentials: ResolvedCredentials;
  config: Record<string, unknown>;
  logger: Logger;
}
