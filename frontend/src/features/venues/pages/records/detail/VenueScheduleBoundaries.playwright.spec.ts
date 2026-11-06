import { request as playwrightRequest, type APIResponse, type Page } from "@playwright/test";
import { expect, test, type BuiltScene, type TestDatabase } from "../../../../../../e2e/fixtures";
import { isoDateFromNow } from "../../../../../../e2e/dates";

/*
 * E2E-09 (docs/test-cases/e2e/E2E-09.md): setup and turnaround boundaries, SPM-50/56/51/54/55/52. Venue V has 30 minutes
 * of setup and 45 of turnaround; Event A at 10:00-12:00 occupies 09:30-12:45, and a second event is placed against that
 * window in the plan's six positions. Every expected value below is worked out by hand from the case's Test Data table
 * (never from the conflict query): effective window = event start - 30 min to event end + 45 min.
 *
 * The browser clock is not frozen: the "fixed clock times" are event times on the fixed day D, built as absolute
 * Asia/Singapore instants. The event builder has no start/end option, only startInDays/durationHours counted from the
 * builder's own Date.now(), so `placeEvent` converts a wall time into those two numbers. The builder's Date.now() is a
 * fraction of a second later than ours, so each event lands up to a second after its stated time and later events
 * land at least as late as earlier ones; none of this can move a result across a minute boundary.
 */
test.use({ timezoneId: "Asia/Singapore", as: "coordinator" });

/** SPM-168 question 1, resolved 2026-11-06: half-open intervals, so a booking whose setup starts exactly when the previous turnaround ends is allowed. */
const BACK_TO_BACK_ALLOWED = true;

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";
const D = isoDateFromNow(30);
const SETUP_MINUTES = 30;
const TURNAROUND_MINUTES = 45;
const hourMs = 3_600_000;
const dayMs = 24 * hourMs;

/** Singapore wall time `hhmm` on day D as an absolute instant. */
const at = (hhmm: string) => new Date(`${D}T${hhmm}:00+08:00`);

/** The builder options that put an event at D `start` to D `end` (see the header note). */
function placeEvent(name: string, start: string, end: string, status: "Approved" | "Planning" = "Approved") {
  return {
    name,
    status,
    startInDays: (at(start).getTime() - Date.now()) / dayMs,
    durationHours: (at(end).getTime() - at(start).getTime()) / hourMs,
  };
}

/** Case Test Data rows: event start to end, with the effective window the case derives by hand. */
const ROWS = {
  A: { name: "E09 Row1", start: "13:15", end: "14:15", effective: "12:45 to 15:00", conflict: !BACK_TO_BACK_ALLOWED },
  B: { name: "E09 Row2", start: "13:14", end: "14:14", effective: "12:44 to 15:14", conflict: true },
  C: { name: "E09 Row3", start: "08:30", end: "09:00", effective: "08:00 to 09:45", conflict: true },
  D: { name: "E09 Row4", start: "13:00", end: "14:00", effective: "12:30 to 14:45", conflict: true },
  E: { name: "E09 Row5", start: "10:30", end: "11:30", effective: "10:00 to 12:15", conflict: true },
  F: { name: "E09 Row6", start: "10:00", end: "12:00", effective: "09:30 to 12:45 at V2", conflict: false },
} as const;
type Row = keyof typeof ROWS;

/**
 * Builds V, V2, A, P and the six row events. With `aBooked`, A already holds an approved booking at V (the builder
 * books V for A's own window); without it, A and P are plain Approved events the journey submits itself.
 */
async function seed(db: TestDatabase, aBooked: boolean): Promise<BuiltScene> {
  return db.scene({
    venues: {
      v: { name: "E09 Hall V", capacity: 100, setupMinutes: SETUP_MINUTES, turnaroundMinutes: TURNAROUND_MINUTES },
      v2: { name: "E09 Hall V2", capacity: 100, setupMinutes: SETUP_MINUTES, turnaroundMinutes: TURNAROUND_MINUTES },
    },
    events: {
      // Key order matters: later events land at the same instant or later (see the header note).
      a: { ...placeEvent("E09 A", "10:00", "12:00", aBooked ? "Planning" : "Approved"), ...(aBooked ? { venue: "v" } : {}) },
      p: placeEvent("E09 P pending-first", "13:14", "14:14"),
      r1: placeEvent(ROWS.A.name, ROWS.A.start, ROWS.A.end),
      r2: placeEvent(ROWS.B.name, ROWS.B.start, ROWS.B.end),
      r3: placeEvent(ROWS.C.name, ROWS.C.start, ROWS.C.end),
      r4: placeEvent(ROWS.D.name, ROWS.D.start, ROWS.D.end),
      r5: placeEvent(ROWS.E.name, ROWS.E.start, ROWS.E.end),
      r6: placeEvent(ROWS.F.name, ROWS.F.start, ROWS.F.end),
    },
  });
}

