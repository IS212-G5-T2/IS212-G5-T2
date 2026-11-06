// SPM-191 E2E-28: cancel a confirmed multi-venue event (docs/test-cases/e2e/E2E-28.md).
//
// Stories: SPM-136, SPM-155, SPM-162, SPM-171, SPM-138, SPM-58, SPM-54, SPM-65, SPM-157.
// SPM-190 Q5 (resolved 2026-11-06): the Organiser requests cancellation, the assigned Coordinator decides or cancels
// directly, and the Lead cannot cancel. The Lead is therefore one of the refused actors in the first test.
// Assumption S2 (E2E-28 Note 2): no story defines a notice for Venue Staff or Technical Support, so this spec asserts
// the ABSENCE of a cancellation notice for them. If the customer confirms the plan, those two assertions flip.
//
// Arrange deviation from the case: the case builds the gala as Confirmed and then adds the second venue and the
// equipment through the product, but the product refuses both on a Confirmed event (booking requests answer
// EVENT_NOT_OPEN_FOR_BOOKING and equipment requests answer 409). The gala is therefore built as Planning (with its
// Main Hall booking and two registrations from the builder), the Breakout Room, the Projectors and the safety check
// go through the product, and the event is then confirmed through the product, so it reaches the case's baseline.
import { type APIRequestContext, type APIResponse, type Page } from "@playwright/test";
import { type As, type BuiltScene, type Scene, expect, test } from "../../../../../e2e/fixtures";

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";
const REASON = "Sponsor withdrew from the event";

const SCENE: Scene = {
  venues: {
    main: { name: "E2E-28 Main Hall", capacity: 200, setupMinutes: 30, turnaroundMinutes: 45 },
    breakout: { name: "E2E-28 Breakout Room", capacity: 40, setupMinutes: 15, turnaroundMinutes: 20 },
    hall2: { name: "E2E-28 Hall 2", capacity: 100 },
  },
  equipment: { projector: { name: "E2E-28 Projector", quantity: 5, type: "Visual" } },
  events: {
    gala: {
      name: "E2E-28 Gala", status: "Planning", venue: "main", expectedAttendance: 2, capacity: 2, startInDays: 30, durationHours: 2,
      organiserEmail: "organiser1@connectsphere.test", coordinatorEmail: "coordinator1@connectsphere.test",
    },
    direct: { name: "E2E-28 Direct", status: "Confirmed", venue: "hall2", expectedAttendance: 10, startInDays: 40, durationHours: 2 },
    other: {
      name: "E2E-28 Other event", status: "Approved", expectedAttendance: 20, startInDays: 30, durationHours: 2,
      organiserEmail: "organiser2@connectsphere.test", coordinatorEmail: "coordinator2@connectsphere.test",
    },
  },
  registrations: [
    { event: "gala", attendee: "attendee1@connectsphere.test" },
    { event: "gala", attendee: "attendee2@connectsphere.test" },
  ],
};

type Actor = (who: As) => Promise<APIRequestContext>;
type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- response bodies are asserted field by field

/** One signed-in context per account for the whole test; `pageAs` opens a fresh browser context on every call. */
function makeActors(pageAs: (who: As) => Promise<Page>) {
  const pages = new Map<As, Promise<Page>>();
  const page = (who: As) => {
    if (!pages.has(who)) pages.set(who, pageAs(who));
    return pages.get(who)!;
  };
  const api: Actor = async (who) => (await page(who)).request;
  return { page, api };
}

async function ok(response: APIResponse, expected?: number): Promise<Json> {
  const text = await response.text();
  if (expected !== undefined) expect(response.status(), text).toBe(expected);
  else expect(response.ok(), `${response.status()} ${text}`).toBe(true);
  return text ? JSON.parse(text) : {};
}

const url = (path: string) => `${apiBase}${path}`;

