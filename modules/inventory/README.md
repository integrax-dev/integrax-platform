# @integrax/module-inventory

Inventory management: stock sync across connectors, reservations, releases, and low-stock alerts.

**Exports:** `InventoryService`, `moduleManifest`, types: `UpdateStockInput`, `ReserveStockInput`, `ReleaseReservationInput`, `StockDivergence`.

**Key operations:** update stock level, reserve stock (for pending orders), release reservation, detect stock divergence across systems.

**Consumers:** `services/control-plane` (platform routes), `profiles/ecommerce`, `workflows/temporal`.
