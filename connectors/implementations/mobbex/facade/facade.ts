/**
 * Mobbex Facade
 *
 * Implements ConnectorFacade over MobbexConnector.
 * Mobbex's primary create flow is checkout-based (returns a URL).
 */

import type { ConnectorFacade } from '@integrax/connector-sdk';
import { MobbexConnector } from '../src/index.js';

class MobbexFacade implements ConnectorFacade {
  private readonly connector: MobbexConnector;
  private readonly tenantId: string;

  constructor(credentials: Record<string, string>, tenantId: string) {
    this.connector = new MobbexConnector({
      api_key: credentials.api_key ?? '',
      access_token: credentials.access_token ?? '',
    });
    this.tenantId = tenantId;
  }

  async execute(operation: string, input: Record<string, unknown>): Promise<unknown> {
    switch (operation) {
      case 'create_checkout_link':
      case 'create_payment':
        // Mobbex's create flow returns a hosted checkout URL
        return this.connector.createCheckout(input as any);
      case 'refund_payment':
        return this.connector.refundPayment(input.paymentId as string, input.amount as number | undefined);
      case 'cancel_payment':
        return this.connector.cancelPayment(input.paymentId as string);
      case 'create_subscription':
        return this.connector.createSubscription(input as any);
      case 'cancel_subscription':
        return this.connector.cancelSubscription(input.subscriptionId as string);
      case 'get_payment':
        return this.connector.getPayment(input.paymentId as string);
      default:
        throw new Error(`Mobbex: unsupported operation '${operation}'`);
    }
  }

  async listEntities(entity: string, _params: Record<string, unknown> = {}): Promise<unknown[]> {
    throw new Error(`Mobbex: listEntities not supported for '${entity}'`);
  }

  async getEntity(entity: string, id: string): Promise<unknown> {
    if (entity === 'payment') return this.connector.getPayment(id);
    throw new Error(`Mobbex: getEntity not supported for '${entity}'`);
  }

  async updateEntity(_entity: string, _id: string, _patch: Record<string, unknown>): Promise<unknown> {
    throw new Error('Mobbex: entities are immutable after creation. Use execute(refund_payment) or execute(cancel_payment).');
  }
}

export function createMobbexFacade(credentials: Record<string, string>, tenantId: string): ConnectorFacade {
  return new MobbexFacade(credentials, tenantId);
}
