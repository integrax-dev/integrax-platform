import type { ExternalId } from './external-id.js';

export type ShipmentStatus =
  | 'pending'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed'
  | 'returned';

export interface Shipment {
  id?: string;
  externalIds: ExternalId[];
  trackingId?: string;
  carrier?: string;
  status: ShipmentStatus;
  /** IDs externos de pedidos que este envio satisface. */
  orderIds?: string[];
  originAddress?: string;
  destinationAddress?: string;
  estimatedDelivery?: Date;
  deliveredAt?: Date;
  sourceSystem: string;
  updatedAt: Date;
}
