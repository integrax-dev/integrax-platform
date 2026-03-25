import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Vitest no lee paths de tsconfig automáticamente.
      // Estos alias apuntan al source TypeScript directamente para evitar
      // requerir que los paquetes estén compilados a dist/ durante los tests.
      '@integrax/connector-sdk': resolve(__dirname, '../../connectors/sdk/typescript/src/index.ts'),
      '@integrax/temporal-workflows': resolve(__dirname, '../../workflows/temporal/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
