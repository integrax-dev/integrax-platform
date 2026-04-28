export interface ConnectorSeed {
  id: string;
  name: string;
  category: 'payment' | 'accounting' | 'erp' | 'ecommerce' | 'crm' | 'communication' | 'tax';
  country?: string;   // ISO 3166-1 alpha-2
  trustScore: number; // 0..1 initial trust score
}

export const CONNECTOR_SEEDS: ConnectorSeed[] = [
  // Payment processors
  { id: 'mercadopago',  name: 'MercadoPago',  category: 'payment',    country: 'AR', trustScore: 0.75 },
  { id: 'payway',       name: 'PayWay',       category: 'payment',    country: 'AR', trustScore: 0.70 },
  { id: 'mobbex',       name: 'Mobbex',       category: 'payment',    country: 'AR', trustScore: 0.68 },
  { id: 'decidir',      name: 'Decidir',      category: 'payment',    country: 'AR', trustScore: 0.70 },
  { id: 'stripe',       name: 'Stripe',       category: 'payment',              trustScore: 0.85 },
  { id: 'paypal',       name: 'PayPal',       category: 'payment',              trustScore: 0.82 },

  // Accounting / ERP
  { id: 'contabilium',  name: 'Contabilium',  category: 'accounting', country: 'AR', trustScore: 0.80 },
  { id: 'tango-gestion',name: 'Tango Gestión',category: 'erp',        country: 'AR', trustScore: 0.78 },
  { id: 'xero',         name: 'Xero',         category: 'accounting',           trustScore: 0.80 },
  { id: 'quickbooks',   name: 'QuickBooks',   category: 'accounting',           trustScore: 0.82 },

  // Tax authority
  { id: 'afip-wsfe',    name: 'AFIP WSFE',    category: 'tax',        country: 'AR', trustScore: 0.95 },

  // E-commerce
  { id: 'tiendanube',   name: 'Tiendanube',   category: 'ecommerce',  country: 'AR', trustScore: 0.75 },
  { id: 'mercadolibre', name: 'MercadoLibre', category: 'ecommerce',  country: 'AR', trustScore: 0.80 },
  { id: 'shopify',      name: 'Shopify',      category: 'ecommerce',            trustScore: 0.85 },
  { id: 'woocommerce',  name: 'WooCommerce',  category: 'ecommerce',            trustScore: 0.75 },

  // Communication
  { id: 'google-sheets',name: 'Google Sheets',category: 'communication',        trustScore: 0.70 },
  { id: 'whatsapp',     name: 'WhatsApp',     category: 'communication',        trustScore: 0.72 },
  { id: 'email',        name: 'Email (SMTP)', category: 'communication',        trustScore: 0.65 },
];
