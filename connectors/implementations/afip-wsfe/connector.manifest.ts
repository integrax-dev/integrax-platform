import type { ConnectorManifest } from '@integrax/connector-sdk';

const manifest = {
  service: 'afip-wsfe',

  auth: { type: 'custom' as const }, // Certificado WSAA + clave privada

  // AFIP WSFE es un servicio SOAP sincrono de ida y vuelta.
  // No hay webhooks ni paginacion: cada llamada devuelve un unico resultado de autorizacion.
  capabilities: ['write', 'fiscal'] as const,

  webhooks_supported: false,
  polling_supported: false,
  cursor_fields: [],
  entities_supported: ['invoice'],

  operations: {
    autorizar_comprobante: true,
    get_ultimo_comprobante: true,
    get_puntos_venta: true,
    get_cotizacion: true,
  },

  entities: {
    invoice: {
      source: 'comprobantes',
      identity: {
        // Las facturas AFIP son inmutables una vez autorizadas: CAE + comprobante es la identidad util.
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
    // AFIP WSFE es SOAP: no hay endpoints REST para vigilar.
    // El drift se sigue a nivel de version del WSDL.
    endpoints: ['wsfev1'],
  },
} satisfies ConnectorManifest;

export default manifest;
