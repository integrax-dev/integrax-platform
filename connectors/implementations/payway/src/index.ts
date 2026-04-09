/**
 * Payway Connector (Prisma Medios de Pago)
 *
 * Sandbox base: https://developers.payway.com.ar
 * Production base: https://pos.payway.com.ar
 *
 * Auth: site_id + api_key in request body; public_key for Payway.js tokenization.
 *
 * NOTE: This is a scaffold. API endpoints and payload shapes must be verified
 * against Payway's official integration guide before going to production.
 */

export interface PaywayCredentials {
  site_id: string;
  api_key: string;
  public_key: string;
  sandbox?: boolean;
}

export interface PaywayPaymentInput {
  amount: number;            // in cents
  currency?: string;         // default ARS
  card_token: string;
  installments?: number;
  external_reference?: string;
  descriptor?: string;
}

export interface PaywayPaymentResult {
  id: string;
  status: 'approved' | 'authorized' | 'rejected' | 'cancelled' | 'in_process';
  authorization_code?: string;
  amount: number;
  currency: string;
  external_reference?: string;
  date: string;
}

export class PaywayConnector {
  private readonly baseUrl: string;
  private readonly credentials: PaywayCredentials;

  constructor(credentials: PaywayCredentials) {
    this.credentials = credentials;
    this.baseUrl = credentials.sandbox !== false
      ? 'https://developers.payway.com.ar/api'
      : 'https://pos.payway.com.ar/api';
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.credentials.api_key,
        'Origin': 'IntegraX',
      },
      body: body ? JSON.stringify({ ...body as object, site_transaction_id: this.credentials.site_id }) : undefined,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as { error_type?: string; message?: string };
      throw new Error(`Payway error ${response.status}: ${err.message ?? err.error_type ?? 'Unknown'}`);
    }

    return response.json() as Promise<T>;
  }

  async createPayment(input: PaywayPaymentInput): Promise<PaywayPaymentResult> {
    return this.request<PaywayPaymentResult>('POST', '/v1/payment', {
      site_transaction_id: input.external_reference ?? `pw_${Date.now()}`,
      token: input.card_token,
      installments: input.installments ?? 1,
      payment_method_id: 1,  // Visa — must be dynamic per card brand
      amount: input.amount,
      currency: input.currency ?? 'ARS',
    });
  }

  async authorizePayment(input: PaywayPaymentInput): Promise<PaywayPaymentResult> {
    // Two-step: pre-authorize without capture
    return this.request<PaywayPaymentResult>('POST', '/v1/payment', {
      site_transaction_id: input.external_reference ?? `pw_${Date.now()}`,
      token: input.card_token,
      installments: input.installments ?? 1,
      payment_method_id: 1,
      amount: input.amount,
      currency: input.currency ?? 'ARS',
      capture: false,
    });
  }

  async capturePayment(paymentId: string, amount?: number): Promise<PaywayPaymentResult> {
    return this.request<PaywayPaymentResult>('PUT', `/v1/payment/${paymentId}`, { amount });
  }

  async refundPayment(paymentId: string, amount?: number): Promise<{ id: string; status: string }> {
    return this.request('POST', `/v1/payment/${paymentId}/refund`, { amount });
  }

  async cancelPayment(paymentId: string): Promise<{ id: string; status: string }> {
    return this.request('DELETE', `/v1/payment/${paymentId}`);
  }

  async getPayment(paymentId: string): Promise<PaywayPaymentResult> {
    return this.request<PaywayPaymentResult>('GET', `/v1/payment/${paymentId}`);
  }
}

export function createPaywayConnector(credentials: PaywayCredentials): PaywayConnector {
  return new PaywayConnector(credentials);
}
