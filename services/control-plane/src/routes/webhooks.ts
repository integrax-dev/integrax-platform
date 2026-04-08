/**
 * Webhook ingestion routes
 *
 * POST /webhooks/:connectorId  — recibe webhooks de sistemas externos,
 * valida la firma y los encola en el event bus.
 *
 * La configuración de secreto/header se carga desde variables de entorno
 * con la convención:
 *   WEBHOOK_<CONNECTOR_ID_UPPER>_SECRET
 *   WEBHOOK_<CONNECTOR_ID_UPPER>_HEADER  (default: x-signature)
 */

import { Router } from 'express';
import { createWebhookMiddleware } from '@integrax/webhook-ingestion';
import { eventBus } from '../platform/container.js';

export const webhooksRouter = Router();

/**
 * Registra dinámicamente el middleware de un conector cuando se recibe
 * el primer webhook. El middleware valida la firma y encola el evento.
 *
 * Si no se encuentra configuración para el conector, responde 400.
 */
webhooksRouter.post('/:connectorId', (req, res, next) => {
  const { connectorId } = req.params;
  const envKey = connectorId.toUpperCase().replace(/-/g, '_');

  const secret = process.env[`WEBHOOK_${envKey}_SECRET`];
  if (!secret) {
    res.status(400).json({
      error: 'CONNECTOR_NOT_CONFIGURED',
      message: `No hay configuracion de webhook para el conector: ${connectorId}`,
    });
    return;
  }

  const signatureHeader =
    process.env[`WEBHOOK_${envKey}_HEADER`] ?? 'x-signature';

  const handler = createWebhookMiddleware(
    {
      connectorId,
      secret,
      signatureHeader,
      signatureAlgorithm: 'hmac-sha256',
    },
    eventBus,
    {
      getTenantId: r => {
        const h = r.headers['x-tenant-id'];
        return Array.isArray(h) ? h[0] : h;
      },
    },
  );

  handler(req, res, next);
});
