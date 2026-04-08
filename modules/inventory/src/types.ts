import type { Stock } from '@integrax/entities';

export interface UpdateStockInput {
  tenantId: string;
  sourceSystem: string;
  sku: string;
  canonicalId?: string;
  quantity: number;
  locationId?: string;
}

export interface ReserveStockInput {
  tenantId: string;
  sourceSystem: string;
  sku: string;
  canonicalId?: string;
  quantity: number;
  /** Referencia al pedido o transaccion que reserva este stock. */
  referenceId: string;
}

export interface ReleaseReservationInput {
  tenantId: string;
  sourceSystem: string;
  sku: string;
  canonicalId?: string;
  referenceId: string;
}

export interface StockDivergence {
  sku: string;
  canonicalId?: string;
  systems: Array<{ system: string; quantity: number }>;
  maxDelta: number;
}

export interface InventoryModule {
  updateStock(input: UpdateStockInput): Promise<Stock & { id: string }>;
  reserveStock(input: ReserveStockInput): Promise<void>;
  releaseReservation(input: ReleaseReservationInput): Promise<void>;
  getStock(tenantId: string, sku: string, sourceSystem?: string): Promise<Stock | null>;
  /** Devuelve todos los SKUs cuyo stock diverge entre sistemas origen. */
  findDivergences(tenantId: string): Promise<StockDivergence[]>;
}
