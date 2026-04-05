import type { ConnectorManifest } from '@integrax/connector-sdk';

const manifest = {
  service: 'afip-wsfe',

  auth: { type: 'custom' as const },    // WSAA certificate + private key

  operations: {
    autorizarComprobante: true,
    consultarUltimoComprobante: true,
    consultarComprobante: true,
    verificarServicio: true,
  },

  entities: {
    invoice: {
      source: 'comprobantes',
      identity: {
        // AFIP invoices are immutable once authorized — CAE + CUIT is the canonical identity
        primary: ['CbteDesde', 'PtoVta', 'CbteTipo'],
        fallback: ['DocNro', 'ImpTotal'],
      },
      fields: {
        externalId: 'CAE',
        sku: 'CbteDesde',
        title: 'DocNro',
        price: 'ImpTotal',
        currency: 'MonId',
        stock: '',
        status: 'Resultado',
        updatedAt: 'CbteFch',
      },
    },
  },

  drift: {
    // AFIP WSFE is a SOAP service — no REST endpoints to watch
    // Drift monitoring covers the WSDL version only
    endpoints: ['wsfev1'],
  },

} satisfies ConnectorManifest;

export default manifest;
