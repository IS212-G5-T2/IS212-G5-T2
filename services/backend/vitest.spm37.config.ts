import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';

export default mergeConfig(
  base,
  defineConfig({
    test: {
      coverage: {
        enabled: true,
        provider: 'v8',
        include: [
          'src/events/draft-input.ts',
          'src/events/drafts.service.ts',
          'src/events/drafts.controller.ts',
          'src/events/event-input.ts',
          'src/events/events.service.ts',
        ],
        reporter: ['text', 'json', 'json-summary', 'html'],
        reportsDirectory: './coverage/spm37',
        thresholds: {
          perFile: true,
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
  }),
);
