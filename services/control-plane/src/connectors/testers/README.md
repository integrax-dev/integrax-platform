# connectors/testers/

Test de conexión real por conector. Un archivo por conector.

`index.ts` construye el mapa `CONNECTOR_TESTERS: Record<string, ConnectorTesterFn>`.

**Para agregar un conector nuevo:**
1. Crear `<connector-id>.ts` exportando `connectorId: string` y `testConnection: ConnectorTesterFn`
2. Agregar un import en `index.ts`
3. Nada más cambia.

Conectores actuales: mercadopago, whatsapp, email, google-sheets, contabilium, afip-wsfe, tiendanube, payway, mobbex, decidir.
