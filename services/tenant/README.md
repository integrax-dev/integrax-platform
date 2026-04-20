# tenant

Puerto 3004. Gestión multi-tenant: aislamiento, límites de uso, RBAC, rate limiting.

Separa la lógica de tenant del control-plane para escalar independientemente. Roles: `platform_admin > tenant_admin > operator > viewer`.
