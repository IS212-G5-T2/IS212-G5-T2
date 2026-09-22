import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.{ts,tsx}"],
      exclude: ["**/*.playwright.spec.ts"],
      coverage: {
        provider: "v8",
        reporter: ["text", "json-summary", "html"],
        reportsDirectory: "./coverage",
        exclude: ["src/**/*.test.{ts,tsx}", "src/test/**"],
      },
    },
  }),
);
