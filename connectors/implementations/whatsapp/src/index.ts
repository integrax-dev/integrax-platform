/**
 * WhatsApp Business API Connector
 *
 * Conector para enviar mensajes via WhatsApp Business Cloud API.
 * Soporta mensajes de texto, templates, media y mensajes interactivos.
 */

import {
  BaseConnector,
  ConnectorSpec,
  ActionDefinition,
  ResolvedCredentials,
  ConnectorError,
  WebhookPayload,
} from '@integrax/connector-sdk';
import { z } from 'zod';
import {
  WhatsAppConfig,
  SendMessageRequest,
  SendMessageRequestSchema,
  SendMessageResponse,
  WhatsAppError,
  WebhookPayload as WhatsAppWebhookPayload,
  WebhookMessage,
  WebhookStatus,
  WhatsAppTemplate,
  TemplateMessage,
  TextMessage,
  MediaMessage,
  InteractiveMessage,
} from './types.js';

const WHATSAPP_API_BASE = 'https://graph.facebook.com';
const DEFAULT_API_VERSION = 'v18.0';

export class WhatsAppConnector extends BaseConnector {
  private config: WhatsAppConfig;
  private apiVersion: string;

  constructor(config: WhatsAppConfig) {
    super();
    this.config = config;
    this.apiVersion = config.apiVersion || DEFAULT_API_VERSION;
  }

  protected registerActions(): void {
    const actions = this.getActions();
    for (const action of actions) {
      this.registerAction(action.id, async (input: any) => {
        const method = action.id as keyof this;
        if (typeof this[method] === 'function') {
          return (this as any)[method](input);
        }
        throw new ConnectorError('NOT_IMPLEMENTED', 'Action not implemented');
      });
    }
  }

  // ============================================
  // Connector Interface
  // ============================================

  getSpec(): ConnectorSpec {
    return {
      metadata: {
        id: 'whatsapp',
        name: 'WhatsApp Business',
        description: 'Envía mensajes via WhatsApp Business Cloud API',
        version: '0.1.0',
        category: 'notification',
        status: 'active',
      },
      authType: 'api_key',
      authSchema: z.any(),
      actions: this.getActions(),
    };
  }

  async testConnection(credentials: ResolvedCredentials): Promise<import('@integrax/connector-sdk').TestConnectionResult> {
    try {
      if (credentials.accessToken) {
        this.config.accessToken = credentials.accessToken;
      }
      await this.getPhoneNumberInfo();
      return { success: true, testedAt: new Date(), latencyMs: 0 };
    } catch (error: any) {
      return { success: false, testedAt: new Date(), latencyMs: 0, error: { code: 'FAIL', message: error.message || 'Connection failed' } };
    }
  }

  getActions(): ActionDefinition[] {
    return [
      {
        id: 'sendText',
        name: 'Enviar Texto',
        description: 'Envía un mensaje de texto simple',
        inputSchema: z.object({
          to: z.string().describe('Número con código de país (ej: 5491155551234)'),
          text: z.string().describe('Texto del mensaje'),
          previewUrl: z.boolean().optional(),
        }),
        outputSchema: z.any(),
      },
      {
        id: 'sendTemplate',
        name: 'Enviar Template',
        description: 'Envía un mensaje usando un template pre-aprobado',
        inputSchema: z.object({
          to: z.string(),
          templateName: z.string(),
          languageCode: z.string(),
          parameters: z.array(z.any()).optional(),
        }),
        outputSchema: z.any(),
      },
      {
        id: 'sendImage',
        name: 'Enviar Imagen',
        description: 'Envía una imagen con caption opcional',
        inputSchema: z.object({
          to: z.string(),
          imageUrl: z.string(),
          caption: z.string().optional(),
        }),
        outputSchema: z.any(),
      },
      {
        id: 'sendDocument',
        name: 'Enviar Documento',
        description: 'Envía un documento (PDF, etc)',
        inputSchema: z.object({
          to: z.string(),
          documentUrl: z.string(),
          filename: z.string().optional(),
          caption: z.string().optional(),
        }),
        outputSchema: z.any(),
      },
      {
        id: 'sendInteractiveButtons',
        name: 'Enviar Botones',
        description: 'Envía un mensaje con botones interactivos',
        inputSchema: z.object({
          to: z.string(),
          body: z.string(),
          buttons: z.array(z.object({ id: z.string(), title: z.string() })),
          header: z.string().optional(),
          footer: z.string().optional(),
        }),
        outputSchema: z.any(),
      },
      {
        id: 'listTemplates',
        name: 'Listar Templates',
        description: 'Lista los templates disponibles',
        inputSchema: z.any(),
        outputSchema: z.any(),
      },
    ];
  }

