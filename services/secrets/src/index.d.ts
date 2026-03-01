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
export declare class SecretsManager {
    private client;
    private readonly mountPath;
    private readonly basePath;
    constructor(config?: VaultConfig);
    /**
     * Health check
     */
    isHealthy(): Promise<boolean>;
    /**
     * Store tenant API keys
     */
    storeTenantApiKey(tenantId: string, apiKey: string, apiKeyId: string): Promise<void>;
    /**
     * Get tenant API key
     */
    getTenantApiKey(tenantId: string, apiKeyId: string): Promise<string | null>;
    /**
     * Revoke tenant API key
     */
    revokeTenantApiKey(tenantId: string, apiKeyId: string): Promise<void>;
    /**
     * List tenant API keys
     */
    listTenantApiKeys(tenantId: string): Promise<string[]>;
    /**
     * Store connector credentials for a tenant
     */
    storeConnectorCredentials(tenantId: string, connectorId: string, credentials: ConnectorCredentials): Promise<void>;
    /**
     * Get connector credentials for a tenant
     */
    getConnectorCredentials(tenantId: string, connectorId: string): Promise<ConnectorCredentials | null>;
    /**
     * Delete connector credentials
     */
    deleteConnectorCredentials(tenantId: string, connectorId: string): Promise<void>;
    /**
     * List connector credentials for a tenant
     */
    listConnectorCredentials(tenantId: string): Promise<string[]>;
    /**
     * Store webhook signing secret
     */
    storeWebhookSecret(tenantId: string, webhookId: string, secret: string): Promise<void>;
    /**
     * Get webhook signing secret
     */
    getWebhookSecret(tenantId: string, webhookId: string): Promise<string | null>;
    /**
     * Rotate webhook secret
     */
    rotateWebhookSecret(tenantId: string, webhookId: string): Promise<string>;
    /**
     * Store encryption key for tenant data
     */
    storeTenantEncryptionKey(tenantId: string, key: string): Promise<void>;
    /**
     * Get tenant encryption key
     */
    getTenantEncryptionKey(tenantId: string): Promise<string | null>;
    /**
     * Get dynamic database credentials for a tenant
     * Requires Vault database secrets engine configured
     */
    getDatabaseCredentials(tenantId: string, role?: string): Promise<{
        username: string;
        password: string;
        ttl: number;
    } | null>;
    /**
     * Store platform-wide secret
     */
    storePlatformSecret(key: string, value: SecretData): Promise<void>;
    /**
     * Get platform-wide secret
     */
    getPlatformSecret(key: string): Promise<SecretData | null>;
    /**
     * Encrypt data using Vault Transit
     */
    encrypt(tenantId: string, plaintext: string): Promise<string>;
    /**
     * Decrypt data using Vault Transit
     */
    decrypt(tenantId: string, ciphertext: string): Promise<string>;
    /**
     * Initialize secrets for a new tenant
     */
    initializeTenant(tenantId: string): Promise<{
        apiKey: string;
        webhookSecret: string;
        encryptionKey: string;
    }>;
    /**
     * Delete all secrets for a tenant
     */
    deleteTenant(tenantId: string): Promise<void>;
}
export declare function getSecretsManager(config?: VaultConfig): SecretsManager;
export { vault };
//# sourceMappingURL=index.d.ts.map