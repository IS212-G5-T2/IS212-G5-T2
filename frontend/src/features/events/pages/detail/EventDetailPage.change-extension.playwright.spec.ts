// SPM-192 E2E-25: extension into the next event's turnaround (docs/test-cases/e2e/E2E-25.md).
//
// Stories: SPM-64, SPM-65, SPM-85, SPM-49, SPM-97, SPM-51, SPM-56.
// SPM-190 Q1 (resolved 2026-11-06): back-to-back is allowed (half-open intervals). Here only a real overlap of the
// occupied windows is a conflict, so the extension to 13:00 (45 minutes into B) is a conflict and the control that stops
// 1 minute short is not; the exact-touch row belongs to E2E-09.
// Builder gap (case pre-condition 4): `buildEvent` cannot place an event at 10:00 or 13:30, only "now plus N days" for
// "D hours". The events are therefore placed relative to the builder clock with a fractional `startInDays`, and every
// assertion is computed from the built rows (`startAt`, `endAt`), the same technique as the E2E-01 spec. Event A runs
// 2 hours from its start S and event B 2 hours from S + 3.5 hours, so A's occupied window ends at S + 2h45 and B's begins
// at S + 3h exactly as in the case (10:00 and 13:30 with a 30 minute setup and 45 minute turnaround). Form fields are
// Singapore time, so the typed values are converted from the UTC instants (SGT = UTC + 8, E2E-25 Note 6).
// Not asserted: the venue-schedule occupied windows of steps 1 and 11 (the schedule exposes no API and the entries
// are drawn from the booking's own window), see the report.
// EXPECTED PRODUCT MISMATCHES (for the Orchestrator, from reading event-impact.ts): the planning check uses a fixed
// 30 minute gap between events (TURNAROUND_MINUTES) instead of the venue's setup and turnaround, so (a) the preview and
// flag for the 13:00 extension are raised only as a "window" conflict, not attributed to B's turnaround, and (b) the
// 12:14 control is also outside the booking's held window and is flagged rather than applied. Those assertions follow the case.
import { type APIResponse } from "@playwright/test";
import { expect, test } from "../../../../../e2e/fixtures";

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";
const REFUSAL = [401, 403, 404];
const REASON = "Next booking needs the room";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

type Json = any; // response bodies are asserted field by field

async function ok(response: APIResponse, expected?: number): Promise<Json> {
  const text = await response.text();
  if (expected !== undefined) expect(response.status(), text).toBe(expected);
  else expect(response.ok(), `${response.status()} ${text}`).toBe(true);
  return text ? JSON.parse(text) : {};
}

const url = (path: string) => `${apiBase}${path}`;
/** A whole-minute instant: the Singapore form fields carry no seconds. */
const wholeMinute = (ms: number) => Math.floor(ms / MINUTE) * MINUTE;
/** The value of a `datetime-local` field showing `ms` in Singapore time (UTC+8). */
const sgtInput = (ms: number) => new Date(ms + 8 * HOUR).toISOString().slice(0, 16);

test.use({ as: "organiser" });

