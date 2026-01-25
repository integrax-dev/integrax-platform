import { z } from 'zod';
import {
  BaseConnector,
  type ConnectorSpec,
  type TestConnectionResult,
  type ResolvedCredentials,
  type ActionContext,
  HttpClient,
  createHttpClient,
  apiKeyHeader,
  NotFoundError,
} from '@integrax/connector-sdk';
import {
  MercadoPagoAuthSchema,
  MercadoPagoConfigSchema,
  GetPaymentInputSchema,
  SearchPaymentsInputSchema,
  RefundPaymentInputSchema,
  PaymentSchema,
  RefundSchema,
  type Payment,
  type GetPaymentInput,
  type SearchPaymentsInput,
  type RefundPaymentInput,
  type Refund,
} from './types.js';

const BASE_URL = 'https://api.mercadopago.com';

export class MercadoPagoConnector extends BaseConnector {
  private httpClient: HttpClient | null = null;

  getSpec(): ConnectorSpec {
    return {
      metadata: {
        id: 'mercadopago',
        name: 'Mercado Pago',
        description: 'Procesador de pagos líder en Latinoamérica',
        version: '1.0.0',
        category: 'payment',
        status: 'active',
        iconUrl: 'https://http2.mlstatic.com/frontend-assets/mp-web-navigation/ui-navigation/5.21.22/mercadopago/logo__large@2x.png',
        documentationUrl: 'https://www.mercadopago.com.ar/developers/es/docs',
        supportedRegions: ['AR', 'BR', 'MX', 'CL', 'CO', 'PE', 'UY'],
      },
      authType: 'api_key',
      authSchema: MercadoPagoAuthSchema,
      configSchema: MercadoPagoConfigSchema,
      actions: [
        {
          id: 'get_payment',
          name: 'Obtener pago',
          description: 'Obtiene los detalles de un pago por su ID',
          inputSchema: GetPaymentInputSchema,
          outputSchema: PaymentSchema,
          idempotent: true,
        },
        {
          id: 'search_payments',
          name: 'Buscar pagos',
          description: 'Busca pagos por diferentes criterios',
          inputSchema: SearchPaymentsInputSchema,
          outputSchema: z.object({
            results: z.array(PaymentSchema),
            paging: z.object({
              total: z.number(),
              offset: z.number(),
              limit: z.number(),
            }),
          }),
          idempotent: true,
        },
        {
          id: 'refund_payment',
          name: 'Reembolsar pago',
          description: 'Crea un reembolso total o parcial',
          inputSchema: RefundPaymentInputSchema,
          outputSchema: RefundSchema,
          idempotent: false,
        },
      ],
      triggers: [
        {
          id: 'payment_approved',
          name: 'Pago aprobado',
          description: 'Se dispara cuando un pago es aprobado',
          eventType: 'business.order.paid',
          payloadSchema: PaymentSchema,
        },
      ],
    };
  }

  protected registerActions(): void {
    this.registerAction<GetPaymentInput, Payment>(
      'get_payment',
      async (input, context) => this.getPayment(input, context)
    );

    this.registerAction<SearchPaymentsInput, { results: Payment[]; paging: { total: number; offset: number; limit: number } }>(
      'search_payments',
      async (input, context) => this.searchPayments(input, context)
    );

    this.registerAction<RefundPaymentInput, Refund>(
      'refund_payment',
      async (input, context) => this.refundPayment(input, context)
    );
  }

  async testConnection(
    credentials: ResolvedCredentials,
    config?: Record<string, unknown>
  ): Promise<TestConnectionResult> {
    const startTime = Date.now();

    try {
      const client = this.createClient(credentials);

      // Try to get user info to verify credentials
      const response = await client.get<{ id: number; email: string }>('/users/me');

      return {
        success: true,
        testedAt: new Date(),
        latencyMs: Date.now() - startTime,
        details: {
          accountInfo: {
            userId: response.data.id,
            email: response.data.email,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        testedAt: new Date(),
        latencyMs: Date.now() - startTime,
        error: {
          code: 'AUTH_FAILED',
          message: error instanceof Error ? error.message : 'Authentication failed',
        },
      };
    }
  }

  private async getPayment(input: GetPaymentInput, context: ActionContext): Promise<Payment> {
    const client = this.createClient(context.credentials);

    try {
      const response = await client.get<Payment>(`/v1/payments/${input.paymentId}`);
      return response.data;
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        throw new NotFoundError('Payment', String(input.paymentId));
      }
      throw error;
    }
  }

  private async searchPayments(
    input: SearchPaymentsInput,
    context: ActionContext
  ): Promise<{ results: Payment[]; paging: { total: number; offset: number; limit: number } }> {
    const client = this.createClient(context.credentials);

    const params: Record<string, string | number | undefined> = {
      limit: input.limit,
      offset: input.offset,
    };

    if (input.externalReference) {
      params.external_reference = input.externalReference;
    }
    if (input.status) {
      params.status = input.status;
    }
    if (input.dateFrom) {
      params['begin_date'] = input.dateFrom;
    }
    if (input.dateTo) {
      params['end_date'] = input.dateTo;
    }

    const response = await client.get<{
      results: Payment[];
      paging: { total: number; offset: number; limit: number };
    }>('/v1/payments/search', params);

    return response.data;
  }

  private async refundPayment(input: RefundPaymentInput, context: ActionContext): Promise<Refund> {
    const client = this.createClient(context.credentials);

    const body: Record<string, unknown> = {};
    if (input.amount !== undefined) {
      body.amount = input.amount;
    }

    const response = await client.post<Refund>(
      `/v1/payments/${input.paymentId}/refunds`,
      Object.keys(body).length > 0 ? body : undefined
    );

    return response.data;
  }

  private createClient(credentials: ResolvedCredentials): HttpClient {
    const accessToken = credentials.accessToken ?? credentials.access_token;

    if (!accessToken) {
      throw new Error('Missing access token');
    }

    return createHttpClient({
      baseUrl: BASE_URL,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: 30000,
      retries: 3,
    });
  }
}
