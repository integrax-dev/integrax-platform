/**
 * AFIP WSFE Facade
 *
 * Wraps AfipWsfeConnector behind the stable ConnectorFacade interface.
 *
 * AFIP WSFE is a write-first fiscal service:
 * - execute('autorizar_comprobante', ...)  → authorize + get CAE  (create)
 * - execute('get_ultimo_comprobante', ...) → last authorized number (read)
 * - execute('get_puntos_venta', ...)       → list enabled POS (read)
 * - execute('get_cotizacion', ...)         → currency rate (read)
 *
 * getEntity/listEntities: AFIP WSFE has no "fetch invoice by id" REST endpoint.
 * FECompConsultar exists in the SOAP API but is NOT yet implemented in the connector.
 * Both methods throw with a clear message until the connector adds that operation.
 *
 * updateEntity: ALWAYS throws — CAE-authorized invoices are fiscally immutable.
 */

import type { ConnectorFacade } from '@integrax/connector-sdk';
import { AfipWsfeConnector } from '../src/index.js';
import type { AfipConfig } from '../src/types.js';

const ALLOWED_OPERATIONS = new Set([
  'autorizar_comprobante',
  'get_ultimo_comprobante',
  'get_puntos_venta',
  'get_cotizacion',
]);

class AfipWsfeFacade implements ConnectorFacade {
  private readonly connector: AfipWsfeConnector;
  private readonly tenantId: string;

  constructor(config: AfipConfig, tenantId: string) {
    this.connector = new AfipWsfeConnector(config);
    this.tenantId = tenantId;
  }

  async execute(operation: string, input: Record<string, unknown>): Promise<unknown> {
    if (!ALLOWED_OPERATIONS.has(operation)) {
      throw new Error(
        `AFIP WSFE: unknown operation '${operation}'. ` +
        `Valid operations: ${[...ALLOWED_OPERATIONS].join(', ')}`,
      );
    }
    const result = await this.connector.executeAction({
      actionId: operation,
      params: input,
      context: { correlationId: `facade-${Date.now()}`, tenantId: this.tenantId },
      credentials: {}, // AFIP uses cert-based auth configured at connector construction
    });
    if (!result.success) {
      throw new Error(result.error?.message ?? `AFIP WSFE action '${operation}' failed`);
    }
    return result.data;
  }

  async listEntities(entity: string, _params?: Record<string, unknown>): Promise<unknown[]> {
    // FECompConsultar (query by range) is not yet implemented in AfipWsfeConnector.
    // Implement connector.consultarComprobante() first, then expose it here.
    throw new Error(
      `AFIP WSFE: listEntities('${entity}') is not supported. ` +
      `Use execute('get_ultimo_comprobante', { puntoVenta, tipoComprobante }) ` +
      `to find the last authorized number and iterate via consultarComprobante (not yet implemented).`,
    );
  }

  async getEntity(entity: string, _id: string): Promise<unknown> {
    // FECompConsultar is the correct SOAP operation but is not implemented in the connector.
    // Do NOT use autorizar_comprobante here — that is a write operation (requests a new CAE).
    throw new Error(
      `AFIP WSFE: getEntity('${entity}') requires FECompConsultar which is not yet ` +
      `implemented in AfipWsfeConnector. Add consultarComprobante() to the connector first.`,
    );
  }

  async updateEntity(entity: string, _id: string, _patch: Record<string, unknown>): Promise<unknown> {
    throw new Error(
      `AFIP WSFE: ${entity} records are immutable once a CAE is issued. ` +
      `Issue a nota de crédito (CbteTipo 3/8/13) via execute('autorizar_comprobante', ...) to reverse.`,
    );
  }
}

export function createAfipWsfeFacade(config: AfipConfig, tenantId: string): ConnectorFacade {
  return new AfipWsfeFacade(config, tenantId);
}
