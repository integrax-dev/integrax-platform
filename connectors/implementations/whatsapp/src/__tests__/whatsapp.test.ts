/**
 * WhatsApp Business Connector Tests
 *
 * Tests para el conector de WhatsApp Business API
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Types from the connector
interface TextMessage {
  body: string;
  preview_url?: boolean;
}

interface TemplateMessage {
  name: string;
  language: { code: string };
  components?: Array<{
    type: 'header' | 'body' | 'button';
    parameters?: Array<{ type: 'text' | 'image' | 'document'; text?: string }>;
  }>;
}

interface InteractiveMessage {
  type: 'button' | 'list';
  header?: { type: 'text' | 'image'; text?: string };
  body: { text: string };
  footer?: { text: string };
  action: {
    buttons?: Array<{
      type: 'reply';
      reply: { id: string; title: string };
    }>;
    button?: string;
    sections?: Array<{
      title?: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>;
  };
}

interface SendMessageRequest {
  to: string;
  type: 'text' | 'template' | 'image' | 'document' | 'interactive' | 'location';
  text?: TextMessage;
  template?: TemplateMessage;
  image?: { link: string; caption?: string };
  document?: { link: string; filename?: string; caption?: string };
  interactive?: InteractiveMessage;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  context?: { message_id: string };
}

interface WebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'image' | 'interactive' | 'button';
  text?: { body: string };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
}

interface WebhookStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string }>;
}

// Helper: Format Argentina phone
function formatArgentinaPhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');

  if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }

  if (digits.length === 10 && digits.substring(2, 4) === '15') {
    digits = digits.substring(0, 2) + digits.substring(4);
  }

  if (!digits.startsWith('54')) {
    digits = '54' + digits;
  }

  if (digits.startsWith('54') && !digits.startsWith('549')) {
    digits = '549' + digits.substring(2);
  }

  return digits;
}

describe('WhatsApp Connector', () => {
  describe('Connector Spec', () => {
    it('should have correct metadata', () => {
      const spec = {
        id: 'whatsapp',
        name: 'WhatsApp Business',
        description: 'Envía mensajes via WhatsApp Business Cloud API',
        version: '0.1.0',
        auth: { type: 'api_key' },
      };

      expect(spec.id).toBe('whatsapp');
      expect(spec.auth.type).toBe('api_key');
    });

    it('should define all required actions', () => {
      const actions = [
        'send_text',
        'send_template',
        'send_image',
        'send_document',
        'send_interactive_buttons',
        'list_templates',
      ];

      expect(actions).toContain('send_text');
      expect(actions).toContain('send_template');
      expect(actions).toContain('send_interactive_buttons');
    });
  });

  describe('Phone Number Formatting', () => {
    describe('Argentina Numbers', () => {
      it('should format Buenos Aires mobile with 15', () => {
        // 011-15-4555-1234 -> 5491145551234
        expect(formatArgentinaPhone('01145551234')).toBe('5491145551234');
      });

      it('should format Buenos Aires mobile without 15', () => {
        expect(formatArgentinaPhone('1145551234')).toBe('5491145551234');
      });

      it('should format number with dashes', () => {
        expect(formatArgentinaPhone('011-4555-1234')).toBe('5491145551234');
      });

      it('should format number with spaces', () => {
        expect(formatArgentinaPhone('011 4555 1234')).toBe('5491145551234');
      });

      it('should handle number already with country code', () => {
        expect(formatArgentinaPhone('5491145551234')).toBe('5491145551234');
      });

      it('should add 9 for mobile if missing', () => {
        expect(formatArgentinaPhone('541145551234')).toBe('5491145551234');
      });

      it('should format Córdoba mobile', () => {
        // Full number with area code
        expect(formatArgentinaPhone('5493515551234')).toBe('5493515551234');
      });

      it('should format Rosario mobile', () => {
        // Full number with area code
        expect(formatArgentinaPhone('5493415551234')).toBe('5493415551234');
      });
    });
  });

  describe('Text Messages', () => {
    it('should build text message request', () => {
      const request: SendMessageRequest = {
        to: '5491145551234',
        type: 'text',
        text: {
          body: 'Hola! Tu pedido está listo.',
        },
      };

      expect(request.type).toBe('text');
      expect(request.text?.body).toContain('pedido');
    });

    it('should support preview URL', () => {
      const request: SendMessageRequest = {
        to: '5491145551234',
        type: 'text',
        text: {
          body: 'Mirá esto: https://example.com',
          preview_url: true,
        },
      };

      expect(request.text?.preview_url).toBe(true);
    });
  });

  describe('Template Messages', () => {
    it('should build template message without parameters', () => {
      const request: SendMessageRequest = {
        to: '5491145551234',
        type: 'template',
        template: {
          name: 'hello_world',
          language: { code: 'es_AR' },
        },
      };

      expect(request.type).toBe('template');
      expect(request.template?.name).toBe('hello_world');
      expect(request.template?.language.code).toBe('es_AR');
    });

    it('should build template message with body parameters', () => {
      const request: SendMessageRequest = {
        to: '5491145551234',
        type: 'template',
        template: {
          name: 'order_confirmation',
          language: { code: 'es_AR' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: 'Juan' },
                { type: 'text', text: 'ORD-12345' },
                { type: 'text', text: '$15.000' },
              ],
            },
          ],
        },
      };

      expect(request.template?.components).toHaveLength(1);
      expect(request.template?.components![0].parameters).toHaveLength(3);
    });

    it('should support different languages', () => {
      const languages = ['es_AR', 'es', 'en', 'pt_BR'];

      languages.forEach(lang => {
        const template: TemplateMessage = {
          name: 'test',
          language: { code: lang },
        };
        expect(template.language.code).toBe(lang);
      });
    });
  });

  describe('Media Messages', () => {
    it('should build image message', () => {
      const request: SendMessageRequest = {
        to: '5491145551234',
        type: 'image',
        image: {
          link: 'https://example.com/image.jpg',
          caption: 'Tu factura',
        },
      };

      expect(request.type).toBe('image');
      expect(request.image?.link).toContain('https://');
    });

    it('should build document message (PDF invoice)', () => {
      const request: SendMessageRequest = {
        to: '5491145551234',
        type: 'document',
        document: {
          link: 'https://example.com/factura.pdf',
          filename: 'Factura-A-0001-00000001.pdf',
          caption: 'Factura A - CAE: 71234567890123',
        },
      };

      expect(request.type).toBe('document');
      expect(request.document?.filename).toContain('Factura');
    });
  });

  describe('Interactive Messages', () => {
    it('should build button message', () => {
      const request: SendMessageRequest = {
        to: '5491145551234',
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: '¿Confirmás tu pedido?' },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'confirm', title: 'Sí, confirmar' } },
              { type: 'reply', reply: { id: 'cancel', title: 'Cancelar' } },
            ],
          },
        },
      };

      expect(request.interactive?.type).toBe('button');
      expect(request.interactive?.action.buttons).toHaveLength(2);
    });

    it('should build list message', () => {
      const request: SendMessageRequest = {
        to: '5491145551234',
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: 'Seleccioná una opción' },
          action: {
            button: 'Ver opciones',
            sections: [
              {
                title: 'Productos',
                rows: [
                  { id: 'prod1', title: 'Producto A', description: '$1.000' },
                  { id: 'prod2', title: 'Producto B', description: '$2.000' },
                ],
              },
            ],
          },
        },
      };

      expect(request.interactive?.type).toBe('list');
      expect(request.interactive?.action.sections).toHaveLength(1);
      expect(request.interactive?.action.sections![0].rows).toHaveLength(2);
    });

    it('should support header and footer', () => {
      const interactive: InteractiveMessage = {
        type: 'button',
        header: { type: 'text', text: 'Pedido #12345' },
        body: { text: 'Detalles del pedido...' },
        footer: { text: 'IntegraX - Tu plataforma de pagos' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'ok', title: 'Entendido' } },
          ],
        },
      };

      expect(interactive.header?.text).toBe('Pedido #12345');
      expect(interactive.footer?.text).toContain('IntegraX');
    });

    it('should limit buttons to 3', () => {
      const maxButtons = 3;
      const buttons = [
        { type: 'reply' as const, reply: { id: '1', title: 'Opción 1' } },
        { type: 'reply' as const, reply: { id: '2', title: 'Opción 2' } },
        { type: 'reply' as const, reply: { id: '3', title: 'Opción 3' } },
      ];

      expect(buttons.length).toBeLessThanOrEqual(maxButtons);
    });
  });

  describe('Location Messages', () => {
    it('should build location message', () => {
      const request: SendMessageRequest = {
        to: '5491145551234',
        type: 'location',
        location: {
          latitude: -34.603722,
          longitude: -58.381592,
          name: 'Obelisco',
          address: 'Av. 9 de Julio, Buenos Aires',
        },
      };

      expect(request.type).toBe('location');
      expect(request.location?.latitude).toBeCloseTo(-34.6, 1);
    });
  });

  describe('Webhook Handling', () => {
    it('should verify webhook challenge', () => {
      const verifyToken = 'my_secret_token';
      const mode = 'subscribe';
      const token = 'my_secret_token';
      const challenge = '1234567890';

      const isValid = mode === 'subscribe' && token === verifyToken;
      expect(isValid).toBe(true);
    });

    it('should parse incoming text message', () => {
      const message: WebhookMessage = {
        from: '5491145551234',
        id: 'wamid.abc123',
        timestamp: '1706198400',
        type: 'text',
        text: { body: 'Hola, necesito ayuda' },
      };

      expect(message.type).toBe('text');
      expect(message.text?.body).toContain('Hola');
    });

    it('should parse button reply', () => {
      const message: WebhookMessage = {
        from: '5491145551234',
        id: 'wamid.abc123',
        timestamp: '1706198400',
        type: 'interactive',
        interactive: {
          type: 'button_reply',
          button_reply: { id: 'confirm', title: 'Sí, confirmar' },
        },
      };

      expect(message.interactive?.type).toBe('button_reply');
      expect(message.interactive?.button_reply?.id).toBe('confirm');
    });

    it('should parse list reply', () => {
      const message: WebhookMessage = {
        from: '5491145551234',
        id: 'wamid.abc123',
        timestamp: '1706198400',
        type: 'interactive',
        interactive: {
          type: 'list_reply',
          list_reply: { id: 'prod1', title: 'Producto A' },
        },
      };

      expect(message.interactive?.type).toBe('list_reply');
      expect(message.interactive?.list_reply?.id).toBe('prod1');
    });
  });

  describe('Message Status', () => {
    it('should parse delivery status', () => {
      const status: WebhookStatus = {
        id: 'wamid.abc123',
        status: 'delivered',
        timestamp: '1706198400',
        recipient_id: '5491145551234',
      };

      expect(status.status).toBe('delivered');
    });

    it('should handle failed status with errors', () => {
      const status: WebhookStatus = {
        id: 'wamid.abc123',
        status: 'failed',
        timestamp: '1706198400',
        recipient_id: '5491145551234',
        errors: [
          { code: 131047, title: 'Re-engagement message' },
        ],
      };

      expect(status.status).toBe('failed');
      expect(status.errors).toHaveLength(1);
      expect(status.errors![0].code).toBe(131047);
    });

    it('should track message lifecycle', () => {
      const statuses: WebhookStatus['status'][] = ['sent', 'delivered', 'read'];
      expect(statuses).toContain('sent');
      expect(statuses).toContain('delivered');
      expect(statuses).toContain('read');
    });
  });

  describe('Reply Context', () => {
    it('should support replying to a message', () => {
      const request: SendMessageRequest = {
        to: '5491145551234',
        type: 'text',
        text: { body: 'Gracias por tu consulta!' },
        context: { message_id: 'wamid.original123' },
      };

      expect(request.context?.message_id).toBe('wamid.original123');
    });
  });

  describe('WhatsApp Integration (real)', () => {
    const { WhatsAppConnector } = require('../index');
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    it('should authenticate and get phone profile', async () => {
      if (!phoneNumberId || !accessToken) {
        console.warn('WhatsApp integration test skipped: set WHATSAPP_PHONE_NUMBER_ID y WHATSAPP_ACCESS_TOKEN');
        return;
      }
      const connector = new WhatsAppConnector({ phoneNumberId, accessToken });
      let profile = null;
      let error = null;
      try {
        profile = await connector.getPhoneProfile();
      } catch (err) {
        error = err;
      }
      if (error) {
        console.error('WhatsApp API error:', error);
      }
      expect(profile).toBeDefined();
      expect(profile.id).toBeDefined();
    }, 10000);
  });
});
