import type { ConnectorManifest } from '@integrax/connector-sdk';

const manifest = {
  service: 'contabilium',

  auth: { type: 'oauth2' as const },

  operations: {
    getCliente: true,
    listClientes: true,
    createCliente: true,
    updateCliente: true,
    getProducto: true,
    listProductos: true,
    createProducto: true,
    updateProducto: true,
    getComprobante: true,
    listComprobantes: true,
    createComprobante: true,
    getPago: true,
    listPagos: true,
  },

  entities: {
    customer: {
      source: 'clientes',
      identity: {
        primary: ['NumeroDocumento'],     // CUIT/CUIL — strongest identity signal
        fallback: ['RazonSocial', 'Email'],
      },
      fields: {
        externalId: 'Id',
        sku: 'NumeroDocumento',
        title: 'RazonSocial',            // RazonSocial = company name / customer name
        price: '',
        currency: '',
        stock: '',
        status: 'Activo',
        updatedAt: 'FechaModificacion',
      },
    },

    product: {
      source: 'productos',
      identity: {
        primary: ['Codigo'],             // product code / SKU
        fallback: ['Nombre', 'CodigoBarras'],
      },
      fields: {
        externalId: 'Id',
        sku: 'Codigo',
        title: 'Nombre',                 // Nombre = product name (NOT Descripcion)
        price: 'Precio',                 // Precio = sale price (NOT PrecioVenta)
        currency: '',                    // Contabilium uses tenant-level currency (ARS default)
        stock: 'Stock',
        status: 'Activo',
        updatedAt: 'FechaModificacion',
      },
    },

    invoice: {
      source: 'comprobantes',
      identity: {
        primary: ['NumeroComprobante', 'PuntoVenta'],
        fallback: ['ClienteNumeroDocumento', 'Total'],
      },
      fields: {
        externalId: 'Id',
        sku: 'NumeroComprobante',
        title: 'ClienteRazonSocial',
        price: 'Total',
        currency: 'Moneda',
        stock: '',
        status: 'Estado',
        updatedAt: 'Fecha',
      },
    },
  },

  drift: {
    endpoints: ['clientes', 'productos', 'comprobantes', 'pagos'],
  },

} satisfies ConnectorManifest;

export default manifest;
