export type { ILLMAdapter, LLMMessage, LLMCompletion, LLMCompletionOptions, LLMTool, LLMToolUse } from './llm-adapter.js';
export { ClaudeAdapter } from './claude-adapter.js';
export type { ClaudeAdapterConfig } from './claude-adapter.js';

export type { IQueueAdapter, EnqueueOptions, JobStatus } from './queue-adapter.js';
export { BullMQAdapter } from './bullmq-adapter.js';

export type { IEmailAdapter, EmailMessage, EmailSendResult } from './email-adapter.js';
export { ResendEmailAdapter, SmtpEmailAdapter } from './resend-adapter.js';

import type { IEmailAdapter } from './email-adapter.js';
import { ResendEmailAdapter } from './resend-adapter.js';
import { SmtpEmailAdapter } from './resend-adapter.js';

/** Factory — picks Resend when RESEND_API_KEY present, falls back to SMTP. */
export function createEmailAdapter(env: Record<string, string | undefined> = process.env as Record<string, string | undefined>): IEmailAdapter {
  if (env['RESEND_API_KEY']) {
    return new ResendEmailAdapter(env['RESEND_API_KEY'], env['EMAIL_FROM']);
  }
  return new SmtpEmailAdapter({
    host: env['SMTP_HOST'] ?? 'localhost',
    port: parseInt(env['SMTP_PORT'] ?? '587', 10),
    secure: env['SMTP_SECURE'] === 'true',
    user: env['SMTP_USER'] ?? '',
    pass: env['SMTP_PASS'] ?? '',
    defaultFrom: env['EMAIL_FROM'],
  });
}
