import type { Order, OrderStatus } from '@integrax/entities';

// --- Comandos ---------------------------------------------------------------

export interface CreateOrderInput {
  tenantId: string;
  sourceSystem: string;
  order: Omit<Order, 'id' | 'updatedAt' | 'createdAt'>;
}

export interface UpdateOrderStatusInput {
  tenantId: string;
  canonicalId: string;
  sourceSystem: string;
  newStatus: OrderStatus;
  reason?: string;
}

export interface CancelOrderInput {
  tenantId: string;
  canonicalId: string;
  sourceSystem: string;
  reason?: string;
}

// --- Consultas --------------------------------------------------------------

export interface GetOrderInput {
  tenantId: string;
  canonicalId: string;
}

export interface ListOrdersInput {
  tenantId: string;
  status?: OrderStatus;
  sourceSystem?: string;
  since?: Date;
  limit?: number;
}

// --- Interfaz del modulo ----------------------------------------------------

export interface OrdersModule {
  createOrder(input: CreateOrderInput): Promise<Order & { id: string }>;
  updateStatus(input: UpdateOrderStatusInput): Promise<void>;
  cancelOrder(input: CancelOrderInput): Promise<void>;
  getOrder(input: GetOrderInput): Promise<Order | null>;
  listOrders(input: ListOrdersInput): Promise<Order[]>;
}
