// SPM-192 E2E-15: main hall plus three breakout rooms for one event (docs/test-cases/e2e/E2E-15.md).
//
// Stories: SPM-54, SPM-55, SPM-56, SPM-85, SPM-129. Priority P1.
// Arrange deviation: the builder's `venue` takes one scene key, so every booking is requested through the API
// (`POST /api/venues/{id}/booking-requests`) as coordinator1 and decided as venue_staff1; the builder sets no bookings.
// Not asserted, by design of the case: (a) "the calendar links all rooms to one event" has no AC and no calendar surface
// in the product (E2E-15 Note 3), so it is covered only by the weaker check that every booking of the event carries the
// same eventId in My Bookings; (b) "the safety check sees every venue" is plan-derived (Note 1): the assumption is that
// the Safety Officer sees every approved venue and no cancelled or rejected one; (c) step 16 (flagged attendance change,
// Note 4) and the notification absence checks (Note 7) are left out until the story owner fixes the actor and screen.
// "One flagged" is the Breakout 3 request, which a competing approved event blocks (Note 2).
import { type APIRequestContext, type APIResponse, type Page } from "@playwright/test";
import { type As, type BuiltScene, type Scene, expect, test } from "../../../../../e2e/fixtures";

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";
const REASON = "Room taken by another event";
const SETUP = 30;
const TURNAROUND = 45;

const room = (capacity: number) => ({ capacity, setupMinutes: SETUP, turnaroundMinutes: TURNAROUND });

const SCENE: Scene = {
  venues: {
    hall: { name: "E2E-15 Main Hall", ...room(200) },
    b1: { name: "E2E-15 Breakout 1", ...room(40) },
    b2: { name: "E2E-15 Breakout 2", ...room(40) },
    b3: { name: "E2E-15 Breakout 3", ...room(40) },
  },
  events: {
    main: {
      name: "E2E-15 Conference", status: "Approved", expectedAttendance: 150, startInDays: 30, durationHours: 2,
      organiserEmail: "organiser1@connectsphere.test", coordinatorEmail: "coordinator1@connectsphere.test",
    },
    rival: {
      name: "E2E-15 Rival workshop", status: "Approved", expectedAttendance: 30, startInDays: 30, durationHours: 2,
      organiserEmail: "organiser2@connectsphere.test", coordinatorEmail: "coordinator2@connectsphere.test",
    },
  },
};

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- response bodies are asserted field by field
type Actor = (who: As) => Promise<APIRequestContext>;

function makeActors(pageAs: (who: As) => Promise<Page>) {
  const pages = new Map<As, Promise<Page>>();
  const page = (who: As) => {
    if (!pages.has(who)) pages.set(who, pageAs(who));
    return pages.get(who)!;
  };
  const api: Actor = async (who) => (await page(who)).request;
  return { page, api };
}

const url = (path: string) => `${apiBase}${path}`;

async function ok(response: APIResponse, expected?: number): Promise<Json> {
  const text = await response.text();
  if (expected !== undefined) expect(response.status(), text).toBe(expected);
  else expect(response.ok(), `${response.status()} ${text}`).toBe(true);
  return text ? JSON.parse(text) : {};
}

function slot(event: { startAt: string; endAt: string }) {
  return { start: event.startAt, end: event.endAt };
}

async function request(api: Actor, who: As, venueId: string, eventId: string, event: { startAt: string; endAt: string }) {
  return (await api(who)).post(url(`/api/venues/${venueId}/booking-requests`), { data: { eventId, ...slot(event) } });
}

/** The caller's My Bookings rows for one event (Coordinator only), newest first. */
async function myBookings(api: Actor, who: As, eventId: string): Promise<Json[]> {
  const rows: Json[] = await ok(await (await api(who)).get(url("/api/venues/bookings/mine")), 200);
  return rows.filter((row) => row.eventId === eventId);
}

const byVenue = (rows: Json[], venueId: string) => {
  const found = rows.filter((row) => row.venueId === venueId);
  expect(found, `one booking row for venue ${venueId}`).toHaveLength(1);
  return found[0];
};

async function eventStatus(api: Actor, who: As, eventId: string): Promise<string> {
  const body = await ok(await (await api(who)).get(url(`/api/events/${eventId}`)), 200);
  return String((body.event ?? body).status).toLowerCase();
}

