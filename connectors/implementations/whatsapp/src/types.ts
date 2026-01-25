/**
 * WhatsApp Business API Types
 *
 * Based on Meta's WhatsApp Cloud API
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

import { z } from 'zod';

// ============================================
// Configuration
// ============================================
export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  businessAccountId?: string;
  webhookVerifyToken?: string;
  apiVersion?: string;
}

// ============================================
// Message Types
// ============================================
export type MessageType = 'text' | 'template' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'contacts' | 'interactive';

// ============================================
// Text Message
// ============================================
export const TextMessageSchema = z.object({
  body: z.string().max(4096),
  preview_url: z.boolean().optional(),
});

export type TextMessage = z.infer<typeof TextMessageSchema>;

// ============================================
// Template Message
// ============================================
export const TemplateParameterSchema = z.object({
  type: z.enum(['text', 'currency', 'date_time', 'image', 'document', 'video']),
  text: z.string().optional(),
  currency: z
    .object({
      fallback_value: z.string(),
      code: z.string(),
      amount_1000: z.number(),
    })
    .optional(),
  date_time: z.object({ fallback_value: z.string() }).optional(),
  image: z.object({ link: z.string() }).optional(),
  document: z.object({ link: z.string() }).optional(),
  video: z.object({ link: z.string() }).optional(),
});

export type TemplateParameter = z.infer<typeof TemplateParameterSchema>;

export const TemplateComponentSchema = z.object({
  type: z.enum(['header', 'body', 'button']),
  sub_type: z.enum(['quick_reply', 'url']).optional(),
  index: z.number().optional(),
  parameters: z.array(TemplateParameterSchema).optional(),
});

export type TemplateComponent = z.infer<typeof TemplateComponentSchema>;

export const TemplateMessageSchema = z.object({
  name: z.string(),
  language: z.object({
    code: z.string(), // e.g., "es_AR", "en_US"
  }),
  components: z.array(TemplateComponentSchema).optional(),
});

export type TemplateMessage = z.infer<typeof TemplateMessageSchema>;

// ============================================
// Media Messages
// ============================================
export const MediaMessageSchema = z.object({
  id: z.string().optional(), // Media ID from upload
  link: z.string().url().optional(), // Or URL
  caption: z.string().max(1024).optional(),
  filename: z.string().optional(), // For documents
});

export type MediaMessage = z.infer<typeof MediaMessageSchema>;

// ============================================
// Location Message
// ============================================
export const LocationMessageSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  name: z.string().optional(),
  address: z.string().optional(),
});

export type LocationMessage = z.infer<typeof LocationMessageSchema>;

// ============================================
// Interactive Messages
// ============================================
export const InteractiveButtonSchema = z.object({
  type: z.literal('reply'),
  reply: z.object({
    id: z.string().max(256),
    title: z.string().max(20),
  }),
});

export const InteractiveListRowSchema = z.object({
  id: z.string().max(200),
  title: z.string().max(24),
  description: z.string().max(72).optional(),
});

export const InteractiveListSectionSchema = z.object({
  title: z.string().max(24).optional(),
  rows: z.array(InteractiveListRowSchema).max(10),
});

export const InteractiveMessageSchema = z.object({
  type: z.enum(['button', 'list', 'product', 'product_list']),
  header: z
    .object({
      type: z.enum(['text', 'image', 'video', 'document']),
      text: z.string().optional(),
      image: MediaMessageSchema.optional(),
      video: MediaMessageSchema.optional(),
      document: MediaMessageSchema.optional(),
    })
    .optional(),
  body: z.object({
    text: z.string().max(1024),
  }),
  footer: z
    .object({
      text: z.string().max(60),
    })
    .optional(),
  action: z.object({
    button: z.string().max(20).optional(), // For list
    buttons: z.array(InteractiveButtonSchema).max(3).optional(), // For button
    sections: z.array(InteractiveListSectionSchema).max(10).optional(), // For list
  }),
});

export type InteractiveMessage = z.infer<typeof InteractiveMessageSchema>;

// ============================================
// Send Message Request
// ============================================
export const SendMessageRequestSchema = z.object({
  to: z.string(), // Phone number with country code
  type: z.enum(['text', 'template', 'image', 'document', 'audio', 'video', 'location', 'interactive']),
  text: TextMessageSchema.optional(),
  template: TemplateMessageSchema.optional(),
  image: MediaMessageSchema.optional(),
  document: MediaMessageSchema.optional(),
  audio: MediaMessageSchema.optional(),
  video: MediaMessageSchema.optional(),
  location: LocationMessageSchema.optional(),
  interactive: InteractiveMessageSchema.optional(),
  context: z
    .object({
      message_id: z.string(), // For replying to a message
    })
    .optional(),
});

export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

// ============================================
// API Responses
// ============================================
export interface SendMessageResponse {
  messaging_product: 'whatsapp';
  contacts: Array<{
    input: string;
    wa_id: string;
  }>;
  messages: Array<{
    id: string;
  }>;
}

export interface WhatsAppError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

// ============================================
// Webhook Types
// ============================================
export interface WebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: MessageType;
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string };
  document?: { id: string; mime_type: string; sha256: string; filename: string };
  audio?: { id: string; mime_type: string };
  video?: { id: string; mime_type: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  button?: { text: string; payload: string };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  context?: { from: string; id: string };
}

export interface WebhookStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  conversation?: {
    id: string;
    origin: { type: string };
  };
  pricing?: {
    billable: boolean;
    pricing_model: string;
    category: string;
  };
  errors?: Array<{
    code: number;
    title: string;
    message?: string;
  }>;
}

export interface WebhookPayload {
  object: 'whatsapp_business_account';
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: 'whatsapp';
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: { name: string };
          wa_id: string;
        }>;
        messages?: WebhookMessage[];
        statuses?: WebhookStatus[];
      };
      field: 'messages';
    }>;
  }>;
}

// ============================================
// Template Types
// ============================================
export interface WhatsAppTemplate {
  name: string;
  language: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  category: 'AUTHENTICATION' | 'MARKETING' | 'UTILITY';
  components: Array<{
    type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
    format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
    text?: string;
    buttons?: Array<{
      type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
      text: string;
      url?: string;
      phone_number?: string;
    }>;
  }>;
}
