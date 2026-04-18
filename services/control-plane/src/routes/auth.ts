/**
 * Public auth routes — no JWT required
 * POST /api/auth/signup          register → email verification
 * POST /api/auth/verify-email    confirm token → create tenant + return API key
 * POST /api/auth/login           email+pass → JWT
 * POST /api/auth/forgot-password send reset link
 * POST /api/auth/reset-password  consume reset token → update password
 */

import { Router, Request, Response } from 'express';
import { ulid } from 'ulid';
import { randomBytes, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { SignJWT } from 'jose';
import { pool } from '../store/db.js';
import { saveTenant, getTenantByApiKeyHash } from '../store/tenants.js';
import type { Tenant } from '../types.js';
import { z } from 'zod';

const router = Router();

// ─── Plan limits hardcoded (mirrors migration 012) ────────────────────────────
const PLAN_DEFAULTS = {
  free:         { requestsPerMinute: 30,   jobsPerMinute: 50,    maxConcurrentJobs: 5,   maxWorkflows: 3,   maxConnectors: 1,   dataRetentionDays: 7  },
  starter:      { requestsPerMinute: 100,  jobsPerMinute: 200,   maxConcurrentJobs: 10,  maxWorkflows: 10,  maxConnectors: 5,   dataRetentionDays: 30 },
  professional: { requestsPerMinute: 500,  jobsPerMinute: 1000,  maxConcurrentJobs: 50,  maxWorkflows: 50,  maxConnectors: 20,  dataRetentionDays: 90 },
  enterprise:   { requestsPerMinute: 5000, jobsPerMinute: 10000, maxConcurrentJobs: 200, maxWorkflows: 500, maxConnectors: 100, dataRetentionDays: 365 },
} as const;

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

const SignupSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  companyName: z.string().min(1).max(100),
  plan: z.enum(['free', 'starter', 'professional', 'enterprise']).default('free'),
});

