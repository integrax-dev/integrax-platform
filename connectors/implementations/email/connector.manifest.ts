import type { ConnectorManifest } from '@integrax/connector-sdk';

const manifest = {
  service: 'email',

  // El conector acepta configuracion SMTP y opciones de proveedor, no solo user/pass.
  auth: { type: 'custom' as const },

  // Canal de notificacion solo saliente: no lee entidades, no hace polling y no recibe webhooks.
  // Los webhooks de entrega dependen de cada proveedor y se manejan por separado.
  capabilities: ['notification'] as const,

  webhooks_supported: false,
  polling_supported: false,
  cursor_fields: [],
  entities_supported: [],

  operations: {
    sendEmail: true,
    sendTemplateEmail: true,
    sendBulkEmail: true,
    verifyConnection: true,
  },

  // Email es solo saliente: no hay entidades para reconciliar.
  // Los mensajes se envian y despachan: no existe get/list/update.
  entities: {},

  drift: {
    // No hay endpoints REST para vigilar; el estado de entrega llega por webhooks del proveedor.
    endpoints: [],
  },
} satisfies ConnectorManifest;

export default manifest;
