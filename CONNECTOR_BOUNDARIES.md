# Limites de los conectores

## Que pertenece a un conector

```
connectors/implementations/<name>/
  src/               Cliente HTTP, auth, wrappers de endpoints, paginacion, reintentos, rate limiting
  connector.manifest.ts   Metadatos declarativos
  facade/
    facade.ts        Implementacion de ConnectorFacade
    capabilities.ts  Flags CRUD por entidad
```

Cada conector debe definir `connector.manifest.ts` con:
- `service` -> identificador unico del conector
- `auth` -> tipo de autenticacion
- `operations` -> que operaciones quedan habilitadas
- `entities` -> tipos de entidad canonica soportados + mapeos de campos
- `drift.endpoints` -> endpoints a vigilar por drift de esquema
- `webhooks_supported` / `polling_supported` / `cursor_field` -> para el pipeline de ingesta

## Que NO deben contener los conectores

| Prohibido                           | Donde corresponde                     |
|-------------------------------------|---------------------------------------|
| Logica de reconciliacion            | `packages/reconciliation-engine`      |
| Deteccion de diff/conflictos        | `packages/platform-kernel/diff`       |
| Matching de identidad de entidades  | `packages/platform-kernel/identity`   |
| Aplicacion de politicas             | `packages/reconciliation-engine`      |
| Reglas especificas de un pais (CUIT, CAE) | `country-packs/ar`              |
| Orquestacion de workflows           | `packages/workflow-engine` + runtime  |
| Logica de modulos de negocio        | `modules/*`                           |

## Ejemplos de violacion del limite del conector

```typescript
// ERROR: reconciliacion dentro de un conector
class MercadoPagoConnector {
  async syncProduct(mp: MpProduct, cont: ContProduct) {
    if (mp.price !== cont.price) { /* logica de conflicto */ }  // NO
  }
}

// CORRECTO: el conector solo trae datos
class MercadoPagoConnector {
  async getProduct(id: string): Promise<MpProduct> { /* solo HTTP */ }
}

// La reconciliacion ocurre en la capa de plataforma:
const mp = await mpFacade.getEntity('product', id);
const cont = await contFacade.getEntity('product', id);
const result = diffProducts(toCanonical(mp), toCanonical(cont));
```

## Interfaz ConnectorFacade

Cada conector expone esta interfaz via `facade/facade.ts`:

```typescript
interface ConnectorFacade {
  execute(operation: string, input: Record<string, unknown>): Promise<unknown>;
  listEntities(entity: string, params?: Record<string, unknown>): Promise<unknown[]>;
  getEntity(entity: string, id: string): Promise<unknown>;
  updateEntity(entity: string, id: string, patch: Record<string, unknown>): Promise<unknown>;
}
```

Los conectores que no puedan soportar una operacion deben lanzar un error claro (no fallar en silencio):

```typescript
// afip-wsfe/facade/facade.ts
async updateEntity() {
  throw new Error('Las facturas de AFIP son inmutables una vez autorizadas; update no esta soportado');
}
```
