import type { ModuleHandlerDef } from './_types.js';
import { inventoryService } from '../modules.js';
import type { UpdateStockInput } from '@integrax/module-inventory';

export const moduleId = 'inventory';

export const handle: ModuleHandlerDef['handle'] = async (_tenantId, action, payload) => {
  if (action === 'update_stock') return inventoryService.updateStock(payload as UpdateStockInput);
  throw new Error(`inventory: unknown action '${action}'`);
};
