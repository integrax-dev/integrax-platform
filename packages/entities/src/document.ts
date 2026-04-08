import type { ExternalId } from './external-id.js';

/** Documento generico de referencia: ordenes de compra, contratos, recibos, etc. */
export interface Document {
  id?: string;
  externalIds: ExternalId[];
  /** Cadena con el tipo de documento definido por el conector. */
  documentType: string;
  title?: string;
  content?: string;
  mimeType?: string;
  /** URL o ruta al archivo real si se almacena por fuera de la plataforma. */
  fileUrl?: string;
  /** IDs de entidades relacionadas (orderId, invoiceId, etc.). */
  relatedEntityIds?: { type: string; id: string }[];
  sourceSystem: string;
  issuedAt?: Date;
  updatedAt: Date;
}
