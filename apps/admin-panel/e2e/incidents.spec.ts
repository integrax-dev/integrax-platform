import { expect, test, type Page } from '@playwright/test';

type DriftIncident = {
  id: string;
  sourceId: string;
  protocol: 'sql' | 'openapi' | 'avro' | 'csv' | 'jsonl' | 'xml' | 'soap' | 'graphql' | 'parquet' | 'protobuf';
  severity: 'critical' | 'major' | 'minor';
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
  bridgeReport: unknown;
  impactScore: number | null;
  routingTarget: 'operator_review' | 'incident_alert' | 'timeline_trace' | 'auto_resolved' | null;
  remediationHints: string[];
  affectedTenants: string[];
  llmAnalysis: unknown[];
  detectedAt: string;
  resolvedAt: string | null;
};

const AUTH_STORAGE_KEY = 'integrax-auth-dev';
const I18N_STORAGE_KEY = 'i18nextLng';

function buildIncidentsFixture(nowIso: string): DriftIncident[] {
  const bridgeReportWithEscalation = {
    resolvedConflicts: [
      {
        diff: { kind: 'rename_candidate', pathA: 'name', pathB: 'full_name', breakingScore: 0.8 },
        resolution: 'ambiguous',
        confidence: 0.62,
        llmRequired: true,
        llmReason: 'Potential rename',
      },
    ],
    requirementsReport: {
      llmEscalations: [
        {
          diff: { kind: 'rename_candidate', pathA: 'name', pathB: 'full_name' },
          reason: 'Ambiguous rename vs new field',
          promptSeed: 'Decide if name was renamed to full_name.',
        },
      ],
      summary: {
        totalDiffs: 1,
        breakingCount: 1,
        nonBreakingCount: 0,
        llmEscalationCount: 1,
        resolvedDeterministically: 0,
      },
    },
    inferredSchemaA: { fingerprint: 'aaaaaaaaaaaaaaaa' },
    inferredSchemaB: { fingerprint: 'bbbbbbbbbbbbbbbb' },
    generatedTransformTs: nowIso,
  };

  return [
    {
      id: 'inc-open',
      sourceId: 'source_open',
      protocol: 'openapi',
      severity: 'major',
      status: 'open',
      bridgeReport: null,
      impactScore: 0.42,
      routingTarget: 'operator_review',
      remediationHints: [],
      affectedTenants: [],
      llmAnalysis: [],
      detectedAt: nowIso,
      resolvedAt: null,
    },
    {
      id: 'inc-investigating',
      sourceId: 'source_investigating',
      protocol: 'sql',
      severity: 'critical',
      status: 'investigating',
      bridgeReport: bridgeReportWithEscalation,
      impactScore: 0.91,
      routingTarget: 'incident_alert',
      remediationHints: ['Verify rename at consumer side', 'Update mapping memory'],
      affectedTenants: ['tenant-a', 'tenant-b'],
      llmAnalysis: [],
      detectedAt: nowIso,
      resolvedAt: null,
    },
    {
      id: 'inc-resolved',
      sourceId: 'source_resolved',
      protocol: 'csv',
      severity: 'major',
      status: 'resolved',
      bridgeReport: null,
      impactScore: 0.12,
      routingTarget: 'auto_resolved',
      remediationHints: [],
      affectedTenants: [],
      llmAnalysis: [],
      detectedAt: nowIso,
      resolvedAt: nowIso,
    },
  ];
}

