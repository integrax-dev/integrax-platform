// Secret Manager multi-tenant (mock, usar Vault/KMS en prod)
import { Credential } from './types';

const credentials: Credential[] = [];

export function storeCredential(cred: Omit<Credential, 'id' | 'createdAt' | 'updatedAt'>): Credential {
  const id = 'cred_' + Date.now();
  const now = new Date().toISOString();
  const credential: Credential = {
    ...cred,
    id,
    createdAt: now,
    updatedAt: now,
    data: maskSecrets(cred.data),
  };
  credentials.push(credential);
  return credential;
}

export function maskSecrets(data: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const k in data) {
    masked[k] = '****';
  }
  return masked;
}

export function getCredentials(tenantId: string): Credential[] {
  return credentials.filter(c => c.tenantId === tenantId);
}
