import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // These suites share one mutable PostgreSQL container and clean up their
    // own fixtures, so parallel files can interfere with one another.
    fileParallelism: false,
  },
});
