# admin-panel — `@integrax/admin-panel`

React SPA for IntegraX platform operators. Built with Vite, React 19, React Router, Zustand, TanStack Query, and Recharts.

**Routes (pages):**
- `/` Dashboard with metrics and charts
- `/tenants` Tenant CRUD and lifecycle (suspend/activate)
- `/connectors` Connector catalog and per-tenant configuration
- `/workflows` Workflow runs and Temporal workflow status
- `/events` Event feed with status and DLQ visibility
- `/incidents` Drift incidents and alert management
- `/schema-diffs` Schema comparison reports from `schema-bridge`
- `/mapping-memory` LLM mapping feedback and overrides
- `/audit` Audit log viewer
- `/settings` Platform settings

**Auth:** JWT-based; `useAuthStore` (Zustand) guards all routes via `ProtectedRoute`. Unauthenticated requests redirect to `/login`.

**Dependencies:** `control-plane` API at port 3000. No server-side rendering. E2E tests via Playwright.

**Dev:** `pnpm dev` (Vite HMR at port 5173)
