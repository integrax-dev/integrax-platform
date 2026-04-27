import type { BusinessTypeProvider } from './types.js';

export function detectBusinessFormat(
  value: string,
  fieldPath: string,
  providers: BusinessTypeProvider[],
): string | undefined {
  for (const provider of providers) {
    if (provider.detect({ value, fieldPath })) {
      return provider.format;
    }
  }
  return undefined;
}
