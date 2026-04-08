/**
 * Fachada de Email
 *
 * Adaptador orientado al dominio sobre EmailConnector.
 * Expone metodos de alto nivel para factura, recordatorio de pago
 * y notificaciones, en lugar de depender de acciones SMTP de bajo nivel.
 *
 * Tambien implementa ConnectorFacade para los flujos genericos de la plataforma.
 * Como Email es solo saliente, listEntities devuelve vacio y get/update no aplican.
 */

import type { ConnectorFacade } from '@integrax/connector-sdk';
import { EmailConnector } from '../src/index.js';
import type { EmailRecipient, SendEmailResult } from '../src/types.js';

// Tipos de entrada orientados al dominio

export interface SendInvoiceEmailInput {
  from: EmailRecipient;
  to: EmailRecipient;
  numeroFactura: string;
  fechaEmision: string;
  cae: string;
  fechaVencimientoCae: string;
  total: string;
  clienteNombre: string;
  empresaNombre: string;
  linkPdf?: string;
  pdfAttachment?: Buffer;
}

export interface SendPaymentReminderInput {
  from: EmailRecipient;
  to: EmailRecipient;
  numeroFactura: string;
  fechaVencimiento: string;
  montoAdeudado: string;
  clienteNombre: string;
  diasVencido?: number;
}

export interface SendNotificationInput {
  from: EmailRecipient;
  to: EmailRecipient | EmailRecipient[];
  subject: string;
  text?: string;
  html?: string;
}

// Fachada

class EmailFacade implements ConnectorFacade {
  private readonly connector: EmailConnector;
  private connected = false;
  private readonly credentials: Record<string, string>;

  constructor(credentials: Record<string, string>) {
    this.credentials = credentials;
    this.connector = new EmailConnector();
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      await this.connector.connect(this.credentials);
      this.connected = true;
    }
  }

  // Implementacion de ConnectorFacade

  async execute(operation: string, input: Record<string, unknown>): Promise<unknown> {
    await this.ensureConnected();
    switch (operation) {
      case 'sendEmail':
        return this.connector.sendEmail(input as any);
      case 'sendTemplateEmail':
        return this.connector.sendTemplateEmail(input as any);
      case 'sendBulkEmail':
        return this.connector.sendBulkEmail(input as any);
      case 'verifyConnection':
        return this.connector.verifyConnection();
      default:
        throw new Error(
          `Email facade: operacion desconocida '${operation}'. ` +
          'Validas: sendEmail, sendTemplateEmail, sendBulkEmail, verifyConnection',
        );
    }
  }

  /** Email es solo saliente: no hay entidades para listar. */
  async listEntities(_entity: string, _params?: Record<string, unknown>): Promise<unknown[]> {
    return [];
  }

  /** Email es solo saliente: no hay entidades para obtener. */
  async getEntity(_entity: string, _id: string): Promise<unknown> {
    throw new Error('Email facade: getEntity no esta soportado porque email es solo saliente.');
  }

  /** Email es solo saliente: no hay entidades para actualizar. */
  async updateEntity(_entity: string, _id: string, _patch: Record<string, unknown>): Promise<unknown> {
    throw new Error('Email facade: updateEntity no esta soportado porque email es solo saliente.');
  }

  // Metodos de dominio

  /**
   * Envia un email de factura autorizado por AFIP.
   * Usa la plantilla argentina incluida y permite adjuntar el PDF.
   */
  async sendInvoiceEmail(input: SendInvoiceEmailInput): Promise<SendEmailResult> {
    await this.ensureConnected();
    return this.connector.sendFacturaEmail(
      input.from,
      input.to,
      {
        numeroFactura: input.numeroFactura,
        fechaEmision: input.fechaEmision,
        cae: input.cae,
        fechaVencimientoCae: input.fechaVencimientoCae,
        total: input.total,
        clienteNombre: input.clienteNombre,
        empresaNombre: input.empresaNombre,
        linkPdf: input.linkPdf,
      },
      input.pdfAttachment,
    );
  }

  /**
   * Envia un recordatorio de pago para una factura vencida.
   */
  async sendPaymentReminder(input: SendPaymentReminderInput): Promise<SendEmailResult> {
    await this.ensureConnected();
    return this.connector.sendRecordatorioPagoEmail(input.from, input.to, {
      numeroFactura: input.numeroFactura,
      fechaVencimiento: input.fechaVencimiento,
      montoAdeudado: input.montoAdeudado,
      clienteNombre: input.clienteNombre,
      diasVencido: input.diasVencido,
    });
  }

  /**
   * Envia una notificacion simple con asunto y cuerpo en texto o HTML.
   * Sirve para alertas del sistema, conflictos o resultados de flujos.
   */
  async sendNotification(input: SendNotificationInput): Promise<SendEmailResult> {
    await this.ensureConnected();
    const to = Array.isArray(input.to) ? input.to : [input.to];
    return this.connector.sendEmail({
      from: input.from,
      to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
  }

  /**
   * Lista todas las plantillas disponibles, incluidas las de negocio para Argentina.
   */
  getTemplates() {
    return this.connector.getTemplates();
  }
}

export function createEmailFacade(credentials: Record<string, string>): EmailFacade {
  return new EmailFacade(credentials);
}
