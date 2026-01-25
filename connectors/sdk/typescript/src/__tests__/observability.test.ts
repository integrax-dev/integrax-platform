import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createLogger,
  extractTraceContext,
  createTraceparent,
  generateSpanId,
  generateTraceId,
  createMetricsRecorder,
} from '../observability.js';

describe('createLogger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should create logger with all methods', () => {
    const logger = createLogger('test');

    expect(logger.debug).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.error).toBeDefined();
    expect(logger.child).toBeDefined();
  });

  it('should log with string message', () => {
    const logger = createLogger('test');
    logger.info('Test message');

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"msg":"Test message"')
    );
  });

  it('should log with object and message', () => {
    const logger = createLogger('test');
    logger.info({ key: 'value' }, 'Test message');

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"key":"value"')
    );
  });

  it('should create child logger', () => {
    const logger = createLogger('parent');
    const child = logger.child({ correlationId: '123' });

    expect(child).toBeDefined();
    expect(child.info).toBeDefined();
  });
});

describe('extractTraceContext', () => {
  it('should extract trace context from W3C traceparent header', () => {
    const headers = {
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
    };

    const context = extractTraceContext(headers);

    expect(context).toEqual({
      traceId: '0af7651916cd43dd8448eb211c80319c',
      spanId: 'b7ad6b7169203331',
      sampled: true,
    });
  });

  it('should handle unsampled trace', () => {
    const headers = {
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-00',
    };

    const context = extractTraceContext(headers);

    expect(context?.sampled).toBe(false);
  });

  it('should return null when no traceparent header', () => {
    const headers = {};

    const context = extractTraceContext(headers);

    expect(context).toBeNull();
  });

  it('should handle capitalized header name', () => {
    const headers = {
      Traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
    };

    const context = extractTraceContext(headers);

    expect(context).not.toBeNull();
    expect(context?.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
  });

  it('should return null for invalid format', () => {
    const headers = {
      traceparent: 'invalid-format',
    };

    const context = extractTraceContext(headers);

    expect(context).toBeNull();
  });
});

describe('createTraceparent', () => {
  it('should create traceparent for sampled trace', () => {
    const context = {
      traceId: '0af7651916cd43dd8448eb211c80319c',
      spanId: 'b7ad6b7169203331',
      sampled: true,
    };

    const traceparent = createTraceparent(context);

    expect(traceparent).toBe('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');
  });

  it('should create traceparent for unsampled trace', () => {
    const context = {
      traceId: '0af7651916cd43dd8448eb211c80319c',
      spanId: 'b7ad6b7169203331',
      sampled: false,
    };

    const traceparent = createTraceparent(context);

    expect(traceparent).toBe('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-00');
  });
});

describe('generateSpanId', () => {
  it('should generate 16 character span ID', () => {
    const spanId = generateSpanId();

    expect(spanId).toHaveLength(16);
    expect(spanId).toMatch(/^[0-9a-f]+$/);
  });

  it('should generate unique span IDs', () => {
    const spanIds = new Set<string>();

    for (let i = 0; i < 100; i++) {
      spanIds.add(generateSpanId());
    }

    expect(spanIds.size).toBe(100);
  });
});

describe('generateTraceId', () => {
  it('should generate 32 character trace ID', () => {
    const traceId = generateTraceId();

    expect(traceId).toHaveLength(32);
    expect(traceId).toMatch(/^[0-9a-f]+$/);
  });

  it('should generate unique trace IDs', () => {
    const traceIds = new Set<string>();

    for (let i = 0; i < 100; i++) {
      traceIds.add(generateTraceId());
    }

    expect(traceIds.size).toBe(100);
  });
});

describe('createMetricsRecorder', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should create recorder with all methods', () => {
    const recorder = createMetricsRecorder('test');

    expect(recorder.increment).toBeDefined();
    expect(recorder.gauge).toBeDefined();
    expect(recorder.histogram).toBeDefined();
    expect(recorder.timing).toBeDefined();
  });

  it('should record increment metric', () => {
    const recorder = createMetricsRecorder('connector');
    recorder.increment('requests', 1, { status: 'success' });

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"metric":"connector.requests"')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"kind":"counter"')
    );
  });

  it('should record timing metric', () => {
    const recorder = createMetricsRecorder('connector');
    recorder.timing('latency', 150, { action: 'get_payment' });

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"metric":"connector.latency"')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"kind":"timing"')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"value":150')
    );
  });
});
