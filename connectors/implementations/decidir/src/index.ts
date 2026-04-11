/**
 * Decidir Connector (ICBC)
 *
 * Sandbox base: https://developers.decidir.com/api/v2
 * Production base: https://live.decidir.com/api/v2
 *
 * Auth: apikey header (private key for server-side, public key for Decidir.js)
 *
 * NOTE: This is a scaffold. Verify endpoint paths and payload shapes against
 * Decidir's developer portal before going to production.
 */

export interface DecidirCredentials {
  private_api_key: string;
  public_api_key: string;
  sandbox?: boolean;
}

export interface DecidirPaymentInput {
  token: string;               // from Decidir.js
  amount: number;              // in cents (centavos)
  currency?: string;           // default ARS
  installments: number;
  payment_method_id: number;   // e.g. 1=Visa, 6=MasterCard
  bin?: string;
  merchant_payment_id?: string;
  capture?: boolean;           // false = authorize only
}

export interface DecidirPaymentResult {
  id: number;
  site_transaction_id: string;
  payment_method_id: number;
  amount: number;
  currency: string;
  installments: number;
  status: 'approved' | 'pre_approved' | 'rejected' | 'cancelled' | 'refunded';
  status_details: {
    ticket: string;
    card_authorization_code: string;
    address_validation_code: string;
    error: { type: string; reason: { id: number; description: string; additional_description: string } } | null;
  };
  date: string;
  merchant_payment_id?: string;
}

export class DecidirConnector {
  private readonly baseUrl: string;
  private readonly credentials: DecidirCredentials;

  constructor(credentials: DecidirCredentials) {
    this.credentials = credentials;
    this.baseUrl = credentials.sandbox !== false
      ? 'https://developers.decidir.com/api/v2'
      : 'https://live.decidir.com/api/v2';
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.credentials.private_api_key,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as { message?: string; error?: string };
      throw new Error(`Decidir error ${response.status}: ${err.message ?? err.error ?? 'Unknown'}`);
    }

    return response.json() as Promise<T>;
  }

  async createPayment(input: DecidirPaymentInput): Promise<DecidirPaymentResult> {
    return this.request<DecidirPaymentResult>('POST', '/payments', {
      site_transaction_id: input.merchant_payment_id ?? `dc_${Date.now()}`,
      token: input.token,
      payment_method_id: input.payment_method_id,
      bin: input.bin,
      amount: input.amount,
      currency: input.currency ?? 'ARS',
      installments: input.installments,
      description: '',
      payment_type: 'single',
      ...(input.capture === false ? { capture: false } : {}),
    });
  }

  async authorizePayment(input: DecidirPaymentInput): Promise<DecidirPaymentResult> {
    return this.createPayment({ ...input, capture: false });
  }

  async capturePayment(paymentId: number, amount: number): Promise<DecidirPaymentResult> {
    return this.request<DecidirPaymentResult>('PUT', `/payments/${paymentId}`, { amount });
  }

  async refundPayment(paymentId: number, amount?: number): Promise<{ id: string; amount?: number; status: string }> {
    return this.request('POST', `/payments/${paymentId}/refunds`, { amount });
  }

  async cancelPayment(paymentId: number): Promise<{ id: number; status: string }> {
    return this.request('DELETE', `/payments/${paymentId}`);
  }

  async getPayment(paymentId: number): Promise<DecidirPaymentResult> {
    return this.request<DecidirPaymentResult>('GET', `/payments/${paymentId}`);
  }
}

export function createDecidirConnector(credentials: DecidirCredentials): DecidirConnector {
  return new DecidirConnector(credentials);
}
