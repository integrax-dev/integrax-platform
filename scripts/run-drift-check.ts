/**
 * run-drift-check.ts
 *
 * CI script that runs drift detection for all connectors (or a single connector
 * if CONNECTOR_ID env var is set). Reads OpenAPI spec URLs from environment
 * variables and writes reports to .drift/reports/.
 *
 * Exit codes:
 *   0  — no drift or only minor drift detected
 *   1  — major or critical drift detected (will fail CI)
 */

import { createWatchdog } from '../services/connector-watchdog/src/watchdog.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DRIFT_DIR = '.drift';
const FINGERPRINT_DIR = join(DRIFT_DIR, 'fingerprints');
const EVIDENCE_DIR = join(DRIFT_DIR, 'evidence');
const REPORTS_DIR = join(DRIFT_DIR, 'reports');

// ─── Connector → OpenAPI URL mapping from env vars ───────────────────────────

const CONNECTOR_URLS: Record<string, string | undefined> = {
  'mercadopago': process.env.MERCADOPAGO_OPENAPI_URL,
  'mercadolibre': process.env.MERCADOLIBRE_OPENAPI_URL,
  'afip-wsfe': process.env.AFIP_OPENAPI_URL,
  'shopify': process.env.SHOPIFY_OPENAPI_URL,
  'tiendanube': process.env.TIENDANUBE_OPENAPI_URL,
  'contabilium': process.env.CONTABILIUM_OPENAPI_URL,
  'google-sheets': process.env.GOOGLE_SHEETS_OPENAPI_URL,
  'whatsapp-business': process.env.WHATSAPP_OPENAPI_URL,
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(REPORTS_DIR, { recursive: true });

  const watchdog = createWatchdog({
    fingerprintDir: FINGERPRINT_DIR,
    evidenceDir: EVIDENCE_DIR,
    prThreshold: 'major',
    metricsPort: 0,
    github: process.env.GITHUB_TOKEN ? {
      owner: process.env.GITHUB_OWNER ?? '',
      repo: process.env.GITHUB_REPO ?? '',
      token: process.env.GITHUB_TOKEN,
      defaultBaseBranch: 'main',
      defaultAssignees: [],
      defaultLabels: ['drift-alert', 'automated'],
    } : undefined,
  });

  const targetConnector = process.env.CONNECTOR_ID;
  const connectors = targetConnector
    ? [targetConnector]
    : Object.keys(CONNECTOR_URLS);

  let hasSignificantDrift = false;
  const allReports = [];

  for (const connectorId of connectors) {
    const specUrl = CONNECTOR_URLS[connectorId];

    if (!specUrl) {
      console.log(`[drift-ci] Skipping ${connectorId} — no OpenAPI URL configured`);
      continue;
    }

    console.log(`[drift-ci] Checking ${connectorId}...`);

    let spec: unknown;
    try {
      const response = await fetch(specUrl);
      if (!response.ok) {
        console.warn(`[drift-ci] Failed to fetch spec for ${connectorId}: HTTP ${response.status}`);
        continue;
      }
      spec = await response.json();
    } catch (err) {
      console.warn(`[drift-ci] Failed to fetch spec for ${connectorId}: ${err}`);
      continue;
    }

    const report = await watchdog.check(connectorId, spec);
    allReports.push(report);

    // Save report JSON
    await writeFile(
      join(REPORTS_DIR, `${connectorId}-${Date.now()}.json`),
      JSON.stringify(report, null, 2),
      'utf-8',
    );

    if (report.severity === 'critical' || report.severity === 'major') {
      hasSignificantDrift = true;
      console.error(`[drift-ci] DRIFT: ${connectorId} → ${report.severity} (${report.changes.length} changes)`);
      for (const change of report.changes) {
        console.error(`  - [${change.severity}] ${change.type}: ${change.description}`);
      }
    } else if (report.severity === 'minor') {
      console.warn(`[drift-ci] Minor drift on ${connectorId}: ${report.changes.length} change(s)`);
    } else {
      console.log(`[drift-ci] No drift on ${connectorId}`);
    }
  }

  // Print metrics
  console.log('\n[drift-ci] Metrics:');
  console.log(watchdog.renderMetrics());

  await watchdog.shutdown();

  // Exit 1 only on significant drift so CI fails
  if (hasSignificantDrift) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[drift-ci] Fatal error:', err);
  process.exit(1);
});
