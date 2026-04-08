# Modelo de entidades

## Entidades canonicas (`packages/entities`)

La plataforma define un conjunto de entidades agnosticas al conector. Cada conector mapea sus objetos nativos a estos tipos canonicos antes de entrar en la plataforma.

| Entidad     | Campos clave                                                        |
|-------------|---------------------------------------------------------------------|
| Product     | externalIds, sku, title, price, currency, stock, status             |
| Customer    | externalIds, taxId, name, email, vatStatus, address, status         |
| Invoice     | externalIds, invoiceNumber, invoiceType, amounts, currency, cae, status |
| Order       | externalIds, status, items, amounts, currency                       |
| Stock       | externalIds, sku, quantity, locationId                              |
| Shipment    | externalIds, trackingId, status, carrier, orderIds                  |
| Transaction | externalIds, type, status, amount, currency                         |
| Document    | externalIds, documentType, fileUrl, relatedEntityIds                |

Todas las entidades incluyen:
- `externalIds: { system: string; id: string }[]` -> enlaces a todos los sistemas origen
- `sourceSystem: string` -> que conector produjo este snapshot
- `updatedAt: Date` -> timestamp de ultima modificacion en el origen

## Resolucion de identidad (`packages/platform-kernel/identity`)

`IdentityResolver` mapea pares `{ system, id }` a IDs canonicos estables (ulids):

```typescript
const resolver = new IdentityResolver();
resolver.registerAlias('canon-abc', 'mercadopago', 'MLA-123');
resolver.registerAlias('canon-abc', 'contabilium', 'CONT-456');

const identity = resolver.resolve([{ system: 'mercadopago', id: 'MLA-123' }]);
// -> { canonicalId: 'canon-abc', strategy: 'exact', ... }
```

## Snapshot store (`packages/snapshot-store`)

Para cada entidad, la plataforma mantiene un snapshot por sistema origen:

```
entity_snapshots(tenant_id, entity_type, canonical_id, source_system) -> payload
```

Usa `hashPayload()` para detectar cambios sin comparar el objeto completo:

```typescript
const hash = hashPayload(entity);
if (hash !== existing.payloadHash) { /* cambio detectado -> upsert + emitir snapshot.updated */ }
```

## Reconciliacion (`packages/reconciliation-engine`)

Matching y diff especifico por entidad sobre la capa canonica:

- `matchProduct(a, b, manualLinks)` -> `{ decision, confidence, reason }`
- `diffProducts(a, b)` -> `ProductConflict[]`
- `evaluateProductConflicts(conflicts)` -> `{ action: BLOCK | ALERT | IGNORE | AUTO_FIX }`

El mismo patron aplica a `Customer` e `Invoice`.

## Integracion con country packs (`country-packs/ar`)

La normalizacion especifica de AR NO vive en la capa base de entidades. Se usa el country pack de forma explicita:

```typescript
import { normalizeCuit } from '@integrax/country-pack-ar';

// Antes de comparar taxIds de clientes:
const a = normalizeCuit(customerA.taxId); // '20-12345678-9' -> '20123456789'
const b = normalizeCuit(customerB.taxId); // '20123456789' -> '20123456789'
const match = a === b;
```

La copia de `normalizeCuit` en el reconciliation engine se mantiene por compatibilidad hacia atras durante la migracion.
