import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const contracts = fileURLToPath(
  new URL('./packages/contracts/src/index.ts', import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: {
      '@control-plus/contracts': contracts,
    },
  },
  test: {
    environment: 'node',
    include: [
      'apps/api/**/*.test.ts',
      'packages/contracts/**/*.test.ts',
      'apps/mobile/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/.expo/**'],
    // The persistence and e2e suites talk to the Postgres from docker-compose.
    // They are not mocked and they are not skipped: bring the database up first.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ['./apps/api/test/setup-env.ts'],
  },
});
