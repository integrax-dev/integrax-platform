import type { ModuleHandlerDef } from './_types.js';
import { ordersService } from '../modules.js';
import type { CreateOrderInput, UpdateOrderStatusInput, CancelOrderInput } from '@integrax/module-orders';

export const moduleId = 'orders';

export const handle: ModuleHandlerDef['handle'] = async (tenantId, action, payload) => {
  const p = payload as Record<string, unknown>;
  switch (action) {
    case 'update_record':
      return ordersService.updateStatus({ tenantId, ...(p as unknown as Omit<UpdateOrderStatusInput, 'tenantId'>) });
    case 'sync_record':
      return ordersService.createOrder({ tenantId, ...(p as unknown as Omit<CreateOrderInput, 'tenantId'>) });
    default:
      throw new Error(`orders: unknown action '${action}'`);
  }
};