async function seedAuth(page: Page): Promise<void> {
  const authState = {
    state: {
      user: { id: 'e2e', email: 'e2e@local', name: 'E2E', role: 'platform_admin' },
      token: 'e2e-token',
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
}

type ApiMockOptions = {
  incidents: DriftIncident[];
  list?: {
    status?: number;
    once?: boolean;
    body?: unknown;
    contentType?: string;
  };
  sse?: {
    events: Array<{ type: string; data: unknown }>;
  };
  analyze?: (callIndex: number) => { status: number; body: unknown };
};

async function mockIncidentsApi(page: Page, options: ApiMockOptions): Promise<void> {
  let incidentsData = [...options.incidents];
  let listCalls = 0;
  let analyzeCalls = 0;

  await page.route('**/api/stream', async (route) => {
    const events = options.sse?.events ?? [];
    const sseBody = events.length
      ? events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify({ type: e.type, data: e.data, ts: new Date().toISOString() })}\n\n`).join('')
      : ':ok\n\n';
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: sseBody,
    });
  });

  await page.route('**/api/drift/incidents**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());

    if (url.pathname === '/api/drift/incidents' && req.method() === 'GET') {
      listCalls += 1;
      const status = options.list?.status ?? 200;
      const contentType = options.list?.contentType;
      const shouldFail = options.list?.once ? listCalls === 1 : status !== 200;

      if (shouldFail && status !== 200) {
        await route.fulfill({
          status,
          headers: { 'content-type': contentType ?? 'text/plain' },
          body: typeof options.list?.body === 'string' ? options.list.body : JSON.stringify(options.list?.body ?? 'error'),
        });
        return;
      }

      if (contentType && !contentType.includes('application/json')) {
        await route.fulfill({
          status: 200,
          headers: { 'content-type': contentType },
          body: typeof options.list?.body === 'string' ? options.list.body : String(options.list?.body ?? ''),
        });
      } else {
        await route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(options.list?.body ?? { success: true, data: incidentsData }),
        });
      }
      return;
    }

    const matchStatus = url.pathname.match(/^\/api\/drift\/incidents\/([^/]+)\/status$/);
    if (matchStatus && req.method() === 'POST') {
      const id = matchStatus[1];
      const body = req.postDataJSON() as { status?: DriftIncident['status'] } | null;
      const nextStatus = body?.status;

      if (nextStatus) {
        incidentsData = incidentsData.map((i) => (i.id === id ? { ...i, status: nextStatus } : i));
      }

      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    const matchRemediate = url.pathname.match(/^\/api\/drift\/incidents\/([^/]+)\/remediate$/);
    if (matchRemediate && req.method() === 'POST') {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ success: true, data: { started: 2, failed: 0, total: 2 } }),
      });
      return;
    }

    const matchAnalyze = url.pathname.match(/^\/api\/drift\/incidents\/([^/]+)\/analyze$/);
    if (matchAnalyze && req.method() === 'POST') {
      analyzeCalls += 1;
      const handler = options.analyze ?? (() => ({
        status: 200,
        body: {
          success: true,
          data: { action: 'renamed_to', suggestion: 'Treat as rename', confidence: 0.82, reasoning: 'Likely field rename.' },
        },
      }));

      const res = handler(analyzeCalls);
      await route.fulfill({
        status: res.status,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(res.body),
      });
      return;
    }

    await route.fulfill({ status: 404, body: 'not found' });
  });
}

test.beforeEach(async ({ page }) => {
  await seedAuth(page);
});

test('counts investigating incidents in Total Active', async ({ page }) => {
  const nowIso = new Date('2026-04-14T12:00:00.000Z').toISOString();
  const incidents = buildIncidentsFixture(nowIso);
  await mockIncidentsApi(page, { incidents });

  await page.goto('/incidents');

  await expect(page.getByTestId('incidents-summary-total-active')).toContainText('2');
  await expect(page.getByTestId('incident-card-inc-investigating')).toBeVisible();
});

test('adds filter params and filters client-side', async ({ page }) => {
  const nowIso = new Date('2026-04-14T12:00:00.000Z').toISOString();
  const incidents = buildIncidentsFixture(nowIso);
  await mockIncidentsApi(page, { incidents });

  await page.goto('/incidents');

  const statusReq = page.waitForRequest((req) =>
    req.method() === 'GET'
    && req.url().includes('/api/drift/incidents?')
    && req.url().includes('status=resolved')
  );
  await page.getByLabel('Status').selectOption('resolved');
  await statusReq;

  await expect(page.getByTestId('incident-card-inc-resolved')).toBeVisible();
  await expect(page.getByTestId('incident-card-inc-open')).toHaveCount(0);
  await expect(page.getByTestId('incident-card-inc-investigating')).toHaveCount(0);
});

test('updates incident status via POST /status', async ({ page }) => {
  const nowIso = new Date('2026-04-14T12:00:00.000Z').toISOString();
  const incidents = buildIncidentsFixture(nowIso);
  await mockIncidentsApi(page, { incidents });

  await page.goto('/incidents');

  await page.getByText('source_open', { exact: true }).click();

  const [req] = await Promise.all([
    page.waitForRequest((r) =>
      r.method() === 'POST' && r.url().includes('/api/drift/incidents/inc-open/status')
    ),
    page.getByRole('button', { name: 'Mark Investigating' }).click(),
  ]);
  expect(req.postDataJSON()).toEqual({ status: 'investigating' });

  await expect(page.getByTestId('incident-card-inc-open').getByText('investigating', { exact: true })).toBeVisible();
});

test('starts remediation via POST /remediate and shows alert', async ({ page }) => {
  const nowIso = new Date('2026-04-14T12:00:00.000Z').toISOString();
  const incidents = buildIncidentsFixture(nowIso);
  await mockIncidentsApi(page, { incidents });

  await page.goto('/incidents');

  await page.getByText('source_investigating', { exact: true }).click();

  const dialogPromise = new Promise<string>((resolve) => {
    page.once('dialog', async (dialog) => {
      const message = dialog.message();
      await dialog.accept();
      resolve(message);
    });
  });

  await page.getByRole('button', { name: /Start Remediation/i }).click();

  const message = await dialogPromise;
  expect(message).toContain('Remediation started for 2/2');
});

test('shows friendly error on 503 analyze and succeeds on retry', async ({ page }) => {
  const nowIso = new Date('2026-04-14T12:00:00.000Z').toISOString();
  const incidents = buildIncidentsFixture(nowIso);
  await mockIncidentsApi(page, {
    incidents,
    analyze: (callIndex) => {
      if (callIndex === 1) {
        return { status: 503, body: { error: null } };
      }
      return {
        status: 200,
        body: {
          success: true,
          data: { action: 'renamed_to', suggestion: 'Treat as rename', confidence: 0.82, reasoning: 'Likely field rename.' },
        },
      };
    },
  });

  await page.goto('/incidents');
  await page.getByText('source_investigating', { exact: true }).click();

  await page.getByRole('button', { name: /Analyze with AI/i }).click();
  await expect(page.getByText(/LLM unavailable/i)).toBeVisible();

  const analyzeReq = page.waitForRequest((req) =>
    req.method() === 'POST' && req.url().includes('/api/drift/incidents/inc-investigating/analyze')
  );
  await page.getByRole('button', { name: 'retry' }).click();
  await analyzeReq;

  await expect(page.getByText('Treat as rename')).toBeVisible();
});

test('shows load error and recovers on retry', async ({ page }) => {
  const nowIso = new Date('2026-04-14T12:00:00.000Z').toISOString();
  const incidents = buildIncidentsFixture(nowIso);

  await mockIncidentsApi(page, {
    incidents,
    list: { status: 500, once: true },
  });

  await page.goto('/incidents');

  await expect(page.getByText(/HTTP_500/)).toBeVisible();

  const retryReq = page.waitForRequest((req) =>
    req.method() === 'GET' && req.url().includes('/api/drift/incidents?')
  );
  await page.getByRole('button', { name: 'retry' }).click();
  await retryReq;

  await expect(page.getByTestId('incidents-summary-total-active')).toBeVisible();
});

test('redirects to /login on 401 from incidents list', async ({ page }) => {
  const nowIso = new Date('2026-04-14T12:00:00.000Z').toISOString();
  const incidents = buildIncidentsFixture(nowIso);

  await mockIncidentsApi(page, {
    incidents,
    list: { status: 401, body: 'unauthorized' },
  });

  await page.goto('/incidents');
  await expect(page).toHaveURL(/\/login$/);
});

test('shows API_RESPONSE_NOT_JSON when backend returns HTML', async ({ page }) => {
  const nowIso = new Date('2026-04-14T12:00:00.000Z').toISOString();
  const incidents = buildIncidentsFixture(nowIso);

  await mockIncidentsApi(page, {
    incidents,
    list: { status: 200, body: '<!doctype html><html><body>oops</body></html>', contentType: 'text/html' },
  });

  await page.goto('/incidents');
  await expect(page.getByText('API_RESPONSE_NOT_JSON')).toBeVisible();
});

test('renders empty state when filters match nothing', async ({ page }) => {
  const nowIso = new Date('2026-04-14T12:00:00.000Z').toISOString();
  const incidents = buildIncidentsFixture(nowIso);
  await mockIncidentsApi(page, { incidents });

  await page.goto('/incidents');
  await page.getByLabel('Status').selectOption('dismissed');

  await expect(page.getByText('No incidents match the current filters')).toBeVisible();
  await expect(page.getByText('POST /api/drift/ingest')).toBeVisible();
});

test('handles SSE incident.created by adding card and toast', async ({ page }) => {
  const nowIso = new Date('2026-04-14T12:00:00.000Z').toISOString();
  const incidents = buildIncidentsFixture(nowIso);

  const sseIncident: DriftIncident = {
    id: 'inc-sse',
    sourceId: 'source_sse',
    protocol: 'sql',
    severity: 'major',
    status: 'open',
    bridgeReport: null,
    impactScore: 0.5,
    routingTarget: 'operator_review',
    remediationHints: [],
    affectedTenants: ['tenant-x'],
    llmAnalysis: [],
    detectedAt: nowIso,
    resolvedAt: null,
  };

  await mockIncidentsApi(page, {
    incidents,
    sse: { events: [{ type: 'incident.created', data: sseIncident }] },
  });

  await page.goto('/incidents');

  await expect(page.getByTestId('incident-card-inc-sse')).toBeVisible();
  await expect(page.getByText('Major drift — source_sse').first()).toBeVisible();
});

test('shows friendly error on 504 analyze', async ({ page }) => {
  const nowIso = new Date('2026-04-14T12:00:00.000Z').toISOString();
  const incidents = buildIncidentsFixture(nowIso);
  await mockIncidentsApi(page, {
    incidents,
    analyze: () => ({ status: 504, body: { error: null } }),
  });

  await page.goto('/incidents');
  await page.getByText('source_investigating', { exact: true }).click();

  await page.getByRole('button', { name: /Analyze with AI/i }).click();
  await expect(page.getByText('LLM service not responding')).toBeVisible();
});

test('expands incident and renders Schema Diffs table', async ({ page }) => {
  const nowIso = new Date('2026-04-14T12:00:00.000Z').toISOString();
  const incidents = buildIncidentsFixture(nowIso);
  await mockIncidentsApi(page, { incidents });

  await page.goto('/incidents');

  // Expand the incident that has a bridge report
  await page.getByText('source_investigating', { exact: true }).click();

  const card = page.getByTestId('incident-card-inc-investigating');

  // Schema Diffs header shows count
  await expect(card.getByText(/Schema Diffs \(1\)/i)).toBeVisible();

  // The diff hunk header
  await expect(card.getByText('@@ schema diff @@')).toBeVisible();

  // The renamed field paths are shown
  await expect(card.getByText('name')).toBeVisible();
  await expect(card.getByText('full_name')).toBeVisible();

  // Fingerprint delta chip is visible
  await expect(card.getByText(/aaaaaaaa/)).toBeVisible();
  await expect(card.getByText(/bbbbbbbb/)).toBeVisible();

  // Resolution summary: 1 pending LLM, 1 breaking
  await expect(card.getByText(/pending.*LLM|LLM.*pending/i)).toBeVisible();
  await expect(card.getByText(/breaking/i).first()).toBeVisible();
});

test('expands incident and shows Needs AI analysis section', async ({ page }) => {
  const nowIso = new Date('2026-04-14T12:00:00.000Z').toISOString();
  const incidents = buildIncidentsFixture(nowIso);
  await mockIncidentsApi(page, { incidents });

  await page.goto('/incidents');
  await page.getByText('source_investigating', { exact: true }).click();

  const card = page.getByTestId('incident-card-inc-investigating');

  // LLM escalation section header
  await expect(card.getByText(/Needs AI analysis \(1\)/i)).toBeVisible();

  // The escalation reason from the fixture
  await expect(card.getByText('Ambiguous rename vs new field')).toBeVisible();

  // Analyze button
  await expect(card.getByRole('button', { name: /Analyze with AI/i })).toBeVisible();
});

test('completes LLM analysis and shows result card', async ({ page }) => {
  const nowIso = new Date('2026-04-14T12:00:00.000Z').toISOString();
  const incidents = buildIncidentsFixture(nowIso);
  await mockIncidentsApi(page, { incidents });

  await page.goto('/incidents');
  await page.getByText('source_investigating', { exact: true }).click();

  const analyzeReq = page.waitForRequest((req) =>
    req.method() === 'POST' && req.url().includes('/api/drift/incidents/inc-investigating/analyze'),
  );
  await page.getByRole('button', { name: /Analyze with AI/i }).click();
  await analyzeReq;

  const card = page.getByTestId('incident-card-inc-investigating');

  // Default mock returns renamed_to with suggestion and 82% confidence
  await expect(card.getByText('Treat as rename')).toBeVisible();
  await expect(card.getByText('Likely field rename.')).toBeVisible();
  await expect(card.getByText('82%')).toBeVisible();

  // After analysis the Analyze button is replaced by action badge + Re-analyze
  await expect(card.getByRole('button', { name: /Analyze with AI/i })).toHaveCount(0);
  await expect(card.getByRole('button', { name: /Re-analyze/i })).toBeVisible();
});

test('incidents with null bridgeReport show no-diffs text', async ({ page }) => {
  const nowIso = new Date('2026-04-14T12:00:00.000Z').toISOString();
  const incidents = buildIncidentsFixture(nowIso);
  await mockIncidentsApi(page, { incidents });

  await page.goto('/incidents');

  // Expand inc-open which has bridgeReport: null
  await page.getByText('source_open', { exact: true }).click();

  const card = page.getByTestId('incident-card-inc-open');

  // No diffs text and no Schema Diffs section
  await expect(card.getByText(/No diffs recorded/i)).toBeVisible();
  await expect(card.getByText(/Schema Diffs/i)).toHaveCount(0);
  await expect(card.getByText(/Needs AI analysis/i)).toHaveCount(0);
});
