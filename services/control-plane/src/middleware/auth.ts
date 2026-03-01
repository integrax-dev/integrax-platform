/**
 * Authentication and Authorization Middleware
 */

import { Request, Response, NextFunction } from 'express';
import * as jose from 'jose';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../types.js';
import { tenants } from '../store/tenants.js';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: UserRole;
        tenantId: string | null;
      };
      tenantId?: string;
    }
  }
}

// JWT secret - REQUIRED in production
function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;

  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable is required in production');
  }

  if (!secret) {
    console.warn('[Auth] WARNING: Using default JWT secret. Set JWT_SECRET in production!');
  }

  return new TextEncoder().encode(secret || 'integrax-dev-secret-DO-NOT-USE-IN-PRODUCTION');
}

const JWT_SECRET = getJwtSecret();

/**
 * Authenticate request via JWT or API key
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authorization header required' },
      });
    }

    // Handle Bearer token (JWT)
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);

      try {
        const { payload } = await jose.jwtVerify(token, JWT_SECRET);

        req.user = {
          id: payload.sub as string,
          email: payload.email as string,
          role: payload.role as UserRole,
          tenantId: payload.tenantId as string | null,
        };

        if (req.user.tenantId) {
          req.tenantId = req.user.tenantId;
        }

        return next();
      } catch (jwtError) {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
        });
      }
    }

    // Handle API key (for tenant-level access)
    if (authHeader.startsWith('ApiKey ')) {
      const apiKey = authHeader.slice(7);
      const tenantId = req.headers['x-tenant-id'] as string;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_TENANT', message: 'X-Tenant-Id header required with API key' },
        });
      }

      // Validate API key against tenant's stored hash
      if (!apiKey.startsWith('ixk_')) {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_API_KEY', message: 'Invalid API key format' },
        });
      }

      const tenant = tenants.get(tenantId);
      if (!tenant) {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_TENANT', message: 'Tenant not found or deleted' },
        });
      }

      if (tenant.status !== 'active') {
        return res.status(403).json({
          success: false,
          error: { code: 'TENANT_INACTIVE', message: `Tenant status is ${tenant.status}` },
        });
      }

      const isValidKey = await bcrypt.compare(apiKey, tenant.apiKeyHash);
      if (!isValidKey) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED_API_KEY', message: 'Invalid API Key' },
        });
      }

      req.user = {
        id: 'api_key_user',
        email: 'api@tenant',
        role: 'operator',
        tenantId,
      };
      req.tenantId = tenantId;

      return next();
    }

    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_AUTH', message: 'Invalid authorization format' },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: { code: 'AUTH_ERROR', message: 'Authentication error' },
    });
  }
}

/**
 * Require specific role(s)
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    // Platform admin has access to everything
    if (req.user.role === 'platform_admin') {
      return next();
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Role '${req.user.role}' not authorized. Required: ${allowedRoles.join(' or ')}`,
        },
      });
    }

    next();
  };
}

/**
 * Require tenant context
 */
export function requireTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.tenantId) {
    // Try to get from header
    const headerTenantId = req.headers['x-tenant-id'] as string;

    if (headerTenantId) {
      // Verify user has access to this tenant
      if (req.user?.role !== 'platform_admin' && req.user?.tenantId !== headerTenantId) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access to this tenant denied' },
        });
      }
      req.tenantId = headerTenantId;
    } else if (req.user?.tenantId) {
      req.tenantId = req.user.tenantId;
    } else {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'Tenant context required' },
      });
    }
  }

  next();
}

/**
 * Generate JWT token for user
 */
export async function generateToken(user: {
  id: string;
  email: string;
  role: UserRole;
  tenantId: string | null;
}): Promise<string> {
  const token = await new jose.SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(JWT_SECRET);

  return token;
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const crypto = require('crypto');
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
