// SPM-187: a thin wrapper over page.clock for tests whose subject IS time: hold expiry (E2E-13) and the venue
// setup/turnaround boundaries (E2E-09). It controls the BROWSER clock only; the backend keeps real time, so a test
// that needs the server to see a different "now" must seed data relative to the real clock instead.
//
// Use `freezeClock(page, iso)` to pin "now", then `advanceClock(page, ms)` to move it forward deterministically.
// Timers (setTimeout/setInterval) fire as the clock advances, so countdowns and expiry banners can be driven without
// sleeping. Call before `page.goto`; the clock is installed into the page's scripts at load.
//
// This is not for picking a future date to type into a form; use ./dates.ts for that.
import type { Page } from "@playwright/test";

/** Pin the browser's "now" to `iso` and let it stay still until `advanceClock` moves it. */
export async function freezeClock(page: Page, iso: string | Date): Promise<void> {
  await page.clock.install({ time: new Date(iso) });
  await page.clock.pauseAt(new Date(iso));
}

/** Move the paused browser clock forward by `ms`, firing any timers that fall due. */
export async function advanceClock(page: Page, ms: number): Promise<void> {
  await page.clock.fastForward(ms);
}

/** Read the browser's current "now" as an ISO string (useful to assert what the page believes). */
export async function browserNow(page: Page): Promise<string> {
  return page.evaluate(() => new Date().toISOString());
}
