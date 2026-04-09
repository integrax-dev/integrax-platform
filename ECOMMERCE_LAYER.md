# Ecommerce Layer

The ecommerce module (`modules/ecommerce`) provides commerce primitives (catalog, variants, pricing, carts, checkout, promotions, fulfillment) by reusing Medusa where it saves time, without coupling the rest of IntegraX to Medusa.

---

## What it provides

| Concept | Source |
|---|---|
| CatalogItem / Variant / Price | Medusa products (via adapter) or snapshot-store fallback |
| PriceList / SalesChannel | Medusa pricing |
| Cart / LineItem | Medusa carts |
| CheckoutSession | Medusa cart completion |
| Discount / DiscountRule | Medusa promotions |
| CustomerAccount | Medusa customers |
| DraftOrder | Medusa draft orders |
| FulfillmentRequest | Medusa fulfillment primitives |
| ReturnRequest | Medusa returns |
| InventoryAllocation | modules/inventory (always IntegraX-native) |

---

## What Medusa replaces (and what it does not)

| Medusa replaces | NOT replaced by Medusa |
|---|---|
| Building product/variant data model from scratch | operation-engine |
| Building cart state machine from scratch | event-bus |
| Building checkout session from scratch | snapshot-store |
| Building promotion/discount engine from scratch | timeline |
| Basic fulfillment primitives | reconciliation-engine |
| | schema-bridge |
| | modules/payments |
| | modules/billing |
| | profiles |
| | country-packs |

---

## Modules the ecommerce layer bridges to

| Module | How |
|---|---|
| `modules/catalog` | CatalogItem snapshot shared with catalog module's Product snapshot |
| `modules/orders` | Order created from completed cart — write via operation-engine |
| `modules/inventory` | InventoryAllocation writes via InventoryService (snapshot-backed) |
| `modules/payments` | CheckoutSession → startCheckout() emits event → payment command dispatched |
| `modules/billing` | `payment.captured` event → billing module creates invoice via workflow |

---

## Reconciliation integration

The ecommerce layer participates in reconciliation like any other module:

- External catalog (Tienda Nube, WooCommerce connector) vs internal CatalogItem → schema-bridge detects field drift, reconciliation-engine detects price/stock divergence
- Order state in external connector vs `modules/orders` snapshot → consistency-inspector detects state divergence
- Inventory allocation vs connector's live stock → `InventoryService.findDivergences()` detects delta

None of this requires Medusa — it uses `snapshot-store` + `reconciliation-engine` + `event-bus` directly.

---

## Operation commands (ecommerce write path)

All write operations go through operation-engine:

| Command | Description |
|---|---|
| `create_catalog_item` | Create product in Medusa + snapshot |
| `update_catalog_item` | Update product |
| `archive_catalog_item` | Archive/soft-delete |
| `create_cart` | Create new cart session |
| `add_line_item` | Add variant to cart |
| `remove_line_item` | Remove from cart |
| `start_checkout` | Transition cart to checkout session |
| `apply_promotion` | Apply discount code |
| `create_draft_order` | Create draft order for manual flows |
| `request_fulfillment` | Trigger fulfillment for an order |
