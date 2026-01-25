import { describe, it, expect } from 'vitest';
import {
  ConnectorError,
  ValidationError,
  AuthenticationError,
  RateLimitError,
  NotFoundError,
  ConflictError,
  ServiceUnavailableError,
  TimeoutError,
} from '../errors.js';

describe('ConnectorError', () => {
  it('should create error with all properties', () => {
    const error = new ConnectorError('TEST_CODE', 'Test message', true, { key: 'value' });

    expect(error.code).toBe('TEST_CODE');
    expect(error.message).toBe('Test message');
    expect(error.retryable).toBe(true);
    expect(error.details).toEqual({ key: 'value' });
    expect(error.name).toBe('ConnectorError');
  });

  it('should default retryable to false', () => {
    const error = new ConnectorError('TEST_CODE', 'Test message');

    expect(error.retryable).toBe(false);
  });
});

describe('ValidationError', () => {
  it('should create error with validation errors', () => {
    const errors = [
      { path: 'field1', message: 'Required' },
      { path: 'field2', message: 'Invalid format' },
    ];

    const error = new ValidationError('Validation failed', errors);

    expect(error.message).toBe('Validation failed');
    expect(error.errors).toEqual(errors);
    expect(error.name).toBe('ValidationError');
  });
});

describe('AuthenticationError', () => {
  it('should create error with default message', () => {
    const error = new AuthenticationError();

    expect(error.code).toBe('AUTHENTICATION_ERROR');
    expect(error.message).toBe('Authentication failed');
    expect(error.retryable).toBe(false);
    expect(error.name).toBe('AuthenticationError');
  });

  it('should create error with custom message', () => {
    const error = new AuthenticationError('Invalid API key');

    expect(error.message).toBe('Invalid API key');
  });
});

describe('RateLimitError', () => {
  it('should create error with retry info', () => {
    const error = new RateLimitError(5000, { limit: 100 });

    expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(error.retryable).toBe(true);
    expect(error.retryAfterMs).toBe(5000);
    expect(error.details?.retryAfterMs).toBe(5000);
    expect(error.name).toBe('RateLimitError');
  });
});

describe('NotFoundError', () => {
  it('should create error with resource info', () => {
    const error = new NotFoundError('Payment', 'PAY-123');

    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('Payment with id PAY-123 not found');
    expect(error.retryable).toBe(false);
    expect(error.details).toEqual({
      resourceType: 'Payment',
      resourceId: 'PAY-123',
    });
    expect(error.name).toBe('NotFoundError');
  });
});

describe('ConflictError', () => {
  it('should create error with conflict message', () => {
    const error = new ConflictError('Duplicate entry', { existingId: '123' });

    expect(error.code).toBe('CONFLICT');
    expect(error.message).toBe('Duplicate entry');
    expect(error.retryable).toBe(false);
    expect(error.details).toEqual({ existingId: '123' });
    expect(error.name).toBe('ConflictError');
  });
});

describe('ServiceUnavailableError', () => {
  it('should create error with service name', () => {
    const error = new ServiceUnavailableError('MercadoPago API');

    expect(error.code).toBe('SERVICE_UNAVAILABLE');
    expect(error.message).toBe('MercadoPago API is currently unavailable');
    expect(error.retryable).toBe(true);
    expect(error.name).toBe('ServiceUnavailableError');
  });
});

describe('TimeoutError', () => {
  it('should create error with operation info', () => {
    const error = new TimeoutError('GET /payments', 30000);

    expect(error.code).toBe('TIMEOUT');
    expect(error.message).toBe('GET /payments timed out after 30000ms');
    expect(error.retryable).toBe(true);
    expect(error.details).toEqual({
      operation: 'GET /payments',
      timeoutMs: 30000,
    });
    expect(error.name).toBe('TimeoutError');
  });
});