/** The case's Arrange block (steps 1 to 3), through the product, ending at the Confirmed baseline. */
async function arrangeGala(scene: BuiltScene, api: Actor) {
  const { gala } = scene.events;
  const coordinator = await api("coordinator");
  const venueStaff = await api("venue_staff");
  const techSupport = await api("tech_support");

  // 1. Second venue booking: Coordinator 1 requests the Breakout Room, Venue Staff 1 approves.
  const booking = await ok(
    await coordinator.post(url(`/api/venues/${scene.venues.breakout.id}/booking-requests`), {
      data: { eventId: gala.id, start: gala.startAt, end: gala.endAt },
    }),
    201,
  );
  await ok(await venueStaff.post(url(`/api/venues/bookings/${booking.id}/approve`)));

  // 2. Equipment: Coordinator 1 requests 3 Projectors, Technical Support 1 reserves them.
  const equipmentRequest = await ok(
    await coordinator.post(url("/api/equipment/requests"), {
      data: { eventId: gala.id, items: [{ equipmentName: scene.equipment.projector.name, equipmentType: "Visual", quantity: 3 }] },
    }),
    201,
  );
  await ok(await techSupport.patch(url(`/api/equipment/requests/${equipmentRequest.id}/reserve`)), 200);

  // Confirm the event through the product: safety check requested, approved, then the status change.
  await ok(await coordinator.post(url(`/api/events/${gala.id}/safety-check/request`)));
  await ok(await (await api("safety_officer")).post(url(`/api/safety-officer/queue/${gala.id}/decision`), { data: { decision: "approved" } }));
  await ok(await coordinator.post(url(`/api/events/${gala.id}/status-change`), { data: { targetStatus: "Confirmed" } }), 200);

  // 3. Attendee 3 joins the waiting list of the full event.
  await ok(await (await api("attendee3")).post(url(`/api/events/${gala.id}/waitlist`), { data: {} }));
}

async function eventStatus(request: APIRequestContext, eventId: string): Promise<string> {
  const body = await ok(await request.get(url(`/api/events/${eventId}`)), 200);
  return String((body.event ?? body).status).toLowerCase();
}

/** Booking-history rows of one venue for one event, read as the venue's owner. */
async function bookingStatuses(api: Actor, venueId: string, eventId: string): Promise<string[]> {
  const rows: Json[] = await ok(await (await api("venue_staff")).get(url(`/api/venues/${venueId}/booking-history`)), 200);
  return rows.filter((row) => row.eventId === eventId).map((row) => row.status as string).sort();
}

/** The Projector pool for the gala's slot, read as Technical Support. */
async function projectorPool(api: Actor, scene: BuiltScene) {
  const { gala } = scene.events;
  const query = `startDateTime=${encodeURIComponent(gala.startAt)}&endDateTime=${encodeURIComponent(gala.endAt)}&equipmentType=Visual`;
  const rows: Json[] = await ok(await (await api("tech_support")).get(url(`/api/equipment/availability?${query}`)), 200);
  const row = rows.find((item) => item.name === scene.equipment.projector.name);
  expect(row, "the Projector pool is listed").toBeTruthy();
  return { total: row.activeQuantity as number, reserved: row.reservedQuantity as number, available: row.availableQuantity as number };
}

const ATTENDEES = ["attendee", "attendee2", "attendee3"] as const;

async function registrationStatusesFor(api: Actor, eventId: string): Promise<string[]> {
  const statuses: string[] = [];
  for (const who of ATTENDEES) {
    const body = await ok(await (await api(who)).get(url(`/api/events/${eventId}/registrations/me`)), 200);
    statuses.push(String(body.registration?.status).toLowerCase());
  }
  return statuses;
}

/** Every notification of the account that mentions the event, by id when the API carries one, else by message. */
async function notices(api: Actor, who: As, eventId: string): Promise<Json[]> {
  const response = await (await api(who)).get(url("/api/notifications"));
  // GET /api/notifications is closed (403) to Venue Staff, Technical Support and Safety Officer: they have no notification
  // feed at all, which for these checks means "no notices".
  if (response.status() === 403) return [];
  const rows: Json[] = await ok(response, 200);
  return rows.filter((row) => row.relatedEventId === eventId);
}

const cancelNotices = async (api: Actor, who: As, eventId: string) =>
  (await notices(api, who, eventId)).filter((row) => /cancel/i.test(`${row.type} ${row.message}`));

const WATCHED: As[] = [
  "organiser", "organiser2", "coordinator", "coordinator2", "lead", "venue_staff", "tech_support", "safety_officer",
  "attendee", "attendee2", "attendee3",
];

