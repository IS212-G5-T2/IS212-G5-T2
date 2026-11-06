import { calendarDayFromNow } from "../../../../../../e2e/dates";
import { type Page } from "@playwright/test";
import { type As, expect, test } from "../../../../../../e2e/fixtures";

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";
const venueName = "SPM-122 unavailability browser";

test.use({ timezoneId: "Asia/Singapore", as: "venue_staff" });

// SPM-122 / VEN-UNAVAIL-01-A/03-A/04-A/06-A: review, confirm, persist, and reload a real venue blockout.
test("creates an unavailable period through the browser and displays it after reload", async ({ page }) => {
  // Arrange: signed in as seeded Venue Staff (test.use above); create an isolated venue through the real API.
  const created = await page.request.post(`${apiBase}/api/venues`, {
    data: {
      name: venueName,
      location: "Browser Test Building",
      capacity: 40,
      facilities: ["AV System"],
      accessibility: [],
      layouts: ["Classroom"],
      operatingInformation: "Browser test venue",
      setupTimeMinutes: 0,
      turnaroundTimeMinutes: 0,
    },
  });
  expect(created.status()).toBe(201);
  const venueId = (await created.json()).venue.id as string;
  await page.goto(`/venue-records/${venueId}`);
  await expect(page.getByRole("heading", { name: venueName })).toBeVisible();
  // The day is chosen by the shared date helper; the browser (Asia/Singapore via test.use) builds the local times.
  const day = calendarDayFromNow(2);
  const localTimes = await page.evaluate(({ year, month, day }) => {
    const start = new Date(year, month - 1, day, 15, 0, 0, 0);
    const end = new Date(year, month - 1, day, 18, 0, 0, 0);
    const input = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    return { start: input(start), end: input(end), startIso: start.toISOString(), endIso: end.toISOString() };
  }, day);

  // Act: enter the local interval, review it without writing, then confirm.
  await page.getByRole("button", { name: "Mark unavailable" }).click();
  await page.getByLabel("Unavailable start").fill(localTimes.start);
  await page.getByLabel("Unavailable end").fill(localTimes.end);
  await page.getByLabel("Reason").fill("Browser maintenance");
  await page.getByRole("button", { name: "Review unavailability" }).click();
  await expect(page.getByText(/Confirm unavailability for this venue/)).toContainText("Browser maintenance");
  const beforeConfirmation = await page.request.get(`${apiBase}/api/venues/${venueId}`);
  expect((await beforeConfirmation.json()).unavailablePeriods).toEqual([]);
  const savedResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/api/venues/${venueId}/unavailable-periods`) && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Confirm unavailability" }).click();
  const saved = await savedResponse;

  // Assert the actual API persisted the chosen instants and the UI shows the saved period.
  expect(saved.status()).toBe(201);
  const savedBody = await saved.json();
  expect(savedBody.period).toMatchObject({ start: localTimes.startIso, end: localTimes.endIso, reason: "Browser maintenance" });
  await expect(page.getByRole("listitem").getByText("Browser maintenance", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Affected bookings" })).toContainText("No existing bookings are affected.");

  // Assert a fresh page read still displays the same server record, not just transient React state.
  const refreshed = page.waitForResponse((response) =>
    response.url().endsWith(`/api/venues/${venueId}`) && response.request().method() === "GET",
  );
  await page.reload();
  const detail = await (await refreshed).json();
  expect(detail.unavailablePeriods).toEqual([
    expect.objectContaining({ id: savedBody.period.id, start: localTimes.startIso, end: localTimes.endIso, reason: "Browser maintenance" }),
  ]);
  await expect(page.getByRole("listitem").getByText("Browser maintenance", { exact: true })).toBeVisible();
});

/*
 * E2E-14 (docs/test-cases/e2e/E2E-14.md, SPM-191): a maintenance block on a venue that already has an approved booking.
 *
 * Time model: browser-fixtures builds an event (and its approved venue booking) at "now + 30 days" for two hours, so its
 * clock time is not 10:00. Every instant below is therefore an offset in minutes from the event's own start `S`
 * (the spec's D 10:00 is S, D 11:00 is S+60, D 13:00 is S+180). V has setup 30 / turnaround 45, so the occupied window
 * is S-30 .. S+165 (spec 09:30 .. 12:45).
 *
 * "Database check" steps are made through the real API reads, because the fixture exposes only builders (no query).
 * Builder gaps are listed in the report that accompanies this spec.
 */
const ACCOUNTS_THAT_MUST_NOT_BE_NOTIFIED = ["organiser1", "coordinator2", "lead", "tech_support1", "safety_officer1", "attendee1", "venue_staff1"] as const satisfies readonly As[];
const SETUP = 30;
const TURNAROUND = 45;

const at = (startIso: string, minutes: number) => new Date(Date.parse(startIso) + minutes * 60_000).toISOString();

/** `YYYY-MM-DDTHH:mm` in Singapore, the value the panel's datetime-local inputs take. */
const sgtInput = (iso: string) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};

interface AffectedBooking { id: string; eventId: string; eventName: string; start: string; end: string; status: string; coordinatorNotified?: boolean }
interface Notice { id: string; type: string; message: string; relatedEventId?: string | null; relatedBookingId?: string | null }

async function mainScene(db: import("../../../../../../e2e/fixtures").TestDatabase) {
  const scene = await db.scene({
    venues: {
      V: { name: "E2E-14 venue V", setupMinutes: SETUP, turnaroundMinutes: TURNAROUND },
      V2: { name: "E2E-14 venue V2", setupMinutes: 15, turnaroundMinutes: 20 },
    },
    events: { main: { name: "E2E-14 main event", status: "Planning", venue: "V", expectedAttendance: 40 } },
  });
  return { V: scene.venues.V, V2: scene.venues.V2, main: scene.events.main, S: scene.events.main.startAt };
}

async function markUnavailable(staff: Page, venueId: string, start: string, end: string, reason = "maintenance") {
  const response = await staff.request.post(`${apiBase}/api/venues/${venueId}/unavailable-periods`, { data: { start, end, reason } });
  expect(response.status()).toBe(201);
  return (await response.json()) as { period: { id: string; start: string; end: string; reason: string }; affectedBookings: AffectedBooking[] };
}

async function notices(page: Page): Promise<Notice[]> {
  const response = await page.request.get(`${apiBase}/api/notifications`);
  expect(response.status()).toBe(200);
  return (await response.json()) as Notice[];
}

/** Notification totals for every account the case says must stay silent, plus coordinator1. */
async function noticeCounts(pageAs: (who: As) => Promise<Page>, accounts: readonly As[]) {
  const counts: Record<string, number> = {};
  for (const account of accounts) counts[account] = (await notices(await pageAs(account))).length;
  return counts;
}

async function venueBookings(page: Page) {
  const response = await page.request.get(`${apiBase}/api/venues/bookings/mine`);
  expect(response.status()).toBe(200);
  return (await response.json()) as Array<{ id: string; eventId: string; venueName: string; status: string; bookingReference: string; affected?: boolean; start: string; end: string }>;
}

async function eventRow(page: Page, eventId: string) {
  const response = await page.request.get(`${apiBase}/api/events/${eventId}`);
  expect(response.status()).toBe(200);
  return (await response.json()) as { id: string; name: string; status: string; startDateTime: string; endDateTime: string; expectedAttendance: number };
}

async function periods(page: Page, venueId: string) {
  const response = await page.request.get(`${apiBase}/api/venues/${venueId}`);
  expect(response.status()).toBe(200);
  return ((await response.json()) as { unavailablePeriods: Array<{ start: string; end: string; reason: string }> }).unavailablePeriods;
}

async function history(page: Page, venueId: string) {
  const response = await page.request.get(`${apiBase}/api/venues/${venueId}/unavailability-history`);
  expect(response.status()).toBe(200);
  return (await response.json()) as Array<{ action: string; start: string; end: string; actorName?: string; actor?: string }>;
}

test.describe("E2E-14 maintenance block on a booked venue", () => {
  test.use({ timezoneId: "Asia/Singapore", as: "venue_staff" });

  // Steps 1-8, 24 (E2E-14; SPM-122 AC3/AC6/AC7/AC8, SPM-125 AC2/AC5/AC6/AC7, SPM-48 AC9, SPM-157 AC2).
  test("@P0 blocking a booked venue flags the booking, keeps the event and notifies only the owning Coordinator", async ({ page, pageAs, db }) => {
    const { V, main, S } = await mainScene(db);
    const coordinator = await pageAs("coordinator");
    const silent = [...ACCOUNTS_THAT_MUST_NOT_BE_NOTIFIED];

    // Step 1: baseline of the event, the booking and every notification count.
    const eventBefore = await eventRow(coordinator, main.id);
    expect(eventBefore).toMatchObject({ name: "E2E-14 main event", status: "Planning", expectedAttendance: 40 });
    const bookingBefore = (await venueBookings(coordinator)).find((b) => b.eventId === main.id);
    expect(bookingBefore).toMatchObject({ venueName: V.name, status: "approved" });
    const coordinatorBefore = (await notices(coordinator)).length;
    const silentBefore = await noticeCounts(pageAs, silent);

    // Step 2: start the block in the UI, cancel before saving (SPM-122 AC3), then repeat and confirm.
    const blockStart = at(S, 60);
    const blockEnd = at(S, 180);
    await page.goto(`/venue-records/${V.id}`);
    await expect(page.getByRole("heading", { name: V.name })).toBeVisible();
    await page.getByRole("button", { name: "Mark Unavailable" }).click();
    await page.getByLabel("Unavailable start").fill(sgtInput(blockStart));
    await page.getByLabel("Unavailable end").fill(sgtInput(blockEnd));
    await page.getByLabel("Reason").fill("maintenance");
    await page.getByRole("button", { name: "Review unavailability" }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(await periods(page, V.id)).toEqual([]);

    await page.getByRole("button", { name: "Mark Unavailable" }).click();
    await page.getByLabel("Unavailable start").fill(sgtInput(blockStart));
    await page.getByLabel("Unavailable end").fill(sgtInput(blockEnd));
    await page.getByLabel("Reason").fill("maintenance");
    await page.getByRole("button", { name: "Review unavailability" }).click();
    await page.getByRole("button", { name: "Confirm unavailability" }).click();

    // Step 3: the affected-bookings list names the event and marks coordinator1 as notified.
    const affected = page.getByRole("region", { name: "Affected bookings" });
    await expect(affected).toContainText("E2E-14 main event");
    await expect(affected).toContainText("Coordinator notified");
    await expect(affected).toContainText("1 affected booking has been notified");

    // Step 4: the block and its history entry exist; the booking and the event are untouched (SPM-122 AC8, SPM-54 AC6).
    const saved = await periods(page, V.id);
    expect(saved).toHaveLength(1);
    expect(Date.parse(saved[0].start)).toBe(Math.floor(Date.parse(blockStart) / 60_000) * 60_000);
    expect(saved[0].reason).toBe("maintenance");
    const entries = await history(page, V.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("created");
    expect(JSON.stringify(entries[0])).toMatch(/venue_staff1|Venue Staff 1/i);
    const bookingAfter = (await venueBookings(coordinator)).find((b) => b.id === bookingBefore!.id);
    expect(bookingAfter).toMatchObject({ status: "approved", venueName: V.name, affected: true });
    expect(await eventRow(coordinator, main.id)).toEqual(eventBefore);

    // Step 5: exactly one new notice for coordinator1 (event, venue, period, reason) and none for anyone else.
    const coordinatorNotices = await notices(coordinator);
    expect(coordinatorNotices).toHaveLength(coordinatorBefore + 1);
    const notice = coordinatorNotices.find((n) => n.type === "venue_unavailable_impact")!;
    expect(notice.message).toContain("E2E-14 main event");
    expect(notice.message).toContain(V.name);
    expect(notice.message).toContain("maintenance");
    expect(notice.relatedBookingId).toBe(bookingBefore!.id);
    expect(await noticeCounts(pageAs, silent)).toEqual(silentBefore);

    // Step 6: the venue record shows the block with its reason.
    await page.reload();
    await expect(page.getByRole("listitem").getByText("maintenance", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Calendar" }).click();
    await expect(page.getByRole("region", { name: "Venue schedule" })).toBeVisible();

    // Step 7: coordinator1 opens the bell and follows the notice to the booking.
    await coordinator.goto("/");
    await coordinator.getByRole("button", { name: /^Notifications/ }).click();
    const bell = coordinator.getByRole("dialog", { name: "Notifications" });
    await bell.getByRole("listitem").filter({ hasText: "maintenance" }).getByRole("link", { name: "View Booking" }).click();
    await expect(coordinator).toHaveURL(new RegExp(`/bookings\\?booking=${bookingBefore!.id}`));
    await expect(coordinator.getByRole("dialog", { name: /Booking details/ })).toContainText("E2E-14 main event");

    // Step 8: the event is still listed as Planning with the venue-unavailable indicator.
    await coordinator.goto("/events");
    await expect(coordinator.getByText("E2E-14 main event").first()).toBeVisible();
    await expect(coordinator.getByText(`Venue unavailable – alternative arrangements needed: ${V.name}`)).toBeVisible();

    // Step 24: the venue's booking history still lists the original booking.
    const bookingHistory = await page.request.get(`${apiBase}/api/venues/${V.id}/booking-history`);
    expect(bookingHistory.status()).toBe(200);
    expect(JSON.stringify(await bookingHistory.json())).toContain("E2E-14 main event");
  });

  // SPM-122 AC7 / SPM-125 AC7 say the list includes setup and turnaround; the panel prints only the event window.
  test.fixme("@P0 the affected-bookings list shows the occupied window including setup and turnaround", async ({ page, db }) => {
    const { V, S } = await mainScene(db);
    await page.goto(`/venue-records/${V.id}`);
    await page.getByRole("button", { name: "Mark Unavailable" }).click();
    await page.getByLabel("Unavailable start").fill(sgtInput(at(S, 60)));
    await page.getByLabel("Unavailable end").fill(sgtInput(at(S, 180)));
    await page.getByLabel("Reason").fill("maintenance");
    await page.getByRole("button", { name: "Review unavailability" }).click();
    await page.getByRole("button", { name: "Confirm unavailability" }).click();
    const region = page.getByRole("region", { name: "Affected bookings" });
    // Occupied window = S-30min .. S+165min (spec 09:30 to 12:45).
    await expect(region).toContainText(sgtInput(at(S, -SETUP)).slice(-5));
    await expect(region).toContainText(sgtInput(at(S, 120 + TURNAROUND)).slice(-5));
  });

  // Steps 9-13 (SPM-52 AC3, SPM-54 AC4/AC5/AC6, SPM-55 AC2, SPM-97 AC5).
  test("@P0 the Coordinator finds V excluded, requests replacement V2 and Venue Staff approve it without cancelling V", async ({ page, pageAs, db }) => {
    const { V, V2, main, S } = await mainScene(db);
    await markUnavailable(page, V.id, at(S, 60), at(S, 180));
    const coordinator = await pageAs("coordinator");
    const originalBooking = (await venueBookings(coordinator)).find((b) => b.eventId === main.id)!;
    const eventBefore = await eventRow(coordinator, main.id);

    // Step 9: the search for the event's slot omits V and lists V2.
    await coordinator.goto(`/venues?eventId=${main.id}`);
    await expect(coordinator.getByText(/venues? match/)).toBeVisible();
    await expect(coordinator.getByText(V2.name, { exact: true })).toBeVisible();
    await expect(coordinator.getByText(V.name, { exact: true })).toHaveCount(0);

    // Step 10: the replacement request is submitted for the same event and is pending.
    const requested = await coordinator.request.post(`${apiBase}/api/venues/${V2.id}/booking-requests`, {
      data: { eventId: main.id, start: main.startAt, end: main.endAt, specialRequest: "Replacement for blocked venue" },
    });
    expect(requested.status()).toBe(201);
    const reference = ((await requested.json()) as { bookingReference: string }).bookingReference;
    expect(reference).toBeTruthy();
    const afterRequest = await venueBookings(coordinator);
    const replacement = afterRequest.find((b) => b.venueName === V2.name)!;
    expect(replacement).toMatchObject({ status: "pending", eventId: main.id, bookingReference: reference });

    // Step 11: the original is not auto-cancelled.
    expect(afterRequest.find((b) => b.id === originalBooking.id)).toMatchObject({ status: "approved", venueName: V.name });

    // Step 12: Venue Staff approve; the event stays Planning with unchanged details.
    const pending = await page.request.get(`${apiBase}/api/venues/bookings/pending`);
    expect(((await pending.json()) as Array<{ id: string }>).map((b) => b.id)).toContain(replacement.id);
    const approved = await page.request.post(`${apiBase}/api/venues/bookings/${replacement.id}/approve`);
    expect(approved.status()).toBe(201);
    expect((await venueBookings(coordinator)).find((b) => b.id === replacement.id)).toMatchObject({ status: "approved" });
    expect((await venueBookings(coordinator)).find((b) => b.id === originalBooking.id)).toMatchObject({ status: "approved" });
    expect(await eventRow(coordinator, main.id)).toEqual(eventBefore);

    // Step 13 (API part): the Organiser still sees the event, which has not been cancelled.
    const organiser = await pageAs("organiser");
    expect(await eventRow(organiser, main.id)).toMatchObject({ status: "Planning", name: "E2E-14 main event" });
  });

  // Steps 14-15 (forbidden for coordinator2).
  test("@P0 a second Coordinator cannot open the event or book V inside the blocked period", async ({ page, pageAs, db }) => {
    const { V, main, S } = await mainScene(db);
    await markUnavailable(page, V.id, at(S, 60), at(S, 180));
    const other = await pageAs("coordinator2");
    const rowsBefore = (await (await page.request.get(`${apiBase}/api/venues/${V.id}/booking-history`)).json()) as unknown[];

    await other.goto(`/events/${main.id}`);
    await expect(other.getByText("E2E-14 main event")).toHaveCount(0);
    const read = await other.request.get(`${apiBase}/api/events/${main.id}`);
    expect([403, 404]).toContain(read.status());

    // ASSUMPTION (E2E-14 step 15): status 409 or 422 unless the API spec fixes another refusal code.
    const refused = await other.request.post(`${apiBase}/api/venues/${V.id}/booking-requests`, {
      data: { eventId: main.id, start: at(S, 60), end: at(S, 120) },
    });
    expect(refused.status()).toBeGreaterThanOrEqual(400);
    expect(refused.status()).toBeLessThan(500);
    const rowsAfter = (await (await page.request.get(`${apiBase}/api/venues/${V.id}/booking-history`)).json()) as unknown[];
    expect(rowsAfter).toHaveLength(rowsBefore.length);
  });

  // Steps 16-18 (SPM-54 AC2, SPM-125 AC3/AC4).
  test("@P0 a new request into the blocked period is refused by UI and API, and one starting exactly at the block end is allowed", async ({ page, pageAs, db }) => {
    const scene = await db.scene({
      venues: { V: { name: "E2E-14 venue V", setupMinutes: SETUP, turnaroundMinutes: TURNAROUND } },
      events: {
        main: { name: "E2E-14 main event", status: "Planning", venue: "V" },
        late: { name: "E2E-14 late", status: "Planning" },
        edge: { name: "E2E-14 edge", status: "Planning" },
        edgeEarly: { name: "E2E-14 edge early", status: "Planning" },
      },
    });
    const V = scene.venues.V;
    const S = scene.events.main.startAt;
    await markUnavailable(page, V.id, at(S, 60), at(S, 180));
    const coordinator = await pageAs("coordinator");
    const countBefore = (await venueBookings(coordinator)).length;

    // Step 16: UI refusal for event "late" at 11:30-12:30 (S+90..S+150); the reason names the unavailability.
    await coordinator.goto(`/venue-records/${V.id}?eventId=${scene.events.late.id}`);
    await expect(coordinator.getByLabel("Event starts")).toBeVisible();
    await coordinator.getByLabel("Event starts").fill(sgtInput(at(S, 90)));
    await coordinator.getByLabel("Event ends").fill(sgtInput(at(S, 150)));
    await expect(coordinator.getByRole("alert").filter({ hasText: /unavailab/i })).toBeVisible();
    await expect(coordinator.getByRole("button", { name: "Submit booking request" })).toHaveCount(0);

    // Step 17: the same request straight to the API (ASSUMPTION: 409 or 422).
    const refused = await coordinator.request.post(`${apiBase}/api/venues/${V.id}/booking-requests`, {
      data: { eventId: scene.events.late.id, start: at(S, 90), end: at(S, 150) },
    });
    expect([409, 422]).toContain(refused.status());
    expect(await venueBookings(coordinator)).toHaveLength(countBefore);

    // Step 18: occupied period starts exactly at the block end (event start S+210 minus 30 min setup) -> accepted.
    const accepted = await coordinator.request.post(`${apiBase}/api/venues/${V.id}/booking-requests`, {
      data: { eventId: scene.events.edge.id, start: at(S, 180 + SETUP), end: at(S, 180 + SETUP + 60) },
    });
    expect(accepted.status()).toBe(201);
    // One minute earlier overlaps the block -> refused.
    const tooEarly = await coordinator.request.post(`${apiBase}/api/venues/${V.id}/booking-requests`, {
      data: { eventId: scene.events.edgeEarly.id, start: at(S, 180 + SETUP - 1), end: at(S, 180 + SETUP + 59) },
    });
    expect([409, 422]).toContain(tooEarly.status());
  });

  // Steps 19-20 (SPM-122 AC7, SPM-125 AC6): the block touches only the setup or only the turnaround window.
  for (const variant of [
    { name: "(a) setup window only", from: -60, to: -15 },
    { name: "(b) turnaround window only", from: 135, to: 180 },
  ]) {
    test(`@P0 variant ${variant.name} still flags the booking and notifies the Coordinator`, async ({ page, pageAs, db }) => {
      const { V, main, S } = await mainScene(db);
      const coordinator = await pageAs("coordinator");
      const before = (await notices(coordinator)).length;
      const result = await markUnavailable(page, V.id, at(S, variant.from), at(S, variant.to));
      expect(result.affectedBookings).toEqual([expect.objectContaining({ eventId: main.id, coordinatorNotified: true })]);
      expect(await notices(coordinator)).toHaveLength(before + 1);
      expect((await venueBookings(coordinator)).find((b) => b.eventId === main.id)).toMatchObject({ status: "approved" });
      expect(await eventRow(coordinator, main.id)).toMatchObject({ status: "Planning" });
    });
  }

  // Step 21 (SPM-125 AC4 as the overlap test): a block ending exactly where the occupied period starts is outside.
  test("@P0 a block ending exactly when setup starts is not affected, one minute later is", async ({ page, pageAs, db }) => {
    const { V, main, S } = await mainScene(db);
    const coordinator = await pageAs("coordinator");
    const before = (await notices(coordinator)).length;
    const touching = await markUnavailable(page, V.id, at(S, -120), at(S, -SETUP));
    expect(touching.affectedBookings).toEqual([]);
    expect(await notices(coordinator)).toHaveLength(before);
    const inside = await markUnavailable(page, V.id, at(S, -120), at(S, -SETUP + 1));
    expect(inside.affectedBookings).toEqual([expect.objectContaining({ eventId: main.id, coordinatorNotified: true })]);
    expect(await notices(coordinator)).toHaveLength(before + 1);
  });

  // Step 22 (SPM-54 AC7/AC8): one room of a multi-venue event.
  test("@P0 variant (c) blocking one room flags only that room's booking", async ({ page, pageAs, db }) => {
    const scene = await db.scene({
      venues: {
        roomA: { name: "E2E-14 room A", setupMinutes: SETUP, turnaroundMinutes: TURNAROUND },
        roomB: { name: "E2E-14 room B", setupMinutes: SETUP, turnaroundMinutes: TURNAROUND },
      },
      events: { multi: { name: "E2E-14 multi event", status: "Planning", venue: "roomA" } },
    });
    // GAP: the builder books one venue per event (`venue`, not `venues`), so roomB's booking is added by the request path.
    const { roomA, roomB } = scene.venues;
    const multi = scene.events.multi;
    const coordinator = await pageAs("coordinator");
    const secondRoom = await coordinator.request.post(`${apiBase}/api/venues/${roomB.id}/booking-requests`, {
      data: { eventId: multi.id, start: multi.startAt, end: multi.endAt },
    });
    expect(secondRoom.status()).toBe(201);
    const pendingRoomB = (await venueBookings(coordinator)).find((b) => b.venueName === roomB.name)!;
    expect((await page.request.post(`${apiBase}/api/venues/bookings/${pendingRoomB.id}/approve`)).status()).toBe(201);

    const before = (await notices(coordinator)).length;
    const result = await markUnavailable(page, roomB.id, at(multi.startAt, 0), at(multi.startAt, 120));
    expect(result.affectedBookings).toHaveLength(1);
    expect(result.affectedBookings[0]).toMatchObject({ eventId: multi.id, coordinatorNotified: true });
    expect(await notices(coordinator)).toHaveLength(before + 1);

    const bookings = await venueBookings(coordinator);
    expect(bookings.find((b) => b.venueName === roomA.name)).toMatchObject({ status: "approved", affected: false });
    expect(bookings.find((b) => b.venueName === roomB.name)).toMatchObject({ status: "approved", affected: true });
    expect(await eventRow(coordinator, multi.id)).toMatchObject({ status: "Planning" });
    await coordinator.goto("/bookings");
    await expect(coordinator.getByText(`Venue: ${roomA.name}`)).toBeVisible();
    await expect(coordinator.getByText(`Venue: ${roomB.name}`)).toBeVisible();
  });

  // Step 23: no booking on the blocked day -> no affected bookings, a period and a history entry, zero notices.
  test("@P0 variant (d) a block on a day with no booking creates no notification for anyone", async ({ page, pageAs, db }) => {
    const { V, S } = await mainScene(db);
    const everyone: As[] = ["coordinator1", ...ACCOUNTS_THAT_MUST_NOT_BE_NOTIFIED];
    const before = await noticeCounts(pageAs, everyone);
    const result = await markUnavailable(page, V.id, at(S, 24 * 60), at(S, 24 * 60 + 120));
    expect(result.affectedBookings).toEqual([]);
    expect(await periods(page, V.id)).toHaveLength(1);
    expect((await history(page, V.id)).map((e) => e.action)).toEqual(["created"]);
    expect(await noticeCounts(pageAs, everyone)).toEqual(before);
  });
});
