import type { ExternalId } from './external-id.js';

export interface Stock {
  id?: string;
  externalIds: ExternalId[];
  sku: string;
  quantity: number;
  reservedQuantity?: number;
  /** Identificador de ubicacion fisica o virtual. */
  locationId?: string;
  locationName?: string;
  sourceSystem: string;
  updatedAt: Date;
}
