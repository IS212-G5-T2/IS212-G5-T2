import { type APIResponse, type Page } from "@playwright/test";
import { expect, test } from "../../../../../e2e/fixtures";

// E2E-04 (docs/test-cases/e2e/E2E-04.md): rejection. SPM-83 AC1-AC4, SPM-88 AC1/AC3/AC4, SPM-48 AC2, SPM-157 AC1/AC8,
// SPM-57 AC8 (equipment for a rejected event), SPM-148 AC1 (only an Approved event moves to Planning), SPM-38 AC4.
//
// SPM-190 Q3 applied: a rejection reason is 10 to 500 characters (trimmed) with at least 3 real words. The valid reason
// below (five words, 41 characters) satisfies every candidate rule, and the invalid reasons at the API probe each limb of
// the Q3 rule (empty, too short, too few words, no letters, over 500).
//
// "DB:" checks are made through the authorised API because frontend/ has no database dependency. Refusal status codes are
// ASSUMPTIONS in the case (Notes 8), so refusals are asserted as 4xx with no state change. The venue negative has no AC
// (Notes 1, [S1]); if the product accepts the booking, the finding is a missing AC, not a test defect.
//
// Recorded, not failed: SPM-88 AC3 asks the notification to show the decision date; the product's rejection notice reads
// `Your event request "<name>" was rejected` (events.service reject) with no date. The notice is asserted for name and
// "rejected", and the gap is annotated.

test.use({ as: "coordinator", timezoneId: "Asia/Singapore" });

const apiBase = process.env.PLAYWRIGHT_API_URL ?? `http://localhost:${process.env.E2E_BACKEND_PORT ?? "8080"}`;
const eventName = "Rejection check event";
const hallName = "Rejection check hall";
const reason = "Venue not suitable for expected attendance";

interface Notice { id: string; type: string; message: string; relatedEventId: string | null; read: boolean }
interface EventApi { id: string; status: string; rejectionReason?: string | null }

async function readEvent(page: Page, eventId: string): Promise<EventApi> {
  const response = await page.request.get(`${apiBase}/api/events/${eventId}`);
  expect(response.status(), "GET event").toBe(200);
  const body = (await response.json()) as { event?: EventApi } & EventApi;
  return body.event ?? body;
}

async function noticesAbout(page: Page, eventId: string): Promise<Notice[]> {
  const response = await page.request.get(`${apiBase}/api/notifications`);
  // A role with no inbox (the API refuses it) holds nothing by construction.
  if (response.status() === 401 || response.status() === 403) return [];
  expect(response.status(), "GET /api/notifications").toBe(200);
  return ((await response.json()) as Notice[]).filter((notice) => notice.relatedEventId === eventId);
}

async function expectRefused(response: APIResponse, what: string) {
  const status = response.status();
  expect(status, `${what}: expected a refusal, got ${status}`).toBeGreaterThanOrEqual(400);
  expect(status, `${what}: expected a client error, got ${status}`).toBeLessThan(500);
}

