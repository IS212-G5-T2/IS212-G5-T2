import { defineConfig, devices } from "@playwright/test";

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
  // Two projects (SPM-187 stage 2). `setup` writes a saved login per seeded account (e2e/auth.setup.ts) and `browser`
  // runs the specs after it, so a spec declares `test.use({ as: "coordinator" })` instead of logging in through the UI.
  // Neither project sets a default storageState: a spec is anonymous unless it asks, which the login test and the
  // stubbed specs rely on.
  testDir: "./src",
  projects: [
    { name: "setup", testDir: "./e2e", testMatch: "**/*.setup.ts" },
    { name: "browser", testMatch: "**/*.playwright.spec.ts", testIgnore: "**/*.mobile.playwright.spec.ts", dependencies: ["setup"] },
    // E2E-30 (SPM-192) and any other phone-only test: name the file `*.mobile.playwright.spec.ts` and it runs under a
    // named device profile (viewport, touch, mobile UA) instead of calling page.setViewportSize. Pixel 7 is Chromium,
    // so no extra browser is needed. Tests that deliberately sweep several widths in one test stay in `browser`.
    { name: "mobile", testMatch: "**/*.mobile.playwright.spec.ts", dependencies: ["setup"], use: { ...devices["Pixel 7"] } },
    // Self-tests for the e2e helpers (clock, dates). No database or login involved.
    { name: "helpers", testDir: "./e2e", testMatch: "**/*.playwright.spec.ts" },
  ],

  // These suites share one database and frontend/e2e/fixtures.ts truncates it before EVERY test
  // (SPM-187), so two tests running at once would wipe each other's rows and sessions mid-test and the
  // fixtures' fixed names would collide. workers: 1 is a correctness requirement here, not a tuning
  // choice - do not raise it, enable fullyParallel, or shard two shards onto one database. The reset
  // fixture asserts this and fails loudly rather than letting it corrupt a run.
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
