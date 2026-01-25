import {
  ConnectorError,
  RateLimitError,
  ServiceUnavailableError,
  TimeoutError,
} from './errors.js';
import type { Logger } from './observability.js';

export interface HttpClientConfig {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
  retries?: number;
  retryDelayMs?: number;
  logger?: Logger;
}

export interface RequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Headers;
  data: T;
}

/**
 * HTTP client with retry logic, timeout handling, and error normalization.
 */
export class HttpClient {
  private config: Required<HttpClientConfig>;

  constructor(config: HttpClientConfig) {
    this.config = {
      timeout: 30000,
      headers: {},
      retries: 3,
      retryDelayMs: 1000,
      logger: console as unknown as Logger,
      ...config,
    };
  }

  async request<T = unknown>(reqConfig: RequestConfig): Promise<HttpResponse<T>> {
    const { method = 'GET', path, params, body, headers, timeout } = reqConfig;

    const url = this.buildUrl(path, params);
    const requestTimeout = timeout ?? this.config.timeout;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...this.config.headers,
            ...headers,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const retryAfterMs = retryAfter ? parseInt(retryAfter) * 1000 : undefined;
          throw new RateLimitError(retryAfterMs);
        }

        // Handle server errors (potentially retryable)
        if (response.status >= 500) {
          throw new ServiceUnavailableError(this.config.baseUrl);
        }

        // Parse response
        const data = await this.parseResponse<T>(response);

        // Handle client errors
        if (response.status >= 400) {
          throw new ConnectorError(
            `HTTP_${response.status}`,
            typeof data === 'object' && data && 'message' in data
              ? String((data as Record<string, unknown>).message)
              : `HTTP ${response.status}`,
            false,
            { status: response.status, data }
          );
        }

        return {
          status: response.status,
          headers: response.headers,
          data,
        };
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new TimeoutError(`${method} ${path}`, requestTimeout);
        } else if (error instanceof ConnectorError) {
          if (!error.retryable || attempt === this.config.retries) {
            throw error;
          }
          lastError = error;
        } else {
          lastError = error instanceof Error ? error : new Error(String(error));
        }

        // Wait before retry
        if (attempt < this.config.retries) {
          const delay = this.calculateRetryDelay(attempt, lastError);
          await this.sleep(delay);
        }
      }
    }

    throw lastError ?? new ConnectorError('UNKNOWN_ERROR', 'Request failed', false);
  }

  async get<T = unknown>(path: string, params?: RequestConfig['params']): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'GET', path, params });
  }

  async post<T = unknown>(path: string, body?: unknown, params?: RequestConfig['params']): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'POST', path, body, params });
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'PUT', path, body });
  }

  async patch<T = unknown>(path: string, body?: unknown): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'PATCH', path, body });
  }

  async delete<T = unknown>(path: string): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'DELETE', path });
  }

  private buildUrl(path: string, params?: RequestConfig['params']): string {
    const url = new URL(path, this.config.baseUrl);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('Content-Type') ?? '';

    if (contentType.includes('application/json')) {
      return response.json() as Promise<T>;
    }

    if (contentType.includes('text/')) {
      return response.text() as Promise<T>;
    }

    // Return empty object for no content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  private calculateRetryDelay(attempt: number, error: Error): number {
    // Use exponential backoff with jitter
    const baseDelay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.3 * baseDelay;

    // Check for Retry-After header in rate limit errors
    if (error instanceof RateLimitError && error.retryAfterMs) {
      return error.retryAfterMs;
    }

    return baseDelay + jitter;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a pre-configured HTTP client.
 */
export function createHttpClient(config: HttpClientConfig): HttpClient {
  return new HttpClient(config);
}
