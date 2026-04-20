# @integrax/connector-whatsapp

Connector for WhatsApp Business Cloud API. Sends text messages, templates, media, and interactive messages. Validates incoming webhook signatures.

**Auth:** `phoneNumberId` + `accessToken` (Meta Graph API).

**Actions:** send text message, send template message, send media, send interactive (buttons/list), mark as read.

**Webhooks:** `validateWhatsAppSignature` using HMAC-SHA256 + `appSecret`.

**Dependencies:** `@integrax/connector-sdk`.

**Consumers:** `services/control-plane` tester registry, notification workflows.
