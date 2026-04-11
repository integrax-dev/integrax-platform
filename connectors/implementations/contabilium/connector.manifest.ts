import type { ConnectorManifest } from '@integrax/connector-sdk';

const manifest = {
  service: 'contabilium',

  auth: { type: 'oauth2' as const },

  capabilities: ['read', 'write', 'polling'] as const,

  webhooks_supported: false,
  polling_supported: true,
  cursor_fields: ['FechaModificacion', 'Fecha'],
  entities_supported: ['customer', 'product', 'invoice'],

  operations: {
    getCliente: true,
    searchClientes: true,
    createCliente: true,
    updateCliente: true,
    getProducto: true,
    searchProductos: true,
    createProducto: true,
    updateProducto: true,
    getComprobante: true,
    searchComprobantes: true,
    createComprobante: true,
    facturarComprobante: true,
    anularComprobante: true,
    registrarPago: true,
    getPagosComprobante: true,
  },

  entities: {
    customer: {
      source: 'clientes',
      identity: {
        primary: ['NumeroDocumento'], // CUIT/CUIL: senal de identidad mas fuerte
        fallback: ['RazonSocial', 'Email'],
      },
      fields: {
        externalId: 'Id',
        sku: 'NumeroDocumento',
        title: 'RazonSocial', // nombre comercial o razon social del cliente
        price: '',
        currency: '',
        stock: '',
        status: 'Activo',
        updatedAt: 'FechaModificacion',
      },
    },

    product: {
      source: 'conceptos',
      identity: {
        primary: ['Codigo'], // codigo interno o SKU
        fallback: ['Nombre', 'CodigoBarras'],
      },
      fields: {
        externalId: 'Id',
        sku: 'Codigo',
        title: 'Nombre',
        price: 'Precio',
        currency: '', // la moneda suele ser a nivel tenant (ARS por defecto)
        stock: 'Stock',
        status: 'Activo',
        updatedAt: 'FechaModificacion',
      },
    },

    invoice: {
      source: 'comprobantes',
      identity: {
        primary: ['NumeroCompleto'],
        fallback: ['Cliente.NumeroDocumento', 'Total'],
      },
      fields: {
        externalId: 'Id',
        sku: 'NumeroCompleto',
        title: 'Cliente.RazonSocial',
        price: 'Total',
        currency: 'Moneda',
        stock: '',
        status: 'Estado',
        updatedAt: 'FechaModificacion',
      },
    },
  },

  drift: {
    endpoints: ['clientes', 'conceptos', 'comprobantes', 'pagos'],
  },
} satisfies ConnectorManifest;

export default manifest;
