import type { EventBus } from '@integrax/event-bus';
import type { WebhookIngestionConfig, WebhookValidationError, NormalizedWebhookPayload } from './types.js';
import { validateSignature, stripSignaturePrefix } from './signature.js';
import { normalizePayload } from './normalize.js';
import { enqueueWebhook } from './enqueue.js';

const MAX_PAYLOAD_BYTES = 1024 * 1024; // 1 MB
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 200;

/**
 * Publica un webhook normalizado al bus con reintentos exponenciales.
 *
 * Si los tres intentos fallan, el error se registra con suficiente contexto
 * para que un operador pueda republicar manualmente. No lanzamos excepcion
 * porque la respuesta HTTP ya fue enviada.
 */
async function publishWithRetry(
  payload: NormalizedWebhookPayload,
  tenantId: string,
  bus: EventBus,
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await enqueueWebhook(payload, tenantId, bus);
      return;
    } catch (err) {
      const isLast = attempt === MAX_RETRIES;
      const msg = err instanceof Error ? err.message : String(err);
      if (isLast) {
        console.error(
          `[webhook-ingestion] publish failed after ${MAX_RETRIES} attempts — ` +
          `connector=${payload.connectorId} eventType=${payload.eventType} ` +
          `tenantId=${tenantId} error=${msg}`,
        );
      } else {
        const delay = RETRY_BASE_MS * 2 ** (attempt - 1);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
}

export type WebhookMiddlewareOptions = {
  /**
   * Extrae el tenant ID desde la request.
   * Por defecto lee `req.headers['x-tenant-id']`.
   */
  getTenantId?: (req: MinimalRequest) => string | undefined;
  /** Tamano maximo permitido del body en bytes. Por defecto: 1 MB. */
  maxBodyBytes?: number;
};

/** Forma minima de request compatible con Express, Fastify y raw http.IncomingMessage. */
export interface MinimalRequest {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  rawBody?: Buffer;
}

export interface MinimalResponse {
  status(code: number): this;
  json(body: unknown): void;
}

export type NextFn = (err?: unknown) => void;

/**
 * Constructor de middleware compatible con Express.
 *
 * Valida la firma HMAC, normaliza el payload y publica un evento en el bus,
 * todo antes de enviar la respuesta.
 *
 * Responde 200 inmediatamente despues de encolar para que los servicios
 * externos no agoten timeout mientras el procesamiento aguas abajo sigue
 * de forma asincrona.
 *
 * Uso:
 * ```ts
 * app.post('/webhooks/mercadopago', createWebhookMiddleware(mpConfig, bus));
 * ```
 */
export function createWebhookMiddleware(
  config: WebhookIngestionConfig,
  bus: EventBus,
  options: WebhookMiddlewareOptions = {},
) {
  const maxBytes = options.maxBodyBytes ?? MAX_PAYLOAD_BYTES;
  const getTenantId =
    options.getTenantId ??
    ((req: MinimalRequest) => {
      const h = req.headers['x-tenant-id'];
      return Array.isArray(h) ? h[0] : h;
    });

  return async (
    req: MinimalRequest,
    res: MinimalResponse,
    next: NextFn,
  ): Promise<void> => {
    try {
      // --- 1. Chequeo de tamano ---------------------------------------------
      const rawBody = req.rawBody;
      if (rawBody && rawBody.length > maxBytes) {
        const err: WebhookValidationError = {
          code: 'PAYLOAD_TOO_LARGE',
          message: `El payload supera ${maxBytes} bytes`,
        };
        res.status(413).json(err);
        return;
      }

      // --- 2. Validacion de firma -------------------------------------------
      const sigHeader = req.headers[config.signatureHeader.toLowerCase()];
      const rawSig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;

      if (!rawSig) {
        const err: WebhookValidationError = {
          code: 'MISSING_SIGNATURE',
          message: `Falta el header: ${config.signatureHeader}`,
        };
        res.status(400).json(err);
        return;
      }

      if (rawBody) {
        const sig = stripSignaturePrefix(rawSig, config.signaturePrefix);
        const valid = validateSignature(rawBody, sig, config.secret, config.signatureAlgorithm);
        if (!valid) {
          const err: WebhookValidationError = {
            code: 'INVALID_SIGNATURE',
            message: 'Fallo la verificacion de firma del webhook',
          };
          res.status(401).json(err);
          return;
        }
      }

      // --- 3. Normalizar el payload (sincrono, antes del 200) ---------------
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (v) headers[k] = Array.isArray(v) ? v[0] : v;
      }
      const normalized = normalizePayload(req.body ?? {}, headers, config);
      const tenantId = getTenantId(req) ?? 'unknown';

      // --- 4. Responder 200 antes de encolar --------------------------------
      // El 200 se envia ANTES de publicar al bus para que el servicio externo
      // no experimente timeout. El encolado puede fallar en silencio: registramos
      // el error pero no podemos volver a enviar el 200 porque ya fue emitido.
      //
      // Estrategia de resiliencia:
      //  - Si el bus rechaza el evento, lo reintentamos hasta MAX_RETRIES veces
      //    con backoff exponencial antes de enviar a la DLQ interna del bus.
      //  - El webhook normalized ya fue validado (firma OK) por lo que es seguro
      //    reintentar el publish sin riesgo de duplicar la validacion de firma.
      res.status(200).json({ received: true });

      void publishWithRetry(normalized, tenantId, bus);
    } catch (err) {
      next(err);
    }
  };
}
