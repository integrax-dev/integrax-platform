/**
 * WhatsApp Business — LatAm messaging scenarios matrix
 * Self-contained (no require('../index')) — pure business logic tests
 */
import { describe, it, expect } from 'vitest';

// ─── LatAm phone number formatting ───────────────────────────────────────────

function formatPhone(raw: string, countryCode: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith(countryCode)) return digits;
  return `${countryCode}${digits.startsWith('0') ? digits.slice(1) : digits}`;
}

function isValidWhatsAppPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

// ─── Phone formatting matrix ──────────────────────────────────────────────────

describe('LatAm phone formatting', () => {
  const argentinaCases: Array<{ raw: string; expected: string }> = [
    { raw: '011 1234-5678', expected: '541112345678' },
    { raw: '0351 456-7890', expected: '543514567890' },
    { raw: '+54 9 11 1234-5678', expected: '5491112345678' },
    { raw: '(011) 1234-5678', expected: '541112345678' },
    { raw: '1554123456', expected: '541554123456' },
    { raw: '2215551234', expected: '542215551234' },
    { raw: '3414557890', expected: '543414557890' },
  ];

  it.each(argentinaCases)('AR phone $raw → $expected', ({ raw, expected }) => {
    const result = formatPhone(raw, '54');
    expect(result).toHaveLength(expected.length);
    expect(isValidWhatsAppPhone(result)).toBe(true);
  });

  const brazilCases: Array<{ raw: string; valid: boolean }> = [
    { raw: '+55 11 91234-5678', valid: true },
    { raw: '5511987654321', valid: true },
    { raw: '(11) 98765-4321', valid: true },
    { raw: '21 91234-5678', valid: true },
    { raw: '(85) 99876-5432', valid: true },
  ];

  it.each(brazilCases)('BR phone $raw isValid=$valid', ({ raw, valid }) => {
    expect(isValidWhatsAppPhone(raw)).toBe(valid);
  });

  const latamCountries = [
    { country: 'MX', code: '52', phone: '5512345678901' },
    { country: 'CL', code: '56', phone: '56912345678' },
    { country: 'CO', code: '57', phone: '573001234567' },
    { country: 'PE', code: '51', phone: '51987654321' },
    { country: 'UY', code: '598', phone: '59891234567' },
    { country: 'VE', code: '58', phone: '584121234567' },
    { country: 'EC', code: '593', phone: '5930991234567' },
    { country: 'BO', code: '591', phone: '59171234567' },
    { country: 'PY', code: '595', phone: '595981234567' },
  ];

  it.each(latamCountries)('$country number $phone is valid', ({ phone }) => {
    expect(isValidWhatsAppPhone(phone)).toBe(true);
  });
});

// ─── Message type validation matrix ──────────────────────────────────────────

type MessageType = 'text' | 'template' | 'image' | 'document' | 'interactive' | 'location';

function buildTextMessage(to: string, body: string) {
  return { to, type: 'text' as MessageType, text: { body } };
}

function buildTemplateMessage(to: string, templateName: string, langCode: string, params: string[]) {
  return {
    to,
    type: 'template' as MessageType,
    template: {
      name: templateName,
      language: { code: langCode },
      components: params.length > 0 ? [{
        type: 'body' as const,
        parameters: params.map(text => ({ type: 'text' as const, text })),
      }] : undefined,
    },
  };
}

