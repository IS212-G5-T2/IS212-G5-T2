// SPM-192 E2E-27: change request declined (docs/test-cases/e2e/E2E-27.md).
//
// Stories: SPM-64, SPM-65, SPM-157.
// SPM-190 Q3 (resolved 2026-11-06): a denial reason is 10 to 500 characters and at least 3 words. The main journey's
// reason ("Venue cannot hold more people", 29 characters, 5 words) satisfies both; the rule itself is the second test.
// Product defect: the product (change-request-review.service.ts parseReason and the client denialReasonError) enforces
// only the 10 to 500 character range, so the "at least 3 words" assertion is its own test.fixme, apart from the
// character-range test that passes.
// Notices (E2E-27 Note 2): counts and types are asserted, not the sentence. Coordinator 1 holds the submission notice
// (type coordinator_change_request) by design (SPM-64 AC3); the absence assertions are about the OUTCOME notice.
import { type APIResponse, type Page } from "@playwright/test";
import { type As, expect, test } from "../../../../../e2e/fixtures";

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";
const REFUSAL = [401, 403, 404];
const REASON = "Venue cannot hold more people";
const OUTCOME_NOTICE = /^change_request_(approved|denied)$/;

type Json = any; // response bodies are asserted field by field

async function ok(response: APIResponse, expected?: number): Promise<Json> {
  const text = await response.text();
  if (expected !== undefined) expect(response.status(), text).toBe(expected);
  else expect(response.ok(), `${response.status()} ${text}`).toBe(true);
  return text ? JSON.parse(text) : {};
}

const url = (path: string) => `${apiBase}${path}`;

const SCENE = {
  venues: { hall: { name: "E2E-27 Hall 100", capacity: 100, setupMinutes: 30, turnaroundMinutes: 45 } },
  events: {
    main: {
      name: "E2E-27 Workshop", status: "Planning" as const, venue: "hall", expectedAttendance: 40, capacity: 40, startInDays: 30, durationHours: 2,
      organiserEmail: "organiser1@connectsphere.test", coordinatorEmail: "coordinator1@connectsphere.test",
    },
  },
  registrations: [
    { event: "main", attendee: "attendee1@connectsphere.test" },
    { event: "main", attendee: "attendee2@connectsphere.test" },
    { event: "main", attendee: "attendee3@connectsphere.test" },
  ],
};

/** Opens the Request Change form on the event's change-request page and submits a new expected attendance. */
async function submitAttendanceRequest(page: Page, eventId: string, attendance: number) {
  await page.goto(`/events/${eventId}/change-requests`);
  await page.getByRole("button", { name: "Request Change", exact: true }).click();
  await page.locator("#change-attendance").fill(String(attendance));
  await page.getByRole("button", { name: "Submit Change Request" }).click();
}

