import { expect, test } from "@playwright/test";

const venueId = "responsive-calendar-browser-venue";
const venue = {
  id: venueId,
  name: "Responsive Calendar Venue",
  location: "North Campus",
  capacity: 80,
  facilities: [],
  accessibility: [],
  layouts: [],
  operatingInformation: "Monday to Friday",
  setupTimeMinutes: 30,
  turnaroundTimeMinutes: 30,
  availabilityStatus: "available",
  unavailablePeriods: [],
  reservations: [],
};

test("uses a day grid on mobile and keeps the selected date in the desktop week view", async ({ page }) => {
  await page.clock.install({ time: new Date("2030-01-07T01:00:00.000Z") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        uid: "responsive-calendar-coordinator",
        name: "Calendar Coordinator",
        email: "calendar@example.test",
        roles: ["COORDINATOR"],
      }),
    }),
  );
  await page.route(`**/api/venues/${venueId}`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(venue) }),
  );

  await page.goto(`/venue-records/${venueId}`);
  await expect(page.getByRole("heading", { name: venue.name })).toBeVisible();
  await expect(page.locator(".venue-schedule-calendar--mobile")).toBeVisible();
  await expect(page.locator("[role='grid'][aria-colcount='1']")).toBeVisible();
  await expect(page.locator("[role='grid'][aria-colcount='7']")).toHaveCount(0);
  await expect(page.locator(".venue-schedule-calendar-scroll")).toHaveCSS("overflow-x", "auto");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(page.getByText(/availability updates automatically/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh schedule" })).toHaveCount(0);
  for (const [label, control] of [
    ["Event starts", page.getByLabel("Event starts")],
    ["Event ends", page.getByLabel("Event ends")],
    ["Calendar view", page.getByRole("button", { name: "Calendar" })],
    ["List view", page.getByRole("button", { name: "List" })],
  ] as const) {
    const box = await control.boundingBox();
    expect(box, `${label} should be measurable`).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
  const calendarViewport = page.locator(".venue-schedule-calendar-scroll");
  const calendarGrid = page.locator("[role='grid'][aria-colcount='1']");
  const [viewportBox, gridBox] = await Promise.all([calendarViewport.boundingBox(), calendarGrid.boundingBox()]);
  expect(viewportBox).not.toBeNull();
  expect(gridBox).not.toBeNull();
  expect(gridBox!.width).toBeLessThanOrEqual(viewportBox!.width);

  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.getByRole("columnheader", { name: "January 8, 2030" })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator(".venue-schedule-calendar--desktop")).toBeVisible();
  await expect(page.locator("[role='grid'][aria-colcount='7']")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "January 8, 2030" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("[role='grid'][aria-colcount='1']")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "January 8, 2030" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
