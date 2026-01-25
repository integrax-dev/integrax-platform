import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 30000, // 30s for integration tests
    hookTimeout: 30000,
    pool: 'forks', // Better isolation for integration tests
    poolOptions: {
      forks: {
        singleFork: true, // Run tests sequentially to avoid Redis/Postgres conflicts
      },
    },
  },
});
