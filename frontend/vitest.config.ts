import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      pool: "vmThreads",
      include: ["src/**/*.test.{ts,tsx}"],
      // Each form-heavy test renders a full page and types through it. Under CPU contention
      // a single test can take several seconds, so the default 5000ms budget is too tight.
      testTimeout: 20000,
      exclude: ["**/*.playwright.spec.ts"],
      coverage: {
        provider: "v8",
        reporter: ["text", "json-summary", "json", "html"],
        reportsDirectory: "./coverage",
        exclude: ["src/**/*.test.{ts,tsx}", "src/test/**"],
      },
    },
  }),
);
