import type { ModuleHandlerDef } from './_types.js';
import { ecommerceService } from '../modules.js';

export const moduleId = 'ecommerce';

export const handle: ModuleHandlerDef['handle'] = async (tenantId, action, payload) => {
  const p = payload as Record<string, unknown>;
  switch (action) {
    case 'ingest_catalog_item':
      return ecommerceService.ingestCatalogItem(
        tenantId,
        p['item'] as Parameters<typeof ecommerceService.ingestCatalogItem>[1],
      );
    case 'start_checkout':
      return ecommerceService.startCheckout(tenantId, p['cartId'] as string);
    case 'request_fulfillment':
      return ecommerceService.requestFulfillment(
        tenantId,
        p['request'] as Parameters<typeof ecommerceService.requestFulfillment>[1],
      );
    default:
      throw new Error(`ecommerce: unknown action '${action}'`);
  }
};
