declare module 'nodemailer' {
  interface SentInfo {
    messageId: string;
    accepted: unknown[];
    rejected: unknown[];
    pending: unknown[];
    response?: string;
  }
  interface Transporter {
    sendMail(options: Record<string, unknown>): Promise<SentInfo>;
    verify(): Promise<void>;
    close(): void;
  }
  function createTransport(options: Record<string, unknown>): Transporter;
}
