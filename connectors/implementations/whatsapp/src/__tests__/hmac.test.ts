/**
 * WhatsApp HMAC signature validation tests
 */

import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { WhatsAppConnector } from '../index.js';

function makeConnector() {
  return new WhatsAppConnector({
    phoneNumberId: 'test-phone-id',
    accessToken: 'test-token',
  });
}

function signPayload(body: string, secret: string): string {
  const hmac = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${hmac}`;
}

describe('WhatsApp verifyWebhookSignature', () => {
  it('accepts a valid HMAC-SHA256 signature', async () => {
    const connector = makeConnector();
    const secret = 'my-app-secret';
    const body = JSON.stringify({ object: 'whatsapp_business_account' });
    const signature = signPayload(body, secret);

    const result = await connector.verifyWebhookSignature(
      { headers: { 'x-hub-signature-256': signature }, body: {}, rawBody: body },
      secret,
    );

    expect(result).toBe(true);
  });

  it('rejects a tampered payload', async () => {
    const connector = makeConnector();
    const secret = 'my-app-secret';
    const originalBody = JSON.stringify({ object: 'whatsapp_business_account' });
    const tamperedBody = JSON.stringify({ object: 'whatsapp_business_account', extra: 'injected' });
    const signature = signPayload(originalBody, secret);

    const result = await connector.verifyWebhookSignature(
      { headers: { 'x-hub-signature-256': signature }, body: {}, rawBody: tamperedBody },
      secret,
    );

    expect(result).toBe(false);
  });

  it('rejects a wrong secret', async () => {
    const connector = makeConnector();
    const body = JSON.stringify({ object: 'test' });
    const signature = signPayload(body, 'correct-secret');

    const result = await connector.verifyWebhookSignature(
      { headers: { 'x-hub-signature-256': signature }, body: {}, rawBody: body },
      'wrong-secret',
    );

    expect(result).toBe(false);
  });

  it('rejects missing signature header', async () => {
    const connector = makeConnector();
    const body = JSON.stringify({ object: 'test' });

    const result = await connector.verifyWebhookSignature(
      { headers: {}, body: {}, rawBody: body },
      'secret',
    );

    expect(result).toBe(false);
  });

  it('rejects malformed signature (no sha256= prefix)', async () => {
    const connector = makeConnector();
    const body = JSON.stringify({ object: 'test' });
    const rawHmac = createHmac('sha256', 'secret').update(body).digest('hex');

    const result = await connector.verifyWebhookSignature(
      // missing the "sha256=" prefix — header length won't match
      { headers: { 'x-hub-signature-256': rawHmac }, body: {}, rawBody: body },
      'secret',
    );

    expect(result).toBe(false);
  });

  it('falls back to JSON.stringify(body) when rawBody is absent', async () => {
    const connector = makeConnector();
    const secret = 'secret';
    const bodyObj = { object: 'whatsapp_business_account', entry: [] };
    const bodyStr = JSON.stringify(bodyObj);
    const signature = signPayload(bodyStr, secret);

    const result = await connector.verifyWebhookSignature(
      { headers: { 'x-hub-signature-256': signature }, body: bodyObj },
      secret,
    );

    expect(result).toBe(true);
  });
});
