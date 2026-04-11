/**
 * Fachada de WhatsApp
 *
 * Adaptador orientado al dominio sobre WhatsAppConnector.
 * Expone metodos de alto nivel para notificar estados, facturas y alertas,
 * ademas de utilidades de normalizacion de telefonos argentinos.
 *
 * Tambien implementa ConnectorFacade. Como WhatsApp es solo saliente,
 * listEntities devuelve vacio y get/update no aplican.
 */

import type { ConnectorFacade } from '@integrax/connector-sdk';
import { WhatsAppConnector } from '../src/index.js';
import type { WhatsAppConfig, SendMessageResponse } from '../src/types.js';

// Tipos de entrada orientados al dominio

export interface NotifyOrderStatusInput {
  /** Numero en cualquier formato local AR; se normaliza automaticamente */
  phone: string;
  orderId: string;
  status: string;
  customerName?: string;
  /** Linea extra opcional con contexto debajo del estado */
  detail?: string;
}

export interface NotifyInvoiceInput {
  phone: string;
  invoiceNumber: string;
  total: string;
  cae: string;
  caeExpiry: string;
  customerName?: string;
}

export interface SendAlertInput {
  phone: string;
  title: string;
  message: string;
  /** Nombre de plantilla a usar si existe en la cuenta de WhatsApp Business */
  templateName?: string;
  languageCode?: string;
}

// Fachada

class WhatsAppFacade implements ConnectorFacade {
  private readonly connector: WhatsAppConnector;

  constructor(config: WhatsAppConfig) {
    this.connector = new WhatsAppConnector(config);
  }

  // Implementacion de ConnectorFacade

  async execute(operation: string, input: Record<string, unknown>): Promise<unknown> {
    switch (operation) {
      case 'sendMessage':
        return this.connector.sendMessage(input as any);
      case 'sendText':
        return this.connector.sendText(
          String(input.to),
          String(input.text),
          Boolean(input.previewUrl ?? false),
        );
      case 'sendTemplate':
        return this.connector.sendTemplate(
          String(input.to),
          String(input.templateName),
          String(input.languageCode),
          input.parameters as Array<{ type: 'text'; text: string }> | undefined,
        );
      case 'sendImage':
        return this.connector.sendImage(
          String(input.to),
          String(input.imageUrl),
          input.caption ? String(input.caption) : undefined,
        );
      case 'sendDocument':
        return this.connector.sendDocument(
          String(input.to),
          String(input.documentUrl),
          input.filename ? String(input.filename) : undefined,
          input.caption ? String(input.caption) : undefined,
        );
      case 'listTemplates':
        return this.connector.listTemplates();
      default:
        throw new Error(
          `WhatsApp facade: operacion desconocida '${operation}'. ` +
          'Validas: sendMessage, sendText, sendTemplate, sendImage, sendDocument, listTemplates',
        );
    }
  }

  /** WhatsApp es solo saliente: no hay entidades para listar. */
  async listEntities(_entity: string, _params?: Record<string, unknown>): Promise<unknown[]> {
    return [];
  }

  /** WhatsApp es solo saliente: no hay entidades para obtener. */
  async getEntity(_entity: string, _id: string): Promise<unknown> {
    throw new Error('WhatsApp facade: getEntity no esta soportado porque WhatsApp es solo saliente.');
  }

  /** WhatsApp es solo saliente: no hay entidades para actualizar. */
  async updateEntity(_entity: string, _id: string, _patch: Record<string, unknown>): Promise<unknown> {
    throw new Error('WhatsApp facade: updateEntity no esta soportado porque WhatsApp es solo saliente.');
  }

  // Metodos de dominio

  /**
   * Envia una actualizacion de estado de pedido.
   * El telefono se normaliza automaticamente al formato de WhatsApp para AR.
   */
  async notifyOrderStatus(input: NotifyOrderStatusInput): Promise<SendMessageResponse> {
    const to = WhatsAppConnector.formatArgentinaPhone(input.phone);
    const greeting = input.customerName ? `Hola ${input.customerName},\n\n` : '';
    const detail = input.detail ? `\n${input.detail}` : '';
    const text = `${greeting}Tu pedido *${input.orderId}* cambio de estado: *${input.status}*${detail}`;
    return this.connector.sendText(to, text);
  }

  /**
   * Envia una notificacion de factura AFIP con datos de CAE.
   */
  async notifyInvoice(input: NotifyInvoiceInput): Promise<SendMessageResponse> {
    const to = WhatsAppConnector.formatArgentinaPhone(input.phone);
    const greeting = input.customerName ? `Hola ${input.customerName},\n\n` : '';
    const text =
      `${greeting}Tu factura electronica fue emitida:\n\n` +
      `Nro. Factura: ${input.invoiceNumber}\n` +
      `Total: $${input.total}\n` +
      `CAE: ${input.cae}\n` +
      `Vencimiento CAE: ${input.caeExpiry}\n\n` +
      'Este comprobante fue autorizado por AFIP.';
    return this.connector.sendText(to, text);
  }

  /**
   * Envia una alerta de plataforma por texto o plantilla.
   * Se usa para notificaciones como conflict.detected, invoice.failed o stock.diverged.
   */
  async sendAlert(input: SendAlertInput): Promise<SendMessageResponse> {
    const to = WhatsAppConnector.formatArgentinaPhone(input.phone);
    if (input.templateName) {
      return this.connector.sendTemplate(
        to,
        input.templateName,
        input.languageCode ?? 'es_AR',
        [{ type: 'text', text: input.message }],
      );
    }
    const text = `ALERTA: *${input.title}*\n\n${input.message}`;
    return this.connector.sendText(to, text);
  }

  /**
   * Lista las plantillas aprobadas en la cuenta de WhatsApp Business.
   */
  async listTemplates() {
    return this.connector.listTemplates();
  }

  /**
   * Normaliza un telefono argentino al formato de WhatsApp.
   * Se expone para quienes quieran validar antes de enviar.
   */
  static formatArgentinaPhone(phone: string): string {
    return WhatsAppConnector.formatArgentinaPhone(phone);
  }
}

export function createWhatsAppFacade(config: WhatsAppConfig): WhatsAppFacade {
  return new WhatsAppFacade(config);
}
