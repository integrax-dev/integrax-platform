# workers/ts

Worker BullMQ. Procesa jobs de Redis queue de forma asincrónica.

Handlers registrados: `business.order.paid` → `handlers/order-paid.ts`, `business.invoice.issued` → `handlers/invoice-issued.ts`.

Requiere: `REDIS_HOST/PORT/PASSWORD`, `POSTGRES_*`, `WORKER_CONCURRENCY` (default 5).