const rowEvent = (scene: BuiltScene, row: Row) => scene.events[{ A: "r1", B: "r2", C: "r3", D: "r4", E: "r5", F: "r6" }[row]];

/** Exactly the 4xx family: a refusal by the product's own rules, not a crash or an open door. */
function expectRefused(response: APIResponse) {
  expect(response.status()).toBeGreaterThanOrEqual(400);
  expect(response.status()).toBeLessThan(500);
}

/** The calls the venue page makes, sent directly. */
const requestBody = (event: { id: string; startAt: string; endAt: string }) => ({
  eventId: event.id, start: event.startAt, end: event.endAt,
});

async function submitByApi(page: Page, venueId: string, event: { id: string; startAt: string; endAt: string }) {
  return page.request.post(`${apiBase}/api/venues/${venueId}/booking-requests`, { data: requestBody(event) });
}

/**
 * The same create call with no session at all; [S3] pins only that it is refused as unauthenticated (401). The empty
 * storageState is deliberate: under `test.use({ as })` a bare newContext() inherits the signed-in coordinator's cookies,
 * so the call would not be anonymous and would reach the conflict check (409) instead of being refused (401).
 */
async function unauthenticatedPost(path: string, data: unknown) {
  const anonymous = await playwrightRequest.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    return await anonymous.post(`${apiBase}${path}`, { data });
  } finally {
    await anonymous.dispose();
  }
}

interface MyBooking { id: string; eventId: string; venueId: string; status: string; bookingReference: string }
const myBookings = async (page: Page) => (await (await page.request.get(`${apiBase}/api/venues/bookings/mine`)).json()) as MyBooking[];
const bookingFor = async (page: Page, eventId: string) => (await myBookings(page)).filter((b) => b.eventId === eventId);
const eventStatus = async (page: Page, eventId: string) =>
  ((await (await page.request.get(`${apiBase}/api/events/${eventId}`)).json()) as { status: string }).status.toLowerCase();
const notificationsOf = async (page: Page) =>
  ((await (await page.request.get(`${apiBase}/api/notifications`)).json()) as Array<{ message: string }>).map((n) => n.message);

/** Opens the venue page for `event` as the Coordinator would, from the event's booking journey. */
async function openVenueFor(page: Page, venueId: string, venueName: string, eventId: string) {
  await page.goto(`/venue-records/${venueId}?eventId=${eventId}`);
  await expect(page.getByRole("heading", { name: venueName })).toBeVisible();
}

/** Venue Staff review the request in the Bookings page and submit their decision. */
async function reviewInBookings(staffPage: Page, eventName: string, decision: "approve") {
  await staffPage.goto("/bookings");
  const card = staffPage.locator("div").filter({ has: staffPage.getByRole("heading", { name: eventName, level: 3 }) })
    .filter({ has: staffPage.getByRole("button", { name: /Review Details|View Details/ }) }).last();
  await card.getByRole("button", { name: "Review Details" }).click();
  const dialog = staffPage.getByRole("dialog");
  await expect(dialog).toBeVisible();
  if (decision === "approve") await dialog.getByLabel(/Approve/).check();
  await dialog.getByRole("button", { name: "Submit Decision" }).click();
}

/**
 * One conflicting row, end to end on the submission path (E2E-09 steps 4-8): the UI offers no submit and says why, the
 * direct API call and the unauthenticated call are refused, and nothing was stored.
 */
