import type { ModuleHandlerDef } from './_types.js';
import { catalogService } from '../modules.js';
import type { PublishProductInput, UpdatePriceInput, ArchiveProductInput } from '@integrax/module-catalog';

export const moduleId = 'catalog';

export const handle: ModuleHandlerDef['handle'] = async (tenantId, action, payload) => {
  const p = payload as Record<string, unknown>;
  switch (action) {
    case 'create_record':
    case 'publish_record':
      return catalogService.publishProduct({ tenantId, ...(p as unknown as Omit<PublishProductInput, 'tenantId'>) });
    case 'update_record':
      return catalogService.updatePrice({ tenantId, ...(p as unknown as Omit<UpdatePriceInput, 'tenantId'>) });
    case 'archive_record':
      return catalogService.archiveProduct({ tenantId, ...(p as unknown as Omit<ArchiveProductInput, 'tenantId'>) });
    default:
      throw new Error(`catalog: unknown action '${action}'`);
  }
};
