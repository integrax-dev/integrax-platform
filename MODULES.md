# Modulos

## Que es un modulo

Un modulo es una capacidad operativa focalizada construida sobre entidades canonicas, el bus de eventos y las facades de conectores. Los modulos contienen la logica de negocio que no debe filtrarse ni a los conectores ni al control plane.

Los modulos NO deben:
- Importar tipos especificos de conectores de forma directa (usar `ConnectorFacade`)
- Contener reglas especificas de un pais (delegar a country packs)
- Duplicar logica de reconciliacion (usar `@integrax/reconciliation-engine`)

## Manifest de modulo

Cada modulo exporta un `module.manifest.ts`:

```typescript
export const moduleManifest = {
  id: 'consistency-inspector',
  name: 'Consistency Inspector',
  version: '0.1.0',
  requiredEntities: ['product', 'customer', 'invoice', 'stock', 'shipment'],
  requiredPackages: ['@integrax/snapshot-store', '@integrax/event-bus'],
  optionalConnectors: [],
};
```

## `modules/consistency-inspector`

Detecta divergencias entre sistemas comparando snapshots de entidades.

```typescript
const inspector = new SnapshotConsistencyInspector(snapshotStore, eventBus);

const report = await inspector.inspect('tenant-abc', 'product');
// -> ConsistencyReport { issues: [...], summary: { total, bySeverity, byKind } }

const all = await inspector.inspectAll('tenant-abc', { severity: ['HIGH', 'CRITICAL'] });
```

**Tipos de issue detectados:**

| Kind                 | Se dispara cuando                                         |
|----------------------|-----------------------------------------------------------|
| `stock_divergence`   | `stock` o `quantity` difiere entre sistemas               |
| `price_divergence`   | `price` o `amountTotal` difiere                           |
| `invoice_missing`    | La factura existe solo en un sistema origen               |
| `duplicate_customer` | El cliente aparece varias veces con IDs distintos         |
| `shipment_orphaned`  | El envio no tiene un ID de pedido vinculado               |
| `state_mismatch`     | `status` difiere entre sistemas                           |
| `financial_conflict` | Los valores monetarios divergen                           |

Cada issue detectado emite un evento `conflict.detected` al bus de eventos.

## Modulos planificados

| Modulo      | Responsabilidad                                                |
|-------------|----------------------------------------------------------------|
| `orders`    | Ciclo de vida del pedido: creacion, confirmacion, cancelacion, refund |
| `inventory` | Sincronizacion de stock, reservas y alertas de bajo stock      |
| `billing`   | Generacion de facturas, autorizacion CAE y seguimiento de pagos |
| `catalog`   | Sincronizacion de productos entre marketplaces y ERP           |

Todos los modulos planificados van a:
- Operar sobre tipos canonicos de `@integrax/entities`
- Usar `ConnectorFacade` para todas las llamadas a conectores
- Suscribirse y emitir eventos via `@integrax/event-bus`
- Tener un `module.manifest.ts` que liste sus dependencias
