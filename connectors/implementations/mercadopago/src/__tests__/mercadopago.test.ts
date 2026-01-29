import { describe, it, expect } from 'vitest';
const { MercadoPagoConnector } = require('../index');
const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

describe('MercadoPago Integration (real)', () => {
  it('should authenticate and get user info', async () => {
    if (!accessToken) {
      console.warn('MercadoPago integration test skipped: set MERCADOPAGO_ACCESS_TOKEN');
      return;
    }
    const connector = new MercadoPagoConnector();
    const result = await connector.executeAction({
      actionId: 'get_user',
      credentials: { accessToken },
      params: {},
      context: { tenantId: 'test', correlationId: 'test' },
    });
    expect(result).toBeDefined();
    expect(result.email).toBeDefined();
  }, 10000);
});