# @integrax/webhook-ingestion

Webhook signature validation, payload normalization, and event-bus enqueue for all incoming webhooks.

**Exports:** `validateSignature` (HMAC-SHA256/SHA1), `normalizePayload`, `enqueueWebhook`, `createWebhookMiddleware`, types: `SignatureAlgorithm`, `WebhookIngestionConfig`, `NormalizedWebhookPayload`.

**How it works:** `createWebhookMiddleware(config)` returns an Express middleware that validates the signature, normalizes the raw body into a `NormalizedWebhookPayload`, and enqueues it to the event-bus for downstream processing.

**Consumers:** `services/control-plane` (webhooks route `/api/webhooks`), connector tester files.
