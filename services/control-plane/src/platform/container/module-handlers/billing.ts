import type { ModuleHandlerDef } from './_types.js';
import { billingService } from '../modules.js';
import type { CreateInvoiceInput } from '@integrax/module-billing';

export const moduleId = 'billing';

export const handle: ModuleHandlerDef['handle'] = async (_tenantId, action, payload) => {
  if (action === 'create_invoice') return billingService.createInvoice(payload as CreateInvoiceInput);
  throw new Error(`billing: unknown action '${action}'`);
};