test.describe("E2E-25 extension into the next turnaround", () => {
  test("E2E-25 an extension that runs into the next event's turnaround is denied, flagged and rejected; one that stops short applies @P1", async ({ page, db, pageAs }) => {
    const scene = await db.scene({
      venues: { studio: { name: "E2E-25 Studio", capacity: 100, setupMinutes: 30, turnaroundMinutes: 45 } },
      events: {
        a: {
          name: "E2E-25 Event A", status: "Planning", venue: "studio", expectedAttendance: 20, startInDays: 30, durationHours: 2,
          organiserEmail: "organiser1@connectsphere.test", coordinatorEmail: "coordinator1@connectsphere.test",
        },
        b: {
          name: "E2E-25 Event B", status: "Planning", venue: "studio", expectedAttendance: 20, startInDays: 30 + 3.5 / 24, durationHours: 2,
          organiserEmail: "organiser2@connectsphere.test", coordinatorEmail: "coordinator2@connectsphere.test",
        },
      },
    });
    const a = scene.events.a;
    const b = scene.events.b;
    const coordinatorPage = await pageAs("coordinator");
    const otherCoordinator = (await pageAs("coordinator2")).request;
    const coordinator = coordinatorPage.request;
    const organiser = page.request;

    const planningOf = async (api: typeof coordinator, eventId: string) => ok(await api.get(url(`/api/events/${eventId}/planning`)), 200);
    const planningA = () => planningOf(coordinator, a.id);
    const bookingsOf = async (view: Json) =>
      (view.venueBookings as Json[]).map(({ id, status, start, end, requestStatus }) => ({ id, status, start, end, requestStatus }));
    const requests = async () => (await ok(await coordinator.get(url(`/api/events/${a.id}/change-requests`)), 200)) as Json[];
    const endMs = async () => Date.parse((await planningA()).event.endDateTime);

    // The three instants of the case, from the built rows. Occupied = booked window - setup / + turnaround.
    const aEnd = Date.parse(a.endAt);
    const bStart = Date.parse(b.startAt);
    const extendedEnd = wholeMinute(aEnd + HOUR); // 13:00 in the case
    const controlEnd = wholeMinute(aEnd + 14 * MINUTE); // 12:14 in the case
    const bOccupiedStart = bStart - 30 * MINUTE;
    expect(extendedEnd + 45 * MINUTE - bOccupiedStart, "the extension overlaps B's occupied window by about 45 minutes").toBeGreaterThan(40 * MINUTE);
    expect(extendedEnd, "without turnaround, A would still end before B starts").toBeLessThanOrEqual(bStart);
    expect(bOccupiedStart - (controlEnd + 45 * MINUTE), "the control stops about 1 minute short").toBeGreaterThanOrEqual(0);

    let before: { eventA: string; bookingsA: Json[]; bookingsB: Json[] };
    await test.step("Step 1: snapshot of event A and both approved bookings", async () => {
      const viewA = await planningA();
      const viewB = await planningOf(otherCoordinator, b.id);
      before = { eventA: viewA.event.endDateTime, bookingsA: await bookingsOf(viewA), bookingsB: await bookingsOf(viewB) };
      expect(before.bookingsA).toHaveLength(1);
      expect(before.bookingsB).toHaveLength(1);
      expect(before.bookingsA[0].status).toBe("Booked");
      expect(before.bookingsB[0].status).toBe("Booked");
      expect(Date.parse(before.bookingsA[0].end)).toBe(aEnd);
      expect(Date.parse(before.bookingsB[0].start)).toBe(bStart);
    });
    const unchanged = async () => {
      expect(await endMs(), "event A's end").toBe(Date.parse(before.eventA));
      expect(await bookingsOf(await planningA()), "A's booking").toEqual(before.bookingsA);
      expect(await bookingsOf(await planningOf(otherCoordinator, b.id)), "B's booking").toEqual(before.bookingsB);
    };

    // --- A. Organiser's change request ----------------------------------------------------------------------------------
    await test.step("Step 2: Organiser 1 asks to end A one hour later; confirmation shown, request pending, stored end unchanged (SPM-64 AC1, AC4, AC5)", async () => {
      await page.goto(`/events/${a.id}/change-requests`);
      await page.getByRole("button", { name: "Request Change", exact: true }).click();
      await page.locator("#change-end").fill(sgtInput(extendedEnd));
      await page.getByRole("button", { name: "Submit Change Request" }).click();
      await expect(page.getByText("Your change request for E2E-25 Event A has been submitted for review.")).toBeVisible();
      await expect(page.getByText("Pending review").first()).toBeVisible();
      const [request] = await requests();
      expect(request.status).toBe("Pending");
      expect((request.changes as Json[]).map((change) => change.field)).toEqual(["endDateTime"]);
      expect(Date.parse(request.changes[0].proposedValue)).toBe(extendedEnd);
      expect(await endMs()).toBe(Date.parse(before.eventA));
    });
    const requestId = (await requests())[0].id as string;

    await test.step("Step 3: Coordinator 1 sees the conflict with B's booking caused by A's turnaround; the preview changes nothing (SPM-65 AC3, SPM-85 AC3, SPM-56 AC3)", async () => {
      await coordinatorPage.goto(`/events/${a.id}/change-requests`);
      const review = coordinatorPage.getByRole("region", { name: "Review this change request" });
      await expect(review.getByText("E2E-25 Studio")).toBeVisible();

      const preview = await ok(await coordinator.get(url(`/api/events/${a.id}/change-requests/${requestId}/conflicts`)), 200);
      expect(preview.hasConflicts).toBe(true);
      const studio = (preview.venueBookings as Json[]).find((item) => item.name === "E2E-25 Studio");
      expect(studio, "A's booking at the Studio is listed as in conflict").toBeTruthy();
      const details = (studio.details as string[]).join(" | ");
      expect(details, "the conflict is attributed to B and to the turnaround").toMatch(/E2E-25 Event B/);
      expect(details).toMatch(/turnaround/i);
      await unchanged();
    });

    await test.step("Steps 4 and 5: Coordinator 1 denies with a reason; nothing is applied and no booking is touched (SPM-65 AC5)", async () => {
      const review = coordinatorPage.getByRole("region", { name: "Review this change request" });
      await review.getByRole("button", { name: "Deny Change" }).click();
      await review.getByLabel("Reason for denying").fill(REASON);
      await review.getByRole("button", { name: "Confirm Denial" }).click();
      await expect(coordinatorPage.getByText("The change request was denied. The organiser has been told why.")).toBeVisible();

      const [request] = await requests();
      expect(request.status).toBe("Denied");
      expect(request.decisionReason).toBe(REASON);
      await unchanged();
    });

    // --- B. Coordinator's direct edit -------------------------------------------------------------------------------------
    await test.step("Steps 6 and 7: the same extension as a direct edit is flagged with current and proposed ends; the stored end is unchanged (SPM-85 AC1 to AC3)", async () => {
      await coordinatorPage.goto(`/events/${a.id}`);
      await coordinatorPage.locator("#planning-end").fill(sgtInput(extendedEnd));
      await coordinatorPage.getByRole("button", { name: "Save changes" }).click();
      await expect(coordinatorPage.getByText(/sent for review/).first()).toBeVisible();
      await expect(coordinatorPage.getByTestId("pending-endDateTime")).toBeVisible();

      const view = await planningA();
      expect(view.pendingChanges).toHaveLength(1);
      const [change] = view.pendingChanges as Json[];
      expect(change.field).toBe("endDateTime");
      expect(Date.parse(change.currentValue)).toBe(Date.parse(before.eventA));
      expect(Date.parse(change.proposedValue)).toBe(extendedEnd);
      const impacted = (change.impacts as Json[]).filter((impact) => impact.impacted);
      expect(impacted.map((impact) => impact.venueName)).toEqual(["E2E-25 Studio"]);
      expect(JSON.stringify(impacted[0].conflicts), "the conflict names B and the turnaround").toMatch(/turnaround/i);
      expect(JSON.stringify(impacted[0].conflicts)).toMatch(/E2E-25 Event B/);
      expect(await endMs()).toBe(Date.parse(before.eventA));
    });

    await test.step("Step 8: Coordinator 1 rejects the flagged change; the end is unchanged and the history says Rejected with both values, a name and a time (SPM-85 AC4, AC6)", async () => {
      await coordinatorPage.getByRole("button", { name: "Reject Change", exact: true }).click();
      await expect.poll(async () => ((await planningA()).pendingChanges as Json[]).length).toBe(0);
      expect(await endMs()).toBe(Date.parse(before.eventA));

      const rows = (await ok(await coordinator.get(url(`/api/events/${a.id}/planning/history`)), 200)) as Json[];
      const rejected = rows.filter((row) => row.field === "endDateTime" && row.status === "Rejected");
      expect(rejected).toHaveLength(1);
      expect(Date.parse(rejected[0].originalValue)).toBe(Date.parse(before.eventA));
      expect(Date.parse(rejected[0].proposedValue)).toBe(extendedEnd);
      expect(rejected[0].resolvedBy).toMatch(/coordinator/i);
      expect(Date.parse(rejected[0].resolvedAt)).not.toBeNaN();
    });

    await test.step("Step 9: B's booking is unchanged and still Approved", async () => {
      await unchanged();
    });

    // --- C. One minute short (control) --------------------------------------------------------------------------------------
    await test.step("Steps 10 and 11: an end that leaves A's turnaround just short of B applies at once with no flag (SPM-49 AC5)", async () => {
      await coordinatorPage.goto(`/events/${a.id}`);
      await coordinatorPage.locator("#planning-end").fill(sgtInput(controlEnd));
      await coordinatorPage.getByRole("button", { name: "Save changes" }).click();
      await expect(coordinatorPage.getByText("Changes saved.")).toBeVisible();

      const view = await planningA();
      expect(Date.parse(view.event.endDateTime)).toBe(controlEnd);
      expect(view.pendingChanges).toEqual([]);
      expect(await bookingsOf(await planningOf(otherCoordinator, b.id))).toEqual(before.bookingsB);
    });

    // --- D. The Organiser cannot apply it either --------------------------------------------------------------------------
    await test.step("Step 12: Organiser 1 has no end-time edit control, and a direct update call is refused; A's end stays", async () => {
      await page.goto(`/events/${a.id}`);
      await expect(page.getByText("Planning Information").first()).toBeVisible();
      await expect(page.locator("#planning-end")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
      const attempt = await organiser.patch(url(`/api/events/${a.id}/planning`), { data: { endDateTime: new Date(extendedEnd).toISOString() } });
      expect(REFUSAL, `PATCH planning as Organiser 1 was answered ${attempt.status()}`).toContain(attempt.status());
      expect(await endMs()).toBe(controlEnd);
    });
  });
});
