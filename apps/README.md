# apps/

User-facing web applications for the IntegraX platform.

| App | Package | Port | Description |
|-----|---------|------|-------------|
| `admin-panel` | `@integrax/admin-panel` | 5173 | React SPA for platform operators — manages tenants, connectors, workflows, events, incidents, schema diffs, and mapping memory |
| `landing` | `@integrax/landing` | — | Public marketing/landing page (React + Vite) |

Both apps are private workspaces. Neither is imported by other packages — they are build targets only.
