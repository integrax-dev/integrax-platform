declare module 'vitest' {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void): void;
  export function expect<T = unknown>(actual: T): {
    toBe(expected: unknown): void;
    toBeDefined(): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeUndefined(): void;
    toHaveLength(expected: number): void;
  };
}