  // ============================================
  // API Request Helper
  // ============================================

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${WHATSAPP_API_BASE}/${this.apiVersion}/${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      const error = data as WhatsAppError;
      throw new ConnectorError(
        'API_ERROR',
        `WhatsApp API error: ${error.error?.message || response.statusText}`,
        false,
        { code: error.error?.code, subcode: error.error?.error_subcode }
      );
    }

    return data as T;
  }

  // ============================================
  // Send Messages
  // ============================================

  /**
   * Envía un mensaje genérico
   */
  async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
    const validated = SendMessageRequestSchema.parse(request);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: validated.to,
      type: validated.type,
      [validated.type]: validated[validated.type as keyof typeof validated],
      context: validated.context,
    };

    return this.request<SendMessageResponse>(
      'POST',
      `${this.config.phoneNumberId}/messages`,
      payload
    );
  }

  /**
   * Envía un mensaje de texto simple
   */
  async sendText(to: string, text: string, previewUrl = false): Promise<SendMessageResponse> {
    return this.sendMessage({
      to,
      type: 'text',
      text: { body: text, preview_url: previewUrl },
    });
  }

  /**
   * Envía un mensaje usando un template
   */
  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    parameters?: Array<{ type: 'text'; text: string }>
  ): Promise<SendMessageResponse> {
    const template: TemplateMessage = {
      name: templateName,
      language: { code: languageCode },
    };

    if (parameters && parameters.length > 0) {
      template.components = [
        {
          type: 'body',
          parameters: parameters,
        },
      ];
    }

    return this.sendMessage({
      to,
      type: 'template',
      template,
    });
  }

  /**
   * Envía una imagen
   */
  async sendImage(
    to: string,
    imageUrl: string,
    caption?: string
  ): Promise<SendMessageResponse> {
    return this.sendMessage({
      to,
      type: 'image',
      image: { link: imageUrl, caption },
    });
  }

  /**
   * Envía un documento
   */
  async sendDocument(
    to: string,
    documentUrl: string,
    filename?: string,
    caption?: string
  ): Promise<SendMessageResponse> {
    return this.sendMessage({
      to,
      type: 'document',
      document: { link: documentUrl, filename, caption },
    });
  }

  /**
   * Envía un mensaje con botones interactivos
   */
  async sendInteractiveButtons(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
    header?: string,
    footer?: string
  ): Promise<SendMessageResponse> {
    const interactive: InteractiveMessage = {
      type: 'button',
      body: { text: body },
      action: {
        buttons: buttons.map((btn) => ({
          type: 'reply' as const,
          reply: { id: btn.id, title: btn.title },
        })),
      },
    };

    if (header) {
      interactive.header = { type: 'text', text: header };
    }
    if (footer) {
      interactive.footer = { text: footer };
    }

    return this.sendMessage({
      to,
      type: 'interactive',
      interactive,
    });
  }

  /**
   * Envía un mensaje con lista interactiva
   */
  async sendInteractiveList(
    to: string,
    body: string,
    buttonText: string,
    sections: Array<{
      title?: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
    header?: string,
    footer?: string
  ): Promise<SendMessageResponse> {
    const interactive: InteractiveMessage = {
      type: 'list',
      body: { text: body },
      action: {
        button: buttonText,
        sections: sections,
      },
    };

    if (header) {
      interactive.header = { type: 'text', text: header };
    }
    if (footer) {
      interactive.footer = { text: footer };
    }

    return this.sendMessage({
      to,
      type: 'interactive',
      interactive,
    });
  }

  /**
   * Envía ubicación
   */
  async sendLocation(
    to: string,
    latitude: number,
    longitude: number,
    name?: string,
    address?: string
  ): Promise<SendMessageResponse> {
    return this.sendMessage({
      to,
      type: 'location',
      location: { latitude, longitude, name, address },
    });
  }

  // ============================================
  // Templates
  // ============================================

  /**
   * Lista los templates disponibles
   */
  async listTemplates(): Promise<WhatsAppTemplate[]> {
    if (!this.config.businessAccountId) {
      throw new ConnectorError(
        'CONFIGURATION_ERROR',
        'businessAccountId is required to list templates'
      );
    }

    const response = await this.request<{ data: WhatsAppTemplate[] }>(
      'GET',
      `${this.config.businessAccountId}/message_templates`
    );

    return response.data;
  }

  // ============================================
  // Phone Number Info
  // ============================================

  async getPhoneNumberInfo(): Promise<{
    id: string;
    display_phone_number: string;
    verified_name: string;
  }> {
    return this.request('GET', this.config.phoneNumberId);
  }

  // ============================================
  // Webhook Handling
  // ============================================

  /**
   * Verifica el webhook de WhatsApp (challenge) para el setup inicial (GET)
   */
  async verifyWebhookConnection(
    mode: string,
    token: string,
    challenge: string
  ): Promise<{ valid: boolean; challenge?: string }> {
    if (mode === 'subscribe' && token === this.config.webhookVerifyToken) {
      return { valid: true, challenge };
    }
    return { valid: false };
  }

  /**
   * Implementación estándar de verifyWebhookSignature
   */
  override async verifyWebhookSignature(
    payload: WebhookPayload,
    secret: string
  ): Promise<boolean> {
    // WhatsApp usa X-Hub-Signature-256
    const signature = payload.headers['x-hub-signature-256'];
    if (!signature) return false;
    // TODO: Implementar validación HMAC con el APP SECRET de Meta
    return true;
  }

  /**
   * Implementación estándar de parseWebhook (POST)
   */
  override async parseWebhook(
    payload: WebhookPayload,
    _context: any
  ): Promise<any> { // Debería retornar NormalizedEvent pero WhatsApp puede enviar múltiples
    const data = payload.body as WhatsAppWebhookPayload;
    if (!data.entry) return null;

    const messages: any[] = [];
    const statuses: any[] = [];

    for (const entry of data.entry) {
      for (const change of entry.changes) {
        const value = change.value;
        if (value.messages) {
          for (const msg of value.messages) {
            const contact = value.contacts?.find((c: any) => c.wa_id === msg.from);
            messages.push({
              ...msg,
              contact: contact ? { name: contact.profile.name, wa_id: contact.wa_id } : undefined,
            });
          }
        }
        if (value.statuses) {
          statuses.push(...value.statuses);
        }
      }
    }

    return { messages, statuses };
  }

  // ============================================
  // Utility: Argentina Phone Formatting
  // ============================================

  /**
   * Formatea un número de teléfono argentino al formato WhatsApp
   * Ej: 011-4555-1234 -> 5491145551234
   */
  static formatArgentinaPhone(phone: string): string {
    // Remove all non-digits
    let digits = phone.replace(/\D/g, '');

    // Remove leading 0 if present
    if (digits.startsWith('0')) {
      digits = digits.substring(1);
    }

    // Remove 15 for mobile numbers
    if (digits.length === 10 && digits.substring(2, 4) === '15') {
      digits = digits.substring(0, 2) + digits.substring(4);
    }

    // Add country code if not present
    if (!digits.startsWith('54')) {
      digits = '54' + digits;
    }

    // Add 9 for mobile if not present (after 54)
    if (digits.startsWith('54') && !digits.startsWith('549')) {
      digits = '549' + digits.substring(2);
    }

    return digits;
  }
}

// Export types
export * from './types.js';

// Factory function
export function createWhatsAppConnector(config: WhatsAppConfig): WhatsAppConnector {
  return new WhatsAppConnector(config);
}