async function expectRowRefused(row: Exclude<Row, "A" | "F">, { page, db }: { page: Page; db: TestDatabase }) {
  const scene = await seed(db, true);
  const event = rowEvent(scene, row);
  const venue = scene.venues.v;

  await openVenueFor(page, venue.id, venue.name, event.id);
  const alert = page.getByRole("alert").filter({ hasText: "This time is unavailable" });
  await expect(alert).toBeVisible();
  // SPM-56 AC6: the alert names the blocker and the interval the product prints, which is the blocker's own booking
  // window (A: 10:00 to 12:00). Which rows conflict is still decided by the occupied window 09:30-12:45 (see ROWS).
  await expect(alert).toContainText("E09 A");
  await expect(alert).toContainText("10:00");
  await expect(alert).toContainText("12:00");
  // The control must be absent or disabled, not merely followed by a toast.
  const submit = page.getByRole("button", { name: "Submit booking request" });
  await expect(submit).toHaveCount(0);

  expectRefused(await submitByApi(page, venue.id, event));
  expect((await unauthenticatedPost(`/api/venues/${venue.id}/booking-requests`, requestBody(event))).status()).toBe(401);

  expect(await bookingFor(page, event.id), `no booking row for ${ROWS[row].name} (effective ${ROWS[row].effective})`).toHaveLength(0);
  expect(await eventStatus(page, event.id)).toBe("approved");
  // A's approved booking at V is untouched.
  expect((await bookingFor(page, scene.events.a.id)).map((b) => b.status)).toEqual(["approved"]);
}

