// SPM-192 E2E-23: attendance change beyond the venue's capacity (docs/test-cases/e2e/E2E-23.md).
//
// Stories: SPM-64, SPM-65, SPM-85, SPM-52, SPM-54, SPM-55, SPM-129, SPM-135, SPM-139, SPM-97, SPM-137.
// SPM-190 Q6 (resolved 2026-11-06): no re-check is required for attendance, date or venue changes. The case's own
// steps 6, 13 and 14 still assert that approving the change resets the safety check and sends the event back through
// Safety Officer 1, and the product does so (change-request-review.service.ts, SPM-65 AC8). This spec follows the
// case's steps; if Q6 means the safety check must NOT reset, steps "6" and "13 and 14" below flip together.
// Arrange deviation: `status: "Confirmed"` carries no readiness rows (browser-fixtures.mjs), so the event is built as
// Planning (booking and registrations from the builder) and confirmed through the product: no-equipment confirmation,
// safety check request, Safety Officer approval, status change.
// Not asserted (see the report): the "Hall 100 slot is free for another event" probe of step 12, the Hall 200 capacity
// summary text of step 11, and the sentence of any notice (Note 4). Step 18 runs while the request is pending.
import { type APIResponse } from "@playwright/test";
import { expect, test } from "../../../../../e2e/fixtures";

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";
const REFUSAL = [401, 403, 404];

type Json = any; // response bodies are asserted field by field

async function ok(response: APIResponse, expected?: number): Promise<Json> {
  const text = await response.text();
  if (expected !== undefined) expect(response.status(), text).toBe(expected);
  else expect(response.ok(), `${response.status()} ${text}`).toBe(true);
  return text ? JSON.parse(text) : {};
}

const url = (path: string) => `${apiBase}${path}`;

test.use({ as: "organiser" });

