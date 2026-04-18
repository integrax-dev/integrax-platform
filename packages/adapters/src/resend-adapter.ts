import type { IEmailAdapter, EmailMessage, EmailSendResult } from './email-adapter.js';

interface ResendResponse {
  id: string;
  from: string;
  to: string[];
}

export class ResendEmailAdapter implements IEmailAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly defaultFrom = 'IntegraX <noreply@integrax.dev>',
  ) {}

  async send(msg: EmailMessage): Promise<EmailSendResult> {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: msg.from ?? this.defaultFrom,
        to: Array.isArray(msg.to) ? msg.to : [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        reply_to: msg.replyTo,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Resend API error ${resp.status}: ${err}`);
    }

    const data = await resp.json() as ResendResponse;
    return {
      messageId: data.id,
      accepted: Array.isArray(data.to) ? data.to : [data.to],
      rejected: [],
    };
  }
}

/** SMTP fallback via nodemailer — for self-hosted deployments */
export class SmtpEmailAdapter implements IEmailAdapter {
  private transporter: unknown = null;
  constructor(private readonly config: {
    host: string; port: number; secure: boolean;
    user: string; pass: string;
    defaultFrom?: string;
  }) {}

  private async getTransporter() {
    if (!this.transporter) {
      const nodemailer = await import('nodemailer');
      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: { user: this.config.user, pass: this.config.pass },
      });
    }
    return this.transporter as import('nodemailer').Transporter;
  }

  async send(msg: EmailMessage): Promise<EmailSendResult> {
    const t = await this.getTransporter();
    const info = await t.sendMail({
      from: msg.from ?? this.config.defaultFrom ?? 'noreply@integrax.dev',
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
    return {
      messageId: info.messageId,
      accepted: (info.accepted as string[]) ?? [],
      rejected: (info.rejected as string[]) ?? [],
    };
  }
}