/** Stored state that a refusal or a decline must leave untouched (E2E-28 steps 4, 6, 9). */
async function snapshot(api: Actor, scene: BuiltScene) {
  const { gala } = scene.events;
  const notificationCounts: Record<string, number> = {};
  for (const who of WATCHED) notificationCounts[who] = (await notices(api, who, gala.id)).length;
  return {
    status: await eventStatus(await api("coordinator"), gala.id),
    main: await bookingStatuses(api, scene.venues.main.id, gala.id),
    breakout: await bookingStatuses(api, scene.venues.breakout.id, gala.id),
    pool: await projectorPool(api, scene),
    registrations: await registrationStatusesFor(api, gala.id),
    notificationCounts,
  };
}

const withoutNotices = ({ notificationCounts, ...rest }: Awaited<ReturnType<typeof snapshot>>) => {
  void notificationCounts;
  return rest;
};

test.describe("E2E-28 cancel a confirmed multi-venue event", () => {
  test.use({ as: "organiser" });

  // Steps 4 to 6. SPM-136 AC1, SPM-155 AC1, SPM-190 Q5: only the assigned Coordinator may cancel; the Lead may not.
  test("every actor except the assigned Coordinator is refused by UI and API, and nothing changes @P0 @E2E-28", async ({
    db, pageAs, playwright,
  }) => {
    const scene = await db.scene(SCENE);
    const { gala } = scene.events;
    const { page: pageOf, api } = makeActors(pageAs);
    await arrangeGala(scene, api);

    // Baseline (step 4): Confirmed, two Approved bookings, 3 of 5 reserved, 2 registered and 1 waitlisted.
    const before = await snapshot(api, scene);
    expect(before.status).toBe("confirmed");
    expect(before.main).toEqual(["approved"]);
    expect(before.breakout).toEqual(["approved"]);
    expect(before.pool).toEqual({ total: 5, reserved: 3, available: 2 });
    expect(before.registrations[0]).toBe("registered");
    expect(before.registrations[1]).toBe("registered");
    expect(before.registrations[2]).toMatch(/wait/);
    for (const who of WATCHED) expect(await cancelNotices(api, who, gala.id), `${who} has no cancellation notice yet`).toEqual([]);

    // Step 6: Coordinator 2 (unassigned), Organiser 2, Attendee 1, Venue Staff 1, Technical Support 1, Safety Officer 1,
    // the Lead and Organiser 1 (who may only request).
    const refused: As[] = ["coordinator2", "organiser2", "attendee", "venue_staff", "tech_support", "safety_officer", "lead", "organiser"];
    for (const who of refused) {
      const page = await pageOf(who);
      await page.goto(`/events/${gala.id}`);
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("button", { name: "Cancel Event" }), `${who} is offered no Cancel control`).toHaveCount(0);

      const response = await page.request.post(url(`/api/events/${gala.id}/status-change`), {
        data: { targetStatus: "Cancelled", confirmed: true },
      });
      expect(response.status(), `${who} direct cancel`).toBe(403);
    }

    // The unauthenticated call is 401.
    const anonymous = await playwright.request.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const response = await anonymous.post(url(`/api/events/${gala.id}/status-change`), { data: { targetStatus: "Cancelled", confirmed: true } });
      expect(response.status()).toBe(401);
    } finally {
      await anonymous.dispose();
    }

    // Nothing changed, and no notification was created for anybody.
    expect(await snapshot(api, scene)).toEqual(before);
  });

  // Steps 4 to 5 and 7 to 23, the main journey: request, decline, request again, accept, effects, immediate reuse.
  test("the Organiser requests, the Coordinator declines then accepts, everything is released and the slot is reusable at once @P0 @E2E-28", async ({
    page, db, pageAs,
  }) => {
    const scene = await db.scene(SCENE);
    const { gala, other } = scene.events;
    const { page: pageOf, api } = makeActors(pageAs);
    await arrangeGala(scene, api);
    const coordinator = await api("coordinator");
    const coordinator2 = await api("coordinator2");
    const baseline = await snapshot(api, scene);

    // Step 5: reuse check before the cancel. The slot is held, so Coordinator 2 is refused and nothing is created.
    const mainRefusal = await coordinator2.post(url(`/api/venues/${scene.venues.main.id}/booking-requests`), {
      data: { eventId: other.id, start: other.startAt, end: other.endAt },
    });
    expect(mainRefusal.status()).toBe(409);
    // Only 2 Projectors are available, so Technical Support cannot reserve 5 for the other event.
    const otherEquipment = await ok(
      await coordinator2.post(url("/api/equipment/requests"), {
        data: { eventId: other.id, items: [{ equipmentName: scene.equipment.projector.name, equipmentType: "Visual", quantity: 5 }] },
      }),
      201,
    );
    const techSupport = await api("tech_support");
    expect((await techSupport.patch(url(`/api/equipment/requests/${otherEquipment.id}/reserve`))).status()).toBe(409);
    expect(await bookingStatuses(api, scene.venues.main.id, other.id)).toEqual([]);
    expect(await projectorPool(api, scene)).toEqual(baseline.pool);

    // Step 7: Organiser 1 requests cancellation with a reason; the request shows Pending.
    await page.goto(`/events/${gala.id}`);
    await page.getByRole("button", { name: "Request Cancellation" }).click();
    await page.getByLabel("Reason (optional)").fill(REASON);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByText("Cancellation request sent to your Event Coordinator.")).toBeVisible();
    await expect(page.getByText("Status: Pending")).toBeVisible();
    // Another request while one is pending: no control in the UI, refused by the server.
    await expect(page.getByRole("button", { name: "Request Cancellation" })).toHaveCount(0);
    const second = await (await api("organiser")).post(url(`/api/events/${gala.id}/cancellation-requests`), { data: { reason: REASON } });
    expect(second.status()).toBe(409);
    expect((await second.json()).code).toBe("CANCELLATION_REQUEST_PENDING");

    // Step 8: only the assigned Coordinator is told. Coordinator 2 and the Lead are not.
    const requested = (await notices(api, "coordinator", gala.id)).filter((row) => /requested to cancel "E2E-28 Gala"\./.test(row.message));
    expect(requested).toHaveLength(1);
    expect(await cancelNotices(api, "coordinator2", gala.id)).toEqual([]);
    expect(await cancelNotices(api, "lead", gala.id)).toEqual([]);

    // Step 9: Coordinator 1 sees the pending request and the reason, and declines.
    const coordinatorPage = await pageOf("coordinator");
    await coordinatorPage.goto(`/events/${gala.id}`);
    await expect(coordinatorPage.getByText("Status: Pending")).toBeVisible();
    await expect(coordinatorPage.getByText(REASON)).toBeVisible();
    await coordinatorPage.getByRole("button", { name: "Decline" }).click();
    await expect(coordinatorPage.getByText("Status: Declined")).toBeVisible();
    // The event and every arrangement are unchanged.
    const afterDecline = await snapshot(api, scene);
    expect(withoutNotices(afterDecline)).toEqual(withoutNotices(baseline));
    const declinedNotice = (await notices(api, "organiser", gala.id)).filter((row) =>
      row.message === 'Your cancellation request for "E2E-28 Gala" was declined. The event keeps its current status.');
    expect(declinedNotice).toHaveLength(1);
    expect(await cancelNotices(api, "coordinator2", gala.id)).toEqual([]);
    expect(await cancelNotices(api, "lead", gala.id)).toEqual([]);

    // Step 10: Organiser 1 asks again; the request is pending and Coordinator 1 has a second request notice.
    await page.reload();
    await page.getByRole("button", { name: "Request Cancellation" }).click();
    await page.getByLabel("Reason (optional)").fill(REASON);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByText("Status: Pending")).toBeVisible();
    const requestedTwice = (await notices(api, "coordinator", gala.id)).filter((row) => /requested to cancel "E2E-28 Gala"\./.test(row.message));
    expect(requestedTwice).toHaveLength(2);

    // Step 11: Coordinator 1 accepts and confirms in the dialog (Note 3: the same strict confirmation as a direct cancel).
    await coordinatorPage.reload();
    await coordinatorPage.getByRole("button", { name: "Accept" }).click();
    const dialog = coordinatorPage.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Confirm cancellation" }).click();
    await expect(dialog.getByRole("status")).toContainText("Cancellation request accepted. E2E-28 Gala is cancelled.");
    await dialog.getByRole("button", { name: "Close" }).click();

    // Step 12: the event is Cancelled and the request shows Accepted.
    expect(await eventStatus(coordinator, gala.id)).toBe("cancelled");
    await coordinatorPage.reload();
    await expect(coordinatorPage.getByText("Status: Accepted")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Status: Accepted")).toBeVisible();

    // Step 13: both bookings are released.
    expect(await bookingStatuses(api, scene.venues.main.id, gala.id)).toEqual(["released"]);
    expect(await bookingStatuses(api, scene.venues.breakout.id, gala.id)).toEqual(["released"]);

    // Step 14: the reservation is released and the pool reads 5 of 5.
    expect(await projectorPool(api, scene)).toEqual({ total: 5, reserved: 0, available: 5 });

    // Step 15: Attendees 1 and 2 and the waiting-list entry show Cancelled, nobody is promoted, the report is empty.
    expect(await registrationStatusesFor(api, gala.id)).toEqual(["cancelled", "cancelled", "cancelled"]);
    const report = await ok(await coordinator.get(url(`/api/events/${gala.id}/registrations/report`)), 200);
    expect(report.totalConfirmed).toBe(0);
    // A new registration attempt is refused and stores nothing (Note 5: the code is an assumption).
    const attempt = await (await api("attendee")).post(url(`/api/events/${gala.id}/registrations`), {
      data: { fullName: "Attendee 1", email: "attendee1@connectsphere.test", contactNumber: "91234567" },
    });
    expect(attempt.status()).toBeGreaterThanOrEqual(400);
    expect(attempt.status()).toBeLessThan(500);
    expect(await registrationStatusesFor(api, gala.id)).toEqual(["cancelled", "cancelled", "cancelled"]);

    // Step 16: nobody can change the arrangements of a cancelled event. UI first, then API.
    await expect(coordinatorPage.getByRole("button", { name: "Cancel Event" })).toHaveCount(0);
    const afterCancel = await snapshot(api, scene);
    const attempts = [
      await coordinator.post(url(`/api/venues/${scene.venues.main.id}/booking-requests`), { data: { eventId: gala.id, start: gala.startAt, end: gala.endAt } }),
      await coordinator.post(url("/api/equipment/requests"), {
        data: { eventId: gala.id, items: [{ equipmentName: scene.equipment.projector.name, equipmentType: "Visual", quantity: 1 }] },
      }),
      await coordinator.patch(url(`/api/events/${gala.id}/planning`), { data: { purpose: "Changed after cancellation" } }),
    ];
    for (const response of attempts) {
      expect(response.status()).toBeGreaterThanOrEqual(400);
      expect(response.status()).toBeLessThan(500);
    }
    expect(await snapshot(api, scene)).toEqual(afterCancel);

    // Step 17: notifications. Organiser 1 has the request outcome and no generic notice; Coordinator 1 and the three
    // Attendees have exactly one event-cancelled notice; nobody else has any cancellation notice (assumption S2).
    const organiserNotices = await notices(api, "organiser", gala.id);
    expect(organiserNotices.filter((row) => row.message === 'Your cancellation request for "E2E-28 Gala" was accepted. The event is cancelled.')).toHaveLength(1);
    expect(organiserNotices.filter((row) => row.type === "EventCancelled")).toEqual([]);
    for (const who of ["coordinator", ...ATTENDEES] as As[]) {
      const cancelled = (await notices(api, who, gala.id)).filter((row) => row.type === "EventCancelled");
      expect(cancelled, `${who} has exactly one event-cancelled notice`).toHaveLength(1);
    }
    for (const who of ["venue_staff", "tech_support", "lead", "coordinator2", "organiser2", "safety_officer"] as As[])
      expect(await cancelNotices(api, who, gala.id), `${who} has no cancellation notice`).toEqual([]);

    // Step 18: history lists the requests, decisions and cancellation, and the releases.
    for (const who of ["coordinator", "organiser"] as As[]) {
      const history = JSON.stringify(await ok(await (await api(who)).get(url(`/api/events/${gala.id}/history`)), 200)).toLowerCase();
      expect(history, `${who} sees the cancellation in the history`).toContain("cancel");
    }
    expect((await bookingStatuses(api, scene.venues.main.id, gala.id)).concat(await bookingStatuses(api, scene.venues.breakout.id, gala.id))).toEqual(["released", "released"]);

    // Steps 19 to 23, the P0 assertion: in the same session, with no delay step, another Coordinator books the freed slot.
    const venueStaff = await api("venue_staff");
    for (const venue of [scene.venues.main, scene.venues.breakout]) {
      const booking = await ok(
        await coordinator2.post(url(`/api/venues/${venue.id}/booking-requests`), { data: { eventId: other.id, start: other.startAt, end: other.endAt } }),
        201,
      );
      expect(booking.status).toBe("pending");
      await ok(await venueStaff.post(url(`/api/venues/bookings/${booking.id}/approve`)));
      expect(await bookingStatuses(api, venue.id, other.id)).toEqual(["approved"]);
    }
    // Technical Support reserves all 5 Projectors for the other event: no conflict, 0 of 5 left.
    await ok(await techSupport.patch(url(`/api/equipment/requests/${otherEquipment.id}/reserve`)), 200);
    expect(await projectorPool(api, scene)).toEqual({ total: 5, reserved: 5, available: 0 });
    // The gala still holds nothing.
    expect(await bookingStatuses(api, scene.venues.main.id, gala.id)).toEqual(["released"]);
    expect(await bookingStatuses(api, scene.venues.breakout.id, gala.id)).toEqual(["released"]);
  });

  // Steps 24 and 25. SPM-136 AC1 to AC3, SPM-65 AC11: the assigned Coordinator cancels directly, with strict confirmation.
  test("the assigned Coordinator cancels directly, only with confirmation, and the pending change request is closed @P0 @E2E-28", async ({
    page, db, pageAs,
  }) => {
    const scene = await db.scene(SCENE);
    const { direct } = scene.events;
    const { page: pageOf, api } = makeActors(pageAs);
    const coordinator = await api("coordinator");

    // Pre-condition (d): Organiser 1 has a pending change request on the direct event.
    const change = await ok(
      await (await api("organiser")).post(url(`/api/events/${direct.id}/change-requests`), {
        data: { changes: { expectedAttendance: 20 }, reason: "More guests confirmed." },
      }),
      201,
    );
    expect(change.status).toBe("Pending");

    // Step 24, UI: choose Cancel Event, dismiss the confirmation, the event is still Confirmed.
    const coordinatorPage = await pageOf("coordinator");
    await coordinatorPage.goto(`/events/${direct.id}`);
    await coordinatorPage.getByRole("button", { name: "Cancel Event" }).click();
    await coordinatorPage.getByRole("dialog").getByRole("button", { name: "Keep event" }).click();
    await expect(coordinatorPage.getByRole("dialog")).toHaveCount(0);
    expect(await eventStatus(coordinator, direct.id)).toBe("confirmed");

    // Step 24, API: an omitted or false confirmation is refused 400 CANCEL_NOT_CONFIRMED and nothing changes.
    for (const data of [{ targetStatus: "Cancelled" }, { targetStatus: "Cancelled", confirmed: false }]) {
      const refusal = await coordinator.post(url(`/api/events/${direct.id}/status-change`), { data });
      expect(refusal.status()).toBe(400);
      expect((await refusal.json()).code).toBe("CANCEL_NOT_CONFIRMED");
    }
    expect(await eventStatus(coordinator, direct.id)).toBe("confirmed");
    expect(await bookingStatuses(api, scene.venues.hall2.id, direct.id)).toEqual(["approved"]);

    // Step 25: Coordinator 1 cancels and confirms.
    await coordinatorPage.getByRole("button", { name: "Cancel Event" }).click();
    const dialog = coordinatorPage.getByRole("dialog");
    await dialog.getByRole("button", { name: "Confirm cancellation" }).click();
    await expect(dialog.getByRole("status")).toContainText("E2E-28 Direct has been cancelled.");
    await dialog.getByRole("button", { name: "Close" }).click();

    expect(await eventStatus(coordinator, direct.id)).toBe("cancelled");
    expect(await bookingStatuses(api, scene.venues.hall2.id, direct.id)).toEqual(["released"]);

    // Organiser 1 has one event-cancelled notice (not a request outcome, so the generic notice applies); so has Coordinator 1.
    for (const who of ["organiser", "coordinator"] as As[]) {
      const cancelled = (await notices(api, who, direct.id)).filter((row) => row.type === "EventCancelled");
      expect(cancelled, `${who} has one event-cancelled notice`).toHaveLength(1);
    }

    // The pending change request is closed automatically and the Organiser can see it closed.
    const changes: Json[] = await ok(await (await api("organiser")).get(url(`/api/events/${direct.id}/change-requests`)), 200);
    expect(changes.find((item) => item.id === change.id)?.status).toBe("Closed");
    await page.goto(`/events/${direct.id}`);
    await expect(page.getByRole("button", { name: "Request Cancellation" })).toHaveCount(0);
  });
});
