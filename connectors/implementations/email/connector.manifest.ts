import type { ConnectorManifest } from '@integrax/connector-sdk';

const manifest = {
  service: 'email',

  // SMTP basic auth (user + pass) or provider API key via apiKey field
  auth: { type: 'basic' as const },

  operations: {
    sendEmail: true,
    sendTemplateEmail: true,
    sendBulkEmail: true,
    verifyConnection: true,
  },

  // Email is outbound-only — no entities to reconcile.
  // Messages are fire-and-forget: there is no get/list/update.
  entities: {},

  drift: {
    // No REST endpoints to watch; delivery status comes via webhooks from providers
    endpoints: [],
  },

} satisfies ConnectorManifest;

export default manifest;
