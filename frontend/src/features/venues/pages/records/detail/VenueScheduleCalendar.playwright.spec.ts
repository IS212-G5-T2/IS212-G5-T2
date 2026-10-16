import { expect, test } from "@playwright/test";

test.use({ timezoneId: "Asia/Singapore" });

const venueId = "spm51-calendar-browser-venue";
const venue = {
  id: venueId,
  name: "Calendar Browser Venue",
  location: "North Campus",
  capacity: 80,
  facilities: [],
  accessibility: [],
  layouts: [],
  operatingInformation: "Monday and Tuesday",
  setupTimeMinutes: 0,
  turnaroundTimeMinutes: 0,
  availabilityStatus: "available",
  unavailablePeriods: [],
  reservations: [],
};

async function pointInSlot(
  page: import("@playwright/test").Page,
  date: string,
  time: string,
) {
  const column = page.getByRole("columnheader", {
    name: new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Singapore",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${date}T12:00:00+08:00`)),
  });
  const row = page.locator(`[data-time="${time}:00"]`).nth(1);
  await row.scrollIntoViewIfNeeded();
  const [columnBox, rowBox] = await Promise.all([
    column.boundingBox(),
    row.boundingBox(),
  ]);
  if (!columnBox || !rowBox) {
    throw new Error(`Could not find time-grid cell ${date} ${time}`);
  }
  return {
    x: columnBox.x + columnBox.width / 2,
    y: rowBox.y + 2,
  };
}

async function dragRange(
  page: import("@playwright/test").Page,
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 20 });
  await page.mouse.up();
}

/** SPM-51: a real FullCalendar drag updates event times across days regardless of retired operating-day fields. */
test("selects a real cross-day time range across any calendar day", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2030-01-07T01:00:00.000Z") });
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        uid: "spm51-calendar-coordinator",
        name: "Calendar Coordinator",
        email: "calendar@example.test",
        roles: ["COORDINATOR"],
      }),
    }),
  );
  await page.route(`**/api/venues/${venueId}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(venue),
    }),
  );

  await page.goto(`/venue-records/${venueId}`);
  await expect(page.getByRole("heading", { name: venue.name })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "January 7, 2030" })).toBeVisible();

  // Early-morning time is clear because this fixture has no booking or closure at that time.
  const wednesdayTwo = await pointInSlot(page, "2030-01-09", "02:00");
  const wednesdayThree = await pointInSlot(page, "2030-01-09", "03:00");
  await dragRange(page, wednesdayTwo, wednesdayThree);

  await expect(page.getByLabel("Event starts")).toHaveValue("2030-01-09T02:00");
  await expect(page.getByLabel("Event ends")).toHaveValue("2030-01-09T04:00");
  await expect(page.getByRole("status")).toContainText("available for this venue");

  // Clear the selected range before trying a second, separate interval.
  await page.locator('[title="Click to clear the selected event time"]').click();

  const mondayFive = await pointInSlot(page, "2030-01-07", "17:00");
  const tuesdayTen = await pointInSlot(page, "2030-01-08", "10:00");
  await dragRange(page, mondayFive, tuesdayTen);

  await expect(page.getByLabel("Event starts")).toHaveValue("2030-01-07T17:00");
  await expect(page.getByLabel("Event ends")).toHaveValue("2030-01-08T11:00");
  await expect(page.getByRole("status")).toContainText("available for this venue");

  const wednesdayTen = await pointInSlot(page, "2030-01-09", "10:00");
  await dragRange(page, mondayFive, wednesdayTen);

  await expect(page.getByLabel("Event starts")).toHaveValue("2030-01-07T17:00");
  await expect(page.getByLabel("Event ends")).toHaveValue("2030-01-09T11:00");
});