test.describe("E2E-15 main hall plus three breakout rooms", () => {
  test.use({ as: "coordinator" });

  test("four venues are decided and released independently and the safety check sees the remaining ones @P1 @E2E-15", async ({
    page, db, pageAs,
  }) => {
    const scene: BuiltScene = await db.scene(SCENE);
    const { main, rival } = scene.events;
    const { hall, b1, b2, b3 } = scene.venues;
    const { page: pageOf, api } = makeActors(pageAs);
    const venueStaff = await api("venue_staff");

    // Step 1 (SPM-54 AC7/AC8): coordinator1 requests all four venues; four rows, each Pending with its own venue.
    expect(await eventStatus(api, "coordinator", main.id)).toBe("approved");
    const created: Record<string, Json> = {};
    for (const venue of [hall, b1, b2, b3]) created[venue.id] = await ok(await request(api, "coordinator", venue.id, main.id, main), 201);
    let rows = await myBookings(api, "coordinator", main.id);
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((row) => row.venueId)).size).toBe(4);
    expect(rows.map((row) => row.status)).toEqual(["pending", "pending", "pending", "pending"]);
    expect(new Set(rows.map((row) => row.bookingReference)).size).toBe(4);
    // The first request moved the event Approved -> Planning (SPM-148 AC1).
    expect(await eventStatus(api, "coordinator", main.id)).toBe("planning");

    // Step 2 (SPM-54 AC7): a duplicate active request for the Main Hall is refused and the row count stays at four.
    const duplicate = await request(api, "coordinator", hall.id, main.id, main);
    expect(duplicate.status()).toBe(409);
    expect((await duplicate.json()).code).toBe("ACTIVE_VENUE_REQUEST_EXISTS");
    expect(await myBookings(api, "coordinator", main.id)).toHaveLength(4);
    expect(await eventStatus(api, "coordinator", main.id)).toBe("planning");

    // Steps 3 and 4: coordinator2 requests Breakout 3 for the rival event and venue_staff1 approves it first.
    const rivalBooking = await ok(await request(api, "coordinator2", b3.id, rival.id, rival), 201);
    expect(rivalBooking.status).toBe("pending");
    await ok(await venueStaff.post(url(`/api/venues/bookings/${rivalBooking.id}/approve`)));
    expect(byVenue(await myBookings(api, "coordinator2", rival.id), b3.id).status).toBe("approved");

    // Step 5 (SPM-56 AC1/AC2/AC3): approving the main Breakout 3 request is refused with the occupied window
    // (start - 30 min to end + 45 min) and the request stays pending.
    const blocked = await venueStaff.post(url(`/api/venues/bookings/${created[b3.id].id}/approve`));
    expect(blocked.status()).toBe(409);
    const conflict = await blocked.json();
    expect(conflict.code).toBe("BOOKING_SLOT_CONFLICT");
    expect(conflict.message).toContain("E2E-15 Rival workshop");
    const windowStart = new Date(main.startAt).getTime() - SETUP * 60_000;
    const windowEnd = new Date(main.endAt).getTime() + TURNAROUND * 60_000;
    expect(conflict.conflicts).toHaveLength(1);
    expect(new Date(conflict.conflicts[0].occupiedStart).getTime()).toBe(windowStart);
    expect(new Date(conflict.conflicts[0].occupiedEnd).getTime()).toBe(windowEnd);
    rows = await myBookings(api, "coordinator", main.id);
    expect(byVenue(rows, b3.id).status).toBe("pending");

    // Step 6 (SPM-54 AC2): a fresh Breakout 3 request for the same event is refused and creates no row.
    const fresh = await request(api, "coordinator", b3.id, main.id, main);
    expect(fresh.status()).toBeGreaterThanOrEqual(400);
    expect(fresh.status()).toBeLessThan(500);
    expect(await myBookings(api, "coordinator", main.id)).toHaveLength(4);

    // Step 7 (SPM-55 AC2): venue_staff1 approves Main Hall, Breakout 1 and Breakout 2; Breakout 3 stays pending.
    for (const venue of [hall, b1, b2]) await ok(await venueStaff.post(url(`/api/venues/bookings/${created[venue.id].id}/approve`)));
    rows = await myBookings(api, "coordinator", main.id);
    expect([hall, b1, b2].map((venue) => byVenue(rows, venue.id).status)).toEqual(["approved", "approved", "approved"]);
    expect(byVenue(rows, b3.id).status).toBe("pending");

    // Step 8 (SPM-55 AC3): an empty reason is refused; the real reason rejects only Breakout 3.
    for (const reason of [undefined, "", "   "]) {
      const refused = await venueStaff.post(url(`/api/venues/bookings/${created[b3.id].id}/reject`), { data: reason === undefined ? {} : { reason } });
      expect(refused.status()).toBeGreaterThanOrEqual(400);
      expect(refused.status()).toBeLessThan(500);
    }
    expect(byVenue(await myBookings(api, "coordinator", main.id), b3.id).status).toBe("pending");
    await ok(await venueStaff.post(url(`/api/venues/bookings/${created[b3.id].id}/reject`), { data: { reason: REASON } }));

    // Step 9: My Bookings shows three approved and Breakout 3 rejected with its reason, in the API and on the page.
    rows = await myBookings(api, "coordinator", main.id);
    expect([hall, b1, b2].map((venue) => byVenue(rows, venue.id).status)).toEqual(["approved", "approved", "approved"]);
    expect(byVenue(rows, b3.id).status).toBe("rejected");
    expect(byVenue(rows, b3.id).rejectionReason).toBe(REASON);
    // "The calendar links all rooms to the event" has no AC or screen (Note 3): all four rows share one eventId.
    expect(new Set(rows.map((row) => row.eventId))).toEqual(new Set([main.id]));
    await page.goto("/bookings");
    for (const venue of [hall, b1, b2, b3]) await expect(page.getByText(venue.name).first()).toBeVisible();
    await expect(page.getByText(REASON).first()).toBeVisible();

    // Step 10 (SPM-54 AC11): coordinator1 sees uncapped confirmed capacity 200 + 40 + 40 = 280; organiser1 is capped at 150.
    await page.goto(`/events/${main.id}`);
    await expect(page.getByText("280 actual / 150 expected")).toBeVisible();
    const organiserPage = await pageOf("organiser");
    await organiserPage.goto(`/events/${main.id}`);
    await expect(organiserPage.getByText("150 / 150", { exact: true })).toBeVisible();

    // Step 11 (SPM-54 AC9/AC10): cancelling Breakout 2 changes only that row; two approved rooms remain, so no warning.
    const cancelled = await ok(await (await api("coordinator")).post(url(`/api/venues/bookings/${created[b2.id].id}/cancel`), { data: {} }), 201);
    expect(cancelled.status).toBe("cancelled");
    rows = await myBookings(api, "coordinator", main.id);
    expect(byVenue(rows, b2.id).status).toBe("cancelled");
    expect(byVenue(rows, hall.id).status).toBe("approved");
    expect(byVenue(rows, b1.id).status).toBe("approved");
    expect(byVenue(rows, b3.id).status).toBe("rejected");
    expect(await eventStatus(api, "coordinator", main.id)).toBe("planning");
    await page.reload();
    await expect(page.getByText("240 actual / 150 expected")).toBeVisible();

    // Step 12: the cancellation frees Breakout 2 at once; coordinator2 books it for the rival event.
    const freed = await ok(await request(api, "coordinator2", b2.id, rival.id, rival), 201);
    expect(freed.status).toBe("pending");

    // Steps 14 and 15 (SPM-129 AC2/AC3): the safety check is requested and the Safety Officer sees every APPROVED venue only.
    await ok(await (await api("coordinator")).post(url(`/api/events/${main.id}/confirm-no-equipment`)));
    await ok(await (await api("coordinator")).post(url(`/api/events/${main.id}/safety-check/request`)));
    const detail = await ok(await (await api("safety_officer")).get(url(`/api/safety-officer/queue/${main.id}`)), 200);
    expect(detail.expectedAttendance).toBe(150);
    const shown = (detail.venues as Json[]).map((venue) => `${venue.name}:${venue.capacity}`).sort();
    expect(shown).toEqual([`${hall.name}:200`, `${b1.name}:40`].sort());
    const officerPage = await pageOf("safety_officer");
    await officerPage.goto("/safety/events");
    await expect(officerPage.getByText("E2E-15 Conference").first()).toBeVisible();
  });

  // Step 13, run as its own test (Note 5): the last active booking needs a warning and an explicit confirmation.
  test("cancelling the last active venue booking needs explicit confirmation @P1 @E2E-15", async ({ db, pageAs }) => {
    const scene = await db.scene({
      venues: { hall: SCENE.venues!.hall, b1: SCENE.venues!.b1 },
      events: { solo: { ...SCENE.events!.main, name: "E2E-15 Last booking", status: "Planning", venue: "hall" } },
    });
    const { solo } = scene.events;
    const { hall, b1 } = scene.venues;
    const { api } = makeActors(pageAs);
    const venueStaff = await api("venue_staff");
    const coordinator = await api("coordinator");

    // The builder books the hall; the second venue goes through the product (builder gap).
    const second = await ok(await request(api, "coordinator", b1.id, solo.id, solo), 201);
    await ok(await venueStaff.post(url(`/api/venues/bookings/${second.id}/approve`)));
    let rows = await myBookings(api, "coordinator", solo.id);
    expect(rows.map((row) => row.status).sort()).toEqual(["approved", "approved"]);

    // Cancelling Breakout 1 leaves one active booking, so it needs no warning.
    await ok(await coordinator.post(url(`/api/venues/bookings/${byVenue(rows, b1.id).id}/cancel`), { data: {} }), 201);
    rows = await myBookings(api, "coordinator", solo.id);
    const last = byVenue(rows, hall.id);

    // Cancelling the last one without confirmation is refused with the warning; declining changes nothing.
    const warned = await coordinator.post(url(`/api/venues/bookings/${last.id}/cancel`), { data: {} });
    expect(warned.status()).toBe(409);
    const body = await warned.json();
    expect(body.code).toBe("LAST_ACTIVE_VENUE_BOOKING");
    expect(body.requiresConfirmation).toBe(true);
    rows = await myBookings(api, "coordinator", solo.id);
    expect(byVenue(rows, hall.id).status).toBe("approved");
    expect(byVenue(rows, b1.id).status).toBe("cancelled");

    // Confirming cancels it.
    await ok(await coordinator.post(url(`/api/venues/bookings/${last.id}/cancel`), { data: { confirmed: true } }), 201);
    expect(byVenue(await myBookings(api, "coordinator", solo.id), hall.id).status).toBe("cancelled");
  });
});
