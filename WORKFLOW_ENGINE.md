# Motor De Workflows

## Esquema de flujo (`packages/workflow-engine`)

Un `IntegraxFlow` es una definicion portable de flujo. Es agnostica al runtime; `runtime/activepieces-adapter` la compila a JSON de Activepieces.

```typescript
interface IntegraxFlow {
  id: string;
  name: string;
  version: string;            // semver
  status: 'active' | 'inactive' | 'draft' | 'error';
  trigger: FlowTrigger;
  steps: FlowStep[];
  tenantId: string | null;
}
```

## Tipos de trigger

| Tipo                | Arranca cuando                                      |
|---------------------|-----------------------------------------------------|
| `event`             | Un evento de plataforma coincide con `eventType`    |
| `schedule`          | Dispara una expresion cron (UTC)                    |
| `webhook`           | Se recibe un webhook de un conector especifico      |
| `manual`            | Un operador hace click en "Run" en la UI            |
| `approval_required` | Una entidad queda marcada para aprobacion manual    |

## Catalogo de nodos

### Publicos (visibles para todos los tenants)

**Acciones**: `CreateInvoice`, `UpdateStock`, `PublishProduct`, `UpdatePrice`, `CreateShipment`, `ChangeOrderStatus`, `SendEmail`, `WriteGoogleSheetRow`, `UploadDriveFile`, `NotifySlack`

**Logica**: `IfElse`, `Delay`, `Retry`, `Switch`, `Branch`, `Approval`

**Ayudantes**: `FindEntity`, `MapFields`, `ValidateData`, `ResolveIdentity`, `DeduplicateRecords`

### Restringidos (requieren permiso explicito)

`HTTPRequestRestricted` -> llamada HTTP solo a dominios allowlisted, con audit log.
`TransformJSON` -> transformacion JMESPath.

### Internos (solo para uso de plataforma, no expuestos a tenants)

`MatchEntities`, `ApplyPolicy`, `ReplaySyncEvent`, `SnapshotUpdate`, `CountryPackValidation`

## Adaptador de runtime

Quien llama usa la interfaz `RuntimeAdapter`, no Activepieces de forma directa:

```typescript
import type { RuntimeAdapter } from '@integrax/activepieces-adapter';

// Ejecutar un flujo
const result = await runtime.executeFlow({
  flowId: 'flow-abc',
  tenantId: 'tenant-xyz',
  payload: { orderId: 'ord-1' },
});

// Compilar una definicion de flujo
const ref = await runtime.compileFlow(myFlow);
```

Para reemplazar el runtime: implementar `RuntimeAdapter` e inyectarlo por DI.

## Flujo de ejemplo (estilo YAML)

```yaml
id: order-created-invoice
name: "Create invoice on order confirmed"
version: "1.0.0"
trigger:
  type: event
  eventType: order.status_changed
  filter: { status: "confirmed" }
steps:
  - id: find-customer
    node: FindEntity
    config: { entityType: customer, field: taxId, source: "$.customerTaxId" }
  - id: create-invoice
    node: CreateInvoice
    config: { connectorId: contabilium, customerId: "$.find-customer.id" }
  - id: notify
    node: SendEmail
    config: { to: "$.customerEmail", template: invoice_created }
```