// ─── POST /api/auth/signup ────────────────────────────────────────────────────
router.post('/signup', async (req: Request, res: Response) => {
  const parse = SignupSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parse.error.message } });
  }

  const { email, name, companyName, plan } = parse.data;

  // Check for existing unverified token or already registered tenant
  const existing = await pool.query(
    `SELECT id FROM email_verifications WHERE email = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [email],
  );
  if (existing.rows.length > 0) {
    // Resend — delete old, create new
    await pool.query(`DELETE FROM email_verifications WHERE email = $1 AND used_at IS NULL`, [email]);
  }

  const token = randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const id = `evr_${ulid()}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  await pool.query(
    `INSERT INTO email_verifications (id, email, token_hash, name, plan, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, email, tokenHash, companyName, plan, expiresAt],
  );

  // Send verification email
  const verifyUrl = `${process.env.APP_URL ?? 'https://app.integrax.dev'}/verify?token=${token}&email=${encodeURIComponent(email)}`;
  await sendVerificationEmail(email, name, verifyUrl).catch(err => {
    console.error('Failed to send verification email:', err);
  });

  res.status(202).json({
    success: true,
    data: { message: 'Verification email sent. Check your inbox.', email },
  });
});

// ─── POST /api/auth/verify-email ─────────────────────────────────────────────
router.post('/verify-email', async (req: Request, res: Response) => {
  const { token, email, password } = req.body as { token?: string; email?: string; password?: string };

  if (!token || !email) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'token and email required' } });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ success: false, error: { code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters' } });
  }

  const tokenHash = hashToken(token);
  const result = await pool.query(
    `SELECT * FROM email_verifications
     WHERE email = $1 AND token_hash = $2 AND used_at IS NULL AND expires_at > NOW()`,
    [email, tokenHash],
  );

  if (result.rows.length === 0) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Token invalid or expired' } });
  }

  const row = result.rows[0] as { id: string; name: string; plan: keyof typeof PLAN_DEFAULTS };

  // Create tenant
  const tenantId = `ten_${ulid()}`;
  const apiKey = `ixk_${randomBytes(32).toString('hex')}`;
  const webhookSecret = `whsec_${randomBytes(32).toString('hex')}`;
  const ownerId = `usr_${ulid()}`;
  const passwordHash = await bcrypt.hash(password, 12);

  const tenant: Tenant = {
    id: tenantId,
    name: row.name,
    plan: row.plan,
    status: 'active',
    ownerId,
    limits: PLAN_DEFAULTS[row.plan],
    metadata: {},
    apiKeyHash: await bcrypt.hash(apiKey, 10),
    webhookSecret,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await saveTenant(tenant);

  // Create owner user
  await pool.query(
    `INSERT INTO users (id, email, name, role, tenant_id, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, 'tenant_admin', $4, $5, NOW(), NOW())
     ON CONFLICT (email) DO NOTHING`,
    [ownerId, email, row.name, tenantId, passwordHash],
  );

  // Init credit balance
  await pool.query(
    `INSERT INTO api_credit_balances (tenant_id, balance) VALUES ($1, 10000) ON CONFLICT DO NOTHING`,
    [tenantId],
  );

  // Init storage usage
  await pool.query(
    `INSERT INTO storage_usage (tenant_id, limit_bytes)
     SELECT $1, storage_bytes FROM plan_limits WHERE plan = $2
     ON CONFLICT DO NOTHING`,
    [tenantId, row.plan],
  );

  // Mark token used
  await pool.query(`UPDATE email_verifications SET used_at = NOW() WHERE id = $1`, [row.id]);

  // Issue JWT
  const jwtSecret = new TextEncoder().encode(process.env.JWT_SECRET!);
  const jwt = await new SignJWT({ sub: ownerId, tenantId, role: 'tenant_admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(jwtSecret);

  res.status(201).json({
    success: true,
    data: {
      tenant: { ...tenant, apiKeyHash: undefined },
      apiKey,
      webhookSecret,
      jwt,
      creditsGranted: 10000,
      message: 'Account created. Store your API key — it will not be shown again.',
    },
  });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'email and password required' } });
  }

  const result = await pool.query(
    `SELECT * FROM users WHERE email = $1`,
    [email],
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
  }

  const user = result.rows[0] as { id: string; password_hash: string; role: string; tenant_id: string | null; name: string };
  const valid = await bcrypt.compare(password, user.password_hash);

  if (!valid) {
    return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
  }

  const jwtSecret = new TextEncoder().encode(process.env.JWT_SECRET!);
  const jwt = await new SignJWT({
    sub: user.id,
    tenantId: user.tenant_id,
    role: user.role,
    name: user.name,
    email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(jwtSecret);

  await pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);

  res.json({
    success: true,
    data: { jwt, user: { id: user.id, email, name: user.name, role: user.role, tenantId: user.tenant_id } },
  });
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
router.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };
  if (!email) return res.status(400).json({ success: false, error: { code: 'MISSING_EMAIL' } });

  const result = await pool.query(`SELECT id, name FROM users WHERE email = $1`, [email]);
  if (result.rows.length === 0) {
    // Don't reveal whether email exists
    return res.json({ success: true, data: { message: 'If the email exists, a reset link was sent.' } });
  }

  const user = result.rows[0] as { id: string; name: string };
  const token = randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const id = `pwr_${ulid()}`;
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2h

  await pool.query(`DELETE FROM password_resets WHERE user_id = $1`, [user.id]);
  await pool.query(
    `INSERT INTO password_resets (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
    [id, user.id, tokenHash, expiresAt],
  );

  const resetUrl = `${process.env.APP_URL ?? 'https://app.integrax.dev'}/reset-password?token=${token}`;
  await sendPasswordResetEmail(email, user.name, resetUrl).catch(() => {});

  res.json({ success: true, data: { message: 'If the email exists, a reset link was sent.' } });
});

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
router.post('/reset-password', async (req: Request, res: Response) => {
  const { token, password } = req.body as { token?: string; password?: string };
  if (!token || !password || password.length < 8) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT' } });
  }

  const tokenHash = hashToken(token);
  const result = await pool.query(
    `SELECT pr.*, u.email FROM password_resets pr
     JOIN users u ON u.id = pr.user_id
     WHERE pr.token_hash = $1 AND pr.used_at IS NULL AND pr.expires_at > NOW()`,
    [tokenHash],
  );

  if (result.rows.length === 0) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Token invalid or expired' } });
  }

  const row = result.rows[0] as { user_id: string; id: string };
  const passwordHash = await bcrypt.hash(password, 12);

  await pool.query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [passwordHash, row.user_id]);
  await pool.query(`UPDATE password_resets SET used_at = NOW() WHERE id = $1`, [row.id]);

  res.json({ success: true, data: { message: 'Password updated. You can now log in.' } });
});

// ─── Email helpers ─────────────────────────────────────────────────────────────

async function sendVerificationEmail(email: string, name: string, url: string): Promise<void> {
  if (!process.env.RESEND_API_KEY && !process.env.SMTP_HOST) return;

  const { createEmailAdapter } = await import('@integrax/adapters');
  const mailer = createEmailAdapter();
  await mailer.send({
    to: email,
    subject: 'Verify your IntegraX account',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#7c3aed">Welcome to IntegraX, ${name}!</h2>
        <p>Click the button below to verify your email and create your account.</p>
        <a href="${url}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Verify Email</a>
        <p style="color:#64748b;font-size:12px;margin-top:24px">Link expires in 24 hours. If you didn't sign up, ignore this email.</p>
      </div>
    `,
    text: `Verify your IntegraX account:\n\n${url}\n\nLink expires in 24 hours.`,
  });
}

async function sendPasswordResetEmail(email: string, name: string, url: string): Promise<void> {
  if (!process.env.RESEND_API_KEY && !process.env.SMTP_HOST) return;

  const { createEmailAdapter } = await import('@integrax/adapters');
  const mailer = createEmailAdapter();
  await mailer.send({
    to: email,
    subject: 'Reset your IntegraX password',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#7c3aed">Password Reset</h2>
        <p>Hi ${name}, click below to reset your password. Link expires in 2 hours.</p>
        <a href="${url}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Reset Password</a>
        <p style="color:#64748b;font-size:12px;margin-top:24px">If you didn't request this, ignore it.</p>
      </div>
    `,
    text: `Reset your password:\n\n${url}\n\nExpires in 2 hours.`,
  });
}

export { router as authRouter };