test.describe("E2E-09 setup and turnaround boundaries", () => {
  test("E2E-09 calendar shows A's effective window 09:30-12:45 with setup and turnaround distinguishable", async ({ page: staff, db }) => {
    const scene = await seed(db, true);
    const venue = scene.venues.v;
    // Seen as the assigned Coordinator (the default login): with the eventId the calendar opens on the week of D, which
    // it does only for the event's own Coordinator (anyone else lands on the current week, 30 days earlier).
    await staff.goto(`/venue-records/${venue.id}?eventId=${rowEvent(scene, "F").id}`);
    await expect(staff.getByRole("heading", { name: venue.name })).toBeVisible();
    const schedule = staff.getByRole("region", { name: "Venue schedule calendar" });
    // SPM-51 AC2, AC8: the setup part and the turnaround part are separate entries from the event, which still shows.
    await expect(schedule.locator(".venue-schedule-booking").first()).toBeVisible();
    const setup = schedule.getByText("Setup buffer", { exact: true }).first();
    // exact: the legend above the grid reads "Setup and turnaround buffer", which a loose match would find first.
    const turnaround = schedule.getByText("Turnaround buffer", { exact: true }).first();
    await expect(setup).toBeVisible();
    await expect(turnaround).toBeVisible();

    // The entry's detail dialog carries the buffer length and the exact span: setup 09:30-10:00, turnaround 12:00-12:45.
    await setup.click();
    const setupDialog = staff.getByRole("dialog");
    await expect(setupDialog).toContainText("E09 A");
    await expect(setupDialog).toContainText("30 minutes before");
    await expect(setupDialog).toContainText("09:30");
    await expect(setupDialog).toContainText("10:00");
    await staff.keyboard.press("Escape");
    await expect(setupDialog).toHaveCount(0);

    await turnaround.click();
    const turnaroundDialog = staff.getByRole("dialog");
    await expect(turnaroundDialog).toContainText("E09 A");
    await expect(turnaroundDialog).toContainText("45 minutes after");
    await expect(turnaroundDialog).toContainText("12:00");
    await expect(turnaroundDialog).toContainText("12:45");
  });

  // FIXME (product vs case assumption [S2], not an edit-the-test problem): the case assumes pending requests do not block
  // one another at submission, so P (13:14, inside A's turnaround) is accepted as Pending next to the still-Pending A and
  // is only refused at approval. The product refuses P at submission: venues.repository.ts submitBookingRequest counts
  // event-linked PENDING requests as blockers (SPM-54 AC2) and answers 409 "conflicts with E09 A". The approval-time
  // recheck is therefore unreachable through the product without a controlled fixture that inserts a pending booking
  // (backend/scripts/testing/browser-fixtures.mjs has none; this task may not add one). Re-enable once either [S2] is
  // settled against SPM-54 AC2 or such a fixture exists. Until then the E2E-09 journey below pins the refusal that does
  // happen at submission.
  test.fixme("E2E-09 approval-time recheck keeps P pending behind A, by UI, by API and unauthenticated @P0", async ({ page, db, pageAs }) => {
    const scene = await seed(db, false);
    const venue = scene.venues.v;
    const { a, p } = scene.events;

    // Step 1: both requests are accepted because neither conflicts with an approved booking yet ([S2]).
    const aResponse = await submitByApi(page, venue.id, a);
    const pResponse = await submitByApi(page, venue.id, p);
    expect(aResponse.status()).toBe(201);
    expect(pResponse.status()).toBe(201);
    const aBookingId = ((await aResponse.json()) as { id: string }).id;
    const pBookingId = ((await pResponse.json()) as { id: string }).id;
    expect(await eventStatus(page, a.id)).toBe("planning");
    expect(await eventStatus(page, p.id)).toBe("planning");

    const staff = await pageAs("venue_staff");
    const approveA = await staff.request.post(`${apiBase}/api/venues/bookings/${aBookingId}/approve`);
    expect(approveA.status()).toBe(201);

    // Step 2: staff try to approve P through the Bookings page; the conflict alert names A and the booking times the product prints.
    await reviewInBookings(staff, p.name, "approve");
    const alert = staff.getByRole("alert").filter({ hasText: /conflicts with/ });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("E09 A");
    await expect(alert).toContainText("10:00");
    await expect(alert).toContainText("12:00");
    const pendingAfter = (await (await staff.request.get(`${apiBase}/api/venues/bookings/pending`)).json()) as Array<{ id: string; status: string }>;
    expect(pendingAfter.find((b) => b.id === pBookingId)?.status).toBe("pending");
    // No decision notification about P (SPM-137 AC7).
    expect((await notificationsOf(page)).filter((m) => m.includes(p.name))).toHaveLength(0);

    // Step 3: the same refusal by direct API, and unauthenticated.
    expectRefused(await staff.request.post(`${apiBase}/api/venues/bookings/${pBookingId}/approve`));
    expect((await unauthenticatedPost(`/api/venues/bookings/${pBookingId}/approve`, {})).status()).toBe(401);
    const stillPending = (await (await staff.request.get(`${apiBase}/api/venues/bookings/pending`)).json()) as Array<{ id: string; status: string }>;
    expect(stillPending.find((b) => b.id === pBookingId)?.status).toBe("pending");
  });

  // Row B: the one-minute-inside case (effective 12:44 against A's 12:45).
  test("E2E-09-B effective window starting 12:44 conflicts with A's turnaround @P0", async ({ page, db }) => {
    await expectRowRefused("B", { page, db });
  });

  test("E2E-09-C a window overlapping only A's setup conflicts", async ({ page, db }) => {
    await expectRowRefused("C", { page, db });
  });

  test("E2E-09-D a window overlapping only A's turnaround conflicts", async ({ page, db }) => {
    await expectRowRefused("D", { page, db });
  });

  test("E2E-09-E a window entirely inside A conflicts", async ({ page, db }) => {
    await expectRowRefused("E", { page, db });
  });

  test("E2E-09-F the same times at a different venue do not conflict", async ({ page, db }) => {
    const scene = await seed(db, true);
    const event = rowEvent(scene, "F");
    const v2 = scene.venues.v2;
    await openVenueFor(page, v2.id, v2.name, event.id);
    await expect(page.getByRole("status").filter({ hasText: "This time is available for this venue." })).toBeVisible();
    await page.getByRole("button", { name: "Submit booking request" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Booking request submitted\. Reference: / })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "is now in Planning" })).toBeVisible();

    const rows = await bookingFor(page, event.id);
    expect(rows.map((b) => [b.venueId, b.status])).toEqual([[v2.id, "pending"]]);
    expect(await eventStatus(page, event.id)).toBe("planning");
    expect((await bookingFor(page, scene.events.a.id)).map((b) => [b.venueId, b.status])).toEqual([[scene.venues.v.id, "approved"]]);
  });

  test("E2E-09-A effective window starting exactly 12:45 is allowed back-to-back and then approved", async ({ page, db, pageAs }) => {
    // SPM-168 question 1: the case follows BACK_TO_BACK_ALLOWED; if that constant flips, only this test changes.
    expect(BACK_TO_BACK_ALLOWED).toBe(true);
    const scene = await seed(db, true);
    const event = rowEvent(scene, "A");
    const venue = scene.venues.v;

    // Submitted by API, not through the venue page: that page truncates the event's start to the minute in its form, while
    // the seeded A lands up to a second after 10:00 (see the header note), so on the page Row1's 12:45:00.000 window start
    // sits a fraction of a second before A's 12:45:00.xxx turnaround end and it reports a conflict that real
    // minute-aligned events cannot produce. The product's own submit check works on the stored instants and is the rule
    // under test here.
    const submitted = await submitByApi(page, venue.id, event);
    expect(submitted.status()).toBe(201);
    expect((await bookingFor(page, event.id)).map((b) => b.status)).toEqual(["pending"]);

    const staff = await pageAs("venue_staff");
    await reviewInBookings(staff, event.name, "approve");
    await expect.poll(async () => (await bookingFor(page, event.id)).map((b) => b.status)).toEqual(["approved"]);
    // Two approved rows at V now exist, A and Row1, with no conflict raised between them.
    const atV = (await myBookings(page)).filter((b) => b.venueId === venue.id && b.status === "approved");
    expect(atV).toHaveLength(2);
  });

  test("E2E-09 journey: three approvals notify coordinator1, nothing for P or the refused events", async ({ page, db, pageAs }) => {
    const scene = await seed(db, false);
    const v = scene.venues.v;
    const v2 = scene.venues.v2;
    const staff = await pageAs("venue_staff");
    const approve = async (bookingId: string) => {
      const response = await staff.request.post(`${apiBase}/api/venues/bookings/${bookingId}/approve`);
      return response;
    };
    const idOf = async (response: APIResponse) => ((await response.json()) as { id: string }).id;

    const aId = await idOf(await submitByApi(page, v.id, scene.events.a));
    // The product refuses P at submission while A is still pending (see the fixme above), so P never gets a booking row.
    expect((await submitByApi(page, v.id, scene.events.p)).status()).toBe(409);
    expect((await approve(aId)).status()).toBe(201);
    expectRefused(await submitByApi(page, v.id, scene.events.p));

    for (const row of ["B", "C", "D", "E"] as const) expectRefused(await submitByApi(page, v.id, rowEvent(scene, row)));
    const row6 = await submitByApi(page, v2.id, rowEvent(scene, "F"));
    const row1 = await submitByApi(page, v.id, rowEvent(scene, "A"));
    expect(row6.status()).toBe(201);
    expect(row1.status()).toBe(201);
    expect((await approve(await idOf(row6))).status()).toBe(201);
    expect((await approve(await idOf(row1))).status()).toBe(201);

    // Database-visible end state, through the product's own reads.
    const rows = await myBookings(page);
    const statusOf = (eventId: string) => rows.filter((b) => b.eventId === eventId).map((b) => b.status);
    const refusedRows: Row[] = ["B", "C", "D", "E"];
    expect(statusOf(scene.events.a.id)).toEqual(["approved"]);
    expect(statusOf(rowEvent(scene, "A").id)).toEqual(["approved"]);
    expect(statusOf(rowEvent(scene, "F").id)).toEqual(["approved"]);
    expect(statusOf(scene.events.p.id)).toEqual([]);
    for (const row of refusedRows) expect(statusOf(rowEvent(scene, row).id)).toEqual([]);

    // Step 12: exactly three decision notifications, worded per SPM-137 AC1/AC2.
    const messages = await notificationsOf(page);
    const approvals = [
      `Your booking of ${v.name} for "E09 A" has been approved.`,
      `Your booking of ${v2.name} for "${ROWS.F.name}" has been approved.`,
      `Your booking of ${v.name} for "${ROWS.A.name}" has been approved.`,
    ];
    expect(messages.filter((m) => /has been approved\./.test(m)).sort()).toEqual([...approvals].sort());
    expect(messages.filter((m) => m.includes("E09 P pending-first"))).toHaveLength(0);
    for (const row of refusedRows) expect(messages.filter((m) => m.includes(ROWS[row].name))).toHaveLength(0);

    // No one else is told: coordinator2, organiser1 and the Lead have no decision notifications.
    for (const other of ["coordinator2", "organiser1", "lead"] as const) {
      const otherPage = await pageAs(other);
      expect((await notificationsOf(otherPage)).filter((m) => /has been approved\./.test(m))).toHaveLength(0);
    }
  });
});
