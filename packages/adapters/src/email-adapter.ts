export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export interface EmailSendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

/** Provider-agnostic email interface. Implement for Resend, SMTP, SES, etc. */
export interface IEmailAdapter {
  send(message: EmailMessage): Promise<EmailSendResult>;
}
