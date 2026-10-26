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
const mobileEvent = {
  id: "mobile-event",
  name: "Mobile booking event",
  purpose: "",
  description: "",
  organiserId: "org-1",
  organiserName: "Organiser",
  status: "planning",
  startDateTime: "2030-01-08T06:00:00.000Z",
  endDateTime: "2030-01-08T08:00:00.000Z",
  expectedAttendance: 40,
  venueRequirements: { minCapacity: 20, accessibility: [], facilities: [], layout: "" },
  equipmentNeeds: "",
  registrationEnabled: false,
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
};
const mobileBooking = {
  id: "mobile-booking",
  eventId: mobileEvent.id,
  eventName: mobileEvent.name,
  venueId,
  venueName: venue.name,
  start: mobileEvent.startDateTime,
  end: mobileEvent.endDateTime,
  createdAt: "2030-01-01T00:00:00.000Z",
  status: "pending",
  bookingReference: "VB-MOBILE-001",
  specialRequest: "Step-free access, please.",
  affected: false,
};
const secondMobileBooking = {
  ...mobileBooking,
  id: "mobile-booking-2",
  venueId: "second-mobile-venue",
  venueName: "Second Mobile Venue",
  bookingReference: "VB-MOBILE-002",
  specialRequest: "Keep an aisle clear.",
  createdAt: "2030-01-02T00:00:00.000Z",
};

async function mockMobileBookingApis(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        uid: "mobile-coordinator",
        name: "Mobile Coordinator",
        email: "mobile@example.test",
        roles: ["COORDINATOR"],
      }),
    }),
  );
  await page.route(`**/api/venues/${venueId}`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(venue) }),
  );
  await page.route("**/api/events/mobile-event", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mobileEvent) }),
  );
  await page.route("**/api/venues/bookings/mine", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([mobileBooking, secondMobileBooking]) }),
  );
}

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
  await page.route("**/api/events/mobile-event", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mobileEvent) }),
  );
  await page.route("**/api/venues/bookings/mine", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );

  // Range selection and the Event starts/ends fields exist only when a request event is open (eventId).
  await page.goto(`/venue-records/${venueId}?eventId=${mobileEvent.id}`);
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

/** SPM-54 mobile UI: keep the selected mode through resizing and adapt the calendar from day to week at 640px. */
test("keeps List or Calendar choice while adapting the booking schedule at phone and tablet widths", async ({ page }) => {
  await page.clock.install({ time: new Date("2030-01-07T01:00:00.000Z") });
  await mockMobileBookingApis(page);

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/venue-records/${venueId}?eventId=${mobileEvent.id}`);
    await expect(page.getByRole("heading", { name: venue.name })).toBeVisible();
    await expect(page.getByRole("button", { name: "List" })).toHaveClass(/primary/);
    await expect(page.getByRole("region", { name: "Venue schedule" })).toBeHidden();
    await expect(page.getByRole("region", { name: "Existing venue booking request" })).toBeVisible();
    await page.getByRole("button", { name: "Calendar" }).click();
    await expect(page.getByRole("columnheader", { name: "January 8, 2030" })).toBeVisible();
    const previousDay = page.getByRole("button", { name: "Previous Day" });
    const nextDay = page.getByRole("button", { name: "Next Day" });
    const today = page.getByRole("button", { name: /Today|This Day/ });
    await expect(previousDay).toBeVisible();
    await expect(nextDay).toBeVisible();
    await expect(today).toBeVisible();
    await nextDay.click();
    await expect(page.getByRole("columnheader", { name: "January 9, 2030" })).toBeVisible();
    await today.click();
    await expect(page.getByRole("columnheader", { name: "January 7, 2030" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel booking" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel booking" }).click();
    const cancelDialog = page.getByRole("alertdialog");
    await expect(cancelDialog).toBeVisible();
    await expect(cancelDialog.getByRole("button", { name: "Confirm cancellation" })).toBeVisible();
    const detailOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(detailOverflow).toBe(false);

    await page.setViewportSize({ width: 768, height: 900 });
    await expect(page.getByRole("columnheader", { name: "January 6, 2030" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "January 12, 2030" })).toBeVisible();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("button", { name: "Keep booking" }).click();
    await page.getByRole("button", { name: "List" }).click();
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole("region", { name: "Venue schedule" })).toBeHidden();
  }
});

/** SPM-54 mobile UI: My Bookings cards and cancellation confirmation remain responsive at phone and tablet widths. */
test("keeps My Bookings summary and cancellation actions usable at phone widths", async ({ page }) => {
  await mockMobileBookingApis(page);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/bookings");
    // The event name is a level-2 group heading; each booking card also repeats it as a level-3 heading.
    await expect(page.getByRole("heading", { name: mobileEvent.name, level: 2 })).toBeVisible();
    await expect(page.getByText("VB-MOBILE-001")).toBeVisible();
    await expect(page.getByText("Step-free access, please.")).toBeVisible();
    await expect(page.getByText("VB-MOBILE-002")).toBeVisible();
    await expect(page.locator("article")).toHaveCount(2);

    const [firstCard, secondCard] = await Promise.all([
      page.locator("article").nth(0).boundingBox(),
      page.locator("article").nth(1).boundingBox(),
    ]);
    expect(firstCard).not.toBeNull();
    expect(secondCard).not.toBeNull();
    if (!firstCard || !secondCard) throw new Error("Booking cards are not laid out.");
    if (width < 640) expect(secondCard.y).toBeGreaterThan(firstCard.y);
    else {
      expect(Math.abs(secondCard.y - firstCard.y)).toBeLessThan(2);
      expect(secondCard.x).toBeGreaterThan(firstCard.x);
    }

    await page.getByRole("button", { name: "Cancel booking" }).first().click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    const keep = dialog.getByRole("button", { name: "Keep booking" });
    const confirm = dialog.getByRole("button", { name: "Confirm cancellation" });
    await expect(keep).toBeVisible();
    await expect(confirm).toBeVisible();
    const [keepBox, confirmBox] = await Promise.all([keep.boundingBox(), confirm.boundingBox()]);
    expect(keepBox).not.toBeNull();
    expect(confirmBox).not.toBeNull();
    if (!keepBox || !confirmBox) throw new Error("Confirmation actions are not laid out.");
    if (width < 640) {
      expect(keepBox.width).toBeGreaterThan(200);
      expect(keepBox.y).toBeGreaterThan(confirmBox.y);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  }
});
