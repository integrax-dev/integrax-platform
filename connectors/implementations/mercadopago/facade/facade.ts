/**
 * MercadoPago Facade
 *
 * Wraps MercadoPagoConnector behind the stable ConnectorFacade interface.
 * Payments in MercadoPago are immutable — updateEntity always throws.
 * Refunds are issued via execute('refund_payment', ...).
 */

import type { ConnectorFacade } from '@integrax/connector-sdk';
import { MercadoPagoConnector } from '../src/connector.js';

class MercadoPagoFacade implements ConnectorFacade {
  private readonly connector: MercadoPagoConnector;
  private readonly credentials: Record<string, string>;
  private readonly tenantId: string;

  constructor(credentials: Record<string, string>, tenantId: string) {
    this.connector = new MercadoPagoConnector();
    this.credentials = credentials;
    this.tenantId = tenantId;
  }

  async execute(operation: string, input: Record<string, unknown>): Promise<unknown> {
    const result = await this.connector.executeAction({
      actionId: operation,
      params: input,
      context: { correlationId: `facade-${Date.now()}`, tenantId: this.tenantId },
      credentials: this.credentials,
    });
    if (!result.success) {
      throw new Error(result.error?.message ?? `MercadoPago action '${operation}' failed`);
    }
    return result.data;
  }

  async listEntities(entity: string, params: Record<string, unknown> = {}): Promise<unknown[]> {
    if (entity === 'payment') {
      const result = await this.execute('search_payments', params) as { results?: unknown[] };
      return result.results ?? [];
    }
    if (entity === 'order') {
      const result = await this.execute('search_orders', params) as { elements?: unknown[] };
      return result.elements ?? [];
    }
    throw new Error(`MercadoPago: listEntities — unsupported entity '${entity}'`);
  }

  async getEntity(entity: string, id: string): Promise<unknown> {
    if (entity === 'payment') {
      return this.execute('get_payment', { paymentId: Number(id) });
    }
    throw new Error(`MercadoPago: getEntity — unsupported entity '${entity}'`);
  }

  async updateEntity(entity: string, _id: string, _patch: Record<string, unknown>): Promise<unknown> {
    throw new Error(
      `MercadoPago: ${entity} entities are immutable. ` +
      `Use execute('refund_payment', { paymentId, amount? }) to issue a refund.`,
    );
  }
}

export function createMercadoPagoFacade(
  credentials: Record<string, string>,
  tenantId: string,
): ConnectorFacade {
  return new MercadoPagoFacade(credentials, tenantId);
}