test.describe("E2E-23 attendance beyond capacity", () => {
  test("E2E-23 raising attendance from 80 to 150 is reviewed, re-booked at the larger hall and re-approved @P1", async ({ page, db, pageAs }) => {
    const scene = await db.scene({
      venues: {
        small: { name: "E2E-23 Hall 100", capacity: 100, setupMinutes: 30, turnaroundMinutes: 45 },
        large: { name: "E2E-23 Hall 200", capacity: 200, setupMinutes: 15, turnaroundMinutes: 20 },
      },
      events: {
        main: {
          name: "E2E-23 Conference", status: "Planning", venue: "small", expectedAttendance: 80, capacity: 80, startInDays: 30, durationHours: 2,
          organiserEmail: "organiser1@connectsphere.test", coordinatorEmail: "coordinator1@connectsphere.test",
        },
      },
      registrations: [
        { event: "main", attendee: "attendee1@connectsphere.test" },
        { event: "main", attendee: "attendee2@connectsphere.test" },
        { event: "main", attendee: "attendee3@connectsphere.test" },
      ],
    });
    const event = scene.events.main;
    const eventId = event.id;
    const coordinatorPage = await pageAs("coordinator");
    const venueStaffPage = await pageAs("venue_staff");
    const officerPage = await pageAs("safety_officer");
    const coordinator = coordinatorPage.request;
    const venueStaff = venueStaffPage.request;
    const officer = officerPage.request;
    const organiser = page.request;

    const planning = async () => ok(await coordinator.get(url(`/api/events/${eventId}/planning`)), 200);
    const eventRecord = async () => {
      const body = await ok(await coordinator.get(url(`/api/events/${eventId}`)), 200);
      return body.event ?? body;
    };
    const requests = async () => (await ok(await coordinator.get(url(`/api/events/${eventId}/change-requests`)), 200)) as Json[];
    const bookingRows = async () =>
      ((await planning()).venueBookings as Json[]).map(({ id, venueName, status, start, end, capacity }) => ({ id, venueName, status, start, end, capacity }));
    const bookingOf = async (venueName: string) => (await bookingRows()).find((row) => row.venueName === venueName);
    const registrationReport = async () => ok(await coordinator.get(url(`/api/events/${eventId}/registrations/report`)), 200);
    const noticesAbout = async (who: "organiser" | "coordinator" | "coordinator2" | "venue_staff") => {
      const context = who === "organiser" ? organiser : (await pageAs(who)).request;
      const response = await context.get(url("/api/notifications"));
      if (REFUSAL.includes(response.status())) return [] as Json[];
      expect(response.status(), `GET /api/notifications as ${who}`).toBe(200);
      return ((await response.json()) as Json[]).filter((notice) => notice.relatedEventId === eventId);
    };

    // --- Arrange: Planning to Confirmed through the product ---------------------------------------------------------
    await test.step("Arrange: the event reaches Confirmed through the product (no-equipment confirmation, safety check, status change)", async () => {
      await ok(await coordinator.post(url(`/api/events/${eventId}/confirm-no-equipment`)), 200);
      await ok(await coordinator.post(url(`/api/events/${eventId}/safety-check/request`)));
      await ok(await officer.post(url(`/api/safety-officer/queue/${eventId}/decision`), { data: { decision: "approved" } }));
      await ok(await coordinator.post(url(`/api/events/${eventId}/status-change`), { data: { targetStatus: "Confirmed" } }), 200);
      expect(String((await eventRecord()).status).toLowerCase()).toBe("confirmed");
    });
    const hall100Before = (await bookingOf(scene.venues.small.name))!;
    const registrationsBefore = await registrationReport();
    expect(hall100Before.status).toBe("Booked");
    expect(registrationsBefore.registrations).toHaveLength(3);

    // --- A. Request ------------------------------------------------------------------------------------------------------
    await test.step("Step 1: Organiser 1 requests 150 and sees a confirmation and a pending request (SPM-64 AC4, AC5)", async () => {
      await page.goto(`/events/${eventId}/change-requests`);
      await page.getByRole("button", { name: "Request Change", exact: true }).click();
      await page.locator("#change-attendance").fill("150");
      await page.getByRole("button", { name: "Submit Change Request" }).click();
      await expect(page.getByText("Your change request for E2E-23 Conference has been submitted for review.")).toBeVisible();
      await expect(page.getByText("Pending review").first()).toBeVisible();
    });

    await test.step("Step 2: stored state: attendance is still 80 and one pending request exists", async () => {
      expect((await planning()).event.expectedAttendance).toBe(80);
      const list = await requests();
      expect(list).toHaveLength(1);
      expect(list[0].status).toBe("Pending");
    });
    const requestId = (await requests())[0].id as string;

    // --- H. Negative, executed while the request is pending (step 18) ------------------------------------------------
    await test.step("Step 18: Organiser 1 cannot approve, by UI or API; the request stays pending at 80", async () => {
      await expect(page.getByRole("button", { name: "Approve Change" })).toHaveCount(0);
      const attempt = await organiser.post(url(`/api/events/${eventId}/change-requests/${requestId}/approve`), { data: {} });
      expect(REFUSAL, `approve as Organiser 1 was answered ${attempt.status()}`).toContain(attempt.status());
      expect((await requests())[0].status).toBe("Pending");
      expect((await planning()).event.expectedAttendance).toBe(80);
    });

    // --- B. Review ----------------------------------------------------------------------------------------------------
    await test.step("Steps 3 and 4: Coordinator 1 sees 80 to 150 and the Hall 100 conflict; the preview changes nothing (SPM-65 AC1 to AC3, SPM-85 AC2)", async () => {
      await coordinatorPage.goto(`/events/${eventId}/change-requests`);
      const row = coordinatorPage.getByRole("row", { name: /Expected attendance/ });
      await expect(row).toContainText("80");
      await expect(row).toContainText("150");
      const review = coordinatorPage.getByRole("region", { name: "Review this change request" });
      await expect(review.getByText("E2E-23 Hall 100")).toBeVisible();

      const preview = await ok(await coordinator.get(url(`/api/events/${eventId}/change-requests/${requestId}/conflicts`)), 200);
      const hall100 = (preview.venueBookings as Json[]).find((item) => item.name === scene.venues.small.name);
      expect(hall100, "Hall 100 is listed as in conflict").toBeTruthy();
      expect((hall100.details as string[]).join(" ")).toMatch(/150/);
      expect(await bookingOf(scene.venues.small.name)).toEqual(hall100Before);
      expect((await planning()).event.expectedAttendance).toBe(80);
    });

    // --- C. Approve ---------------------------------------------------------------------------------------------------
    await test.step("Step 5: Coordinator 1 approves; confirmation, attendance 150, request Approved with an audit entry (SPM-65 AC4, AC6, AC7, AC10)", async () => {
      const review = coordinatorPage.getByRole("region", { name: "Review this change request" });
      await review.getByRole("button", { name: "Approve Change" }).click();
      await review.getByRole("button", { name: "Confirm Approval" }).click();
      await expect(coordinatorPage.getByText(/The change request was approved and E2E-23 Conference has been updated\./)).toBeVisible();

      expect((await planning()).event.expectedAttendance).toBe(150);
      const [request] = await requests();
      expect(request.status).toBe("Approved");
      const audit = (await ok(await coordinator.get(url(`/api/events/${eventId}/change-requests/audit`)), 200)) as Json[];
      expect(audit.map((entry) => entry.outcome)).toEqual(["Approved"]);
      expect(audit[0].changeRequestId).toBe(requestId);
    });

    await test.step("Step 6: the safety check is reset, the event is no longer Confirmed, and Hall 100 is listed as needing review (SPM-65 AC8, AC9; Q6 assumption S1)", async () => {
      const [request] = await requests();
      expect(request.safetyCheckReset).toBe(true);
      expect(String((await eventRecord()).status).toLowerCase()).toBe("planning");
      expect((request.recheck as Json[]).map((item) => item.name)).toContain(scene.venues.small.name);
      await expect(coordinatorPage.getByText("E2E-23 Hall 100").first()).toBeVisible();
    });

    await test.step("Step 7: Organiser 1 sees attendance 150 and the new status (SPM-97 AC5)", async () => {
      const view = await ok(await organiser.get(url(`/api/events/${eventId}/planning`)), 200);
      expect(view.event.expectedAttendance).toBe(150);
      expect(String(view.event.status).toLowerCase()).toBe("planning");
      await page.goto(`/events/${eventId}`);
      await expect(page.getByText("150").first()).toBeVisible();
    });

    // --- D. Re-book ---------------------------------------------------------------------------------------------------
    await test.step("Step 8: venue search from the event starts at minimum capacity 150; Hall 100 is not offered, Hall 200 is (SPM-52 AC2, AC4)", async () => {
      await coordinatorPage.goto(`/venues?eventId=${eventId}`);
      await expect(coordinatorPage.getByLabel("Minimum capacity")).toHaveValue("150");
      await expect(coordinatorPage.getByText("E2E-23 Hall 200").first()).toBeVisible();
      await expect(coordinatorPage.getByText("E2E-23 Hall 100")).toHaveCount(0);
    });

    await test.step("Step 9: Coordinator 1 requests Hall 200 (capacity 200); it appears as Pending (SPM-54 AC1, AC2, AC4)", async () => {
      const hall = await ok(await coordinator.get(url(`/api/venues/${scene.venues.large.id}`)), 200);
      expect(hall.capacity).toBe(200);
      await ok(await coordinator.post(url(`/api/venues/${scene.venues.large.id}/booking-requests`), { data: { eventId, start: event.startAt, end: event.endAt } }), 201);
      const mine = (await ok(await coordinator.get(url("/api/venues/bookings/mine")), 200)) as Json[];
      const pending = mine.filter((booking) => booking.eventId === eventId && booking.venueId === scene.venues.large.id);
      expect(pending.map((booking) => String(booking.status).toLowerCase())).toEqual(["pending"]);
    });

    await test.step("Step 10: Venue Staff 1 approves it; only Coordinator 1 is told (SPM-55 AC2, SPM-137 AC1; Note 8)", async () => {
      const mine = (await ok(await coordinator.get(url("/api/venues/bookings/mine")), 200)) as Json[];
      const booking = mine.find((item) => item.eventId === eventId && item.venueId === scene.venues.large.id)!;
      await ok(await venueStaff.post(url(`/api/venues/bookings/${booking.id}/approve`)), 201);
      const coordinatorNotices = (await noticesAbout("coordinator")).filter((notice) => /booking/i.test(String(notice.type)));
      expect(coordinatorNotices.length, "Coordinator 1 holds a booking decision notice").toBeGreaterThanOrEqual(1);
      for (const who of ["coordinator2", "organiser"] as const) {
        const stray = (await noticesAbout(who)).filter((notice) => /booking/i.test(String(notice.type)));
        expect(stray, `${who} holds no booking decision notice`).toEqual([]);
      }
    });

    await test.step("Steps 11 and 12: cancelling Hall 100 needs no extra warning and leaves Hall 200 untouched (SPM-54 AC9, AC10)", async () => {
      const hall200Before = (await bookingOf(scene.venues.large.name))!;
      expect(hall200Before.status).toBe("Booked");
      expect(hall200Before.capacity).toBe(200);
      const cancel = await coordinator.post(url(`/api/venues/bookings/${hall100Before.id}/cancel`), { data: {} });
      expect(cancel.ok(), `no LAST_ACTIVE_VENUE_BOOKING warning while Hall 200 is active: ${await cancel.text()}`).toBe(true);
      expect(await bookingOf(scene.venues.small.name)).toMatchObject({ id: hall100Before.id, status: "Cancelled" });
      expect(await bookingOf(scene.venues.large.name)).toEqual(hall200Before);
      expect(hall200Before.start).toBe(event.startAt);
      expect(hall200Before.end).toBe(event.endAt);
    });

    // --- E. Safety re-check -----------------------------------------------------------------------------------------------
    await test.step("Steps 13 and 14: Safety Officer 1 sees the event in the queue and approves; Coordinator 1 confirms it again (SPM-129 AC1, SPM-135 AC1)", async () => {
      await ok(await coordinator.post(url(`/api/events/${eventId}/confirm-no-equipment`))); // the equipment confirmation is idempotent
      await ok(await coordinator.post(url(`/api/events/${eventId}/safety-check/request`)));
      await officerPage.goto("/safety/events");
      await expect(officerPage.getByText("E2E-23 Conference").first()).toBeVisible();
      await ok(await officer.post(url(`/api/safety-officer/queue/${eventId}/decision`), { data: { decision: "approved" } }));
      await ok(await coordinator.post(url(`/api/events/${eventId}/status-change`), { data: { targetStatus: "Confirmed" } }), 200);
      expect(String((await eventRecord()).status).toLowerCase()).toBe("confirmed");
    });

    // --- F. Registration capacity -------------------------------------------------------------------------------------
    await test.step("Steps 15 and 16: registration capacity stays 80 until Coordinator 1 sets it to 150 (SPM-139 AC3; Note 2 assumption S2)", async () => {
      const settings = await ok(await coordinator.get(url(`/api/events/${eventId}/registration-settings`)), 200);
      expect(settings.capacity).toBe(80);
      expect((await registrationReport()).registrations).toHaveLength(3);
      await ok(await coordinator.put(url(`/api/events/${eventId}/registration-settings`), { data: { capacity: 150, version: settings.version } }), 200);
      expect((await ok(await coordinator.get(url(`/api/events/${eventId}/registration-settings`)), 200)).capacity).toBe(150);
      expect((await registrationReport()).registrations).toEqual(registrationsBefore.registrations);
    });

    // --- G. Notification ----------------------------------------------------------------------------------------------------
    await test.step("Step 17: Organiser 1 holds the outcome notice; no other role does (Note 4: type and count, not the sentence)", async () => {
      const outcome = (await noticesAbout("organiser")).filter((notice) => notice.type === "change_request_approved");
      expect(outcome, "Organiser 1's outcome notice").toHaveLength(1);
      for (const who of ["coordinator", "coordinator2", "venue_staff"] as const) {
        const stray = (await noticesAbout(who)).filter((notice) => notice.type === "change_request_approved");
        expect(stray, `${who} holds no outcome notice`).toEqual([]);
      }
      for (const who of ["attendee", "attendee2", "attendee3"] as const) {
        const response = await (await pageAs(who)).request.get(url("/api/notifications"));
        if (REFUSAL.includes(response.status())) continue;
        const stray = ((await response.json()) as Json[]).filter((notice) => notice.relatedEventId === eventId && notice.type === "change_request_approved");
        expect(stray, `${who} holds no outcome notice`).toEqual([]);
      }
    });

    await test.step("Final: Organiser 1 sees 150, the Hall 200 booking and Confirmed", async () => {
      const view = await ok(await organiser.get(url(`/api/events/${eventId}/planning`)), 200);
      expect(view.event.expectedAttendance).toBe(150);
      expect(String(view.event.status).toLowerCase()).toBe("confirmed");
      const active = (view.venueBookings as Json[]).filter((booking) => booking.status === "Booked");
      expect(active.map((booking) => booking.venueName)).toEqual([scene.venues.large.name]);
      await page.goto(`/events/${eventId}`);
      await expect(page.getByText("E2E-23 Hall 200").first()).toBeVisible();
    });
  });
});
