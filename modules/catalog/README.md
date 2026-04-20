# @integrax/module-catalog

Product catalog synchronization across connectors: publish products, update prices, archive, and detect cross-system price divergence.

**Exports:** `CatalogService`, `moduleManifest`, types: `PublishProductInput`, `UpdatePriceInput`, `ArchiveProductInput`, `ProductPriceDivergence`.

**Key operations:** publish product to N connectors, update price across systems, detect price divergence, archive product.

**Consumers:** `services/control-plane` (platform routes), `profiles/ecommerce`.
