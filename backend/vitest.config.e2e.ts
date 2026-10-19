import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // These suites share one mutable PostgreSQL container and clean up their
    // own fixtures, so parallel files can interfere with one another.
    fileParallelism: false,
    // The real-database suites are the only tests that run the services which need PostgreSQL
    // (for example status.service.ts), so `npm run test:cov` does not measure them.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage/e2e',
      include: ['src/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    },
  },
});
