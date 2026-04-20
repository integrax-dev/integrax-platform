# @integrax/module-orders

Order lifecycle management: create, confirm, cancel, refund, and query orders across connected systems.

**Exports:** `OrdersService`, `moduleManifest`, types: `CreateOrderInput`, `UpdateOrderStatusInput`, `CancelOrderInput`, `GetOrderInput`, `ListOrdersInput`.

**Key operations:** create order (fan-out to configured connectors), update status, cancel, initiate refund, get/list with filters.

**Consumers:** `services/control-plane` (platform routes `/api/platform/tenants/:id/orders`), `profiles/ecommerce`, `workflows/temporal` (OrderWorkflow).
