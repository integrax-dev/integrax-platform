# IntegraX Tenant Service

Este módulo implementa los servicios base para multi-tenancy:
- Gestión de tenants (alta, suspensión, límites)
- Autenticación y RBAC
- Rate limiting por tenant
- Auditoría
- Gestión de credenciales seguras
- Ingesta y enrutamiento de eventos
- DLQ por tenant
- Métricas y alertas

## Archivos principales
- types.ts: Tipos base multi-tenant
- tenantService.ts: Lógica de gestión de tenants
- authMiddleware.ts: Middleware de autenticación multi-tenant
- rateLimiter.ts: Rate limiting por tenant
- rbacMiddleware.ts: Control de acceso por rol
- auditLogger.ts: Auditoría de cambios
- secretManager.ts: Gestión segura de credenciales
- eventRouter.ts: Ingesta y enrutamiento de eventos
- dlqManager.ts: Dead Letter Queue por tenant
- metrics.ts: Métricas y alertas por tenant
