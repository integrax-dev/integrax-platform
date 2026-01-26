import { storeCredential, getCredentials, maskSecrets } from '../secretManager';
import { describe, it, expect } from 'vitest';

describe('secretManager', () => {
  it('guarda y recupera credenciales enmascaradas', () => {
    const cred = storeCredential({
      tenantId: 't1',
      connector: 'mp',
      data: { token: '1234', secret: 'abcd' },
    });
    const creds = getCredentials('t1');
    expect(creds.length).toBeGreaterThan(0);
    expect(creds[0].data.token).toBe('****');
    expect(creds[0].data.secret).toBe('****');
  });

  it('enmascara secretos correctamente', () => {
    const masked = maskSecrets({ a: '1', b: '2' });
    expect(masked.a).toBe('****');
    expect(masked.b).toBe('****');
  });
});
