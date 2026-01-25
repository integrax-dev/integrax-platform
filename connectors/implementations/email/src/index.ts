/**
 * IntegraX Email/SMTP Connector
 *
 * Transactional and bulk email sending with support for:
 * - SMTP direct sending
 * - Popular providers (Gmail, Outlook, SendGrid, SES, Mailgun)
 * - Templates with variable substitution
 * - Attachments and inline images
 * - Argentine business email templates
 */

import {
  BaseConnector,
  ConnectorMetadata,
  ConnectorCapability,
  AuthConfig,
  AuthType,
  ConnectionStatus,
  OperationResult,
} from '@integrax/connector-sdk';
import * as nodemailer from 'nodemailer';
import type { Transporter, TransportOptions } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

import {
  SmtpConfig,
  EmailProvider,
  EmailProviderConfig,
  SendEmailInput,
  SendTemplateEmailInput,
  BulkEmailInput,
  SendEmailResult,
  BulkEmailResult,
  VerifyConnectionResult,
  EmailTemplate,
  EmailRecipient,
  ArgentinaBusinessTemplates,
} from './types';

// Re-export types
export * from './types';

// Provider configurations
const PROVIDER_CONFIGS: Record<EmailProvider, Partial<SmtpConfig>> = {
  smtp: {},
  gmail: {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
  },
  outlook: {
    host: 'smtp-mail.outlook.com',
    port: 587,
    secure: false,
  },
  sendgrid: {
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
  },
  ses: {
    host: 'email-smtp.us-east-1.amazonaws.com',
    port: 587,
    secure: false,
  },
  mailgun: {
    host: 'smtp.mailgun.org',
    port: 587,
    secure: false,
  },
  zoho: {
    host: 'smtp.zoho.com',
    port: 587,
    secure: false,
  },
};