test.describe("E2E-04 rejection @P1", () => {
  test("@P1 coordinator1 rejects with a valid reason; the Organiser sees it, the history records it, and no equipment, venue or second decision can follow", async ({
    page,
    pageAs,
    db,
  }) => {
    const scene = await db.scene({
      venues: { hall: { name: hallName, capacity: 120, setupMinutes: 30, turnaroundMinutes: 45 } },
      equipment: { projector: { name: "Projector", quantity: 10, type: "Visual" } },
      events: {
        main: {
          name: eventName,
          status: "Submitted",
          purpose: "E2E-04 rejection check",
          expectedAttendance: 60,
          startInDays: 30,
          durationHours: 2,
          organiserEmail: "organiser1@connectsphere.test",
          coordinatorEmail: "coordinator1@connectsphere.test",
        },
      },
    });
    const event = scene.events.main;
    const eventId = event.id;
    const hall = scene.venues.hall;
    const organiser = await pageAs("organiser1");
    const organiser2 = await pageAs("organiser2");
    const coordinator2 = await pageAs("coordinator2");
    const lead = await pageAs("lead");
    const venueStaff = await pageAs("venue_staff1");

    const reject = (who: Page, body: unknown) => who.request.post(`${apiBase}/api/events/${eventId}/reject`, { data: body });
    const expectStillSubmitted = async () => {
      const stored = await readEvent(page, eventId);
      expect(stored.status).toBe("submitted");
      expect(stored.rejectionReason ?? null).toBeNull();
      expect(await noticesAbout(organiser, eventId)).toEqual([]);
    };

    // Step 1: the pending list shows the event with status Submitted (SPM-83 AC1).
    await page.goto("/events");
    await page.getByLabel("Filter by status").selectOption("submitted");
    await expect(page.getByRole("heading", { name: "Pending Requests" })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(eventName) })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(eventName) })).toContainText(/submitted/i);

    // Step 2: Reject with no reason is refused in the UI and by the API; nothing changes (SPM-83 AC3, Q3).
    await page.getByRole("link", { name: new RegExp(eventName) }).click();
    await page.getByRole("button", { name: "Review Event" }).click();
    await page.getByRole("radio", { name: "Reject" }).check();
    await page.getByRole("button", { name: "Submit Decision" }).click();
    await expect(page.getByText("Please provide a reason that:")).toBeVisible();
    // Q3 limbs in the UI: too short, then too few words, still refused with the error.
    await page.getByLabel("Rejection reason").fill("Too short");
    await page.getByRole("button", { name: "Submit Decision" }).click();
    await expect(page.getByText("Please provide a reason that:")).toBeVisible();
    await page.getByLabel("Rejection reason").fill("Venuenotsuitableforattendance");
    await page.getByRole("button", { name: "Submit Decision" }).click();
    await expect(page.getByText("Please provide a reason that:")).toBeVisible();
    await expectStillSubmitted();
    for (const [what, body] of [
      ["an empty reason", { reason: "" }],
      ["a missing reason", {}],
      ["a whitespace-only reason", { reason: "          " }],
      ["a reason of 9 characters", { reason: "Too short" }],
      ["a reason of two words", { reason: "Venue unsuitable" }],
      ["a reason with no letters", { reason: "123 456 789" }],
      ["a reason over 500 characters", { reason: "word ".repeat(101).trim() }],
    ] as const)
      await expectRefused(await reject(page, body), `API reject with ${what}`);
    await expectStillSubmitted();

    // Step 3: the Lead has no decision controls and the API refuses the Lead ([S2]).
    await lead.goto(`/events/${eventId}`);
    await expect(lead.getByRole("button", { name: "Review Event" })).toHaveCount(0);
    await expect(lead.getByRole("radio", { name: "Reject" })).toHaveCount(0);
    await expectRefused(await reject(lead, { reason }), "the Lead rejecting");
    await expectStillSubmitted();

    // Step 4: an unassigned Coordinator sees no details and is refused (SPM-38 AC4).
    await coordinator2.goto(`/events/${eventId}`);
    await expect(coordinator2.getByRole("button", { name: "Review Event" })).toHaveCount(0);
    await expect(coordinator2.getByText(eventName)).toHaveCount(0);
    await expectRefused(await reject(coordinator2, { reason }), "an unassigned coordinator rejecting");
    await expectStillSubmitted();

    // Step 5: the assigned Coordinator rejects with the valid reason (SPM-83 AC4, SPM-48 AC2).
    await page.goto(`/events/${eventId}`);
    await page.getByRole("button", { name: "Review Event" }).click();
    await page.getByRole("radio", { name: "Reject" }).check();
    await page.getByLabel("Rejection reason").fill(reason);
    await page.getByRole("button", { name: "Submit Decision" }).click();
    await expect(page.getByLabel("Event status timeline")).toContainText("rejected");
    await expect(page.getByText(`Rejected: ${reason}`)).toBeVisible();
    const rejected = await readEvent(page, eventId);
    expect(rejected.status).toBe("rejected");
    expect(rejected.rejectionReason).toBe(reason);

    // Step 6: organiser1 holds exactly one notice; organiser2, coordinator2, the Lead and Venue Staff hold none (SPM-88 AC1).
    const notices = await noticesAbout(organiser, eventId);
    expect(notices).toHaveLength(1);
    expect(notices[0].type).toBe("rejection");
    expect(notices[0].message).toContain(eventName);
    expect(notices[0].message).toMatch(/rejected/i);
    expect(notices[0].read).toBe(false);
    for (const [who, label] of [[organiser2, "organiser2"], [coordinator2, "coordinator2"], [lead, "the Lead"], [venueStaff, "venue_staff1"]] as const)
      expect(await noticesAbout(who, eventId), `${label}'s notices`).toEqual([]);
    if (!/\d{1,2}[ /-]|\d{4}/.test(notices[0].message))
      test.info().annotations.push({ type: "gap", description: "SPM-88 AC3: the rejection notification should show the decision date; the notice text carries only the event name and 'rejected'." });

    // Step 7: the Organiser opens the event from the notification and sees Rejected and the reason (SPM-88 AC3, AC4).
    await organiser.goto("/");
    await organiser.getByRole("button", { name: /^Notifications/ }).click();
    const bell = organiser.getByRole("dialog", { name: "Notifications" });
    await expect(bell).toBeVisible();
    // The row's text names the event and the rejection; its link is labelled "View Request".
    await bell.getByRole("listitem").filter({ hasText: new RegExp(`${eventName}.*rejected`) }).getByRole("link", { name: "View Request" }).click();
    await expect(organiser).toHaveURL(new RegExp(`/events/${eventId}`));
    await expect(organiser.getByLabel("Event status timeline")).toContainText("rejected");
    await expect(organiser.getByText(`Rejected: ${reason}`)).toBeVisible();
    // Read after opening, and still read after a reload (observed only: SPM-88 AC5 is outside the brief's AC list).
    await expect.poll(async () => (await noticesAbout(organiser, eventId))[0]?.read).toBe(true);
    await organiser.reload();
    expect((await noticesAbout(organiser, eventId))[0].read).toBe(true);

    // Step 8: the history shows the rejection, by coordinator1, to both coordinator1 and organiser1 (SPM-157 AC1, AC8).
    for (const who of [page, organiser]) {
      await who.goto(`/events/${eventId}/history`);
      await expect(who.getByRole("heading", { name: `History: ${eventName}` })).toBeVisible();
      await expect(who.getByText("Event request rejected")).toBeVisible();
      await expect(who.getByText("by Coordinator 1").first()).toBeVisible();
    }

    // Step 9: the event leaves the pending list and is still in the full list as Rejected (SPM-83 AC1).
    await page.goto("/events");
    await page.getByLabel("Filter by status").selectOption("submitted");
    await expect(page.getByRole("heading", { name: "Pending Requests" })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(eventName) })).toHaveCount(0);
    await page.getByLabel("Filter by status").selectOption("");
    await expect(page.getByRole("link", { name: new RegExp(eventName) })).toContainText(/rejected/i);

    // Step 10: no equipment can be requested for the rejected event (SPM-57 AC8), in the UI or the API; count 0.
    await page.goto("/equipment/requests");
    await page.getByRole("link", { name: /Create Equipment Request/ }).click();
    await expect(page.locator("#equipment-request-event option", { hasText: eventName })).toHaveCount(0);
    await expectRefused(
      await page.request.post(`${apiBase}/api/equipment/requests`, {
        data: { eventId, items: [{ equipmentName: "Projector", equipmentType: "Visual", quantity: 1 }] },
      }),
      "equipment request for a rejected event",
    );
    const equipmentList = await page.request.get(`${apiBase}/api/equipment/requests`);
    expect(equipmentList.status()).toBe(200);
    expect(((await equipmentList.json()) as Array<{ eventId: string }>).filter((record) => record.eventId === eventId)).toHaveLength(0);
    expect((await readEvent(page, eventId)).status).toBe("rejected");

    // Step 11: no venue booking can be raised for it ([S1], Notes 1: the plan's rule, no AC), and it does not become Planning.
    await page.goto(`/venue-records/${hall.id}?eventId=${eventId}`);
    await expect(page.getByRole("button", { name: "Submit booking request" })).toHaveCount(0);
    await expectRefused(
      await page.request.post(`${apiBase}/api/venues/${hall.id}/booking-requests`, {
        data: { eventId, start: event.startAt, end: event.endAt },
      }),
      "venue booking request for a rejected event",
    );
    const bookings = await page.request.get(`${apiBase}/api/venues/bookings/mine`);
    expect(bookings.status()).toBe(200);
    expect(((await bookings.json()) as Array<{ eventId: string }>).filter((booking) => booking.eventId === eventId)).toHaveLength(0);
    expect((await readEvent(page, eventId)).status).toBe("rejected");

    // Step 12: a second decision is refused: the controls are gone and the API refuses approve and reject ([S3]).
    await page.goto(`/events/${eventId}`);
    await expect(page.getByLabel("Event status timeline")).toContainText("rejected");
    await expect(page.getByRole("button", { name: "Review Event" })).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "Approve" })).toHaveCount(0);
    await expectRefused(await page.request.post(`${apiBase}/api/events/${eventId}/approve`), "approving a rejected event");
    await expectRefused(await reject(page, { reason: "A different valid reason" }), "rejecting a rejected event");
    const afterSecond = await readEvent(page, eventId);
    expect(afterSecond.status).toBe("rejected");
    expect(afterSecond.rejectionReason).toBe(reason);

    // Step 13: the Organiser cannot edit the rejected event: no change-request control and the API refuses ([S3]).
    await organiser.goto(`/events/${eventId}`);
    await expect(organiser.getByRole("link", { name: "Request Change" })).toHaveCount(0);
    await expect(organiser.getByRole("button", { name: "Request Change" })).toHaveCount(0);
    await expectRefused(
      await organiser.request.post(`${apiBase}/api/events/${eventId}/change-requests`, {
        data: { changes: { description: "An edited description for the rejected event" }, reason: "Trying to edit after rejection" },
      }),
      "organiser change request on a rejected event",
    );
    expect((await readEvent(organiser, eventId)).status).toBe("rejected");
  });
});
