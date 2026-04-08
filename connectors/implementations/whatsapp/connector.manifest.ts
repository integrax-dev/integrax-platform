import type { ConnectorManifest } from '@integrax/connector-sdk';

const manifest = {
  service: 'whatsapp',

  // Meta Cloud API: accessToken + phoneNumberId se modela como api_key.
  auth: { type: 'api_key' as const },

  // Mensajeria saliente e ingreso de mensajes por webhook de Meta.
  // No hay reconciliacion de entidades: los mensajes se envian y despachan.
  capabilities: ['notification', 'webhook_inbound'] as const,

  webhooks_supported: true, // Meta empuja mensajes entrantes y estados de entrega
  polling_supported: false,
  cursor_fields: [],
  entities_supported: [],

  operations: {
    sendMessage: true,
    sendText: true,
    sendTemplate: true,
    sendImage: true,
    sendDocument: true,
    listTemplates: true,
  },

  // La API de WhatsApp Business se usa como canal de mensajeria, no como fuente de entidades.
  // Los mensajes entrantes llegan por webhook, no por polling.
  entities: {},

  drift: {
    // Solo interesa vigilar cambios de versionado en Graph API.
    endpoints: [],
  },
} satisfies ConnectorManifest;

export default manifest;
