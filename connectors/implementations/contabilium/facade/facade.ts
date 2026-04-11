/**
 * Contabilium Facade
 *
 * Wraps ContabiliumConnector behind the stable ConnectorFacade interface.
 *
 * execute() validates the operation name against an explicit whitelist derived from
 * the connector manifest — callers cannot reach private methods like authenticate().
 *
 * Invoices (comprobantes) are fiscally immutable once authorized — updateEntity throws.
 */

import type { ConnectorFacade } from '@integrax/connector-sdk';
import { ContabiliumConnector, type ContabiliumConfig } from '../src/index.js';

// ─── Whitelists ────────────────────────────────────────────────────────────────
// Explicit sets — adding a new operation requires a conscious decision here.

const ALLOWED_OPERATIONS = new Set([
  'getCliente', 'searchClientes', 'createCliente', 'updateCliente',
  'getProducto', 'searchProductos', 'createProducto', 'updateProducto',
  'getComprobante', 'searchComprobantes', 'createComprobante',
  'facturarComprobante', 'anularComprobante',
  'registrarPago', 'getPagosComprobante',
]);

const ENTITY_LIST_METHOD: Record<string, keyof ContabiliumConnector> = {
  customer: 'searchClientes',
  product:  'searchProductos',
  invoice:  'searchComprobantes',
};

const ENTITY_GET_METHOD: Record<string, keyof ContabiliumConnector> = {
  customer: 'getCliente',
  product:  'getProducto',
  invoice:  'getComprobante',
};

const ENTITY_UPDATE_METHOD: Record<string, keyof ContabiliumConnector> = {
  customer: 'updateCliente',
  product:  'updateProducto',
  // invoice intentionally absent — fiscal immutability
};

// ─── Facade ────────────────────────────────────────────────────────────────────

class ContabiliumFacade implements ConnectorFacade {
  private readonly connector: ContabiliumConnector;

  constructor(config: ContabiliumConfig) {
    this.connector = new ContabiliumConnector(config);
  }

  async execute(operation: string, input: Record<string, unknown>): Promise<unknown> {
    if (!ALLOWED_OPERATIONS.has(operation)) {
      throw new Error(
        `Contabilium: unknown or disallowed operation '${operation}'. ` +
        `Valid operations: ${[...ALLOWED_OPERATIONS].join(', ')}`,
      );
    }
    const fn = this.connector[operation as keyof ContabiliumConnector];
    if (typeof fn !== 'function') {
      throw new Error(`Contabilium: operation '${operation}' is not callable`);
    }
    return (fn as Function).call(this.connector, input);
  }

  async listEntities(entity: string, params: Record<string, unknown> = {}): Promise<unknown[]> {
    const method = ENTITY_LIST_METHOD[entity];
    if (!method) {
      throw new Error(
        `Contabilium: listEntities — unsupported entity '${entity}'. ` +
        `Supported: ${Object.keys(ENTITY_LIST_METHOD).join(', ')}`,
      );
    }
    const result = await (this.connector[method] as Function).call(
      this.connector,
      params.query as string | undefined,
      params.page as number | undefined,
      params.pageSize as number | undefined,
    ) as { Items: unknown[] };
    return result.Items ?? [];
  }

  async getEntity(entity: string, id: string): Promise<unknown> {
    const method = ENTITY_GET_METHOD[entity];
    if (!method) {
      throw new Error(
        `Contabilium: getEntity — unsupported entity '${entity}'. ` +
        `Supported: ${Object.keys(ENTITY_GET_METHOD).join(', ')}`,
      );
    }
    return (this.connector[method] as Function).call(this.connector, Number(id));
  }

  async updateEntity(entity: string, id: string, patch: Record<string, unknown>): Promise<unknown> {
    if (entity === 'invoice') {
      throw new Error(
        'Contabilium: invoices are fiscally immutable after AFIP authorization. ' +
        "Use execute('anularComprobante', { id, motivo }) to void, or issue a nota de crédito.",
      );
    }
    const method = ENTITY_UPDATE_METHOD[entity];
    if (!method) {
      throw new Error(
        `Contabilium: updateEntity — unsupported entity '${entity}'. ` +
        `Supported: ${Object.keys(ENTITY_UPDATE_METHOD).join(', ')}`,
      );
    }
    return (this.connector[method] as Function).call(this.connector, Number(id), patch);
  }
}

export function createContabiliumFacade(config: ContabiliumConfig): ConnectorFacade {
  return new ContabiliumFacade(config);
}
