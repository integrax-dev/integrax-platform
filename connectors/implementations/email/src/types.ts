/**
 * Email/SMTP Connector Types for IntegraX
 * Supports transactional emails, templates, and attachments
 */

// SMTP Configuration
export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean; // true for 465, false for other ports
  auth: {
    user: string;
    pass: string;
  };
  // Optional settings
  pool?: boolean;
  maxConnections?: number;
  maxMessages?: number;
  rateDelta?: number;
  rateLimit?: number;
  // TLS options
  tls?: {
    rejectUnauthorized?: boolean;
    servername?: string;
  };
}

// Common email providers presets
export type EmailProvider =
  | 'smtp'
  | 'gmail'
  | 'outlook'
  | 'sendgrid'
  | 'ses'
  | 'mailgun'
  | 'zoho';

export interface EmailProviderConfig {
  provider: EmailProvider;
  apiKey?: string; // For SendGrid, Mailgun, etc.
  auth?: {
    user: string;
    pass: string;
  };
  region?: string; // For SES
}

// Email Address
export interface EmailAddress {
  name?: string;
  address: string;
}

export type EmailRecipient = string | EmailAddress;

// Attachment
export interface EmailAttachment {
  filename: string;
  content?: string | Buffer;
  path?: string; // File path or URL
  href?: string; // URL to fetch
  contentType?: string;
  encoding?: 'base64' | 'binary' | 'hex';
  cid?: string; // Content-ID for inline images
  contentDisposition?: 'attachment' | 'inline';
}

// Email Headers
export interface EmailHeaders {
  [key: string]: string | string[];
}

// Send Email Input
export interface SendEmailInput {
  // Recipients
  from: EmailRecipient;
  to: EmailRecipient | EmailRecipient[];
  cc?: EmailRecipient | EmailRecipient[];
  bcc?: EmailRecipient | EmailRecipient[];
  replyTo?: EmailRecipient;

  // Content
  subject: string;
  text?: string;
  html?: string;

  // Attachments
  attachments?: EmailAttachment[];

  // Optional
  headers?: EmailHeaders;
  priority?: 'high' | 'normal' | 'low';
  messageId?: string;
  references?: string[];
  inReplyTo?: string;

  // Tracking (for providers that support it)
  tracking?: {
    opens?: boolean;
    clicks?: boolean;
  };

  // Tags/Categories
  tags?: string[];
  category?: string;
}

// Template Email Input
export interface SendTemplateEmailInput {
  from: EmailRecipient;
  to: EmailRecipient | EmailRecipient[];
  cc?: EmailRecipient | EmailRecipient[];
  bcc?: EmailRecipient | EmailRecipient[];
  replyTo?: EmailRecipient;

  // Template
  templateId?: string;
  templateName?: string;
  templateData: Record<string, any>;

  // Fallback subject if template doesn't have one
  subject?: string;

  attachments?: EmailAttachment[];
  headers?: EmailHeaders;
  priority?: 'high' | 'normal' | 'low';
  tags?: string[];
}

// Bulk Email Input
export interface BulkEmailInput {
  from: EmailRecipient;
  subject: string;
  text?: string;
  html?: string;

  recipients: Array<{
    to: EmailRecipient;
    cc?: EmailRecipient[];
    bcc?: EmailRecipient[];
    // Per-recipient template variables
    variables?: Record<string, any>;
  }>;

  // Rate limiting
  batchSize?: number;
  delayBetweenBatches?: number; // ms
}

// Send Result
export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  accepted?: string[];
  rejected?: string[];
  pending?: string[];
  response?: string;
  envelope?: {
    from: string;
    to: string[];
  };
}

// Bulk Send Result
export interface BulkEmailResult {
  total: number;
  sent: number;
  failed: number;
  results: Array<{
    recipient: string;
    success: boolean;
    messageId?: string;
    error?: string;
  }>;
}

// Email Template (for local templates)
export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  textBody?: string;
  htmlBody?: string;
  variables: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Verify Connection Result
export interface VerifyConnectionResult {
  success: boolean;
  message?: string;
  serverInfo?: {
    name: string;
    version?: string;
    capabilities?: string[];
  };
}

// Common Argentine business email templates
export interface ArgentinaBusinessTemplates {
  facturaEnviada: {
    numeroFactura: string;
    fechaEmision: string;
    cae: string;
    fechaVencimientoCae: string;
    total: string;
    clienteNombre: string;
    linkPdf?: string;
  };

  pagoRecibido: {
    numeroPago: string;
    monto: string;
    metodoPago: string;
    fechaPago: string;
    clienteNombre: string;
  };

  recordatorioPago: {
    numeroFactura: string;
    fechaVencimiento: string;
    montoAdeudado: string;
    clienteNombre: string;
    diasVencido?: number;
  };

  bienvenidaCliente: {
    clienteNombre: string;
    empresaNombre: string;
    proximosPasos?: string[];
  };
}

// Email Events (for webhooks)
export type EmailEventType =
  | 'delivered'
  | 'bounced'
  | 'opened'
  | 'clicked'
  | 'complained'
  | 'unsubscribed';

export interface EmailEvent {
  type: EmailEventType;
  messageId: string;
  recipient: string;
  timestamp: Date;
  metadata?: Record<string, any>;
  // Bounce details
  bounceType?: 'hard' | 'soft' | 'complaint';
  bounceReason?: string;
  // Click details
  clickedUrl?: string;
}
