-- Dev seed: demo tenant + platform_admin user
-- Only inserts if they don't exist — safe to run in any environment.
-- Password: integrax-dev (bcrypt cost 10)

INSERT INTO tenants (id, name, plan, status, owner_id, api_key_hash, webhook_secret, created_at, updated_at)
VALUES (
  'ten_mvp_demo',
  'IntegraX Demo',
  'professional',
  'active',
  'usr_admin_platform',
  'dev-placeholder',
  'dev-placeholder',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, email, name, role, tenant_id, password_hash, created_at, updated_at)
VALUES (
  'usr_admin_platform',
  'admin@integrax.io',
  'Admin',
  'platform_admin',
  'ten_mvp_demo',
  '$2b$10$rh9N2LcjBaw9efl8iR6V/.9m0e6vV3u9bwwiqHvmLdgDj90ON3Cj.',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;
