import { createMedusaAdapter } from '@integrax/module-ecommerce';
import { registerModuleTester } from '../../module-tester-registry.js';

registerModuleTester('ecommerce', async (config) => {
  const adapter = createMedusaAdapter({
    medusaBaseUrl: config['medusaBaseUrl'] ?? '',
    medusaAdminApiKey: config['medusaAdminApiKey'] ?? '',
    tenantId: 'test',
  });

  if (!adapter) return { connected: false, error: 'Invalid Medusa configuration' };

  try {
    await adapter.listProducts({ limit: 1 });
    return { connected: true };
  } catch (err) {
    return { connected: false, error: err instanceof Error ? err.message : String(err) };
  }
});
