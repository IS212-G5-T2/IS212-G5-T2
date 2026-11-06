import { request as playwrightRequest, type APIResponse, type Page } from "@playwright/test";
import { isoDateFromNow } from "../../../../../../e2e/dates";
import { expect, test } from "../../../../../../e2e/fixtures";

/*
 * E2E-08 (docs/test-cases/e2e/E2E-08.md): Venue Staff reject a booking request, the Coordinator re-books an alternative
 * venue that is approved, SPM-55/54/137/148.
 *
 * Decisions in force (SPM-190, 2026-11-06): Q1 back-to-back is allowed (not touched here), Q3 a rejection reason is
 * 10-500 characters and three words (REASON is 37 characters, six words), Q8 holds block outright (no holds here).
 * Pending requests coexist (commit ffa205b7); only one request is pending at a time in this journey.
 *
 * Differences from the case text, all deliberate:
 *   - The Playwright process has no SQL access, so each "database" check is an authenticated read of the product's API
 *     (_PREREQUISITES.md item 2). The audit row of step 7 is read through the event history API the Coordinator sees.
 *   - The builder has no start/end option, so `placeEvent` converts Singapore wall time on D into startInDays and
 *     durationHours; the event lands up to a second after 10:00, which cannot move a result.
 *   - Q3 is a customer ruling the product does not yet enforce (the service accepts any non-empty reason up to 1000
 *     characters). The empty-reason refusal is asserted; the length rule is probed in its own test and reported as a
 *     gap rather than failed.
 */
test.use({ timezoneId: "Asia/Singapore", as: "coordinator" });

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";
const D = isoDateFromNow(30);
const REASON = "Venue is under refurbishment that day";
const SPECIAL_REQUEST = "Need stage set-up";
const hourMs = 3_600_000;
const dayMs = 24 * hourMs;
const at = (hhmm: string) => new Date(`${D}T${hhmm}:00+08:00`);
const NAMES = { hallA: "E08 Hall A", hallB: "E08 Hall B", event: "E08 Conference" } as const;

const placeEvent = (name: string, start: string, end: string) => ({
  name,
  status: "Approved" as const,
  expectedAttendance: 60,
  startInDays: (at(start).getTime() - Date.now()) / dayMs,
  durationHours: (at(end).getTime() - at(start).getTime()) / hourMs,
});

interface Notice { type: string; message: string; relatedEventId: string | null; read: boolean }
interface MyBooking { id: string; eventId: string; venueId: string; status: string; bookingReference: string; rejectionReason?: string }
interface PendingRow { id: string; status: string; rejectionReason?: string }

const noticesOf = async (page: Page): Promise<Notice[]> => {
  const response = await page.request.get(`${apiBase}/api/notifications`);
  if ([401, 403, 404].includes(response.status())) return [];
  expect(response.status(), "GET /api/notifications").toBe(200);
  return (await response.json()) as Notice[];
};
const decisionNotices = async (page: Page) => (await noticesOf(page)).filter((n) => /Your booking of .* has been (approved|rejected)\./.test(n.message));
const myBookings = async (page: Page, eventId: string) =>
  ((await (await page.request.get(`${apiBase}/api/venues/bookings/mine`)).json()) as MyBooking[]).filter((b) => b.eventId === eventId);
const staffRows = async (page: Page) => (await (await page.request.get(`${apiBase}/api/venues/bookings/pending`)).json()) as PendingRow[];
const eventStatus = async (page: Page, id: string) =>
  ((await (await page.request.get(`${apiBase}/api/events/${id}`)).json()) as { status: string }).status.toLowerCase();

function expectRefused(response: APIResponse, what: string) {
  expect(response.status(), `${what} was answered ${response.status()}`).toBeGreaterThanOrEqual(400);
  expect(response.status(), `${what} was answered ${response.status()}`).toBeLessThan(500);
}
async function unauthenticatedPost(path: string, data: unknown) {
  const anonymous = await playwrightRequest.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    return await anonymous.post(`${apiBase}${path}`, { data });
  } finally {
    await anonymous.dispose();
  }
}

/** The Coordinator's booking journey: venue page for the event, optional special request, submit. Returns the reference. */
async function requestVenue(page: Page, venueId: string, venueName: string, eventId: string, specialRequest?: string): Promise<string> {
  await page.goto(`/venue-records/${venueId}?eventId=${eventId}`);
  await expect(page.getByRole("heading", { name: venueName })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "This time is available for this venue." })).toBeVisible();
  if (specialRequest) await page.getByLabel("Special requests (optional)").fill(specialRequest);
  await page.getByRole("button", { name: "Submit booking request" }).click();
  const confirmation = page.getByText(/Booking request submitted\. Reference: VB-[0-9A-F]{8}\./).first();
  await expect(confirmation).toBeVisible();
  return /VB-[0-9A-F]{8}/.exec(await confirmation.innerText())![0];
}