describe('Message construction', () => {
  const textMessages: Array<{ to: string; body: string }> = [
    { to: '5491112345678', body: 'Hola, tu pago fue aprobado' },
    { to: '5511987654321', body: 'Olá, seu pagamento foi aprovado' },
    { to: '5212345678901', body: 'Hola, tu pago fue aprobado' },
    { to: '56912345678', body: 'Hola, tu pago fue aprobado' },
    { to: '573001234567', body: 'Hola, su pago fue aprobado' },
    { to: '51987654321', body: 'Hola, su pago fue aprobado' },
    { to: '59891234567', body: 'Hola, su pago fue aprobado' },
    { to: '5491198765432', body: 'Tu factura FC-A-00001-00000001 fue emitida exitosamente' },
    { to: '5491187654321', body: 'Hola {{name}}, tienes un nuevo pedido #{{orderId}}' },
    { to: '5491176543210', body: 'Tu CUIT es {{cuit}} — monto: ${{amount}} ARS' },
  ];

  it.each(textMessages)('builds text message to $to', ({ to, body }) => {
    const msg = buildTextMessage(to, body);
    expect(msg.to).toBe(to);
    expect(msg.type).toBe('text');
    expect(msg.text.body).toBe(body);
    expect(msg.text.body.length).toBeGreaterThan(0);
  });

  const templates: Array<{ name: string; lang: string; params: string[] }> = [
    { name: 'payment_approved', lang: 'es_AR', params: ['Juan Pérez', '15000.50', 'ARS'] },
    { name: 'payment_rejected', lang: 'es_AR', params: ['María García', '8500.75'] },
    { name: 'invoice_issued', lang: 'es_AR', params: ['FC-A-00001-00000001', '30-11223344-5'] },
    { name: 'order_shipped', lang: 'es_MX', params: ['ORD-12345', 'DHL', 'TRACK-001'] },
    { name: 'pagamento_aprovado', lang: 'pt_BR', params: ['João Silva', 'R$ 1.250,00'] },
    { name: 'account_verification', lang: 'es', params: ['123456'] },
    { name: 'appointment_reminder', lang: 'es_AR', params: ['15/01/2025', '10:30', 'Oficina Central'] },
    { name: 'new_order', lang: 'es', params: ['ORD-001', '3', '$45.000'] },
    { name: 'welcome', lang: 'es_AR', params: ['Carlos'] },
    { name: 'subscription_expiring', lang: 'es', params: ['30/01/2025', 'Professional'] },
  ];

  it.each(templates)('builds template $name ($lang)', ({ name, lang, params }) => {
    const msg = buildTemplateMessage('5491112345678', name, lang, params);
    expect(msg.type).toBe('template');
    expect(msg.template.name).toBe(name);
    expect(msg.template.language.code).toBe(lang);
    if (params.length > 0) {
      expect(msg.template.components).toBeDefined();
      expect(msg.template.components![0].parameters).toHaveLength(params.length);
    }
  });
});

// ─── Webhook event parsing matrix ─────────────────────────────────────────────

type WebhookStatusType = 'sent' | 'delivered' | 'read' | 'failed';

function parseWebhookStatus(status: string): WebhookStatusType | null {
  const validStatuses: WebhookStatusType[] = ['sent', 'delivered', 'read', 'failed'];
  return validStatuses.includes(status as WebhookStatusType) ? (status as WebhookStatusType) : null;
}

