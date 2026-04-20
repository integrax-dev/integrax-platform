type TestResult = { connected: boolean; error?: string };
type ModuleTesterFn = (config: Record<string, string>) => Promise<TestResult>;

const testers = new Map<string, ModuleTesterFn>();

export function registerModuleTester(moduleId: string, fn: ModuleTesterFn): void {
  testers.set(moduleId, fn);
}

export async function testModule(
  moduleId: string,
  config: Record<string, string>,
): Promise<TestResult> {
  const fn = testers.get(moduleId);
  if (!fn) return { connected: false, error: `No tester registered for module '${moduleId}'` };
  return fn(config);
}
