import { request as playwrightRequest, type APIResponse, type Page } from "@playwright/test";
import { emailOf } from "../../../../../../e2e/accounts";
import { isoDateFromNow } from "../../../../../../e2e/dates";
import { expect, test } from "../../../../../../e2e/fixtures";

/*
 * E2E-11 (docs/test-cases/e2e/E2E-11.md): a confirmed booking blocks a competing request, SPM-56/55/54/51/137. Two
 * Coordinators request overlapping slots at one venue, Venue Staff approve the first, the second can no longer be
 * approved or freshly submitted, and a later rejection tells coordinator2 alone.
 *
 * Decisions in force (SPM-190, 2026-11-06): Q1 back-to-back is allowed (the overlap here is over two hours, so the
 * boundary is not touched), Q3 a rejection reason is 10-500 characters and three words (REASON below is 34 characters,
 * six words), Q8 a hold blocks outright (no holds in this journey). Pending ordinary requests coexist (commit
 * ffa205b7), so coordinator2's overlapping request is accepted as Pending and refused only at approval ([S1]).
 *
 * Differences from the case text, all deliberate:
 *   - The builder has no start/end option, so `placeEvent` turns a Singapore wall time on day D into startInDays and
 *     durationHours. Events land up to a second after the stated time; the overlap is hours long so no result moves.
 *   - The Playwright process has no SQL access: every "database" check is an authenticated read of the product's API
 *     (_PREREQUISITES.md item 2).
 *   - The venue page prints the blocker's own booking window (10:00 to 12:00) in the submit-time alert, and the
 *     approval alert prints the occupied interval (09:30 to 12:45); each is asserted where it is printed.
 *   - Step 7's "no conflicting label for the Coordinator" is asserted as the case says: Pending, and no reason shown.
 */
test.use({ timezoneId: "Asia/Singapore", as: "coordinator" });

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";
const D = isoDateFromNow(30);
const SETUP_MINUTES = 30;
const TURNAROUND_MINUTES = 45;
const REASON = "Slot already taken by another event";
const hourMs = 3_600_000;
const dayMs = 24 * hourMs;
const at = (hhmm: string) => new Date(`${D}T${hhmm}:00+08:00`);

const NAMES = { hall: "E11 Hall", one: "E11 EC1 event", two: "E11 EC2 event", three: "E11 EC2 second event" } as const;

function placeEvent(name: string, start: string, end: string) {
  return {
    name,
    status: "Approved" as const,
    startInDays: (at(start).getTime() - Date.now()) / dayMs,
    durationHours: (at(end).getTime() - at(start).getTime()) / hourMs,
  };
}

interface Notice { type: string; message: string; relatedEventId: string | null }
interface MyBooking { id: string; eventId: string; venueId: string; status: string; bookingReference: string; rejectionReason?: string }
interface PendingRow { id: string; status: string }

const noticesOf = async (page: Page): Promise<Notice[]> => {
  const response = await page.request.get(`${apiBase}/api/notifications`);
  // Roles with no inbox are refused; they hold nothing.
  if ([401, 403, 404].includes(response.status())) return [];
  expect(response.status(), "GET /api/notifications").toBe(200);
  return (await response.json()) as Notice[];
};
const decisionNotices = async (page: Page) => (await noticesOf(page)).filter((n) => /Your booking of .* has been (approved|rejected)\./.test(n.message));
const myBookings = async (page: Page) => (await (await page.request.get(`${apiBase}/api/venues/bookings/mine`)).json()) as MyBooking[];
const bookingsFor = async (page: Page, eventId: string) => (await myBookings(page)).filter((b) => b.eventId === eventId);
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

/** The Coordinator's own booking journey for one event: venue page, check availability, submit. Returns the reference. */
async function submitThroughVenuePage(page: Page, venueId: string, eventId: string): Promise<string> {
  await page.goto(`/venue-records/${venueId}?eventId=${eventId}`);
  await expect(page.getByRole("heading", { name: NAMES.hall })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "This time is available for this venue." })).toBeVisible();
  await page.getByRole("button", { name: "Submit booking request" }).click();
  const confirmation = page.getByText(/Booking request submitted\. Reference: VB-[0-9A-F]{8}\./).first();
  await expect(confirmation).toBeVisible();
  return /VB-[0-9A-F]{8}/.exec(await confirmation.innerText())![0];
}