// Argentine business email templates
const AR_TEMPLATES: Record<keyof ArgentinaBusinessTemplates, EmailTemplate> = {
  facturaEnviada: {
    id: 'ar_factura_enviada',
    name: 'Factura Enviada',
    subject: 'Factura {{numeroFactura}} - {{empresaNombre}}',
    htmlBody: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #2563eb;">Factura Electrónica</h2>
  <p>Estimado/a <strong>{{clienteNombre}}</strong>,</p>
  <p>Le enviamos adjunta la factura correspondiente a su compra/servicio.</p>

  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
    <tr style="background: #f3f4f6;">
      <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>N° Factura</strong></td>
      <td style="padding: 10px; border: 1px solid #e5e7eb;">{{numeroFactura}}</td>
    </tr>
    <tr>
      <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Fecha de Emisión</strong></td>
      <td style="padding: 10px; border: 1px solid #e5e7eb;">{{fechaEmision}}</td>
    </tr>
    <tr style="background: #f3f4f6;">
      <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>CAE</strong></td>
      <td style="padding: 10px; border: 1px solid #e5e7eb;">{{cae}}</td>
    </tr>
    <tr>
      <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Vencimiento CAE</strong></td>
      <td style="padding: 10px; border: 1px solid #e5e7eb;">{{fechaVencimientoCae}}</td>
    </tr>
    <tr style="background: #2563eb; color: white;">
      <td style="padding: 10px; border: 1px solid #1d4ed8;"><strong>Total</strong></td>
      <td style="padding: 10px; border: 1px solid #1d4ed8;"><strong>$ {{total}}</strong></td>
    </tr>
  </table>

  {{#if linkPdf}}
  <p><a href="{{linkPdf}}" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Descargar PDF</a></p>
  {{/if}}

  <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
    Este comprobante fue autorizado por AFIP. CAE: {{cae}}
  </p>
</body>
</html>`,
    textBody: `
Factura Electrónica

Estimado/a {{clienteNombre}},

Le enviamos adjunta la factura correspondiente a su compra/servicio.

N° Factura: {{numeroFactura}}
Fecha de Emisión: {{fechaEmision}}
CAE: {{cae}}
Vencimiento CAE: {{fechaVencimientoCae}}
Total: $ {{total}}

Este comprobante fue autorizado por AFIP.
`,
    variables: ['numeroFactura', 'fechaEmision', 'cae', 'fechaVencimientoCae', 'total', 'clienteNombre', 'linkPdf', 'empresaNombre'],
    createdAt: new Date(),
    updatedAt: new Date(),
  },

  pagoRecibido: {
    id: 'ar_pago_recibido',
    name: 'Pago Recibido',
    subject: 'Pago recibido - Comprobante {{numeroPago}}',
    htmlBody: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #16a34a;">✓ Pago Recibido</h2>
  <p>Estimado/a <strong>{{clienteNombre}}</strong>,</p>
  <p>Confirmamos la recepción de su pago.</p>

  <div style="background: #f0fdf4; border: 1px solid #86efac; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 0;"><strong>N° Comprobante:</strong> {{numeroPago}}</p>
    <p style="margin: 10px 0 0;"><strong>Monto:</strong> $ {{monto}}</p>
    <p style="margin: 10px 0 0;"><strong>Método:</strong> {{metodoPago}}</p>
    <p style="margin: 10px 0 0;"><strong>Fecha:</strong> {{fechaPago}}</p>
  </div>

  <p>Gracias por su pago.</p>
</body>
</html>`,
    textBody: `
Pago Recibido

Estimado/a {{clienteNombre}},

Confirmamos la recepción de su pago.

N° Comprobante: {{numeroPago}}
Monto: $ {{monto}}
Método: {{metodoPago}}
Fecha: {{fechaPago}}

Gracias por su pago.
`,
    variables: ['numeroPago', 'monto', 'metodoPago', 'fechaPago', 'clienteNombre'],
    createdAt: new Date(),
    updatedAt: new Date(),
  },

  recordatorioPago: {
    id: 'ar_recordatorio_pago',
    name: 'Recordatorio de Pago',
    subject: 'Recordatorio: Factura {{numeroFactura}} pendiente de pago',
    htmlBody: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #dc2626;">Recordatorio de Pago</h2>
  <p>Estimado/a <strong>{{clienteNombre}}</strong>,</p>
  <p>Le recordamos que tiene una factura pendiente de pago.</p>

  <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 0;"><strong>N° Factura:</strong> {{numeroFactura}}</p>
    <p style="margin: 10px 0 0;"><strong>Fecha Vencimiento:</strong> {{fechaVencimiento}}</p>
    <p style="margin: 10px 0 0;"><strong>Monto Adeudado:</strong> $ {{montoAdeudado}}</p>
    {{#if diasVencido}}
    <p style="margin: 10px 0 0; color: #dc2626;"><strong>Días vencido:</strong> {{diasVencido}}</p>
    {{/if}}
  </div>

  <p>Por favor, regularice su situación a la brevedad.</p>
  <p>Si ya realizó el pago, por favor ignore este mensaje.</p>
</body>
</html>`,
    textBody: `
Recordatorio de Pago

Estimado/a {{clienteNombre}},

Le recordamos que tiene una factura pendiente de pago.

N° Factura: {{numeroFactura}}
Fecha Vencimiento: {{fechaVencimiento}}
Monto Adeudado: $ {{montoAdeudado}}
{{#if diasVencido}}Días vencido: {{diasVencido}}{{/if}}

Por favor, regularice su situación a la brevedad.
Si ya realizó el pago, por favor ignore este mensaje.
`,
    variables: ['numeroFactura', 'fechaVencimiento', 'montoAdeudado', 'clienteNombre', 'diasVencido'],
    createdAt: new Date(),
    updatedAt: new Date(),
  },

  bienvenidaCliente: {
    id: 'ar_bienvenida_cliente',
    name: 'Bienvenida Cliente',
    subject: '¡Bienvenido/a a {{empresaNombre}}!',
    htmlBody: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #2563eb;">¡Bienvenido/a!</h2>
  <p>Estimado/a <strong>{{clienteNombre}}</strong>,</p>
  <p>Es un placer darle la bienvenida a <strong>{{empresaNombre}}</strong>.</p>

  {{#if proximosPasos}}
  <h3>Próximos pasos:</h3>
  <ul>
    {{#each proximosPasos}}
    <li>{{this}}</li>
    {{/each}}
  </ul>
  {{/if}}

  <p>Estamos a su disposición para cualquier consulta.</p>
  <p>¡Gracias por confiar en nosotros!</p>
</body>
</html>`,
    textBody: `
¡Bienvenido/a!

Estimado/a {{clienteNombre}},

Es un placer darle la bienvenida a {{empresaNombre}}.

{{#if proximosPasos}}
Próximos pasos:
{{#each proximosPasos}}
- {{this}}
{{/each}}
{{/if}}

Estamos a su disposición para cualquier consulta.
¡Gracias por confiar en nosotros!
`,
    variables: ['clienteNombre', 'empresaNombre', 'proximosPasos'],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

export class EmailConnector extends BaseConnector {
  private transporter: Transporter<SMTPTransport.SentMessageInfo> | null = null;
  private config: SmtpConfig | null = null;
  private templates: Map<string, EmailTemplate> = new Map();

  constructor() {
    super();
    // Load Argentine templates
    Object.values(AR_TEMPLATES).forEach(template => {
      this.templates.set(template.id, template);
    });
  }

  getMetadata(): ConnectorMetadata {
    return {
      id: 'email',
      name: 'Email/SMTP',
      version: '0.1.0',
      description: 'Send transactional and bulk emails via SMTP or popular email providers',
      author: 'IntegraX',
      capabilities: [
        ConnectorCapability.WRITE,
        ConnectorCapability.BATCH,
      ],
      supportedAuthTypes: [AuthType.API_KEY, AuthType.BASIC],
      configSchema: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            enum: ['smtp', 'gmail', 'outlook', 'sendgrid', 'ses', 'mailgun', 'zoho'],
            description: 'Email provider or SMTP for custom server',
          },
          host: {
            type: 'string',
            description: 'SMTP host (required for smtp provider)',
          },
          port: {
            type: 'number',
            description: 'SMTP port',
          },
          secure: {
            type: 'boolean',
            description: 'Use TLS (true for port 465)',
          },
          user: {
            type: 'string',
            description: 'SMTP username or email',
          },
          pass: {
            type: 'string',
            description: 'SMTP password or app password',
          },
          pool: {
            type: 'boolean',
            description: 'Use connection pooling',
          },
        },
        required: ['provider', 'user', 'pass'],
      },
    };
  }

  async connect(auth: AuthConfig): Promise<ConnectionStatus> {
    try {
      const credentials = auth.credentials as EmailProviderConfig & Partial<SmtpConfig>;
      const provider = credentials.provider || 'smtp';

      // Get provider defaults
      const providerConfig = PROVIDER_CONFIGS[provider] || {};

      // Build SMTP config
      this.config = {
        host: credentials.host || providerConfig.host || 'localhost',
        port: credentials.port || providerConfig.port || 587,
        secure: credentials.secure ?? providerConfig.secure ?? false,
        auth: {
          user: credentials.auth?.user || (credentials as any).user || '',
          pass: credentials.auth?.pass || (credentials as any).pass || '',
        },
        pool: credentials.pool ?? true,
        maxConnections: credentials.maxConnections ?? 5,
        maxMessages: credentials.maxMessages ?? 100,
        tls: credentials.tls ?? { rejectUnauthorized: true },
      };

      // Handle SES region
      if (provider === 'ses' && credentials.region) {
        this.config.host = `email-smtp.${credentials.region}.amazonaws.com`;
      }

      // Create transporter
      this.transporter = nodemailer.createTransport(this.config as SMTPTransport.Options);

      // Verify connection
      await this.transporter.verify();

      return {
        connected: true,
        message: `Connected to ${provider} SMTP server`,
      };
    } catch (error: any) {
      return {
        connected: false,
        error: error.message || 'Failed to connect to SMTP server',
      };
    }
  }

  async disconnect(): Promise<void> {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
    }
    this.config = null;
  }

  async healthCheck(): Promise<ConnectionStatus> {
    if (!this.transporter) {
      return { connected: false, error: 'Not connected' };
    }

    try {
      await this.transporter.verify();
      return { connected: true };
    } catch (error: any) {
      return { connected: false, error: error.message };
    }
  }

  // ==================== Operations ====================

  /**
   * Send a single email
   */
  async sendEmail(input: SendEmailInput): Promise<OperationResult<SendEmailResult>> {
    if (!this.transporter) {
      return { success: false, error: { code: 'NOT_CONNECTED', message: 'Not connected to SMTP server' } };
    }

    try {
      const result = await this.transporter.sendMail({
        from: this.formatRecipient(input.from),
        to: this.formatRecipients(input.to),
        cc: input.cc ? this.formatRecipients(input.cc) : undefined,
        bcc: input.bcc ? this.formatRecipients(input.bcc) : undefined,
        replyTo: input.replyTo ? this.formatRecipient(input.replyTo) : undefined,
        subject: input.subject,
        text: input.text,
        html: input.html,
        attachments: input.attachments?.map(att => ({
          filename: att.filename,
          content: att.content,
          path: att.path,
          href: att.href,
          contentType: att.contentType,
          encoding: att.encoding,
          cid: att.cid,
          contentDisposition: att.contentDisposition,
        })),
        headers: input.headers,
        priority: input.priority,
        messageId: input.messageId,
        references: input.references,
        inReplyTo: input.inReplyTo,
      });

      return {
        success: true,
        data: {
          success: true,
          messageId: result.messageId,
          accepted: result.accepted as string[],
          rejected: result.rejected as string[],
          pending: result.pending as string[],
          response: result.response,
          envelope: result.envelope,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'SEND_FAILED',
          message: error.message || 'Failed to send email',
          details: error,
        },
      };
    }
  }

  /**
   * Send email using a template
   */
  async sendTemplateEmail(input: SendTemplateEmailInput): Promise<OperationResult<SendEmailResult>> {
    // Get template
    const template = input.templateId
      ? this.templates.get(input.templateId)
      : Array.from(this.templates.values()).find(t => t.name === input.templateName);

    if (!template) {
      return {
        success: false,
        error: {
          code: 'TEMPLATE_NOT_FOUND',
          message: `Template not found: ${input.templateId || input.templateName}`,
        },
      };
    }

    // Render template
    const subject = this.renderTemplate(template.subject, input.templateData);
    const text = template.textBody ? this.renderTemplate(template.textBody, input.templateData) : undefined;
    const html = template.htmlBody ? this.renderTemplate(template.htmlBody, input.templateData) : undefined;

    return this.sendEmail({
      from: input.from,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      replyTo: input.replyTo,
      subject: input.subject || subject,
      text,
      html,
      attachments: input.attachments,
      headers: input.headers,
      priority: input.priority,
      tags: input.tags,
    });
  }

  /**
   * Send bulk emails with rate limiting
   */
  async sendBulkEmail(input: BulkEmailInput): Promise<OperationResult<BulkEmailResult>> {
    if (!this.transporter) {
      return { success: false, error: { code: 'NOT_CONNECTED', message: 'Not connected to SMTP server' } };
    }

    const batchSize = input.batchSize || 10;
    const delay = input.delayBetweenBatches || 1000;
    const results: BulkEmailResult['results'] = [];

    // Process in batches
    for (let i = 0; i < input.recipients.length; i += batchSize) {
      const batch = input.recipients.slice(i, i + batchSize);

      // Send batch in parallel
      const batchPromises = batch.map(async (recipient) => {
        try {
          // Render personalized content if variables provided
          let text = input.text;
          let html = input.html;
          let subject = input.subject;

          if (recipient.variables) {
            if (text) text = this.renderTemplate(text, recipient.variables);
            if (html) html = this.renderTemplate(html, recipient.variables);
            subject = this.renderTemplate(subject, recipient.variables);
          }

          const result = await this.transporter!.sendMail({
            from: this.formatRecipient(input.from),
            to: this.formatRecipient(recipient.to),
            cc: recipient.cc ? this.formatRecipients(recipient.cc) : undefined,
            bcc: recipient.bcc ? this.formatRecipients(recipient.bcc) : undefined,
            subject,
            text,
            html,
          });

          return {
            recipient: typeof recipient.to === 'string' ? recipient.to : recipient.to.address,
            success: true,
            messageId: result.messageId,
          };
        } catch (error: any) {
          return {
            recipient: typeof recipient.to === 'string' ? recipient.to : recipient.to.address,
            success: false,
            error: error.message,
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Delay between batches (except for last batch)
      if (i + batchSize < input.recipients.length) {
        await this.sleep(delay);
      }
    }

    const sent = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return {
      success: failed === 0,
      data: {
        total: results.length,
        sent,
        failed,
        results,
      },
    };
  }

  /**
   * Verify SMTP connection
   */
  async verifyConnection(): Promise<OperationResult<VerifyConnectionResult>> {
    if (!this.transporter) {
      return { success: false, error: { code: 'NOT_CONNECTED', message: 'Not connected to SMTP server' } };
    }

    try {
      await this.transporter.verify();
      return {
        success: true,
        data: {
          success: true,
          message: 'SMTP connection verified',
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'VERIFICATION_FAILED',
          message: error.message,
        },
      };
    }
  }

  /**
   * Add a custom template
   */
  addTemplate(template: EmailTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * Get all available templates
   */
  getTemplates(): EmailTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get Argentine business templates
   */
  getArgentinaTemplates(): typeof AR_TEMPLATES {
    return AR_TEMPLATES;
  }

  /**
   * Send Argentine invoice email (Factura)
   */
  async sendFacturaEmail(
    from: EmailRecipient,
    to: EmailRecipient,
    data: ArgentinaBusinessTemplates['facturaEnviada'] & { empresaNombre: string },
    pdfAttachment?: Buffer
  ): Promise<OperationResult<SendEmailResult>> {
    const attachments = pdfAttachment ? [{
      filename: `Factura_${data.numeroFactura}.pdf`,
      content: pdfAttachment,
      contentType: 'application/pdf',
    }] : undefined;

    return this.sendTemplateEmail({
      from,
      to,
      templateId: 'ar_factura_enviada',
      templateData: data,
      attachments,
    });
  }

  /**
   * Send payment received email
   */
  async sendPagoRecibidoEmail(
    from: EmailRecipient,
    to: EmailRecipient,
    data: ArgentinaBusinessTemplates['pagoRecibido']
  ): Promise<OperationResult<SendEmailResult>> {
    return this.sendTemplateEmail({
      from,
      to,
      templateId: 'ar_pago_recibido',
      templateData: data,
    });
  }

  /**
   * Send payment reminder email
   */
  async sendRecordatorioPagoEmail(
    from: EmailRecipient,
    to: EmailRecipient,
    data: ArgentinaBusinessTemplates['recordatorioPago']
  ): Promise<OperationResult<SendEmailResult>> {
    return this.sendTemplateEmail({
      from,
      to,
      templateId: 'ar_recordatorio_pago',
      templateData: data,
    });
  }

  // ==================== Private Helpers ====================

  private formatRecipient(recipient: EmailRecipient): string {
    if (typeof recipient === 'string') {
      return recipient;
    }
    return recipient.name ? `"${recipient.name}" <${recipient.address}>` : recipient.address;
  }

  private formatRecipients(recipients: EmailRecipient | EmailRecipient[]): string {
    const list = Array.isArray(recipients) ? recipients : [recipients];
    return list.map(r => this.formatRecipient(r)).join(', ');
  }

  private renderTemplate(template: string, data: Record<string, any>): string {
    let result = template;

    // Simple variable replacement: {{variable}}
    result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] !== undefined ? String(data[key]) : match;
    });

    // Simple conditionals: {{#if variable}}...{{/if}}
    result = result.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, key, content) => {
      return data[key] ? content : '';
    });

    // Simple each loops: {{#each array}}...{{/each}}
    result = result.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, key, content) => {
      const items = data[key];
      if (!Array.isArray(items)) return '';
      return items.map(item => content.replace(/\{\{this\}\}/g, String(item))).join('');
    });

    return result;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton factory
export function createEmailConnector(): EmailConnector {
  return new EmailConnector();
}

// Default export
export default EmailConnector;
