import { defineConfig } from "@playwright/test";

const isCI = !!process.env.CI;

const backendPort = process.env.E2E_BACKEND_PORT ?? "8080";
const frontendPort = process.env.E2E_FRONTEND_PORT ?? "5173";
const backendOrigin = `http://localhost:${backendPort}`;
const frontendOrigin = `http://localhost:${frontendPort}`;

// Playwright starts the stack itself, so one command works locally and in CI (SPM-186). The backend
// entry is the built output, so `npm run build` in backend/ must have run first.
//
// Both servers inherit this process's environment, which is how the test database reaches them:
// backend/scripts/testing/run-browser.mjs passes DATABASE_URL, FRONTEND_ORIGIN and
// TENTATIVE_HOLD_EXPIRY_INTERVAL_MS through to here.
//
// reuseExistingServer is OFF by default, deliberately. Playwright decides whether to reuse by
// probing the health URL, which tells it only that *something* answers - not that it is ours. On a
// developer machine this is a real trap: an unrelated project's nginx was found listening on 8080
// answering /healthz with 200, which Playwright would have adopted as the backend under test. With
// reuse off, a busy port fails loudly instead. Set PLAYWRIGHT_REUSE_SERVERS=1 when you have
// deliberately started this project's stack yourself, or override the ports below.
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVERS === "1";

const webServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER
  ? undefined
  : [
      {
        command: "node dist/main",
        cwd: "../backend",
        url: `http://127.0.0.1:${backendPort}/healthz`,
        reuseExistingServer,
        timeout: 120_000,
        stdout: "pipe" as const,
        stderr: "pipe" as const,
        env: { PORT: backendPort, FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN ?? frontendOrigin },
      },
      {
        // --strictPort so a clash fails instead of Vite silently moving to another port, which
        // would leave baseURL pointing at nothing.
        command: `npm run dev -- --port ${frontendPort} --strictPort`,
        url: frontendOrigin,
        reuseExistingServer,
        timeout: 120_000,
        stdout: "pipe" as const,
        stderr: "pipe" as const,
        env: { VITE_API_BASE_URL: process.env.VITE_API_BASE_URL ?? backendOrigin },
      },
    ];

export default defineConfig({
  testDir: "./src",
  testMatch: "**/*.playwright.spec.ts",

  // These suites share one database, so they run one at a time. Per-test isolation is SPM-187.
  workers: 1,
  fullyParallel: false,

  // A stray .only must not silently narrow a CI run into passing.
  forbidOnly: isCI,

  // Deliberately no retries, including in CI. A retry turns a flaky test green and is how a real
  // defect survives: the schema regression fixed in SPM-185 was invisible for weeks because the
  // suite's result depended on luck rather than correctness. A flake should be visible and fixed
  // (see SPM-195), not retried away.
  retries: 0,

  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME
    ? [["list"], ["json"]]
    : isCI
      ? [["list"], ["html", { open: "never" }]]
      : "list",

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? frontendOrigin,
    headless: true,
    // Evidence for a failure nobody watched happen.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    launchOptions: process.env.PLAYWRIGHT_CHROME_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH }
      : undefined,
  },

  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? "./test-results",
  webServer,
});
