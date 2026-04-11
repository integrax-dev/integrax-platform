/**
 * Connector registry + facade factories
 *
 * Registers all connector manifests and their facade factories into the
 * ConnectorManifestRegistry (for the IntegrationOrchestrator) and the
 * FacadeResolver (for the OperationEngine).
 */

import {
  ConnectorManifestRegistry,
} from '@integrax/integration-orchestrator';
import { FacadeResolver } from '@integrax/operation-engine';
import type { ConnectorManifest } from '@integrax/connector-sdk';
import { findTenantConnector } from '../../store/tenant-connectors.js';

// ─── Manifests ────────────────────────────────────────────────────────────────

import mercadopagoManifest from '../../../../../connectors/implementations/mercadopago/connector.manifest.js';
import contabiliumManifest from '../../../../../connectors/implementations/contabilium/connector.manifest.js';
import afipWsfeManifest from '../../../../../connectors/implementations/afip-wsfe/connector.manifest.js';
import googleSheetsManifest from '../../../../../connectors/implementations/google-sheets/connector.manifest.js';
import emailManifest from '../../../../../connectors/implementations/email/connector.manifest.js';
import whatsappManifest from '../../../../../connectors/implementations/whatsapp/connector.manifest.js';
import paywayManifest from '../../../../../connectors/implementations/payway/connector.manifest.js';
import mobbexManifest from '../../../../../connectors/implementations/mobbex/connector.manifest.js';
import decidirManifest from '../../../../../connectors/implementations/decidir/connector.manifest.js';

// ─── Facade factories ─────────────────────────────────────────────────────────

import { createMercadoPagoFacade } from '../../../../../connectors/implementations/mercadopago/facade/facade.js';
import { createContabiliumFacade } from '../../../../../connectors/implementations/contabilium/facade/facade.js';
import { createAfipWsfeFacade } from '../../../../../connectors/implementations/afip-wsfe/facade/facade.js';
import { createGoogleSheetsFacade } from '../../../../../connectors/implementations/google-sheets/facade/facade.js';
import { createEmailFacade } from '../../../../../connectors/implementations/email/facade/facade.js';
import { createWhatsAppFacade } from '../../../../../connectors/implementations/whatsapp/facade/facade.js';
import { createPaywayFacade } from '../../../../../connectors/implementations/payway/facade/facade.js';
import { createMobbexFacade } from '../../../../../connectors/implementations/mobbex/facade/facade.js';
import { createDecidirFacade } from '../../../../../connectors/implementations/decidir/facade/facade.js';

// ─── ConnectorManifestRegistry ───────────────────────────────────────────────

export const connectorRegistry = new ConnectorManifestRegistry();

connectorRegistry.register({
  connectorId: 'mercadopago',
  manifest: mercadopagoManifest as unknown as ConnectorManifest,
  createFacade: (credentials, tenantId) => createMercadoPagoFacade(credentials, tenantId),
});

connectorRegistry.register({
  connectorId: 'contabilium',
  manifest: contabiliumManifest as unknown as ConnectorManifest,
  createFacade: (credentials) => createContabiliumFacade({
    clientId: credentials['clientId'] ?? '',
    clientSecret: credentials['clientSecret'] ?? '',
    environment: (credentials['environment'] as 'sandbox' | 'production') ?? 'production',
    defaultPuntoVenta: credentials['defaultPuntoVenta'] ? Number(credentials['defaultPuntoVenta']) : undefined,
  }),
});

connectorRegistry.register({
  connectorId: 'afip-wsfe',
  manifest: afipWsfeManifest as unknown as ConnectorManifest,
  createFacade: (credentials, tenantId) => createAfipWsfeFacade({
    cuit: credentials['cuit'] ?? '',
    certificate: credentials['certificate'] ?? '',
    privateKey: credentials['privateKey'] ?? '',
    environment: (credentials['environment'] as 'production' | 'testing') ?? 'testing',
    defaultPuntoVenta: credentials['defaultPuntoVenta'] ? Number(credentials['defaultPuntoVenta']) : undefined,
  }, tenantId),
});

connectorRegistry.register({
  connectorId: 'google-sheets',
  manifest: googleSheetsManifest as unknown as ConnectorManifest,
  createFacade: (credentials, tenantId) => createGoogleSheetsFacade(credentials, tenantId),
});

connectorRegistry.register({
  connectorId: 'email',
  manifest: emailManifest as unknown as ConnectorManifest,
  createFacade: (credentials) => createEmailFacade(credentials),
});

connectorRegistry.register({
  connectorId: 'whatsapp',
  manifest: whatsappManifest as unknown as ConnectorManifest,
  createFacade: (credentials) => createWhatsAppFacade({
    phoneNumberId: credentials['phoneNumberId'] ?? '',
    accessToken: credentials['accessToken'] ?? '',
    businessAccountId: credentials['businessAccountId'],
    webhookVerifyToken: credentials['webhookVerifyToken'],
  }),
});

connectorRegistry.register({
  connectorId: 'payway',
  manifest: paywayManifest as unknown as ConnectorManifest,
  createFacade: (credentials, tenantId) => createPaywayFacade(credentials, tenantId),
});

connectorRegistry.register({
  connectorId: 'mobbex',
  manifest: mobbexManifest as unknown as ConnectorManifest,
  createFacade: (credentials, tenantId) => createMobbexFacade(credentials, tenantId),
});

connectorRegistry.register({
  connectorId: 'decidir',
  manifest: decidirManifest as unknown as ConnectorManifest,
  createFacade: (credentials, tenantId) => createDecidirFacade(credentials, tenantId),
});

// ─── FacadeResolver ───────────────────────────────────────────────────────────
// CredentialProvider loads real credentials from the tenant_connectors table.

export const facadeResolver = new FacadeResolver(async (tenantId, connectorId) => {
  const tc = await findTenantConnector(tenantId, connectorId);
  return tc?.credentials ?? {};
});

facadeResolver.register('mercadopago', (creds, tenantId) => createMercadoPagoFacade(creds, tenantId));
facadeResolver.register('contabilium', (creds) => createContabiliumFacade({
  clientId: creds['clientId'] ?? '',
  clientSecret: creds['clientSecret'] ?? '',
  environment: (creds['environment'] as 'sandbox' | 'production') ?? 'production',
}));
facadeResolver.register('afip-wsfe', (creds, tenantId) => createAfipWsfeFacade({
  cuit: creds['cuit'] ?? '',
  certificate: creds['certificate'] ?? '',
  privateKey: creds['privateKey'] ?? '',
  environment: (creds['environment'] as 'production' | 'testing') ?? 'testing',
}, tenantId));
facadeResolver.register('google-sheets', (creds, tenantId) => createGoogleSheetsFacade(creds, tenantId));
facadeResolver.register('email', (creds) => createEmailFacade(creds));
facadeResolver.register('whatsapp', (creds) => createWhatsAppFacade({
  phoneNumberId: creds['phoneNumberId'] ?? '',
  accessToken: creds['accessToken'] ?? '',
}));
facadeResolver.register('payway', (creds, tenantId) => createPaywayFacade(creds, tenantId));
facadeResolver.register('mobbex', (creds, tenantId) => createMobbexFacade(creds, tenantId));
facadeResolver.register('decidir', (creds, tenantId) => createDecidirFacade(creds, tenantId));