test.describe("E2E-27 change request declined", () => {
  test.use({ as: "organiser" });

  test("E2E-27 the assigned Coordinator denies a request with a reason; nothing is applied and only the Organiser is told @P1", async ({ page, db, pageAs }) => {
    const scene = await db.scene(SCENE);
    const eventId = scene.events.main.id;
    const coordinatorPage = await pageAs("coordinator");
    const otherCoordinatorPage = await pageAs("coordinator2");
    const coordinator = coordinatorPage.request;
    const organiser = page.request;

    const planning = async () => ok(await coordinator.get(url(`/api/events/${eventId}/planning`)), 200);
    // The report carries a generatedAt timestamp that changes on every read; the registrations themselves are what must not change.
    const registrations = async () => (await ok(await coordinator.get(url(`/api/events/${eventId}/registrations/report`)), 200)).registrations as Json[];
    const settings = async () => ok(await coordinator.get(url(`/api/events/${eventId}/registration-settings`)), 200);
    const requests = async () => (await ok(await coordinator.get(url(`/api/events/${eventId}/change-requests`)), 200)) as Json[];
    const bookings = async () =>
      ((await planning()).venueBookings as Json[]).map(({ id, status, start, end, requestStatus }) => ({ id, status, start, end, requestStatus }));

    let before: { bookings: Json[]; registrations: Json[]; capacity: unknown };
    await test.step("Step 1: snapshot of the event, the booking and the registrations", async () => {
      const view = await planning();
      expect(view.event.expectedAttendance).toBe(40);
      expect(String(view.event.status).toLowerCase()).toBe("planning");
      before = { bookings: await bookings(), registrations: await registrations(), capacity: (await settings()).capacity };
      expect(before.capacity).toBe(40);
      expect(before.bookings).toHaveLength(1);
      expect(String(before.bookings[0].status)).toBe("Booked");
      expect(await requests()).toEqual([]);
    });

    // --- A. Submit ---------------------------------------------------------------------------------------------------
    await test.step("Step 2: Organiser 1 requests 150 and sees a confirmation and a pending status (SPM-64 AC4, AC5)", async () => {
      await submitAttendanceRequest(page, eventId, 150);
      await expect(page.getByText("Your change request for E2E-27 Workshop has been submitted for review.")).toBeVisible();
      await expect(page.getByText("Pending review").first()).toBeVisible();
      const [request] = await requests();
      expect(request.status).toBe("Pending");
    });
    const requestId = (await requests())[0].id as string;

    // --- B. Access ---------------------------------------------------------------------------------------------------
    await test.step("Step 3: Coordinator 2 (not assigned) cannot see or decide the request, by UI or API", async () => {
      await otherCoordinatorPage.goto(`/events/${eventId}/change-requests`);
      await expect(otherCoordinatorPage.getByRole("alert")).toBeVisible();
      await expect(otherCoordinatorPage.getByRole("heading", { name: /Change Requests/ })).toHaveCount(0);
      await expect(otherCoordinatorPage.getByText("Requested by")).toHaveCount(0);
      await expect(otherCoordinatorPage.getByText("E2E-27 Workshop")).toHaveCount(0);

      const read = await otherCoordinatorPage.request.get(url(`/api/events/${eventId}/change-requests`));
      expect(REFUSAL, `GET change-requests as Coordinator 2 was answered ${read.status()}`).toContain(read.status());
      expect(await read.text()).not.toContain(requestId);
      const deny = await otherCoordinatorPage.request.post(url(`/api/events/${eventId}/change-requests/${requestId}/deny`), { data: { reason: REASON } });
      expect(REFUSAL, `deny as Coordinator 2 was answered ${deny.status()}`).toContain(deny.status());
      expect((await requests())[0].status).toBe("Pending");
    });

    await test.step("Step 4: Organiser 1 has no Deny control; a deny call is refused and the request stays pending", async () => {
      await page.goto(`/events/${eventId}/change-requests`);
      await expect(page.getByText("Pending review").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Deny Change" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Approve Change" })).toHaveCount(0);
      const deny = await organiser.post(url(`/api/events/${eventId}/change-requests/${requestId}/deny`), { data: { reason: REASON } });
      expect(REFUSAL, `deny as Organiser 1 was answered ${deny.status()}`).toContain(deny.status());
      expect((await requests())[0].status).toBe("Pending");
    });

    // --- C. Review and deny ----------------------------------------------------------------------------------------------
    await test.step("Step 5: Coordinator 1 sees 40 to 150 and the venue conflict preview, which changes nothing (SPM-65 AC1 to AC3)", async () => {
      await coordinatorPage.goto(`/events/${eventId}/change-requests`);
      const row = coordinatorPage.getByRole("row", { name: /Expected attendance/ });
      await expect(row).toContainText("40");
      await expect(row).toContainText("150");
      const review = coordinatorPage.getByRole("region", { name: "Review this change request" });
      await expect(review.getByText("E2E-27 Hall 100")).toBeVisible();

      const preview = await ok(await coordinator.get(url(`/api/events/${eventId}/change-requests/${requestId}/conflicts`)), 200);
      expect(preview.hasConflicts).toBe(true);
      expect((preview.venueBookings as Json[]).map((item) => item.name)).toContain("E2E-27 Hall 100");
      expect(await bookings()).toEqual(before.bookings);
      expect((await planning()).event.expectedAttendance).toBe(40);
      expect(await registrations()).toEqual(before.registrations);
    });

    await test.step("Step 6: a denial without a reason is refused by the form and by the API; the request stays pending", async () => {
      const review = coordinatorPage.getByRole("region", { name: "Review this change request" });
      await review.getByRole("button", { name: "Deny Change" }).click();
      await review.getByRole("button", { name: "Confirm Denial" }).click();
      await expect(review.getByText("Please give a reason for denying this change.")).toBeVisible();
      const empty = await coordinator.post(url(`/api/events/${eventId}/change-requests/${requestId}/deny`), { data: { reason: "" } });
      expect(empty.status()).toBe(400);
      expect((await requests())[0].status).toBe("Pending");
    });

    await test.step("Step 7: Coordinator 1 denies with the reason and sees a confirmation (SPM-65 AC5, AC6)", async () => {
      const review = coordinatorPage.getByRole("region", { name: "Review this change request" });
      await review.getByLabel("Reason for denying").fill(REASON);
      await review.getByRole("button", { name: "Confirm Denial" }).click();
      await expect(coordinatorPage.getByText("The change request was denied. The organiser has been told why.")).toBeVisible();
    });

    // --- D. Outcome ------------------------------------------------------------------------------------------------------
    await test.step("Step 8: stored state: Denied with the reason; event, booking and registrations unchanged", async () => {
      const [request] = await requests();
      expect(request.status).toBe("Denied");
      expect(request.decisionReason).toBe(REASON);
      const view = await planning();
      expect(view.event.expectedAttendance).toBe(40);
      expect(String(view.event.status).toLowerCase()).toBe("planning");
      expect((await settings()).capacity).toBe(40);
      expect(await bookings()).toEqual(before.bookings);
      expect(await registrations()).toEqual(before.registrations);
    });

    await test.step("Step 9: the audit log and the event history record the denial (SPM-65 AC10, SPM-157 AC1, AC8)", async () => {
      const audit = (await ok(await coordinator.get(url(`/api/events/${eventId}/change-requests/audit`)), 200)) as Json[];
      expect(audit, "one audit entry for the denial").toHaveLength(1);
      expect(audit[0].outcome).toBe("Denied");
      expect(audit[0].reason).toBe(REASON);
      expect(audit[0].decidedBy).toMatch(/coordinator/i);
      expect(audit[0].changeRequestId).toBe(requestId);

      for (const [who, api] of [["Coordinator 1", coordinator], ["Organiser 1", organiser]] as const) {
        const history = await ok(await api.get(url(`/api/events/${eventId}/history`)), 200);
        const text = JSON.stringify(history.sections.event ?? []);
        expect(text, `${who}'s event history shows the denied request`).toMatch(/denied/i);
        expect(text, `${who}'s event history shows the reason`).toContain(REASON);
      }
    });

    await test.step("Step 10: Organiser 1 sees Denied and the reason; the event details are the original ones", async () => {
      await page.goto(`/events/${eventId}/change-requests`);
      await expect(page.getByText("Denied").first()).toBeVisible();
      await expect(page.getByText(REASON).first()).toBeVisible();
      const view = await ok(await organiser.get(url(`/api/events/${eventId}/planning`)), 200);
      expect(view.event.expectedAttendance).toBe(40);
    });

    await test.step("Step 11: Organiser 1 has exactly one outcome notice; nobody else has one", async () => {
      const noticesAbout = async (who: As) => {
        const context = who === "organiser1" ? organiser : (await pageAs(who)).request;
        const response = await context.get(url("/api/notifications"));
        if (REFUSAL.includes(response.status())) return [] as Json[]; // roles without an inbox hold nothing
        expect(response.status(), `GET /api/notifications as ${who}`).toBe(200);
        return ((await response.json()) as Json[]).filter((notice) => notice.relatedEventId === eventId);
      };
      const organiserNotices = await noticesAbout("organiser1");
      expect(organiserNotices.map((notice) => notice.type), "Organiser 1's notices about the event").toEqual(["change_request_denied"]);
      for (const who of ["coordinator1", "coordinator2", "lead", "venue_staff1", "attendee1", "attendee2", "attendee3"] as const) {
        const outcome = (await noticesAbout(who)).filter((notice) => OUTCOME_NOTICE.test(notice.type));
        expect(outcome, `${who} holds no outcome notice`).toEqual([]);
      }
    });
  });

  test("E2E-27 the denial reason must be 10 to 500 characters (SPM-190 Q3, character range) @P1", async ({ page, db, pageAs }) => {
    const scene = await db.scene(SCENE);
    const eventId = scene.events.main.id;
    const coordinator = (await pageAs("coordinator")).request;
    await submitAttendanceRequest(page, eventId, 150);
    await expect(page.getByText("Your change request for E2E-27 Workshop has been submitted for review.")).toBeVisible();
    const [request] = (await ok(await coordinator.get(url(`/api/events/${eventId}/change-requests`)), 200)) as Json[];
    const deny = (reason: string) => coordinator.post(url(`/api/events/${eventId}/change-requests/${request.id}/deny`), { data: { reason } });
    const status = async () => ((await ok(await coordinator.get(url(`/api/events/${eventId}/change-requests`)), 200)) as Json[])[0].status;

    // Each refused reason is tried against the pending request, so a wrongly accepted one would also close it.
    for (const [label, reason] of [
      ["blank", "   "],
      ["9 characters", "Too short"],
      ["501 characters", `${"word ".repeat(100)}x`.padEnd(501, "x")],
    ] as const) {
      const response = await deny(reason);
      expect(response.status(), `a ${label} reason`).toBe(400);
      expect(await status()).toBe("Pending");
    }

    await test.step("lower boundary: 10 characters in 3 words is accepted", async () => {
      const accepted = await deny("No fit now"); // 10 characters, 3 words
      await ok(accepted, 200);
      expect(await status()).toBe("Denied");
    });
  });

  // PRODUCT DEFECT (reported, no story covers it): SPM-190 Q3 requires a denial reason of at least 3 words, but the
  // product (change-request-review.service.ts parseReason and the client denialReasonError) enforces only the 10 to 500
  // character range, so a one-word reason of 11 characters ("Unavailable") is accepted. Remove the fixme once enforced.
  test.fixme("E2E-27 the denial reason must be at least 3 words (SPM-190 Q3, word count) @P1", async ({ page, db, pageAs }) => {
    const scene = await db.scene(SCENE);
    const eventId = scene.events.main.id;
    const coordinator = (await pageAs("coordinator")).request;
    await submitAttendanceRequest(page, eventId, 150);
    await expect(page.getByText("Your change request for E2E-27 Workshop has been submitted for review.")).toBeVisible();
    const [request] = (await ok(await coordinator.get(url(`/api/events/${eventId}/change-requests`)), 200)) as Json[];

    const response = await coordinator.post(url(`/api/events/${eventId}/change-requests/${request.id}/deny`), { data: { reason: "Unavailable" } });
    expect(response.status(), "a one-word reason of 11 characters").toBe(400);
    const [after] = (await ok(await coordinator.get(url(`/api/events/${eventId}/change-requests`)), 200)) as Json[];
    expect(after.status).toBe("Pending");
  });

  test("E2E-27 a request withdrawn before review is closed and changes nothing @P1", async ({ page, db, pageAs }) => {
    const scene = await db.scene(SCENE);
    const eventId = scene.events.main.id;
    const coordinatorPage = await pageAs("coordinator");
    const coordinator = coordinatorPage.request;
    const planning = async () => ok(await coordinator.get(url(`/api/events/${eventId}/planning`)), 200);
    const beforeView = await planning();

    await test.step("Step 12: Organiser 1 submits a second request (120) and withdraws it before review (SPM-64 AC8)", async () => {
      await submitAttendanceRequest(page, eventId, 120);
      await expect(page.getByText("Your change request for E2E-27 Workshop has been submitted for review.")).toBeVisible();
      await page.getByRole("button", { name: "Withdraw Request" }).click();
      await expect(page.getByText("Your change request was withdrawn.")).toBeVisible();
    });

    await test.step("SPM-65 AC11: the request is closed, Coordinator 1's list no longer shows it as pending, and the event is unchanged", async () => {
      const list = (await ok(await coordinator.get(url(`/api/events/${eventId}/change-requests`)), 200)) as Json[];
      expect(list.map((item) => item.status)).toEqual(["Withdrawn"]);
      await coordinatorPage.goto(`/events/${eventId}/change-requests`);
      await expect(coordinatorPage.getByText("Withdrawn").first()).toBeVisible();
      await expect(coordinatorPage.getByText("Pending review")).toHaveCount(0);
      await expect(coordinatorPage.getByRole("button", { name: "Deny Change" })).toHaveCount(0);
      const view = await planning();
      expect(view.event.expectedAttendance).toBe(beforeView.event.expectedAttendance);
      expect(view.lastUpdatedAt).toBe(beforeView.lastUpdatedAt);
      const audit = (await ok(await coordinator.get(url(`/api/events/${eventId}/change-requests/audit`)), 200)) as Json[];
      expect(audit.map((entry) => entry.outcome)).toEqual(["Withdrawn"]);
    });
  });
});
