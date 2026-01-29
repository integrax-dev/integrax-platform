/**
 * @integrax/secrets
 *
 * HashiCorp Vault integration for secure secrets management.
 * Supports tenant-isolated credential storage and dynamic secrets.
 */

import vault from 'node-vault';

export interface VaultConfig {
  endpoint?: string;
  token?: string;
  namespace?: string;
}

export interface SecretData {
  [key: string]: string | number | boolean;
}

export interface ConnectorCredentials {
  apiKey?: string;
  apiSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  username?: string;
  password?: string;
  webhookSecret?: string;
  [key: string]: string | undefined;
}

export class SecretsManager {
  private client: vault.client;
  private readonly mountPath: string = 'secret';
  private readonly basePath: string = 'integrax';

  constructor(config: VaultConfig = {}) {
    const isProduction = process.env.NODE_ENV === 'production';
    const vaultAddr = config.endpoint || process.env.VAULT_ADDR;
    const vaultToken = config.token || process.env.VAULT_TOKEN;

    // Validate required config in production
    if (isProduction && !vaultAddr) {
      throw new Error('VAULT_ADDR environment variable is required in production');
    }

    if (isProduction && !vaultToken) {
      throw new Error('VAULT_TOKEN environment variable is required in production');
    }

    if (!vaultAddr) {
      console.warn('[Secrets] WARNING: Using localhost Vault. Set VAULT_ADDR in production!');
    }

    if (!vaultToken) {
      console.warn('[Secrets] WARNING: No Vault token configured. Set VAULT_TOKEN!');
    }

    this.client = vault({
      apiVersion: 'v1',
      endpoint: vaultAddr || 'http://localhost:8200',
      token: vaultToken,
      namespace: config.namespace || process.env.VAULT_NAMESPACE,
    });
  }

  /**
   * Health check
   */
  async isHealthy(): Promise<boolean> {
    try {
      const health = await this.client.health();
      return health.initialized && !health.sealed;
    } catch {
      return false;
    }
  }

  // ============================================
  // Tenant Secrets
  // ============================================

  /**
   * Store tenant API keys
   */
  async storeTenantApiKey(tenantId: string, apiKey: string, apiKeyId: string): Promise<void> {
    const path = `${this.basePath}/tenants/${tenantId}/api-keys/${apiKeyId}`;
    await this.client.write(`${this.mountPath}/data/${path}`, {
      data: {
        key: apiKey,
        created_at: new Date().toISOString(),
      },
    });
  }

  /**
   * Get tenant API key
   */
  async getTenantApiKey(tenantId: string, apiKeyId: string): Promise<string | null> {
    try {
      const path = `${this.basePath}/tenants/${tenantId}/api-keys/${apiKeyId}`;
      const result = await this.client.read(`${this.mountPath}/data/${path}`);
      return result.data?.data?.key || null;
    } catch {
      return null;
    }
  }

  /**
   * Revoke tenant API key
   */
  async revokeTenantApiKey(tenantId: string, apiKeyId: string): Promise<void> {
    const path = `${this.basePath}/tenants/${tenantId}/api-keys/${apiKeyId}`;
    await this.client.delete(`${this.mountPath}/data/${path}`);
  }

  /**
   * List tenant API keys
   */
  async listTenantApiKeys(tenantId: string): Promise<string[]> {
    try {
      const path = `${this.basePath}/tenants/${tenantId}/api-keys`;
      const result = await this.client.list(`${this.mountPath}/metadata/${path}`);
      return result.data?.keys || [];
    } catch {
      return [];
    }
  }

  // ============================================
  // Connector Credentials
  // ============================================

  /**
   * Store connector credentials for a tenant
   */
  async storeConnectorCredentials(
    tenantId: string,
    connectorId: string,
    credentials: ConnectorCredentials
  ): Promise<void> {
    const path = `${this.basePath}/tenants/${tenantId}/connectors/${connectorId}`;
    await this.client.write(`${this.mountPath}/data/${path}`, {
      data: {
        ...credentials,
        updated_at: new Date().toISOString(),
      },
    });
  }

  /**
   * Get connector credentials for a tenant
   */
  async getConnectorCredentials(
    tenantId: string,
    connectorId: string
  ): Promise<ConnectorCredentials | null> {
    try {
      const path = `${this.basePath}/tenants/${tenantId}/connectors/${connectorId}`;
      const result = await this.client.read(`${this.mountPath}/data/${path}`);
      if (!result.data?.data) return null;

      const { updated_at, ...credentials } = result.data.data;
      return credentials as ConnectorCredentials;
    } catch {
      return null;
    }
  }

  /**
   * Delete connector credentials
   */
  async deleteConnectorCredentials(tenantId: string, connectorId: string): Promise<void> {
    const path = `${this.basePath}/tenants/${tenantId}/connectors/${connectorId}`;
    await this.client.delete(`${this.mountPath}/data/${path}`);
  }

  /**
   * List connector credentials for a tenant
   */
  async listConnectorCredentials(tenantId: string): Promise<string[]> {
    try {
      const path = `${this.basePath}/tenants/${tenantId}/connectors`;
      const result = await this.client.list(`${this.mountPath}/metadata/${path}`);
      return result.data?.keys || [];
    } catch {
      return [];
    }
  }

  // ============================================
  // Webhook Secrets
  // ============================================

