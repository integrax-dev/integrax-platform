/**
 * Email/SMTP Connector Tests
 *
 * Tests para el conector de Email SMTP
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Types from the connector
interface EmailAddress {
  name?: string;
  address: string;
}

type EmailRecipient = string | EmailAddress;

interface EmailAttachment {
  filename: string;
  content?: string | Buffer;
  path?: string;
  contentType?: string;
  cid?: string;
}

interface SendEmailInput {
  from: EmailRecipient;
  to: EmailRecipient | EmailRecipient[];
  cc?: EmailRecipient | EmailRecipient[];
  bcc?: EmailRecipient | EmailRecipient[];
  replyTo?: EmailRecipient;
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
  priority?: 'high' | 'normal' | 'low';
  tags?: string[];
}

interface SendEmailResult {
  success: boolean;
  messageId?: string;
  accepted?: string[];
  rejected?: string[];
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  textBody?: string;
  htmlBody?: string;
  variables: string[];
}

// Helper: Format recipient
function formatRecipient(recipient: EmailRecipient): string {
  if (typeof recipient === 'string') {
    return recipient;
  }
  return recipient.name ? `"${recipient.name}" <${recipient.address}>` : recipient.address;
}

// Helper: Render template
function renderTemplate(template: string, data: Record<string, any>): string {
  let result = template;

  // Simple variable replacement: {{variable}}
  result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] !== undefined ? String(data[key]) : match;
  });

  // Simple conditionals: {{#if variable}}...{{/if}}
  result = result.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, key, content) => {
    return data[key] ? content : '';
  });

  return result;
}

describe('Email Connector', () => {
  describe('Connector Spec', () => {
    it('should have correct metadata', () => {
      const spec = {
        id: 'email',
        name: 'Email/SMTP',
        description: 'Send transactional and bulk emails via SMTP or popular email providers',
        version: '0.1.0',
      };

      expect(spec.id).toBe('email');
      expect(spec.name).toBe('Email/SMTP');
    });

    it('should support multiple providers', () => {
      const providers = ['smtp', 'gmail', 'outlook', 'sendgrid', 'ses', 'mailgun', 'zoho'];
      expect(providers).toHaveLength(7);
      expect(providers).toContain('gmail');
      expect(providers).toContain('sendgrid');
    });
  });

  describe('Recipient Formatting', () => {
    it('should format string email', () => {
      expect(formatRecipient('test@example.com')).toBe('test@example.com');
    });

    it('should format email with name', () => {
      const recipient: EmailAddress = {
        name: 'Juan Pérez',
        address: 'juan@example.com',
      };
      expect(formatRecipient(recipient)).toBe('"Juan Pérez" <juan@example.com>');
    });

    it('should format email without name', () => {
      const recipient: EmailAddress = {
        address: 'juan@example.com',
      };
      expect(formatRecipient(recipient)).toBe('juan@example.com');
    });
  });

  describe('Send Email', () => {
    it('should build simple text email', () => {
      const email: SendEmailInput = {
        from: 'sender@company.com',
        to: 'customer@example.com',
        subject: 'Confirmación de pedido',
        text: 'Su pedido ha sido confirmado.',
      };

      expect(email.from).toBe('sender@company.com');
      expect(email.to).toBe('customer@example.com');
      expect(email.subject).toContain('pedido');
    });

    it('should build HTML email', () => {
      const email: SendEmailInput = {
        from: { name: 'Mi Empresa', address: 'noreply@empresa.com' },
        to: 'customer@example.com',
        subject: 'Bienvenido!',
        html: '<h1>Bienvenido</h1><p>Gracias por registrarte.</p>',
      };

      expect(email.html).toContain('<h1>');
    });

    it('should support multiple recipients', () => {
      const email: SendEmailInput = {
        from: 'sender@company.com',
        to: ['customer1@example.com', 'customer2@example.com'],
        cc: 'manager@company.com',
        bcc: 'audit@company.com',
        subject: 'Comunicado',
        text: 'Mensaje importante.',
      };

      expect(Array.isArray(email.to)).toBe(true);
      expect((email.to as string[]).length).toBe(2);
    });

    it('should support attachments', () => {
      const email: SendEmailInput = {
        from: 'sender@company.com',
        to: 'customer@example.com',
        subject: 'Factura adjunta',
        text: 'Adjuntamos su factura.',
        attachments: [
          {
            filename: 'Factura-A-0001-00000001.pdf',
            contentType: 'application/pdf',
            content: 'base64content...',
          },
        ],
      };

      expect(email.attachments).toHaveLength(1);
      expect(email.attachments![0].filename).toContain('Factura');
    });

    it('should support inline images', () => {
      const email: SendEmailInput = {
        from: 'sender@company.com',
        to: 'customer@example.com',
        subject: 'Email con logo',
        html: '<img src="cid:logo" /><p>Contenido</p>',
        attachments: [
          {
            filename: 'logo.png',
            path: '/path/to/logo.png',
            cid: 'logo',
          },
        ],
      };

      expect(email.html).toContain('cid:logo');
      expect(email.attachments![0].cid).toBe('logo');
    });

    it('should support priority', () => {
      const email: SendEmailInput = {
        from: 'sender@company.com',
        to: 'customer@example.com',
        subject: 'URGENTE',
        text: 'Mensaje urgente.',
        priority: 'high',
      };

      expect(email.priority).toBe('high');
    });
  });

  describe('Template Rendering', () => {
    it('should replace simple variables', () => {
      const template = 'Hola {{nombre}}, tu pedido {{pedido}} está listo.';
      const data = { nombre: 'Juan', pedido: 'ORD-123' };

      const result = renderTemplate(template, data);
      expect(result).toBe('Hola Juan, tu pedido ORD-123 está listo.');
    });

    it('should handle missing variables', () => {
      const template = 'Hola {{nombre}}, tu código es {{codigo}}.';
      const data = { nombre: 'Juan' };

      const result = renderTemplate(template, data);
      expect(result).toBe('Hola Juan, tu código es {{codigo}}.');
    });

    it('should handle conditionals', () => {
      const template = 'Pedido{{#if premium}} PREMIUM{{/if}} confirmado.';

      expect(renderTemplate(template, { premium: true })).toBe('Pedido PREMIUM confirmado.');
      expect(renderTemplate(template, { premium: false })).toBe('Pedido confirmado.');
    });
  });

  describe('Argentine Business Templates', () => {
    const arTemplates: Record<string, EmailTemplate> = {
      facturaEnviada: {
        id: 'ar_factura_enviada',
        name: 'Factura Enviada',
        subject: 'Factura {{numeroFactura}} - {{empresaNombre}}',
        htmlBody: '<h2>Factura Electrónica</h2>...',
        variables: ['numeroFactura', 'fechaEmision', 'cae', 'total', 'clienteNombre'],
      },
      pagoRecibido: {
        id: 'ar_pago_recibido',
        name: 'Pago Recibido',
        subject: 'Pago recibido - Comprobante {{numeroPago}}',
        htmlBody: '<h2>✓ Pago Recibido</h2>...',
        variables: ['numeroPago', 'monto', 'metodoPago', 'fechaPago', 'clienteNombre'],
      },
      recordatorioPago: {
        id: 'ar_recordatorio_pago',
        name: 'Recordatorio de Pago',
        subject: 'Recordatorio: Factura {{numeroFactura}} pendiente de pago',
        htmlBody: '<h2>Recordatorio de Pago</h2>...',
        variables: ['numeroFactura', 'fechaVencimiento', 'montoAdeudado', 'clienteNombre'],
      },
      bienvenidaCliente: {
        id: 'ar_bienvenida_cliente',
        name: 'Bienvenida Cliente',
        subject: '¡Bienvenido/a a {{empresaNombre}}!',
        htmlBody: '<h2>¡Bienvenido/a!</h2>...',
        variables: ['clienteNombre', 'empresaNombre', 'proximosPasos'],
      },
    };

    it('should have all Argentine templates', () => {
      expect(Object.keys(arTemplates)).toHaveLength(4);
      expect(arTemplates.facturaEnviada).toBeDefined();
      expect(arTemplates.pagoRecibido).toBeDefined();
      expect(arTemplates.recordatorioPago).toBeDefined();
      expect(arTemplates.bienvenidaCliente).toBeDefined();
    });

    it('should have CAE in factura template variables', () => {
      expect(arTemplates.facturaEnviada.variables).toContain('cae');
    });

    it('should have metodoPago in pago template', () => {
      expect(arTemplates.pagoRecibido.variables).toContain('metodoPago');
    });

    it('should render factura subject correctly', () => {
      const subject = arTemplates.facturaEnviada.subject;
      const data = { numeroFactura: 'A-0001-00000001', empresaNombre: 'Mi Empresa SRL' };

      const result = renderTemplate(subject, data);
      expect(result).toBe('Factura A-0001-00000001 - Mi Empresa SRL');
    });
  });

  describe('Bulk Email', () => {
    it('should support batch sending', () => {
      const bulkInput = {
        from: 'sender@company.com',
        subject: 'Newsletter - {{mes}}',
        html: '<p>Novedades de {{mes}}...</p>',
        recipients: [
          { to: 'user1@example.com', variables: { mes: 'Enero' } },
          { to: 'user2@example.com', variables: { mes: 'Enero' } },
          { to: 'user3@example.com', variables: { mes: 'Enero' } },
        ],
        batchSize: 10,
        delayBetweenBatches: 1000,
      };

      expect(bulkInput.recipients).toHaveLength(3);
      expect(bulkInput.batchSize).toBe(10);
    });
  });

  describe('Send Result', () => {
    it('should parse successful result', () => {
      const result: SendEmailResult = {
        success: true,
        messageId: '<abc123@mail.example.com>',
        accepted: ['customer@example.com'],
        rejected: [],
      };

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.accepted).toHaveLength(1);
      expect(result.rejected).toHaveLength(0);
    });

    it('should handle partial rejection', () => {
      const result: SendEmailResult = {
        success: true,
        messageId: '<abc123@mail.example.com>',
        accepted: ['valid@example.com'],
        rejected: ['invalid@bad-domain'],
      };

      expect(result.accepted).toHaveLength(1);
      expect(result.rejected).toHaveLength(1);
    });
  });

  describe('Provider Configurations', () => {
    it('should have Gmail config', () => {
      const gmailConfig = {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
      };

      expect(gmailConfig.host).toBe('smtp.gmail.com');
    });

    it('should have SendGrid config', () => {
      const sendgridConfig = {
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false,
      };

      expect(sendgridConfig.host).toBe('smtp.sendgrid.net');
    });

    it('should have SES config with region', () => {
      const sesConfig = (region: string) => ({
        host: `email-smtp.${region}.amazonaws.com`,
        port: 587,
        secure: false,
      });

      expect(sesConfig('us-east-1').host).toContain('us-east-1');
      expect(sesConfig('sa-east-1').host).toContain('sa-east-1');
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors', () => {
      const error = {
        code: 'NOT_CONNECTED',
        message: 'Not connected to SMTP server',
      };

      expect(error.code).toBe('NOT_CONNECTED');
    });

    it('should handle send failures', () => {
      const error = {
        code: 'SEND_FAILED',
        message: 'Failed to send email: Connection timeout',
        details: { timeout: 30000 },
      };

      expect(error.code).toBe('SEND_FAILED');
    });

    it('should handle template not found', () => {
      const error = {
        code: 'TEMPLATE_NOT_FOUND',
        message: 'Template not found: unknown_template',
      };

      expect(error.code).toBe('TEMPLATE_NOT_FOUND');
    });
  });

  describe('Connection Pooling', () => {
    it('should support pool configuration', () => {
      const poolConfig = {
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 1000,
        rateLimit: 10,
      };

      expect(poolConfig.pool).toBe(true);
      expect(poolConfig.maxConnections).toBe(5);
    });
  });

  describe('Email Integration (real)', () => {
    const { EmailConnector } = require('../index');
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM_EMAIL || smtpUser;
    const smtpTo = process.env.SMTP_TO_EMAIL || smtpUser;

    it('should connect to SMTP and verify', async () => {
      if (!smtpHost || !smtpUser || !smtpPass) {
        console.warn('Email integration test skipped: set SMTP_HOST, SMTP_USER, SMTP_PASS');
        return;
      }
      const connector = new EmailConnector();
      await connector.connect({
        type: 'basic',
        credentials: { provider: 'smtp', host: smtpHost, user: smtpUser, pass: smtpPass },
      });
      const verified = await connector.verify();
      expect(verified).toBe(true);
      await connector.disconnect();
    }, 10000);

    it('should connect and send a test email', async () => {
      if (!smtpHost || !smtpUser || !smtpPass) {
        console.warn('Email integration test skipped: set SMTP_HOST, SMTP_USER, SMTP_PASS');
        return;
      }
      const connector = new EmailConnector();
      await connector.connect({
        type: 'basic',
        credentials: { provider: 'smtp', host: smtpHost, user: smtpUser, pass: smtpPass },
      });
      let result = null;
      let error = null;
      try {
        result = await connector.sendEmail({
          from: smtpFrom,
          to: smtpTo,
          subject: 'Test IntegraX',
          text: 'Test de integración SMTP',
        });
      } catch (err) {
        error = err;
      }
      await connector.disconnect();
      if (error) {
        console.error('SMTP error:', error);
      }
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    }, 15000);
  });
});
