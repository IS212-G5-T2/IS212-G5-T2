import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

export default mergeConfig(
  base,
  defineConfig({
    test: {
      // v8 coverage instrumentation slows userEvent flows; give them headroom
      // so component tests do not flake against the default 5s timeout.
      testTimeout: 30000,
      hookTimeout: 30000,
      coverage: {
        enabled: true,
        provider: "v8",
        include: [
          "src/pages/EventCreatePage.tsx",
          "src/pages/MyRequestsPage.tsx",
          "src/utils/api.ts",
        ],
        reporter: ["text", "json", "json-summary", "html"],
        reportsDirectory: "./coverage/spm37",
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
