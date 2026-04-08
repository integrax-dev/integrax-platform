import type { IntegraxEventType } from '@integrax/event-bus';

export type SignatureAlgorithm = 'hmac-sha256' | 'hmac-sha512';

export interface WebhookIngestionConfig {
  /** Identificador del conector o servicio, por ejemplo 'mercadopago' o 'contabilium'. */
  connectorId: string;
  /** Secreto HMAC compartido con el servicio externo. */
  secret: string;
  /** Nombre del header HTTP que contiene la firma, por ejemplo 'x-signature'. */
  signatureHeader: string;
  signatureAlgorithm: SignatureAlgorithm;
  /**
   * Prefijo opcional que el servicio externo antepone al digest hexadecimal.
   * Por ejemplo GitHub usa el prefijo 'sha256='. Dejar vacio si el header ya
   * trae el hex puro.
   */
  signaturePrefix?: string;
  /**
   * Tipo de entidad que se emite al recibir este webhook.
   * Se usa para poblar el campo `entityType` del evento.
   */
  entityType?: string;
  /**
   * Mapea eventos crudos del webhook a `IntegraxEventType`.
   * Si no se define, el valor por defecto es 'webhook.received'.
   */
  eventTypeMap?: Record<string, IntegraxEventType>;
}

export interface NormalizedWebhookPayload {
  connectorId: string;
  /** Cuerpo crudo ya parseado de la request. */
  raw: unknown;
  /** Headers HTTP en minuscula. */
  headers: Record<string, string>;
  /** Timestamp ISO del momento de recepcion del webhook. */
  receivedAt: string;
  /** Tipo de evento resuelto a partir de `eventTypeMap`. */
  eventType: IntegraxEventType;
  /** Tipo de entidad, si se puede determinar desde el payload. */
  entityType: string;
  /** ID externo de entidad si puede extraerse del payload crudo. */
  entityId?: string;
}

export interface WebhookValidationError {
  code: 'MISSING_SIGNATURE' | 'INVALID_SIGNATURE' | 'PAYLOAD_TOO_LARGE';
  message: string;
}
