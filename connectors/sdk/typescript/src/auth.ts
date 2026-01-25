import type { ResolvedCredentials } from './types/index.js';

/**
 * Generate Authorization header for API Key auth.
 */
export function apiKeyHeader(
  credentials: ResolvedCredentials,
  keyName: string = 'apiKey',
  headerName: string = 'Authorization',
  prefix: string = 'Bearer'
): Record<string, string> {
  const apiKey = credentials[keyName];
  if (!apiKey) {
    throw new Error(`Missing credential: ${keyName}`);
  }
  return { [headerName]: `${prefix} ${apiKey}` };
}

/**
 * Generate Authorization header for Basic auth.
 */
export function basicAuthHeader(
  credentials: ResolvedCredentials,
  usernameKey: string = 'username',
  passwordKey: string = 'password'
): Record<string, string> {
  const username = credentials[usernameKey];
  const password = credentials[passwordKey];

  if (!username || !password) {
    throw new Error('Missing username or password credentials');
  }

  const encoded = Buffer.from(`${username}:${password}`).toString('base64');
  return { Authorization: `Basic ${encoded}` };
}

/**
 * OAuth2 token management.
 */
export interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  scopes?: string[];
  grantType?: 'client_credentials' | 'authorization_code' | 'refresh_token';
}

export interface OAuth2Token {
  accessToken: string;
  tokenType: string;
  expiresAt?: Date;
  refreshToken?: string;
  scope?: string;
}

export class OAuth2Client {
  private token: OAuth2Token | null = null;

  constructor(private config: OAuth2Config) {}

  async getAccessToken(): Promise<string> {
    if (this.token && this.isTokenValid()) {
      return this.token.accessToken;
    }

    if (this.token?.refreshToken) {
      await this.refreshAccessToken();
    } else {
      await this.fetchNewToken();
    }

    if (!this.token) {
      throw new Error('Failed to obtain access token');
    }

    return this.token.accessToken;
  }

  async getAuthHeader(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return { Authorization: `Bearer ${token}` };
  }

  private isTokenValid(): boolean {
    if (!this.token) return false;
    if (!this.token.expiresAt) return true;

    // Consider token invalid 60 seconds before expiration
    const bufferMs = 60 * 1000;
    return this.token.expiresAt.getTime() > Date.now() + bufferMs;
  }

  private async fetchNewToken(): Promise<void> {
    const params = new URLSearchParams({
      grant_type: this.config.grantType ?? 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    if (this.config.scopes?.length) {
      params.set('scope', this.config.scopes.join(' '));
    }

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`OAuth2 token request failed: ${response.status}`);
    }

    const data = await response.json() as OAuth2TokenResponse;
    this.token = this.parseTokenResponse(data);
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.token?.refreshToken) {
      throw new Error('No refresh token available');
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.token.refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      // If refresh fails, try to get a new token
      this.token = null;
      await this.fetchNewToken();
      return;
    }

    const data = await response.json() as OAuth2TokenResponse;
    this.token = this.parseTokenResponse(data);
  }

  private parseTokenResponse(data: OAuth2TokenResponse): OAuth2Token {
    const token: OAuth2Token = {
      accessToken: data.access_token,
      tokenType: data.token_type ?? 'Bearer',
    };

    if (data.expires_in) {
      token.expiresAt = new Date(Date.now() + data.expires_in * 1000);
    }

    if (data.refresh_token) {
      token.refreshToken = data.refresh_token;
    }

    if (data.scope) {
      token.scope = data.scope;
    }

    return token;
  }
}

interface OAuth2TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * Create OAuth2 client from credentials.
 */
export function createOAuth2Client(
  credentials: ResolvedCredentials,
  tokenUrl: string,
  scopes?: string[]
): OAuth2Client {
  return new OAuth2Client({
    clientId: credentials.clientId ?? credentials.client_id ?? '',
    clientSecret: credentials.clientSecret ?? credentials.client_secret ?? '',
    tokenUrl,
    scopes,
  });
}
