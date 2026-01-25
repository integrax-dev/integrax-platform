/**
 * Logger interface compatible with pino.
 */
export interface Logger {
  debug(obj: object, msg?: string): void;
  debug(msg: string): void;
  info(obj: object, msg?: string): void;
  info(msg: string): void;
  warn(obj: object, msg?: string): void;
  warn(msg: string): void;
  error(obj: object, msg?: string): void;
  error(msg: string): void;
  child(bindings: Record<string, unknown>): Logger;
}

/**
 * Create a logger instance.
 * In production, this should be configured to use pino with proper transports.
 */
export function createLogger(name: string): Logger {
  // Simple console-based logger for now
  // In production, replace with pino configuration
  const createLogFn = (level: string) => {
    return (objOrMsg: object | string, msg?: string) => {
      const timestamp = new Date().toISOString();
      if (typeof objOrMsg === 'string') {
        console.log(JSON.stringify({ timestamp, level, name, msg: objOrMsg }));
      } else {
        console.log(JSON.stringify({ timestamp, level, name, ...objOrMsg, msg }));
      }
    };
  };

  const logger: Logger = {
    debug: createLogFn('debug'),
    info: createLogFn('info'),
    warn: createLogFn('warn'),
    error: createLogFn('error'),
    child: (bindings: Record<string, unknown>) => {
      // Return a new logger with merged bindings
      return createLogger(`${name}:${Object.values(bindings).join(':')}`);
    },
  };

  return logger;
}

/**
 * Trace context for distributed tracing.
 */
export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled?: boolean;
}

/**
 * Extract trace context from headers (W3C Trace Context format).
 */
export function extractTraceContext(
  headers: Record<string, string | undefined>
): TraceContext | null {
  const traceparent = headers['traceparent'] ?? headers['Traceparent'];
  if (!traceparent) return null;

  // Format: version-traceId-spanId-flags
  const parts = traceparent.split('-');
  if (parts.length < 4) return null;

  return {
    traceId: parts[1],
    spanId: parts[2],
    sampled: parts[3] === '01',
  };
}

/**
 * Create traceparent header value.
 */
export function createTraceparent(context: TraceContext): string {
  const flags = context.sampled ? '01' : '00';
  return `00-${context.traceId}-${context.spanId}-${flags}`;
}

/**
 * Generate a new span ID.
 */
export function generateSpanId(): string {
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

/**
 * Generate a new trace ID.
 */
export function generateTraceId(): string {
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

/**
 * Metrics recording interface.
 */
export interface MetricsRecorder {
  increment(metric: string, value?: number, tags?: Record<string, string>): void;
  gauge(metric: string, value: number, tags?: Record<string, string>): void;
  histogram(metric: string, value: number, tags?: Record<string, string>): void;
  timing(metric: string, durationMs: number, tags?: Record<string, string>): void;
}

/**
 * Create a metrics recorder.
 * In production, this should be configured to use OpenTelemetry or another metrics backend.
 */
export function createMetricsRecorder(prefix: string): MetricsRecorder {
  return {
    increment(metric, value = 1, tags) {
      console.log(JSON.stringify({
        type: 'metric',
        metric: `${prefix}.${metric}`,
        kind: 'counter',
        value,
        tags,
        timestamp: Date.now(),
      }));
    },
    gauge(metric, value, tags) {
      console.log(JSON.stringify({
        type: 'metric',
        metric: `${prefix}.${metric}`,
        kind: 'gauge',
        value,
        tags,
        timestamp: Date.now(),
      }));
    },
    histogram(metric, value, tags) {
      console.log(JSON.stringify({
        type: 'metric',
        metric: `${prefix}.${metric}`,
        kind: 'histogram',
        value,
        tags,
        timestamp: Date.now(),
      }));
    },
    timing(metric, durationMs, tags) {
      console.log(JSON.stringify({
        type: 'metric',
        metric: `${prefix}.${metric}`,
        kind: 'timing',
        value: durationMs,
        tags,
        timestamp: Date.now(),
      }));
    },
  };
}
