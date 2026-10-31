import { expect, test, type Page } from "@playwright/test";

test.use({ timezoneId: "Asia/Singapore" });

// SPM-88 DECISION-NOTIFY-05-VIEWPORT-1: the notification dropdown must fit
// short viewports so the last row's "View Request" and "Mark As Read" stay reachable (AC4, AC5), and the visible
// decision date (AC2/AC3) is rendered. The backend is stubbed, so no database or login is needed.

const notifications = Array.from({ length: 12 }, (_, i) => ({
  id: `n-${i + 1}`,
  audienceRole: "organiser",
  audienceUserId: "org-short",
  type: "rejection",
  message: `Your event request "Short Screen Event ${i + 1}" was rejected`,
  relatedEventId: `event-${i + 1}`,
  read: false,
  // Later numbers are newer, so "Short Screen Event 1" is the last (oldest) row.
  createdAt: new Date(Date.UTC(2030, 0, 1 + i, 4, 0, 0)).toISOString(),
}));

async function openBellWithErrorBanner(page: Page) {
  const read = new Set<string>();
  let failFeed = false;
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ uid: "org-short", name: "Short Organiser", email: "short@example.test", roles: ["ORGANISER"] }),
    }),
  );
  await page.route("**/api/notifications", (route) =>
    failFeed
      ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "down" }) })
      : route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(notifications.map((n) => ({ ...n, read: read.has(n.id) }))),
        }),
  );
  await page.route("**/api/notifications/*/read", (route) => {
    read.add(route.request().url().split("/").slice(-2, -1)[0]);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
  });
  await page.route("**/api/events", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
  );
  await page.goto("/events");
  await page.getByRole("button", { name: /^Notifications, 12 unread/ }).click();
  await expect(page.getByRole("dialog", { name: "Notifications" })).toBeVisible();
  // Make the feed fail and refresh through the window focus handler so the error banner shows above the list.
  failFeed = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("dialog", { name: "Notifications" }).getByRole("alert")).toContainText("Could not load request decisions.");
}

async function expectInsideViewport(page: Page, locator: ReturnType<Page["getByRole"]>) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error("Missing bounding box or viewport");
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
}

for (const size of [
  { name: "phone 375x480", width: 375, height: 480 },
  { name: "short desktop 1024x500", width: 1024, height: 500 },
]) {
  test(`DECISION-NOTIFY-05-VIEWPORT-1: on a ${size.name} screen the last row's actions stay reachable and usable`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await openBellWithErrorBanner(page);

    const dialog = page.getByRole("dialog", { name: "Notifications" });
    // The whole dropdown, including the heading and error banner, fits inside the viewport.
    await expectInsideViewport(page, dialog);
    await expect(dialog.getByRole("heading", { name: "Notifications" })).toBeInViewport();

    const lastRow = dialog.getByRole("listitem").filter({ hasText: "Short Screen Event 1\"" });
    const markRead = lastRow.getByRole("button", { name: "Mark As Read" });
    const viewRequest = lastRow.getByRole("link", { name: "View Request" });
    await markRead.scrollIntoViewIfNeeded();
    await expect(markRead).toBeVisible();
    await expectInsideViewport(page, markRead);
    await expectInsideViewport(page, viewRequest);
    // The decision date (AC2/AC3) is visible text in the last row too.
    await expect(lastRow.getByText("1 Jan 2030")).toBeVisible();

    await markRead.click();
    await expect(dialog.getByRole("listitem")).toHaveCount(11);
    await expect(page.getByRole("button", { name: /^Notifications, 11 unread/ })).toBeVisible();
  });
}
