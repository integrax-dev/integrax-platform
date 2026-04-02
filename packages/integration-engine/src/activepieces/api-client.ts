import { IntegrationEngineError } from '../errors.js';

export class ActivepiecesApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async get<T = unknown>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: this.headers(),
    });
    return this.parse<T>(res);
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.parse<T>(res);
  }

  async patch<T = unknown>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PATCH',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.parse<T>(res);
  }

  private headers() {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  private async parse<T>(res: Response): Promise<T> {
    const text = await res.text();
    if (!res.ok) {
      throw new IntegrationEngineError(`HTTP ${res.status}: ${text}`, res.status);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new IntegrationEngineError(`Non-JSON response: ${text}`, res.status);
    }
  }
}
