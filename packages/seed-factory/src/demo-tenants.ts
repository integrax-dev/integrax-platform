export interface DemoTenantSeed {
  id: string;
  name: string;
  plan: 'starter' | 'professional' | 'enterprise';
  country: string;
  connectorIds: string[];
  behaviorProfileId: string;
}

export const DEMO_TENANT_SEEDS: DemoTenantSeed[] = [
  {
    id: 'ten_demo_ecommerce_ar',
    name: 'Demo E-commerce AR',
    plan: 'professional',
    country: 'AR',
    connectorIds: ['mercadopago', 'tiendanube', 'contabilium', 'afip-wsfe'],
    behaviorProfileId: 'regulatory_ar',
  },
  {
    id: 'ten_demo_marketplace',
    name: 'Demo Marketplace',
    plan: 'enterprise',
    country: 'AR',
    connectorIds: ['mercadopago', 'payway', 'mobbex', 'mercadolibre', 'contabilium'],
    behaviorProfileId: 'marketplace_strict',
  },
  {
    id: 'ten_demo_saas',
    name: 'Demo SaaS',
    plan: 'starter',
    country: 'AR',
    connectorIds: ['stripe', 'xero'],
    behaviorProfileId: 'accounting_locked',
  },
];
