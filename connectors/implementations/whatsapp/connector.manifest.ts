import type { ConnectorManifest } from '@integrax/connector-sdk';

const manifest = {
  service: 'whatsapp',

  // Meta Cloud API: accessToken + phoneNumberId → api_key
  auth: { type: 'api_key' as const },

  operations: {
    sendMessage: true,
    sendTemplate: true,
    sendMedia: true,
    getTemplates: true,
    markAsRead: true,
  },

  // WhatsApp Business API is outbound messaging — no entities to reconcile.
  // Incoming messages are received via webhook (push), not polled.
  entities: {},

  drift: {
    // Graph API versioning is the only drift to watch
    endpoints: [],
  },

  hooks: {
    // Incoming messages + delivery statuses arrive via Meta webhook
    inbound: 'hooks/whatsapp-webhook.ts',
  },

} satisfies ConnectorManifest;

export default manifest;
