import { type Page } from "@playwright/test";
import { expect, test } from "../../../../../e2e/fixtures";

/*
 * SPM-134 browser acceptance (tentative hold expiry notifications, Coordinator). Run through the backend browser harness
 * (backend/scripts/testing/run-browser.mjs). Each test resets the database and builds, through the "holdExpiry" preset
 * (backend/scripts/testing/browser-fixtures.mjs), three approved tentative holds of one event assigned to the seeded
 * Coordinator 1. The backend under test must run with TENTATIVE_HOLD_EXPIRY_INTERVAL_MS=1000 (the harness sets it) so
 * its own scheduler sends the reminder and the expired notice. Everyone is signed in from a saved login (frontend/e2e/auth.setup.ts).
 */
const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";

/** SPM-134 AC1 / SPM-190 Q4 (resolved): the Coordinator is reminded 48 hours before the hold expires. One-line edit if it changes. */
const REMINDER_LEAD_HOURS = 48;

test.use({ timezoneId: "Asia/Singapore", as: "coordinator" });

/** The Coordinator's feed as the browser session sees it (used only to wait for the scheduler's own write). */
async function feedMessages(page: Page): Promise<string[]> {
  const response = await page.request.get(`${apiBase}/api/notifications`);
  return ((await response.json()) as Array<{ message: string }>).map((n) => n.message);
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
test("HOLD-EXP-NOTIF-06-INT-1 the Coordinator sees the reminder and the expired notice and opens the reminded hold", async ({ page, db }) => {
  const { eventName, reminderVenue, expiredVenue, reminderHoldId, reminderExpiresIso, expiredExpiresIso } = await db.preset("holdExpiry");
  await page.goto("/");
  // The backend's own scheduler writes both notices within its interval; wait for its write, bounded.
  await expect
    .poll(async () => (await feedMessages(page)).filter((m) => m.includes(reminderVenue) || m.includes(expiredVenue)).length, { timeout: 30_000 })
    .toBe(2);

  await page.reload();
  await page.getByRole("button", { name: /^Notifications/ }).click();
  const bell = page.getByRole("dialog", { name: "Notifications" });
  const expiry = sgt(reminderExpiresIso);
  await expect(bell.getByText(new RegExp(`Your tentative hold of ${reminderVenue} for "${eventName}" expires on ${expiry.date}, ${expiry.time} SGT\\.`))).toBeVisible();
  // The exact expiry of the fixture hold (SC-SPM134-01: the app's Singapore format; September is "Sept", en-GB).
  const expiredAt = sgt(expiredExpiresIso);
  await expect(bell.getByText(`Your tentative hold of ${expiredVenue} for "${eventName}" expired on ${expiredAt.date}, ${expiredAt.time} SGT.`)).toBeVisible();

  const reminderRow = bell.getByRole("listitem").filter({ hasText: reminderVenue });
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
test("HOLD-EXP-NOTIF-06-INT-2 the Coordinator is told when Venue Staff release the hold and opens it", async ({ page, pageAs, db }) => {
  const { eventName, releaseVenue, releaseHoldId } = await db.preset("holdExpiry");
  // Venue Staff release the hold through the real route, in their own session.
  const staffPage = await pageAs("venue_staff");
  const released = await staffPage.request.post(`${apiBase}/api/venues/bookings/${releaseHoldId}/release-hold`);
  expect(released.status()).toBe(201);

  await page.goto("/");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  const bell = page.getByRole("dialog", { name: "Notifications" });
  await expect(bell.getByText(`Your tentative hold of ${releaseVenue} for "${eventName}" has been released.`)).toBeVisible();
  await bell.getByRole("listitem").filter({ hasText: releaseVenue }).getByRole("link", { name: "View Booking" }).click();

  await expect(page).toHaveURL(new RegExp(`/bookings\\?booking=${releaseHoldId}`));
  const dialog = page.getByRole("dialog", { name: /Booking details/ });
  await expect(dialog).toContainText("released");
  await expect(dialog).toContainText("Hold expiry");
});

/*
 * E2E-13 availability half (SPM-133 AC2/AC3/AC6, SPM-56 AC4/AC5, SPM-51 AC3/AC7/AC10, SPM-159). The notification half is above.
 *
 * Time: the browser clock helper (frontend/e2e/clock.ts) cannot move the server, so no test here claims "T-1 minute succeeds" or
 * "T+1 minute is refused" at a controlled instant. Expiry is seeded relative to real now (47 hours ahead, one minute ago, 10 days
 * ahead) and the backend's own 1-second processor does the expiring. The "request before expiry succeeds" half is covered
 * by a non-boundary substitute: converting the 10-day hold, far from its expiry. SPM-190 Q8 (resolved): an active hold blocks outright.
 * The venue calendar is asserted through the API the calendar reads (GET /api/venues/:id reservations); the on-screen calendar
 * and the "Expired tentative hold" label are not asserted here.
 */
interface CoordinatorBooking {
  id: string; venueId: string; venueName: string; status: string; requestKind: string; holdExpiresAt?: string; holdExpired: boolean;
}
interface VenueSchedule { reservations: Array<{ id: string; eventName: string; start: string; end: string; status: "booked" | "tentative"; holdExpiresAt?: string }> }

async function coordinatorBookings(page: Page): Promise<CoordinatorBooking[]> {
  const response = await page.request.get(`${apiBase}/api/venues/bookings/mine`);
  expect(response.status()).toBe(200);
  return (await response.json()) as CoordinatorBooking[];
}

async function venueSchedule(page: Page, venueId: string): Promise<VenueSchedule> {
  const response = await page.request.get(`${apiBase}/api/venues/${venueId}`);
  expect(response.status()).toBe(200);
  return (await response.json()) as VenueSchedule;
}

/** Waits (bounded, as an assertion) for the backend's processor to store the one-minute-old hold as expired; returns coordinator1's rows. */
async function awaitExpiredHold(page: Page, expiredVenue: string): Promise<{ rows: CoordinatorBooking[]; expired: CoordinatorBooking }> {
  await expect
    .poll(async () => (await coordinatorBookings(page)).find((b) => b.venueName === expiredVenue)?.status, { timeout: 30_000 })
    .toBe("expired");
  const rows = await coordinatorBookings(page);
  return { rows, expired: rows.find((b) => b.venueName === expiredVenue)! };
}

const COORDINATOR2 = "coordinator2@connectsphere.test";

/** E2E-13 step 1 (SPM-133 AC3, AC6): the scheduler stores only the lapsed hold as expired; the others stay approved. */
test("E2E-13 @P0 the scheduler stores only the lapsed hold as expired and it is not a confirmed booking", async ({ page, db }) => {
  const { reminderVenue, expiredVenue, releaseVenue, reminderExpiresIso } = await db.preset("holdExpiry");
  // The seed relies on the lead: the 47-hour hold is inside the reminder window only while the lead is 48 hours or more.
  expect((new Date(reminderExpiresIso).getTime() - Date.now()) / 3_600_000).toBeLessThan(REMINDER_LEAD_HOURS);

  const { rows, expired } = await awaitExpiredHold(page, expiredVenue);
  expect(expired.requestKind).toBe("tentative_hold");
  expect(expired.holdExpired).toBe(true);
  // Reminder and release holds are untouched: still approved, not expired.
  for (const venue of [reminderVenue, releaseVenue]) {
    const row = rows.find((b) => b.venueName === venue)!;
    expect(row.status).toBe("approved");
    expect(row.holdExpired).toBe(false);
  }
});

/** E2E-13 step 8 (SPM-51 AC3, AC10, SPM-133 AC2): the expired hold's slot frees up for Venue Staff and Coordinator 2; the live hold still shows. */
test("E2E-13 @P0 the venue frees at expiry while the other hold still shows as tentative", async ({ page, pageAs, db }) => {
  const { expiredVenue, reminderVenue, reminderExpiresIso } = await db.preset("holdExpiry");
  const { rows } = await awaitExpiredHold(page, expiredVenue);
  const expiredVenueId = rows.find((b) => b.venueName === expiredVenue)!.venueId;
  const reminderVenueId = rows.find((b) => b.venueName === reminderVenue)!.venueId;

  for (const who of ["venue_staff", "coordinator2"] as const) {
    const viewer = await pageAs(who);
    expect((await venueSchedule(viewer, expiredVenueId)).reservations, `${who} sees the expired hold's slot as free`).toEqual([]);
    const live = (await venueSchedule(viewer, reminderVenueId)).reservations;
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ status: "tentative", holdExpiresAt: reminderExpiresIso });
  }
});

/** E2E-13 step 9 (SPM-48 AC8, SPM-133 AC3): the event's list shows the expired hold as expired and the others as active; none is confirmed. */
test("E2E-13 the event stops counting the expired hold as a venue and keeps the active ones", async ({ page, db }) => {
  const { expiredVenue, reminderVenue, releaseVenue } = await db.preset("holdExpiry");
  const { rows } = await awaitExpiredHold(page, expiredVenue);
  const byVenue = new Map(rows.map((b) => [b.venueName, b]));
  expect(byVenue.get(expiredVenue)).toMatchObject({ status: "expired", holdExpired: true });
  expect(byVenue.get(reminderVenue)).toMatchObject({ status: "approved", holdExpired: false });
  expect(byVenue.get(releaseVenue)).toMatchObject({ status: "approved", holdExpired: false });
  // Only the two active holds remain as approved rows for the event; the expired one is not counted as confirmed.
  expect(rows.filter((b) => b.status === "approved")).toHaveLength(2);
  // Note 3 of E2E-13: no AC says the event "no longer has a venue"; nothing stronger than the expired/active split is asserted.
});

/**
 * E2E-13 step 10 (SPM-133 AC2, SPM-56 AC5, SPM-55 AC2): another Coordinator's ordinary request for the expired hold's slot is
 * accepted as pending and Venue Staff approve it; the old hold row stays expired.
 */
test("E2E-13 @P0 another Coordinator can request and obtain the expired hold's venue", async ({ page, pageAs, db }) => {
  const { expiredVenue } = await db.preset("holdExpiry");
  // Option names were proposed in E2E-13 pre-condition 6; the builder takes a full email for coordinatorEmail.
  const rival = await db.event({ name: "E13 EC2 event", status: "Approved", coordinatorEmail: COORDINATOR2, startInDays: 40, durationHours: 2 });
  const { expired } = await awaitExpiredHold(page, expiredVenue);

  const coordinator2 = await pageAs("coordinator2");
  const requested = await coordinator2.request.post(`${apiBase}/api/venues/${expired.venueId}/booking-requests`, {
    data: { eventId: rival.id, start: rival.startAt, end: rival.endAt },
  });
  expect(requested.status()).toBe(201);
  const created = (await requested.json()) as { id: string; status: string };
  expect(created.status).toBe("pending");

  const staff = await pageAs("venue_staff");
  const approved = await staff.request.post(`${apiBase}/api/venues/bookings/${created.id}/approve`);
  expect(approved.status()).toBe(201);

  // The old hold row remains expired and unchanged; the venue now carries the new booking as a confirmed reservation.
  const after = (await coordinatorBookings(page)).find((b) => b.id === expired.id)!;
  expect(after).toMatchObject({ status: "expired", holdExpiresAt: expired.holdExpiresAt });
  const schedule = await venueSchedule(staff, expired.venueId);
  expect(schedule.reservations).toHaveLength(1);
  expect(schedule.reservations[0]).toMatchObject({ id: created.id, eventName: "E13 EC2 event", status: "booked" });
});

/** E2E-13 step 11 (SPM-56 AC4, SPM-51 AC7; SPM-190 Q8 resolved: blocks outright): the same request at the active hold's venue is refused. */
test("E2E-13 @P0 the same request at the venue with an active hold is refused", async ({ page, pageAs, db }) => {
  const { expiredVenue, reminderVenue } = await db.preset("holdExpiry");
  const rival = await db.event({ name: "E13 EC2 event", status: "Approved", coordinatorEmail: COORDINATOR2, startInDays: 40, durationHours: 2 });
  const { rows } = await awaitExpiredHold(page, expiredVenue);
  const reminderVenueId = rows.find((b) => b.venueName === reminderVenue)!.venueId;

  const coordinator2 = await pageAs("coordinator2");
  const refused = await coordinator2.request.post(`${apiBase}/api/venues/${reminderVenueId}/booking-requests`, {
    data: { eventId: rival.id, start: rival.startAt, end: rival.endAt },
  });
  // The refusal code is not stated in any AC (E2E-13 note 4): assert a 4xx that names a conflict, and no new row.
  expect(refused.status()).toBe(409);
  expect(await refused.text()).toMatch(/unavailable|conflict/i);
  expect((await venueSchedule(coordinator2, reminderVenueId)).reservations).toHaveLength(1);
});

/**
 * E2E-13 step 12 (SPM-132 AC9): non-boundary substitute for "an action just before expiry succeeds". The server clock cannot be
 * moved, so Venue Staff convert the hold that expires in 10 days instead; this does NOT prove the T-1 minute boundary.
 */
test("E2E-13 Venue Staff can convert the hold that is far from expiry (not a T-1 minute boundary check)", async ({ page, pageAs, db }) => {
  const { expiredVenue, releaseVenue, releaseHoldId } = await db.preset("holdExpiry");
  const { rows } = await awaitExpiredHold(page, expiredVenue);
  const releaseVenueId = rows.find((b) => b.venueName === releaseVenue)!.venueId;

  const staff = await pageAs("venue_staff");
  const converted = await staff.request.post(`${apiBase}/api/venues/bookings/${releaseHoldId}/convert-hold`);
  expect(converted.status()).toBe(201);

  const reservation = (await venueSchedule(staff, releaseVenueId)).reservations.find((r) => r.id === releaseHoldId)!;
  expect(reservation.status).toBe("booked");
  expect(reservation.holdExpiresAt).toBeUndefined();
  // The expired hold is still not convertible one minute past its expiry (seeded offset, not a controlled instant).
  const expiredId = rows.find((b) => b.venueName === expiredVenue)!.id;
  const refused = await staff.request.post(`${apiBase}/api/venues/bookings/${expiredId}/convert-hold`);
  expect(refused.status()).toBe(409);
});
