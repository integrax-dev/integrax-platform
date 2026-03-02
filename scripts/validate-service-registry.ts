import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function extractContractIds(content: string): string[] {
  const matches = content.matchAll(/connectorId:\s*'([a-z0-9-]+)'/g);
  return uniqueSorted(Array.from(matches, (m) => m[1]));
}

function extractDriftIds(content: string): string[] {
  const mappingBlock = content.match(/const CONNECTOR_URLS:[\s\S]*?=\s*\{([\s\S]*?)\};/);
  if (!mappingBlock) return [];

  const matches = mappingBlock[1].matchAll(/'([a-z0-9-]+)'\s*:/g);
  return uniqueSorted(Array.from(matches, (m) => m[1]));
}

function hasMatrixRegistration(matrixContent: string, serviceId: string): boolean {
  const escaped = serviceId.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const exactBullet = new RegExp(`^\\s*-\\s+${escaped}\\s*$`, 'm');
  return exactBullet.test(matrixContent);
}

function diff(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((v) => !rightSet.has(v));
}

async function main() {
  const root = resolve(process.cwd());
  const contractsPath = resolve(root, 'contracts/ts/src/connector-contracts.ts');
  const driftPath = resolve(root, 'scripts/run-drift-check.ts');
  const matrixPath = resolve(root, 'SERVICE_RESPONSE_MATRIX.md');

  const [contractsRaw, driftRaw, matrixRaw] = await Promise.all([
    readFile(contractsPath, 'utf-8'),
    readFile(driftPath, 'utf-8'),
    readFile(matrixPath, 'utf-8'),
  ]);

  const contractIds = extractContractIds(contractsRaw);
  const driftIds = extractDriftIds(driftRaw);

  const missingInDrift = diff(contractIds, driftIds);
  const missingInMatrix = contractIds.filter((id) => !hasMatrixRegistration(matrixRaw, id));

  if (missingInDrift.length === 0 && missingInMatrix.length === 0) {
    console.log('[service-registry] OK: contracts, drift mapping y matriz están alineados');
    process.exit(0);
  }

  console.error('[service-registry] FAILED: registro de servicios incompleto');

  if (missingInDrift.length > 0) {
    console.error(`- Faltan en scripts/run-drift-check.ts: ${missingInDrift.join(', ')}`);
  }

  if (missingInMatrix.length > 0) {
    console.error(`- Faltan en SERVICE_RESPONSE_MATRIX.md: ${missingInMatrix.join(', ')}`);
  }

  process.exit(1);
}

main().catch((err) => {
  console.error('[service-registry] Fatal:', err);
  process.exit(1);
});
