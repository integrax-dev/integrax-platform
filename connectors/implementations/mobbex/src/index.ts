/**
 * Mobbex Connector
 *
 * API base: https://res.mobbex.com/p
 *
 * Auth: x-api-key (header) + x-access-token (header)
 *
 * NOTE: This is a scaffold. Verify endpoint paths and payload shapes against
 * Mobbex's developer docs before going to production.
 */

export interface MobbexCredentials {
  api_key: string;
  access_token: string;
}

export interface MobbexCheckoutInput {
  title: string;
  description?: string;
  total: number;
  currency?: string;
  reference: string;
  items?: Array<{ image?: string; description: string; quantity: number; price: number }>;
  customer?: { name: string; email: string; phone?: string; identification?: string };
  timeout?: number;  // minutes
  webhook?: string;
  return_url?: string;
  error_url?: string;
}

export interface MobbexCheckoutResult {
  id: string;
  url: string;
  total: number;
  currency: string;
  reference: string;
  status: number;
  status_message: string;
}

export interface MobbexPaymentResult {
  id: string;
  status: number;
  status_message: string;
  total: number;
  currency: string;
  reference: string;
  updated_at: string;
}

export class MobbexConnector {
  private readonly baseUrl = 'https://res.mobbex.com/p';
  private readonly credentials: MobbexCredentials;

  constructor(credentials: MobbexCredentials) {
    this.credentials = credentials;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.credentials.api_key,
        'x-access-token': this.credentials.access_token,
        'cache-control': 'no-cache',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as { message?: string };
      throw new Error(`Mobbex error ${response.status}: ${err.message ?? 'Unknown'}`);
    }

    return response.json() as Promise<T>;
  }

  async createCheckout(input: MobbexCheckoutInput): Promise<MobbexCheckoutResult> {
    return this.request<MobbexCheckoutResult>('POST', '/checkout', {
      title: input.title,
      description: input.description,
      total: input.total,
      currency: input.currency ?? 'ARS',
      reference: input.reference,
      items: input.items ?? [],
      customer: input.customer,
      timeout: input.timeout ?? 15,
      webhook: input.webhook,
      return_url: input.return_url,
      error_url: input.error_url,
    });
  }

  async getPayment(paymentId: string): Promise<MobbexPaymentResult> {
    return this.request<MobbexPaymentResult>('GET', `/payment/${paymentId}`);
  }

  async refundPayment(paymentId: string, amount?: number): Promise<{ id: string; status: string }> {
    return this.request('POST', `/payment/${paymentId}/refund`, { amount });
  }

  async cancelPayment(paymentId: string): Promise<{ id: string; status: string }> {
    return this.request('DELETE', `/payment/${paymentId}`);
  }

  async createSubscription(params: {
    name: string;
    total: number;
    currency?: string;
    interval: number;         // days between charges
    reference: string;
    webhook?: string;
  }): Promise<{ id: string; status: string; reference: string }> {
    return this.request('POST', '/subscription', {
      ...params,
      currency: params.currency ?? 'ARS',
    });
  }

  async cancelSubscription(subscriptionId: string): Promise<{ id: string; status: string }> {
    return this.request('DELETE', `/subscription/${subscriptionId}`);
  }
}

export function createMobbexConnector(credentials: MobbexCredentials): MobbexConnector {
  return new MobbexConnector(credentials);
}
