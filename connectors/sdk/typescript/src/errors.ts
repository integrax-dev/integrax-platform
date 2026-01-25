/**
 * Base error class for connector errors.
 */
export class ConnectorError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean = false,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ConnectorError';
  }
}

/**
 * Error thrown when input validation fails.
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: Array<{ path: string; message: string }>
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when authentication fails.
 */
export class AuthenticationError extends ConnectorError {
  constructor(message: string = 'Authentication failed', details?: Record<string, unknown>) {
    super('AUTHENTICATION_ERROR', message, false, details);
    this.name = 'AuthenticationError';
  }
}

/**
 * Error thrown when rate limit is exceeded.
 */
export class RateLimitError extends ConnectorError {
  constructor(
    public readonly retryAfterMs?: number,
    details?: Record<string, unknown>
  ) {
    super('RATE_LIMIT_EXCEEDED', 'Rate limit exceeded', true, {
      ...details,
      retryAfterMs,
    });
    this.name = 'RateLimitError';
  }
}

/**
 * Error thrown when a resource is not found.
 */
export class NotFoundError extends ConnectorError {
  constructor(resourceType: string, resourceId: string) {
    super(
      'NOT_FOUND',
      `${resourceType} with id ${resourceId} not found`,
      false,
      { resourceType, resourceId }
    );
    this.name = 'NotFoundError';
  }
}

/**
 * Error thrown when there's a conflict (e.g., duplicate).
 */
export class ConflictError extends ConnectorError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CONFLICT', message, false, details);
    this.name = 'ConflictError';
  }
}

/**
 * Error thrown when the external service is unavailable.
 */
export class ServiceUnavailableError extends ConnectorError {
  constructor(service: string, details?: Record<string, unknown>) {
    super(
      'SERVICE_UNAVAILABLE',
      `${service} is currently unavailable`,
      true,
      details
    );
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Error thrown when request times out.
 */
export class TimeoutError extends ConnectorError {
  constructor(operation: string, timeoutMs: number) {
    super(
      'TIMEOUT',
      `${operation} timed out after ${timeoutMs}ms`,
      true,
      { operation, timeoutMs }
    );
    this.name = 'TimeoutError';
  }
}
