/**
 * verify-service-reality.ts
 *
 * Ejecuta validación de contratos contra HTTP real (no mocks) usando credenciales
 * del entorno. Genera un reporte JSON auditable.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ALL_CONTRACTS } from '../contracts/ts/src/connector-contracts.ts';
import { createContractTester } from '../contracts/ts/src/contract-tester.ts';

type VerificationStatus = 'verified_real' | 'failed_real' | 'skipped_missing_auth';

interface VerificationEntry {
  connectorId: string;
  baseUrl: string;
  status: VerificationStatus;
  authEnvVar?: string;
  summary?: {
    total: number;
    passed: number;
    failed: number;
    violations: number;
  };
  details?: string;
  checkedAt: string;
}

interface VerificationReport {
  generatedAt: string;
  mode: 'live-http';
  entries: VerificationEntry[];
}

function nowIso(): string {
  return new Date().toISOString();
}

async function main() {
  const tester = createContractTester();
  const entries: VerificationEntry[] = [];

  for (const contract of ALL_CONTRACTS) {
    const checkedAt = nowIso();
    const authEnvVar = contract.auth?.envVar;

    if (authEnvVar && !process.env[authEnvVar]) {
      entries.push({
        connectorId: contract.connectorId,
        baseUrl: contract.baseUrl,
        status: 'skipped_missing_auth',
        authEnvVar,
        details: `Falta variable ${authEnvVar}`,
        checkedAt,
      });
      continue;
    }

    try {
      const result = await tester.runSuite(contract);
      entries.push({
        connectorId: contract.connectorId,
        baseUrl: contract.baseUrl,
        status: result.passed ? 'verified_real' : 'failed_real',
        authEnvVar,
        summary: result.summary,
        details: result.passed
          ? 'Contrato validado con respuestas HTTP reales'
          : 'Respuesta real no conforma contrato esperado',
        checkedAt,
      });
    } catch (error) {
      entries.push({
        connectorId: contract.connectorId,
        baseUrl: contract.baseUrl,
        status: 'failed_real',
        authEnvVar,
        details: error instanceof Error ? error.message : 'Error desconocido en verificación real',
        checkedAt,
      });
    }
  }

  const report: VerificationReport = {
    generatedAt: nowIso(),
    mode: 'live-http',
    entries,
  };

  await mkdir('.drift/reports', { recursive: true });
  const outputPath = join('.drift/reports', `service-reality-${Date.now()}.json`);
  await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf-8');

  console.log('\n[verify-service-reality] Resultado por conector');
  for (const entry of entries) {
    const summary = entry.summary
      ? ` (ok=${entry.summary.passed}/${entry.summary.total}, violations=${entry.summary.violations})`
      : '';
    console.log(`- ${entry.connectorId}: ${entry.status}${summary}`);
    if (entry.details) {
      console.log(`  -> ${entry.details}`);
    }
  }

  console.log(`\n[verify-service-reality] Reporte: ${outputPath}`);

  const hasFailed = entries.some((e) => e.status === 'failed_real');
  if (hasFailed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[verify-service-reality] Fatal:', error);
  process.exit(1);
});
