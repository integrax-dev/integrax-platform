/**
 * Connector tester registry
 *
 * Auto-built from individual tester files. To add a new connector:
 *   1. Create src/connectors/testers/<connector-id>.ts
 *   2. Export `connectorId: string` and `testConnection: ConnectorTesterFn`
 *   3. Add one import line below — nothing else changes
 *
 * The CONNECTOR_TESTERS map is consumed by the connectors route handler.
 */

import type { ConnectorTesterFn, TestConnectionResult } from './_types.js';
export type { ConnectorTesterFn, TestConnectionResult };

import * as mercadopago  from './mercadopago.js';
import * as whatsapp     from './whatsapp.js';
import * as email        from './email.js';
import * as googleSheets from './google-sheets.js';
import * as contabilium  from './contabilium.js';
import * as afipWsfe     from './afip-wsfe.js';
import * as tiendanube   from './tiendanube.js';
import * as payway       from './payway.js';
import * as mobbex       from './mobbex.js';
import * as decidir      from './decidir.js';

const testers = [
  mercadopago, whatsapp, email, googleSheets,
  contabilium, afipWsfe, tiendanube,
  payway, mobbex, decidir,
];

export const CONNECTOR_TESTERS: Record<string, ConnectorTesterFn> = Object.fromEntries(
  testers.map(t => [t.connectorId, t.testConnection]),
);
