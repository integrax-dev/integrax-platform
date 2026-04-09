/**
 * Payway Facade
 *
 * Implements ConnectorFacade over PaywayConnector.
 * Exposes payment operations through the standard execute() interface.
 */

import type { ConnectorFacade } from '@integrax/connector-sdk';
import { PaywayConnector } from '../src/index.js';

class PaywayFacade implements ConnectorFacade {
  private readonly connector: PaywayConnector;
  private readonly tenantId: string;

  constructor(credentials: Record<string, string>, tenantId: string) {
    this.connector = new PaywayConnector({
      site_id: credentials.site_id ?? '',
      api_key: credentials.api_key ?? '',
      public_key: credentials.public_key ?? '',
      sandbox: credentials.sandbox !== 'false',
    });
    this.tenantId = tenantId;
  }

  async execute(operation: string, input: Record<string, unknown>): Promise<unknown> {
    switch (operation) {
      case 'create_payment':
        return this.connector.createPayment(input as any);
      case 'authorize_payment':
        return this.connector.authorizePayment(input as any);
      case 'capture_payment':
        return this.connector.capturePayment(input.paymentId as string, input.amount as number | undefined);
      case 'refund_payment':
        return this.connector.refundPayment(input.paymentId as string, input.amount as number | undefined);
      case 'cancel_payment':
        return this.connector.cancelPayment(input.paymentId as string);
      case 'get_payment':
        return this.connector.getPayment(input.paymentId as string);
      default:
        throw new Error(`Payway: unsupported operation '${operation}'`);
    }
  }

  async listEntities(entity: string, params: Record<string, unknown> = {}): Promise<unknown[]> {
    // Payway does not have a list endpoint — return empty and let polling/webhooks feed snapshots
    throw new Error(`Payway: listEntities not supported for '${entity}'`);
  }

  async getEntity(entity: string, id: string): Promise<unknown> {
    if (entity === 'payment') return this.connector.getPayment(id);
    throw new Error(`Payway: getEntity not supported for '${entity}'`);
  }

  async updateEntity(_entity: string, _id: string, _patch: Record<string, unknown>): Promise<unknown> {
    throw new Error('Payway: payment entities are immutable. Use execute(refund_payment) or execute(capture_payment).');
  }
}

export function createPaywayFacade(credentials: Record<string, string>, tenantId: string): ConnectorFacade {
  return new PaywayFacade(credentials, tenantId);
}
