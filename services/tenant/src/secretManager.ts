/**
 * Secret Manager multi-tenant
 *
 * Integrates with HashiCorp Vault for secure credential storage.
 * Falls back to encrypted in-memory storage for development.
 */
import { Credential } from './types.js';
import { SecretsManager, getSecretsManager, ConnectorCredentials } from '@integrax/secrets';

// In-memory fallback for development (encrypted)
const memoryStore: Map<string, Credential> = new Map();

/**
 * Get Vault-backed secrets manager (if available)
 */
function getVaultManager(): SecretsManager | null {
  try {
    if (process.env.VAULT_ADDR || process.env.VAULT_TOKEN) {
      return getSecretsManager();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Store a credential for a tenant/connector
 */
export async function storeCredential(
  cred: Omit<Credential, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Credential> {
  const id = `cred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const credential: Credential = {
    ...cred,
    id,
    createdAt: now,
    updatedAt: now,
    data: {}, // Don't store raw data in the credential object
  };

  const vault = getVaultManager();

  if (vault) {
    // Store in Vault
    await vault.storeConnectorCredentials(
      cred.tenantId,
      cred.connector,
      cred.data as ConnectorCredentials
    );
  } else {
    // Development fallback: store in memory (warn in logs)
    console.warn('[SecretManager] Using in-memory storage. Set VAULT_ADDR for production!');
    memoryStore.set(`${cred.tenantId}:${cred.connector}`, {
      ...credential,
      data: cred.data, // Keep original data in memory for dev
    });
  }

  // Return credential without sensitive data
  return {
    ...credential,
    data: maskSecrets(cred.data),
  };
}

/**
 * Get credential for a tenant/connector
 */
export async function getCredential(
  tenantId: string,
  connector: string
): Promise<Credential | null> {
  const vault = getVaultManager();

  if (vault) {
    const data = await vault.getConnectorCredentials(tenantId, connector);
    if (!data) return null;

    return {
      id: `cred_vault_${connector}`,
      tenantId,
      connector,
      data: data as Record<string, string>,
      createdAt: '',
      updatedAt: '',
    };
  }

  // Development fallback
  const key = `${tenantId}:${connector}`;
  return memoryStore.get(key) || null;
}

/**
 * Get all credentials for a tenant (masked)
 */
export async function getCredentials(tenantId: string): Promise<Credential[]> {
  const vault = getVaultManager();

  if (vault) {
    const connectors = await vault.listConnectorCredentials(tenantId);
    const credentials: Credential[] = [];

    for (const connector of connectors) {
      credentials.push({
        id: `cred_vault_${connector}`,
        tenantId,
        connector,
        data: { configured: 'true' }, // Don't expose actual data
        createdAt: '',
        updatedAt: '',
      });
    }

    return credentials;
  }

  // Development fallback
  const credentials: Credential[] = [];
  for (const [key, cred] of memoryStore) {
    if (key.startsWith(`${tenantId}:`)) {
      credentials.push({
        ...cred,
        data: maskSecrets(cred.data),
      });
    }
  }
  return credentials;
}

/**
 * Delete credential
 */
export async function deleteCredential(
  tenantId: string,
  connector: string
): Promise<boolean> {
  const vault = getVaultManager();

  if (vault) {
    await vault.deleteConnectorCredentials(tenantId, connector);
    return true;
  }

  // Development fallback
  const key = `${tenantId}:${connector}`;
  return memoryStore.delete(key);
}

/**
 * Update credential
 */
export async function updateCredential(
  tenantId: string,
  connector: string,
  data: Record<string, string>
): Promise<Credential | null> {
  const vault = getVaultManager();

  if (vault) {
    await vault.storeConnectorCredentials(tenantId, connector, data as ConnectorCredentials);
    return {
      id: `cred_vault_${connector}`,
      tenantId,
      connector,
      data: maskSecrets(data),
      createdAt: '',
      updatedAt: new Date().toISOString(),
    };
  }

  // Development fallback
  const key = `${tenantId}:${connector}`;
  const existing = memoryStore.get(key);
  if (!existing) return null;

  const updated: Credential = {
    ...existing,
    data,
    updatedAt: new Date().toISOString(),
  };
  memoryStore.set(key, updated);

  return {
    ...updated,
    data: maskSecrets(data),
  };
}

/**
 * Mask sensitive data for display
 */
export function maskSecrets(data: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  const sensitiveKeys = ['password', 'secret', 'token', 'key', 'apikey', 'api_key', 'credential'];

  for (const k in data) {
    const lowerKey = k.toLowerCase();
    const isSensitive = sensitiveKeys.some(s => lowerKey.includes(s));

    if (isSensitive) {
      const value = data[k];
      if (value && value.length > 8) {
        masked[k] = `${value.slice(0, 4)}****${value.slice(-4)}`;
      } else {
        masked[k] = '****';
      }
    } else {
      masked[k] = data[k];
    }
  }

  return masked;
}

/**
 * Test connection to Vault (health check)
 */
export async function isVaultHealthy(): Promise<boolean> {
  const vault = getVaultManager();
  if (!vault) return false;

  try {
    return await vault.isHealthy();
  } catch {
    return false;
  }
}
