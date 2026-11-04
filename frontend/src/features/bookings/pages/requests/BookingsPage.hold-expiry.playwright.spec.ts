import { expect, test, type Page } from "@playwright/test";

/*
 * SPM-134 browser acceptance (tentative hold expiry notifications, Coordinator). Run through the backend browser harness
 * (backend/scripts/testing/run-browser.mjs), which seeds three approved tentative holds of one event assigned to the
 * seeded Coordinator 1 and starts nothing itself: the backend under test must run with TENTATIVE_HOLD_EXPIRY_INTERVAL_MS=1000
 * so its own scheduler sends the reminder and the expired notice. Everyone signs in through the real login page.
 */
const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";
const password = "P@55w0rd";
const eventName = process.env.SPM134_EVENT_NAME;
const reminderVenue = process.env.SPM134_REMINDER_VENUE;
const expiredVenue = process.env.SPM134_EXPIRED_VENUE;
const releaseVenue = process.env.SPM134_RELEASE_VENUE;
const reminderHoldId = process.env.SPM134_REMINDER_HOLD_ID;
const releaseHoldId = process.env.SPM134_RELEASE_HOLD_ID;
const reminderExpiresIso = process.env.SPM134_REMINDER_EXPIRES_ISO;
const expiredExpiresIso = process.env.SPM134_EXPIRED_EXPIRES_ISO;

test.use({ timezoneId: "Asia/Singapore" });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
}

/** The Coordinator's feed as the browser session sees it (used only to wait for the scheduler's own write). */
async function feedMessages(page: Page): Promise<string[]> {
  const response = await page.request.get(`${apiBase}/api/notifications`);
  return ((await response.json()) as Array<{ message: string }>).map((n) => n.message);
}

function requireFixture() {
  if (!eventName || !reminderVenue || !expiredVenue || !releaseVenue || !reminderHoldId || !releaseHoldId || !reminderExpiresIso || !expiredExpiresIso)
    throw new Error("Run this spec through the browser harness with a dedicated test database.");
}

// Singapore time, as the product writes it: day, month, year and 24-hour time.
const sgt = (iso: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.day} ${parts.month} ${parts.year}`, time: `${parts.hour}:${parts.minute}` };
};

/**
 * HOLD-EXP-NOTIF-06-INT-1 (SPM-134 AC1, AC2, AC4, AC6): the Coordinator's bell shows the 48-hour reminder and the expired
 * notice for their event's holds, in the agreed wording; opening the reminder lands on the Bookings page with that hold's
 * details (status approved, its expiry time) and marks it read.
 */
test("HOLD-EXP-NOTIF-06-INT-1 the Coordinator sees the reminder and the expired notice and opens the reminded hold", async ({ page }) => {
  requireFixture();
  await login(page, "coordinator1@connectsphere.test");
  // The backend's own scheduler writes both notices within its interval; wait for its write, bounded.
  await expect
    .poll(async () => (await feedMessages(page)).filter((m) => m.includes(reminderVenue!) || m.includes(expiredVenue!)).length, { timeout: 30_000 })
    .toBe(2);

  await page.reload();
  await page.getByRole("button", { name: /^Notifications/ }).click();
  const bell = page.getByRole("dialog", { name: "Notifications" });
  const expiry = sgt(reminderExpiresIso!);
  await expect(bell.getByText(new RegExp(`Your tentative hold of ${reminderVenue} for "${eventName}" expires on ${expiry.date}, ${expiry.time} SGT\\.`))).toBeVisible();
  // The exact expiry of the fixture hold (SC-SPM134-01: the app's Singapore format; September is "Sept", en-GB).
  const expiredAt = sgt(expiredExpiresIso!);
  await expect(bell.getByText(`Your tentative hold of ${expiredVenue} for "${eventName}" expired on ${expiredAt.date}, ${expiredAt.time} SGT.`)).toBeVisible();

  const reminderRow = bell.getByRole("listitem").filter({ hasText: reminderVenue! });
  await reminderRow.getByRole("link", { name: "View Booking" }).click();

  await expect(page).toHaveURL(new RegExp(`/bookings\\?booking=${reminderHoldId}`));
  const dialog = page.getByRole("dialog", { name: /Booking details/ });
  await expect(dialog).toContainText("approved");
  await expect(dialog).toContainText("Hold expires");
  await expect(dialog).toContainText(`${expiry.time} SGT`);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(page.getByRole("dialog", { name: "Notifications" }).getByText(new RegExp(`${reminderVenue} for`))).toHaveCount(0);
});

/**
 * HOLD-EXP-NOTIF-06-INT-2 (SPM-134 AC3, AC6): when Venue Staff release the hold, the Coordinator's bell shows the released
 * notice; opening it shows the hold on the Bookings page with status released.
 */
test("HOLD-EXP-NOTIF-06-INT-2 the Coordinator is told when Venue Staff release the hold and opens it", async ({ page, browser }) => {
  requireFixture();
  // Venue Staff release the hold through the real route, in their own session.
  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  await login(staffPage, "venue_staff1@connectsphere.test");
  const released = await staffPage.request.post(`${apiBase}/api/venues/bookings/${releaseHoldId}/release-hold`);
  expect(released.status()).toBe(201);
  await staffContext.close();

  await login(page, "coordinator1@connectsphere.test");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  const bell = page.getByRole("dialog", { name: "Notifications" });
  await expect(bell.getByText(`Your tentative hold of ${releaseVenue} for "${eventName}" has been released.`)).toBeVisible();
  await bell.getByRole("listitem").filter({ hasText: releaseVenue! }).getByRole("link", { name: "View Booking" }).click();

  await expect(page).toHaveURL(new RegExp(`/bookings\\?booking=${releaseHoldId}`));
  const dialog = page.getByRole("dialog", { name: /Booking details/ });
  await expect(dialog).toContainText("released");
  await expect(dialog).toContainText("Hold expiry");
});
