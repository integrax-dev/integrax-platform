# Paquetes Por Pais

## Proposito

Los country packs aislan reglas de negocio especificas de una jurisdiccion fuera del core de la plataforma. La plataforma puede funcionar en cualquier pais sin ellos; los country packs agregan validacion, normalizacion y etiquetado para contextos locales concretos.

**La plataforma base NUNCA importa desde un country pack.**

Los country packs son aditivos: conectores y modulos pueden importarlos de manera opcional cuando saben que estan operando dentro de una jurisdiccion determinada.

## `country-packs/ar` -> Argentina

| Modulo             | Exports                                                      |
|--------------------|--------------------------------------------------------------|
| `cuit.ts`          | `normalizeCuit`, `validateCuit`, `formatCuit`                |
| `cae.ts`           | `normalizeCae`, `isValidCaeFormat`, `isCaeExpired`, `validateCaeExpiry` |
| `invoice-types.ts` | `AR_INVOICE_TYPES`, `validateAfipInvoiceType`, `getAfipInvoiceTypeName`, `requiresCae` |

### Normalizacion de CUIT

```typescript
import { normalizeCuit, validateCuit } from '@integrax/country-pack-ar';

normalizeCuit('20-12345678-9') // -> '20123456789'
normalizeCuit('20123456789')   // -> '20123456789' (sin cambios)
validateCuit('20123456789')    // -> true | false (checksum del digito)
```

### CAE

```typescript
import { isValidCaeFormat, isCaeExpired } from '@integrax/country-pack-ar';

isValidCaeFormat('73012345678901')    // -> true (14 digitos)
isCaeExpired(new Date('2020-01-01'))  // -> true
```

### Tipos de comprobante AFIP

```typescript
import { AR_INVOICE_TYPES, validateAfipInvoiceType } from '@integrax/country-pack-ar';

validateAfipInvoiceType(1)  // Factura A -> true
validateAfipInvoiceType(99) // -> false
AR_INVOICE_TYPES[6]         // { code: 6, name: 'Factura B', requiresCae: true, ... }
```

## Como escribir un country pack nuevo

1. Crear `country-packs/<iso2>/` con `package.json` (`@integrax/country-pack-<iso2>`).
2. Exportar funciones de normalizacion, validacion y catalogos de tipos.
3. Sin dependencias: no importar otros paquetes de la plataforma.
4. Agregar tests para todos los casos borde de normalizacion.
5. Actualizar `pnpm-workspace.yaml` si todavia no cubre `country-packs/*`.

No agregues logica especifica de pais en `packages/reconciliation-engine`, `packages/entities` ni en ningun conector. Para eso existe el country pack.
