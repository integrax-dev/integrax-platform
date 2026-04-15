import { expect, test, type Page } from '@playwright/test';
import {
  captureBaseline,
  ingest,
  newApiContext,
  readLiveState,
  recordCreatedIncidentId,
  waitForIncidentInList,
  openApiSchemaV1,
  openApiSchemaV2Rename,
  sqlSchemaV1,
  sqlSchemaV2Rename,
  csvSchemaV1,
  csvSchemaV2Rename,
  avroSchemaV1,
  avroSchemaV2Rename,
  jsonlSchemaV1,
  jsonlSchemaV2Rename,
  xmlSchemaV1,
  xmlSchemaV2Rename,
  soapSchemaV1,
  soapSchemaV2Rename,
  graphqlSchemaV1,
  graphqlSchemaV2Rename,
  parquetSchemaV1,
  parquetSchemaV2Rename,
  protobufSchemaV1,
  protobufSchemaV2Rename,
} from './_shared';

const AUTH_STORAGE_KEY = 'integrax-auth-dev';
const I18N_STORAGE_KEY = 'i18nextLng';

async function seedAuth(page: Page): Promise<{ token: string; apiBaseUrl: string; runId: string }> {
  const state = readLiveState();

  const authState = {
    state: {
      user: state.user,
      token: state.token,
      isAuthenticated: true,
    },
    version: 0,
  };

  await page.addInitScript(
    ({ authKey, authValue, i18nKey, i18nValue }) => {
      localStorage.setItem(authKey, authValue);
      localStorage.setItem(i18nKey, i18nValue);
    },
    {
      authKey: AUTH_STORAGE_KEY,
      authValue: JSON.stringify(authState),
      i18nKey: I18N_STORAGE_KEY,
      i18nValue: 'en',
    },
  );

  return { token: state.token, apiBaseUrl: state.apiBaseUrl, runId: state.runId };
}

type ProtocolCase = {
  protocol: string;
  baseline: (runId: string) => string;
  drift: (runId: string) => string;
};

const CASES: ProtocolCase[] = [
  { protocol: 'openapi', baseline: (id) => openApiSchemaV1(`E2E ${id}`), drift: (id) => openApiSchemaV2Rename(`E2E ${id}`) },
  { protocol: 'sql', baseline: () => sqlSchemaV1(), drift: () => sqlSchemaV2Rename() },
  { protocol: 'csv', baseline: () => csvSchemaV1(), drift: () => csvSchemaV2Rename() },
  { protocol: 'avro', baseline: (id) => avroSchemaV1(`User_${id}`), drift: (id) => avroSchemaV2Rename(`User_${id}`) },
  { protocol: 'jsonl', baseline: () => jsonlSchemaV1(), drift: () => jsonlSchemaV2Rename() },
  { protocol: 'xml', baseline: () => xmlSchemaV1(), drift: () => xmlSchemaV2Rename() },
  { protocol: 'soap', baseline: () => soapSchemaV1(), drift: () => soapSchemaV2Rename() },
  { protocol: 'graphql', baseline: () => graphqlSchemaV1(), drift: () => graphqlSchemaV2Rename() },
  { protocol: 'parquet', baseline: () => parquetSchemaV1(), drift: () => parquetSchemaV2Rename() },
  { protocol: 'protobuf', baseline: () => protobufSchemaV1(), drift: () => protobufSchemaV2Rename() },
];

test('live: incidents appear in real time for every protocol', async ({ page }) => {
  const { token, apiBaseUrl, runId } = await seedAuth(page);

  // Open the page FIRST so we validate SSE realtime updates (not just list fetch).
  await page.goto('/incidents');

  const api = await newApiContext(apiBaseUrl, token);

  for (const c of CASES) {
    const sourceId = `e2e-${runId}-${c.protocol}-${Date.now()}`;

    await test.step(`seed ${c.protocol}`, async () => {
      await captureBaseline(api, sourceId, c.protocol, c.baseline(runId));
      const created = await ingest(api, sourceId, c.protocol, c.drift(runId));
      if (!created?.id) throw new Error(`Expected ingest to create incident for protocol=${c.protocol}`);

      recordCreatedIncidentId(String(created.id));

      // Wait until list endpoint sees it too (sanity).
      const incidentId = await waitForIncidentInList(api, sourceId);

      // UI card should appear without refresh (via incident.created SSE).
      await expect(page.getByTestId(`incident-card-${incidentId}`)).toBeVisible();
      await expect(page.getByText(sourceId, { exact: true })).toBeVisible();
      await expect(page.getByTestId(`incident-card-${incidentId}`).getByText(c.protocol.toUpperCase(), { exact: true })).toBeVisible();

      // Severity/status badges should be present (exact values depend on bridge scoring).
      await expect(page.getByTestId(`incident-card-${incidentId}`).getByText(/open|investigating|resolved|dismissed/i).first()).toBeVisible();
    });
  }

  await api.dispose();
});

test('live: captureBaseline resolves an open incident and UI updates via SSE', async ({ page }) => {
  const { token, apiBaseUrl, runId } = await seedAuth(page);

  await page.goto('/incidents');
  const api = await newApiContext(apiBaseUrl, token);

  const protocol = 'openapi';
  const sourceId = `e2e-${runId}-autoresolve-${Date.now()}`;

  await captureBaseline(api, sourceId, protocol, openApiSchemaV1(`E2E ${runId}`));
  const created = await ingest(api, sourceId, protocol, openApiSchemaV2Rename(`E2E ${runId}`));
  if (!created?.id) throw new Error('Expected ingest to create incident');
  recordCreatedIncidentId(String(created.id));
  const incidentId = await waitForIncidentInList(api, sourceId);

  await expect(page.getByTestId(`incident-card-${incidentId}`)).toBeVisible();

  // Now "accept" current schema as baseline; service should auto-resolve open incidents for this source.
  await captureBaseline(api, sourceId, protocol, openApiSchemaV2Rename(`E2E ${runId}`));

  // UI should eventually show resolved (via incident.updated SSE).
  await expect(page.getByTestId(`incident-card-${incidentId}`).getByText('resolved', { exact: true })).toBeVisible();

  await api.dispose();
});

