/**
 * ConnectorTester contract
 *
 * Every connector tester file must export a `testConnection` function and a
 * `connectorId` constant. The registry in index.ts auto-discovers them.
 */

export interface TestConnectionResult {
  success: boolean;
  testedAt: Date;
  latencyMs: number;
  error?: { code: string; message: string };
  details?: Record<string, unknown>;
}

export type ConnectorTesterFn = (credentials: Record<string, string>) => Promise<TestConnectionResult>;

export function ok(start: number, details: Record<string, unknown>): TestConnectionResult {
  return { success: true, testedAt: new Date(), latencyMs: Date.now() - start, details };
}

export function fail(start: number, code: string, message: string): TestConnectionResult {
  return { success: false, testedAt: new Date(), latencyMs: Date.now() - start, error: { code, message } };
}

export function connErr(start: number, e: unknown): TestConnectionResult {
  return fail(start, 'CONNECTION_ERROR', e instanceof Error ? e.message : 'Unknown error');
}
