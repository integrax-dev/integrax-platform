/**
 * Decidir Facade
 *
 * Implements ConnectorFacade over DecidirConnector.
 * Supports full two-step auth+capture flow.
 */

import type { ConnectorFacade } from '@integrax/connector-sdk';
import { DecidirConnector } from '../src/index.js';

class DecidirFacade implements ConnectorFacade {
  private readonly connector: DecidirConnector;
  private readonly tenantId: string;

  constructor(credentials: Record<string, string>, tenantId: string) {
    this.connector = new DecidirConnector({
      private_api_key: credentials.private_api_key ?? '',
      public_api_key: credentials.public_api_key ?? '',
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
        return this.connector.capturePayment(
          Number(input.paymentId),
          input.amount as number,
        );
      case 'refund_payment':
        return this.connector.refundPayment(
          Number(input.paymentId),
          input.amount as number | undefined,
        );
      case 'cancel_payment':
        return this.connector.cancelPayment(Number(input.paymentId));
      case 'get_payment':
        return this.connector.getPayment(Number(input.paymentId));
      default:
        throw new Error(`Decidir: unsupported operation '${operation}'`);
    }
  }

  async listEntities(entity: string, _params: Record<string, unknown> = {}): Promise<unknown[]> {
    throw new Error(`Decidir: listEntities not supported for '${entity}'`);
  }

  async getEntity(entity: string, id: string): Promise<unknown> {
    if (entity === 'payment') return this.connector.getPayment(Number(id));
    throw new Error(`Decidir: getEntity not supported for '${entity}'`);
  }

  async updateEntity(_entity: string, _id: string, _patch: Record<string, unknown>): Promise<unknown> {
    throw new Error('Decidir: use execute(capture_payment) for two-step capture, or execute(refund_payment) for refunds.');
  }
}

export function createDecidirFacade(credentials: Record<string, string>, tenantId: string): ConnectorFacade {
  return new DecidirFacade(credentials, tenantId);
}