  /**
   * Store webhook signing secret
   */
  async storeWebhookSecret(tenantId: string, webhookId: string, secret: string): Promise<void> {
    const path = `${this.basePath}/tenants/${tenantId}/webhooks/${webhookId}`;
    await this.client.write(`${this.mountPath}/data/${path}`, {
      data: {
        secret,
        created_at: new Date().toISOString(),
      },
    });
  }

  /**
   * Get webhook signing secret
   */
  async getWebhookSecret(tenantId: string, webhookId: string): Promise<string | null> {
    try {
      const path = `${this.basePath}/tenants/${tenantId}/webhooks/${webhookId}`;
      const result = await this.client.read(`${this.mountPath}/data/${path}`);
      return result.data?.data?.secret || null;
    } catch {
      return null;
    }
  }

  /**
   * Rotate webhook secret
   */
  async rotateWebhookSecret(tenantId: string, webhookId: string): Promise<string> {
    const newSecret = generateSecret(32);
    await this.storeWebhookSecret(tenantId, webhookId, newSecret);
    return newSecret;
  }

  // ============================================
  // Encryption Keys
  // ============================================

  /**
   * Store encryption key for tenant data
   */
  async storeTenantEncryptionKey(tenantId: string, key: string): Promise<void> {
    const path = `${this.basePath}/tenants/${tenantId}/encryption`;
    await this.client.write(`${this.mountPath}/data/${path}`, {
      data: {
        key,
        version: 1,
        created_at: new Date().toISOString(),
      },
    });
  }

  /**
   * Get tenant encryption key
   */
  async getTenantEncryptionKey(tenantId: string): Promise<string | null> {
    try {
      const path = `${this.basePath}/tenants/${tenantId}/encryption`;
      const result = await this.client.read(`${this.mountPath}/data/${path}`);
      return result.data?.data?.key || null;
    } catch {
      return null;
    }
  }

  // ============================================
  // Dynamic Database Credentials
  // ============================================

  /**
   * Get dynamic database credentials for a tenant
   * Requires Vault database secrets engine configured
   */
  async getDatabaseCredentials(tenantId: string, role: string = 'readonly'): Promise<{
    username: string;
    password: string;
    ttl: number;
  } | null> {
    try {
      const result = await this.client.read(`database/creds/${tenantId}-${role}`);
      return {
        username: result.data.username,
        password: result.data.password,
        ttl: result.lease_duration,
      };
    } catch {
      return null;
    }
  }

  // ============================================
  // Platform Secrets (Global)
  // ============================================

  /**
   * Store platform-wide secret
   */
  async storePlatformSecret(key: string, value: SecretData): Promise<void> {
    const path = `${this.basePath}/platform/${key}`;
    await this.client.write(`${this.mountPath}/data/${path}`, {
      data: {
        ...value,
        updated_at: new Date().toISOString(),
      },
    });
  }

  /**
   * Get platform-wide secret
   */
  async getPlatformSecret(key: string): Promise<SecretData | null> {
    try {
      const path = `${this.basePath}/platform/${key}`;
      const result = await this.client.read(`${this.mountPath}/data/${path}`);
      if (!result.data?.data) return null;

      const { updated_at, ...data } = result.data.data;
      return data;
    } catch {
      return null;
    }
  }

  // ============================================
  // Transit Encryption (Encrypt as a Service)
  // ============================================

  /**
   * Encrypt data using Vault Transit
   */
  async encrypt(tenantId: string, plaintext: string): Promise<string> {
    const result = await this.client.write(`transit/encrypt/${tenantId}`, {
      plaintext: Buffer.from(plaintext).toString('base64'),
    });
    return result.data.ciphertext;
  }

  /**
   * Decrypt data using Vault Transit
   */
  async decrypt(tenantId: string, ciphertext: string): Promise<string> {
    const result = await this.client.write(`transit/decrypt/${tenantId}`, {
      ciphertext,
    });
    return Buffer.from(result.data.plaintext, 'base64').toString();
  }

  // ============================================
  // Tenant Lifecycle
  // ============================================

  /**
   * Initialize secrets for a new tenant
   */
  async initializeTenant(tenantId: string): Promise<{
    apiKey: string;
    webhookSecret: string;
    encryptionKey: string;
  }> {
    const apiKey = generateApiKey();
    const apiKeyId = `ak_${generateId()}`;
    const webhookSecret = generateSecret(32);
    const encryptionKey = generateSecret(32);

    await Promise.all([
      this.storeTenantApiKey(tenantId, apiKey, apiKeyId),
      this.storeWebhookSecret(tenantId, 'default', webhookSecret),
      this.storeTenantEncryptionKey(tenantId, encryptionKey),
    ]);

    return { apiKey, webhookSecret, encryptionKey };
  }

  /**
   * Delete all secrets for a tenant
   */
  async deleteTenant(tenantId: string): Promise<void> {
    const path = `${this.basePath}/tenants/${tenantId}`;

    // Note: This requires the metadata delete capability
    // In production, you might want to soft-delete or archive
    try {
      await this.client.delete(`${this.mountPath}/metadata/${path}`);
    } catch {
      // Ignore errors if path doesn't exist
    }
  }
}

// ============================================
// Helper Functions
// ============================================

function generateSecret(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

function generateApiKey(): string {
  return `ixk_${generateSecret(32)}`;
}

function generateId(): string {
  return generateSecret(12);
}

// ============================================
// Singleton & Factory
// ============================================

let instance: SecretsManager | null = null;

export function getSecretsManager(config?: VaultConfig): SecretsManager {
  if (!instance) {
    instance = new SecretsManager(config);
  }
  return instance;
}

export { vault };