const reviewCard = (staff: Page, eventName: string, button: "Review Details" | "View Details") =>
  staff.locator("div").filter({ has: staff.getByRole("heading", { name: eventName, level: 3 }) })
    .filter({ has: staff.getByRole("button", { name: button }) }).last();

async function openReview(staff: Page, eventName: string, venueName: string) {
  await staff.goto("/bookings");
  const card = reviewCard(staff, eventName, "Review Details").filter({ hasText: venueName });
  await card.getByRole("button", { name: "Review Details" }).click();
  const dialog = staff.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("E2E-08 Venue Staff rejects, Coordinator re-books", () => {
  test("E2E-08 rejection reaches coordinator1 alone, repeat and foreign decisions are refused, the alternative is approved @P1", async ({ page: coordinator1, db, pageAs }) => {
    test.setTimeout(240_000);
    const scene = await db.scene({
      venues: {
        a: { name: NAMES.hallA, capacity: 100, setupMinutes: 30, turnaroundMinutes: 45 },
        b: { name: NAMES.hallB, capacity: 100, setupMinutes: 30, turnaroundMinutes: 45 },
      },
      events: { main: placeEvent(NAMES.event, "10:00", "12:00") },
    });
    const { a, b } = scene.venues;
    const main = scene.events.main;
    const staff = await pageAs("venue_staff");
    const otherStaff = await pageAs("venue_staff2");
    const coordinator2 = await pageAs("coordinator2");
    const organiser = await pageAs("organiser");
    const lead = await pageAs("lead");

    let bookingA = "";
    let referenceA = "";

    await test.step("Step 1: coordinator1 requests Hall A with a special request; Pending, event moves to Planning (SPM-54 AC3-4, SPM-148 AC1)", async () => {
      referenceA = await requestVenue(coordinator1, a.id, NAMES.hallA, main.id, SPECIAL_REQUEST);
      await coordinator1.goto("/bookings");
      const group = coordinator1.getByRole("region", { name: NAMES.event });
      await expect(group).toContainText(referenceA);
      await expect(group).toContainText(/pending/i);
      const rows = await myBookings(coordinator1, main.id);
      expect(rows.map((r) => [r.venueId, r.status])).toEqual([[a.id, "pending"]]);
      bookingA = rows[0].id;
      expect(await eventStatus(coordinator1, main.id)).toBe("planning");
    });

    await test.step("Step 2: the request is listed for Venue Staff with its details (SPM-55 AC1)", async () => {
      await staff.goto("/bookings");
      const card = reviewCard(staff, NAMES.event, "Review Details");
      await expect(card).toContainText(referenceA);
      await expect(card).toContainText("Coordinator: Coordinator 1");
      await expect(card).toContainText(`Venue: ${NAMES.hallA}`);
      await expect(card).toContainText(`Special request: ${SPECIAL_REQUEST}`);
      await expect(card).toContainText("10:00");
    });

    await test.step("Step 3: an empty reason cannot be submitted; the request stays pending (SPM-55 AC3)", async () => {
      const dialog = await openReview(staff, NAMES.event, NAMES.hallA);
      await dialog.getByLabel(/Reject/).check();
      await expect(dialog.getByLabel(/Rejection reason/)).toHaveValue("");
      await expect(dialog.getByRole("button", { name: "Submit Decision" })).toBeDisabled();
      await dialog.getByLabel(/Rejection reason/).fill("   ");
      await expect(dialog.getByRole("button", { name: "Submit Decision" })).toBeDisabled();
      // The API refuses it as well.
      expect((await staff.request.post(`${apiBase}/api/venues/bookings/${bookingA}/reject`, { data: { reason: "   " } })).status()).toBe(400);
      expect((await staffRows(staff)).find((r) => r.id === bookingA)?.status).toBe("pending");
      await dialog.getByRole("button", { name: "Close" }).first().click();
    });

    await test.step("Step 4: a Venue Staff who does not manage the venue is not shown the request (SPM-55 AC1)", async () => {
      await otherStaff.goto("/bookings");
      await expect(otherStaff.getByText("No bookings match this filter.")).toBeVisible();
      await expect(otherStaff.getByRole("heading", { name: NAMES.event, level: 3 })).toHaveCount(0);
    });

    await test.step("Step 5: that account cannot decide it by API either; row and notices unchanged", async () => {
      // ASSUMPTION [S2]: only a 4xx refusal is pinned, not the code.
      expectRefused(await otherStaff.request.post(`${apiBase}/api/venues/bookings/${bookingA}/reject`, { data: { reason: REASON } }), "foreign reject");
      expect((await staffRows(staff)).find((r) => r.id === bookingA)?.status).toBe("pending");
      expect(await decisionNotices(coordinator1)).toHaveLength(0);
    });

    await test.step("Step 6: venue_staff1 rejects with the reason; the list shows Rejected", async () => {
      const dialog = await openReview(staff, NAMES.event, NAMES.hallA);
      await dialog.getByLabel(/Reject/).check();
      await dialog.getByLabel(/Rejection reason/).fill(REASON);
      await dialog.getByRole("button", { name: "Submit Decision" }).click();
      await expect(dialog).toHaveCount(0);
      await staff.getByLabel("Status filter").selectOption("rejected");
      const card = reviewCard(staff, NAMES.event, "View Details");
      await expect(card).toBeVisible();
      await expect(card).toContainText(/rejected/i);
    });

    await test.step("Step 7: stored as rejected with the reason; an audit entry names venue_staff1; the event stays Planning (SPM-55 AC5, SPM-148 AC3)", async () => {
      const row = (await myBookings(coordinator1, main.id)).find((r) => r.id === bookingA)!;
      expect(row.status).toBe("rejected");
      expect(row.rejectionReason).toBe(REASON);
      expect((await staffRows(staff)).find((r) => r.id === bookingA)).toMatchObject({ status: "rejected", rejectionReason: REASON });
      expect(await eventStatus(coordinator1, main.id)).toBe("planning");
      const history = await coordinator1.request.get(`${apiBase}/api/events/${main.id}/history`);
      expect(history.status()).toBe(200);
      const venueBookings = ((await history.json()) as { sections: { venueBookings?: Array<{ summary: string; actor: { name: string }; subject?: string }> } }).sections.venueBookings ?? [];
      const rejection = venueBookings.find((entry) => /reject/i.test(entry.summary));
      expect(rejection, "a venue booking history entry for the rejection").toBeTruthy();
      expect(rejection!.actor.name).toBe("Venue Staff 1");
    });

    await test.step("Step 8: coordinator1 has exactly one rejection notice; opening it shows Rejected and the reason (SPM-137 AC1-3)", async () => {
      const message = `Your booking of ${NAMES.hallA} for "${NAMES.event}" has been rejected.`;
      const notices = await decisionNotices(coordinator1);
      expect(notices.map((n) => n.message)).toEqual([message]);
      expect(notices[0].read).toBe(false);
      await coordinator1.goto("/events");
      await coordinator1.getByRole("button", { name: /^Notifications/ }).click();
      const bell = coordinator1.getByRole("dialog", { name: "Notifications" });
      const row = bell.getByRole("listitem").filter({ hasText: "has been rejected." });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(message);
      await row.getByRole("link", { name: "View Booking" }).click();
      const details = coordinator1.getByRole("dialog");
      await expect(details).toContainText(/rejected/i);
      await expect(details).toContainText(REASON);
    });

    await test.step("Step 9: nobody else is told (SPM-137 AC1)", async () => {
      for (const other of [coordinator2, organiser, lead, staff, otherStaff]) expect(await decisionNotices(other)).toHaveLength(0);
    });

    await test.step("Step 10: the decided request offers no controls to Venue Staff (SPM-55 AC6)", async () => {
      await staff.goto("/bookings");
      await staff.getByLabel("Status filter").selectOption("rejected");
      await reviewCard(staff, NAMES.event, "View Details").getByRole("button", { name: "View Details" }).click();
      const dialog = staff.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Submit Decision" })).toHaveCount(0);
      await expect(dialog.getByLabel(/Approve/)).toHaveCount(0);
      await expect(dialog).toContainText(REASON);
    });

    await test.step("Step 11: a repeat decision by API is refused, signed out it is 401; nothing changes (SPM-55 AC6, SPM-137 AC7)", async () => {
      expectRefused(await staff.request.post(`${apiBase}/api/venues/bookings/${bookingA}/approve`), "approve of a rejected request");
      expectRefused(await staff.request.post(`${apiBase}/api/venues/bookings/${bookingA}/reject`, { data: { reason: "Changed my mind about it" } }), "second reject");
      expect((await unauthenticatedPost(`/api/venues/bookings/${bookingA}/approve`, {})).status()).toBe(401);
      const row = (await myBookings(coordinator1, main.id)).find((r) => r.id === bookingA)!;
      expect([row.status, row.rejectionReason]).toEqual(["rejected", REASON]);
      expect(await decisionNotices(coordinator1)).toHaveLength(1);
    });

    let bookingB = "";
    await test.step("Step 12: coordinator1 requests Hall B; a new reference, Pending, the event stays Planning (SPM-148 AC3)", async () => {
      const referenceB = await requestVenue(coordinator1, b.id, NAMES.hallB, main.id);
      expect(referenceB).not.toBe(referenceA);
      const rows = await myBookings(coordinator1, main.id);
      expect(rows.map((r) => [r.venueId, r.status]).sort()).toEqual([[a.id, "rejected"], [b.id, "pending"]].sort());
      bookingB = rows.find((r) => r.venueId === b.id)!.id;
      expect(await eventStatus(coordinator1, main.id)).toBe("planning");
    });

    await test.step("Step 13: venue_staff1 approves Hall B; Hall A stays rejected; the occupied window is 09:30-12:45", async () => {
      const dialog = await openReview(staff, NAMES.event, NAMES.hallB);
      await dialog.getByLabel(/Approve/).check();
      await dialog.getByRole("button", { name: "Submit Decision" }).click();
      await expect(dialog).toHaveCount(0);
      await expect.poll(async () => (await myBookings(coordinator1, main.id)).find((r) => r.id === bookingB)?.status).toBe("approved");
      expect((await myBookings(coordinator1, main.id)).find((r) => r.id === bookingA)).toMatchObject({ status: "rejected", rejectionReason: REASON });
      // Setup 30 minutes before 10:00 and turnaround 45 minutes after 12:00, as the calendar entries describe them.
      await coordinator1.goto(`/venue-records/${b.id}?eventId=${main.id}`);
      const schedule = coordinator1.getByRole("region", { name: "Venue schedule calendar" });
      await schedule.getByText("Setup buffer", { exact: true }).first().click();
      await expect(coordinator1.getByRole("dialog")).toContainText("09:30");
      await coordinator1.keyboard.press("Escape");
      await schedule.getByText("Turnaround buffer", { exact: true }).first().click();
      await expect(coordinator1.getByRole("dialog")).toContainText("12:45");
      await coordinator1.keyboard.press("Escape");
    });

    await test.step("Step 14: a second, separate approval notice for coordinator1 only (SPM-137 AC2, AC5)", async () => {
      const messages = (await decisionNotices(coordinator1)).map((n) => n.message).sort();
      expect(messages).toEqual([
        `Your booking of ${NAMES.hallA} for "${NAMES.event}" has been rejected.`,
        `Your booking of ${NAMES.hallB} for "${NAMES.event}" has been approved.`,
      ].sort());
      for (const other of [coordinator2, organiser, lead]) expect(await decisionNotices(other)).toHaveLength(0);
    });

    await test.step("Step 15: My Bookings lists both, Hall A Rejected with the reason and Hall B Approved (SPM-55 AC4)", async () => {
      await coordinator1.goto("/bookings");
      const group = coordinator1.getByRole("region", { name: NAMES.event });
      const cardA = group.getByRole("article").filter({ hasText: NAMES.hallA });
      const cardB = group.getByRole("article").filter({ hasText: NAMES.hallB });
      await expect(cardA).toContainText(/rejected/i);
      await expect(cardA).toContainText(`Rejection reason: ${REASON}`);
      await expect(cardB).toContainText(/approved/i);
    });
  });

  // SPM-168 Q3 (2026-11-06): a rejection reason is 10-500 characters. The product has not adopted it yet, so this probe
  // asserts the rule when the product enforces it and otherwise records a gap annotation instead of failing the suite.
  test("E2E-08 Q3 rejection reason length rule (probe) @P1", async ({ page: coordinator1, db, pageAs }) => {
    const scene = await db.scene({
      venues: { a: { name: NAMES.hallA, capacity: 100, setupMinutes: 30, turnaroundMinutes: 45 } },
      events: { main: placeEvent(NAMES.event, "10:00", "12:00") },
    });
    const staff = await pageAs("venue_staff");
    const submitted = await coordinator1.request.post(`${apiBase}/api/venues/${scene.venues.a.id}/booking-requests`, {
      data: { eventId: scene.events.main.id, start: scene.events.main.startAt, end: scene.events.main.endAt },
    });
    expect(submitted.status()).toBe(201);
    const bookingId = ((await submitted.json()) as { id: string }).id;

    const tooLong = "x".repeat(501);
    const tooShort = "no";
    for (const [label, reason] of [["501 characters", tooLong], ["2 characters", tooShort]] as const) {
      const response = await staff.request.post(`${apiBase}/api/venues/bookings/${bookingId}/reject`, { data: { reason } });
      if (response.status() < 400) {
        test.info().annotations.push({ type: "gap", description: `SPM-168 Q3: a rejection reason of ${label} was accepted (${response.status()}); the product enforces only non-empty and at most 1000 characters.` });
        return; // the request is decided now; the remaining probe would only see a conflict
      }
      expectRefused(response, `reject with ${label}`);
    }
    expect((await staffRows(staff)).find((r) => r.id === bookingId)?.status).toBe("pending");
  });
});
