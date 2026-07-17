import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Integration tests share one Postgres database; run files serially to keep
    // the P0-4 race deterministic and avoid cross-file data interference.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 60_000,
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    setupFiles: ['test/setup.ts'],
    env: { NODE_ENV: 'test' },
  },
});