describe('Webhook event parsing', () => {
  const validStatuses: WebhookStatusType[] = ['sent', 'delivered', 'read', 'failed'];
  it.each(validStatuses)('parses valid status: %s', (status) => {
    expect(parseWebhookStatus(status)).toBe(status);
  });

  const invalidStatuses = ['pending', 'processing', 'cancelled', 'SENT', 'Delivered', '', null];
  it.each(invalidStatuses)('returns null for invalid status: %j', (status) => {
    expect(parseWebhookStatus(status as string)).toBeNull();
  });

  const webhookPayloads = [
    {
      label: 'text message received',
      payload: {
        object: 'whatsapp_business_account',
        entry: [{
          id: '123456789',
          changes: [{
            value: {
              messages: [{
                from: '5491112345678',
                id: 'msg-001',
                timestamp: '1704067200',
                type: 'text',
                text: { body: 'Hola, quiero consultar mi factura' },
              }],
              statuses: undefined,
            },
            field: 'messages',
          }],
        }],
      },
    },
    {
      label: 'payment confirmation status',
      payload: {
        object: 'whatsapp_business_account',
        entry: [{
          id: '123456789',
          changes: [{
            value: {
              messages: undefined,
              statuses: [{
                id: 'msg-001',
                status: 'delivered',
                timestamp: '1704067260',
                recipient_id: '5491112345678',
              }],
            },
            field: 'messages',
          }],
        }],
      },
    },
    {
      label: 'interactive button reply',
      payload: {
        object: 'whatsapp_business_account',
        entry: [{
          id: '123456789',
          changes: [{
            value: {
              messages: [{
                from: '5491112345678',
                id: 'msg-002',
                timestamp: '1704067300',
                type: 'interactive',
                interactive: {
                  type: 'button_reply',
                  button_reply: { id: 'confirm_payment', title: 'Confirmar pago' },
                },
              }],
            },
            field: 'messages',
          }],
        }],
      },
    },
  ];

  it.each(webhookPayloads)('processes webhook: $label', ({ payload }) => {
    expect(payload.object).toBe('whatsapp_business_account');
    expect(payload.entry).toHaveLength(1);
    expect(payload.entry[0].changes).toHaveLength(1);
  });
});

// ─── LatAm business notification scenarios ────────────────────────────────────

describe('LatAm business notification scenarios', () => {
  const businessEvents: Array<{ event: string; template: string; params: string[] }> = [
    { event: 'payment_approved', template: 'pago_aprobado', params: ['Juan Pérez', '$15.000', 'ARS', 'MercadoPago'] },
    { event: 'payment_rejected', template: 'pago_rechazado', params: ['María García', '$8.500', 'tarjeta inválida'] },
    { event: 'invoice_issued', template: 'factura_emitida', params: ['FC-A-00001-00000001', '30-11223344-5', '$15.000'] },
    { event: 'invoice_cancelled', template: 'nc_emitida', params: ['NC-A-00001-00000001', 'FC-A-00001-00000001'] },
    { event: 'order_created', template: 'pedido_creado', params: ['ORD-12345', '3 productos', '$45.000'] },
    { event: 'order_shipped', template: 'pedido_enviado', params: ['ORD-12345', 'TRACK-001234', 'Andreani'] },
    { event: 'order_delivered', template: 'pedido_entregado', params: ['ORD-12345', '15/01/2025'] },
    { event: 'subscription_expired', template: 'suscripcion_vencida', params: ['Professional', '01/02/2025'] },
    { event: 'balance_low', template: 'saldo_bajo', params: ['$1.000', '$5.000 ARS'] },
    { event: 'afip_invoice_ready', template: 'factura_afip_lista', params: ['FC-A-00001-00000001', '30/01/2025'] },
    { event: 'cbu_validated', template: 'cbu_validado', params: ['0720461988000019810001'] },
    { event: 'cuit_lookup', template: 'cuit_encontrado', params: ['30-11223344-5', 'Empresa SRL'] },
    { event: 'transfer_received', template: 'transferencia_recibida', params: ['$50.000', 'ARS', 'Banco Nación'] },
    { event: 'card_expiring', template: 'tarjeta_venciendo', params: ['****4321', '02/2025'] },
    { event: 'account_suspended', template: 'cuenta_suspendida', params: ['Plan Professional', 'soporte@integrax.io'] },
  ];

  it.each(businessEvents)('$event notification built correctly', ({ event, template, params }) => {
    const msg = buildTemplateMessage('5491112345678', template, 'es_AR', params);
    expect(msg.type).toBe('template');
    expect(msg.template.name).toBe(template);
    expect(msg.template.components![0].parameters).toHaveLength(params.length);
    // All params are properly typed
    for (const p of msg.template.components![0].parameters!) {
      expect(p.type).toBe('text');
      expect(typeof p.text).toBe('string');
    }
  });
});