/** Venue Staff open one request from the Bookings review list and return its decision dialog. */
async function openReview(staff: Page, eventName: string) {
  await staff.goto("/bookings");
  const card = staff.locator("div").filter({ has: staff.getByRole("heading", { name: eventName, level: 3 }) })
    .filter({ has: staff.getByRole("button", { name: "Review Details" }) }).last();
  await card.getByRole("button", { name: "Review Details" }).click();
  const dialog = staff.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("E2E-11 confirmed booking blocks a competing request", () => {
  test("E2E-11 first approval wins, the competing request is unapprovable and unsubmittable, rejection tells EC2 alone @P1", async ({ page: coordinator1, db, pageAs }) => {
    test.setTimeout(240_000);
    const scene = await db.scene({
      venues: { hall: { name: NAMES.hall, capacity: 100, setupMinutes: SETUP_MINUTES, turnaroundMinutes: TURNAROUND_MINUTES } },
      events: {
        one: placeEvent(NAMES.one, "10:00", "12:00"),
        two: { ...placeEvent(NAMES.two, "11:00", "13:00"), coordinatorEmail: emailOf("coordinator2") },
        three: { ...placeEvent(NAMES.three, "11:00", "13:00"), coordinatorEmail: emailOf("coordinator2") },
      },
    });
    const hall = scene.venues.hall;
    const { one, two, three } = scene.events;
    const coordinator2 = await pageAs("coordinator2");
    const staff = await pageAs("venue_staff");
    const organiser = await pageAs("organiser");
    const lead = await pageAs("lead");

    let firstId = "";
    let secondId = "";

    await test.step("Step 1: coordinator1 requests the hall for 10:00-12:00; Pending with a reference", async () => {
      const reference = await submitThroughVenuePage(coordinator1, hall.id, one.id);
      const rows = await bookingsFor(coordinator1, one.id);
      expect(rows.map((b) => [b.venueId, b.status])).toEqual([[hall.id, "pending"]]);
      expect(rows[0].bookingReference).toBe(reference);
      firstId = rows[0].id;
    });

    await test.step("Step 2: coordinator2 requests the overlapping 11:00-13:00; accepted as Pending ([S1], pending requests coexist)", async () => {
      await submitThroughVenuePage(coordinator2, hall.id, two.id);
      const rows = await bookingsFor(coordinator2, two.id);
      expect(rows.map((b) => b.status)).toEqual(["pending"]);
      secondId = rows[0].id;
      const pending = (await staffRows(staff)).filter((b) => [firstId, secondId].includes(b.id));
      expect(pending.map((b) => b.status)).toEqual(["pending", "pending"]);
    });

    await test.step("Step 3: Venue Staff approve coordinator1's request (SPM-55 AC2)", async () => {
      const dialog = await openReview(staff, NAMES.one);
      await dialog.getByLabel(/Approve/).check();
      await dialog.getByRole("button", { name: "Submit Decision" }).click();
      await expect(dialog).toHaveCount(0);
      await expect.poll(async () => (await bookingsFor(coordinator1, one.id)).map((b) => b.status)).toEqual(["approved"]);
    });

    await test.step("Step 4: approving coordinator2's request shows a conflict alert with the full occupied interval; it stays Pending (SPM-56 AC1-3, AC6)", async () => {
      const dialog = await openReview(staff, NAMES.two);
      await dialog.getByLabel(/Approve/).check();
      await dialog.getByRole("button", { name: "Submit Decision" }).click();
      const alert = staff.getByRole("alert").filter({ hasText: /conflicts with/ });
      await expect(alert).toBeVisible();
      await expect(alert).toContainText(NAMES.one);
      // 10:00 - 30 min setup to 12:00 + 45 min turnaround; the alert must not present 10:00-12:00 alone as the blocker.
      await expect(alert).toContainText("09:30");
      await expect(alert).toContainText("12:45");
      expect((await staffRows(staff)).find((b) => b.id === secondId)?.status).toBe("pending");
      expect((await bookingsFor(coordinator2, two.id)).map((b) => b.status)).toEqual(["pending"]);
    });

    await test.step("Step 5: the refused approval created no notification; only coordinator1's approval exists (SPM-137 AC1, AC7)", async () => {
      expect((await decisionNotices(coordinator1)).map((n) => n.message)).toEqual([`Your booking of ${NAMES.hall} for "${NAMES.one}" has been approved.`]);
      expect(await decisionNotices(coordinator2)).toHaveLength(0);
      expect(await decisionNotices(organiser)).toHaveLength(0);
      expect(await decisionNotices(lead)).toHaveLength(0);
    });

    await test.step("Step 6: the same approval by API, unauthenticated and as a Coordinator is refused; rows and notices unchanged", async () => {
      expectRefused(await staff.request.post(`${apiBase}/api/venues/bookings/${secondId}/approve`), "staff approve of the competing request");
      expect((await unauthenticatedPost(`/api/venues/bookings/${secondId}/approve`, {})).status()).toBe(401);
      // ASSUMPTION [S2]: a Coordinator may not decide a booking; the exact code is not in an AC.
      expectRefused(await coordinator2.request.post(`${apiBase}/api/venues/bookings/${secondId}/approve`), "coordinator2 approve of her own request");
      expect((await staffRows(staff)).find((b) => b.id === secondId)?.status).toBe("pending");
      expect((await bookingsFor(coordinator2, two.id)).map((b) => b.status)).toEqual(["pending"]);
      expect(await decisionNotices(coordinator2)).toHaveLength(0);
      expect(await decisionNotices(coordinator1)).toHaveLength(1);
    });

    await test.step("Step 7: coordinator2's My Bookings shows Pending and no rejection reason; no conflict label is asserted (Note 1)", async () => {
      await coordinator2.goto("/bookings");
      const group = coordinator2.getByRole("region", { name: NAMES.two });
      await expect(group).toContainText(/pending/i);
      await expect(group).not.toContainText("Rejection reason");
    });

    await test.step("Step 8: coordinator2 cannot submit a fresh request for the slot and is told why (SPM-54 AC2, SPM-51 AC7)", async () => {
      await coordinator2.goto(`/venue-records/${hall.id}?eventId=${three.id}`);
      await expect(coordinator2.getByRole("heading", { name: NAMES.hall })).toBeVisible();
      const alert = coordinator2.getByRole("alert").filter({ hasText: "This time is unavailable" });
      await expect(alert).toBeVisible();
      await expect(alert).toContainText(NAMES.one);
      await expect(alert).toContainText("10:00");
      await expect(alert).toContainText("12:00");
      await expect(coordinator2.getByRole("button", { name: "Submit booking request" })).toHaveCount(0);
      expectRefused(
        await coordinator2.request.post(`${apiBase}/api/venues/${hall.id}/booking-requests`, { data: { eventId: three.id, start: three.startAt, end: three.endAt } }),
        "API submit for the blocked slot",
      );
      expect(await bookingsFor(coordinator2, three.id)).toHaveLength(0);
      expect(await eventStatus(coordinator2, three.id)).toBe("approved");
    });

    await test.step("Step 9: Venue Staff reject coordinator2's original request with a reason", async () => {
      const dialog = await openReview(staff, NAMES.two);
      await dialog.getByLabel(/Reject/).check();
      await dialog.getByLabel(/Rejection reason/).fill(REASON);
      await dialog.getByRole("button", { name: "Submit Decision" }).click();
      await expect(dialog).toHaveCount(0);
      await expect.poll(async () => (await bookingsFor(coordinator2, two.id)).map((b) => b.status)).toEqual(["rejected"]);
      expect((await bookingsFor(coordinator2, two.id))[0].rejectionReason).toBe(REASON);
    });

    await test.step("Step 10: coordinator2 alone gets the rejection notice, with the reason one click away (SPM-137 AC1-AC3)", async () => {
      const notices = await decisionNotices(coordinator2);
      expect(notices.map((n) => n.message)).toEqual([`Your booking of ${NAMES.hall} for "${NAMES.two}" has been rejected.`]);
      await coordinator2.goto("/events");
      await coordinator2.getByRole("button", { name: /^Notifications/ }).click();
      const bell = coordinator2.getByRole("dialog", { name: "Notifications" });
      const row = bell.getByRole("listitem").filter({ hasText: "has been rejected." });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(`Your booking of ${NAMES.hall} for "${NAMES.two}" has been rejected.`);
      await row.getByRole("link", { name: "View Booking" }).click();
      const details = coordinator2.getByRole("dialog");
      await expect(details).toContainText(/rejected/i);
      await expect(details).toContainText(REASON);
      // Nobody else hears of it, and the table holds exactly the two decisions.
      expect((await decisionNotices(coordinator1)).map((n) => n.message)).toEqual([`Your booking of ${NAMES.hall} for "${NAMES.one}" has been approved.`]);
      expect(await decisionNotices(organiser)).toHaveLength(0);
      expect(await decisionNotices(lead)).toHaveLength(0);
    });

    await test.step("Step 11: the rejected request offers no decision, and an API approve is refused (SPM-55 AC6)", async () => {
      await staff.goto("/bookings");
      await staff.getByLabel("Status filter").selectOption("rejected");
      const card = staff.locator("div").filter({ has: staff.getByRole("heading", { name: NAMES.two, level: 3 }) })
        .filter({ has: staff.getByRole("button", { name: "View Details" }) }).last();
      await card.getByRole("button", { name: "View Details" }).click();
      const dialog = staff.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Submit Decision" })).toHaveCount(0);
      await expect(dialog.getByLabel(/Approve/)).toHaveCount(0);
      expectRefused(await staff.request.post(`${apiBase}/api/venues/bookings/${secondId}/approve`), "approve of a rejected request");
      expect((await bookingsFor(coordinator2, two.id)).map((b) => b.status)).toEqual(["rejected"]);
      expect(await decisionNotices(coordinator2)).toHaveLength(1);
    });
  });
});
