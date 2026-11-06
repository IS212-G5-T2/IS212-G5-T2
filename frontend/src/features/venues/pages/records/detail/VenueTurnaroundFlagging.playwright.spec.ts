import { request as playwrightRequest, type APIResponse, type Page } from "@playwright/test";
import { emailOf } from "../../../../../../e2e/accounts";
import { isoDateFromNow } from "../../../../../../e2e/dates";
import { expect, test } from "../../../../../../e2e/fixtures";

/*
 * E2E-10 (docs/test-cases/e2e/E2E-10.md): raising a venue's turnaround time flags bookings that now clash,
 * SPM-121/125/51/157. Venue V has setup 30 and turnaround 15; A (10:00-12:00, coordinator1), B (13:00-14:00,
 * coordinator2) and C (16:00-17:00, coordinator3) are approved and clash with nothing. venue_staff1 raises the
 * turnaround to 60, so A now occupies 09:30-13:00 and B 12:30-15:00 (30 minutes of overlap) and C is untouched.
 *
 * Decisions in force (SPM-190, 2026-11-06): Q1 back-to-back allowed (the overlap is 30 minutes, so the boundary is not
 * touched), Q3 rejection reasons (no rejections here), Q8 holds block outright (no holds here).
 *
 * Differences from the case text, all deliberate:
 *   - Setup. The case has each Coordinator request V through the UI and Venue Staff approve through the review page.
 *     Those requests are the journey's pre-condition, not its subject (the subject is the venue edit), and E2E-08 and
 *     E2E-11 drive that UI path, so the three requests and approvals here use the same API calls the pages use.
 *   - The Playwright process has no SQL access: each "database" check is an authenticated read of the product's API
 *     (_PREREQUISITES.md item 2).
 *   - Open items stay soft, as the case says: which of A and B is "affected" (Note 2) is asserted as a non-empty subset
 *     of {A, B} excluding C, and the C-side history entry (Note 4) is recorded, not asserted.
 */
test.use({ timezoneId: "Asia/Singapore", as: "venue_staff" });

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";
const D = isoDateFromNow(30);
const SETUP_MINUTES = 30;
const OLD_TURNAROUND = 15;
const NEW_TURNAROUND = 60;
const hourMs = 3_600_000;
const dayMs = 24 * hourMs;
const at = (hhmm: string) => new Date(`${D}T${hhmm}:00+08:00`);
const NAMES = { venue: "E10 Hall V", a: "E10 A", b: "E10 B", c: "E10 C" } as const;

const placeEvent = (name: string, start: string, end: string, coordinator: "coordinator1" | "coordinator2" | "coordinator3") => ({
  name,
  status: "Approved" as const,
  coordinatorEmail: emailOf(coordinator),
  startInDays: (at(start).getTime() - Date.now()) / dayMs,
  durationHours: (at(end).getTime() - at(start).getTime()) / hourMs,
});

interface Notice { type: string; message: string; relatedEventId: string | null; read: boolean }
interface MyBooking { id: string; eventId: string; venueId: string; status: string; affected?: boolean }
interface VenueApi { id: string; setupTimeMinutes: number; turnaroundTimeMinutes: number }

const noticesOf = async (page: Page): Promise<Notice[]> => {
  const response = await page.request.get(`${apiBase}/api/notifications`);
  if ([401, 403, 404].includes(response.status())) return [];
  expect(response.status(), "GET /api/notifications").toBe(200);
  return (await response.json()) as Notice[];
};
const impactNotices = async (page: Page) => (await noticesOf(page)).filter((n) => n.type === "venue_timing_impact");
const mine = async (page: Page) => (await (await page.request.get(`${apiBase}/api/venues/bookings/mine`)).json()) as MyBooking[];
const getVenue = async (page: Page, id: string) => (await (await page.request.get(`${apiBase}/api/venues/${id}`)).json()) as VenueApi;

function expectRefused(response: APIResponse, what: string) {
  expect(response.status(), `${what} was answered ${response.status()}`).toBeGreaterThanOrEqual(400);
  expect(response.status(), `${what} was answered ${response.status()}`).toBeLessThan(500);
}

/** The venue-update body the edit form sends (see VenueEditPage submit). */
const updateBody = (turnaroundTimeMinutes: number) => ({
  name: NAMES.venue,
  location: "Browser Test Building",
  capacity: 100,
  facilities: ["Projector"],
  accessibility: [],
  layouts: ["Theatre"],
  operatingInformation: "Browser test venue",
  setupTimeMinutes: SETUP_MINUTES,
  turnaroundTimeMinutes,
});

test.describe("E2E-10 raising turnaround flags clashing bookings", () => {
  test("E2E-10 both bookings survive, the Coordinators of the listed ones are told, C and the rest are not @P1", async ({ page: staff, db, pageAs }) => {
    test.setTimeout(300_000);
    const scene = await db.scene({
      venues: { v: { name: NAMES.venue, capacity: 100, setupMinutes: SETUP_MINUTES, turnaroundMinutes: OLD_TURNAROUND } },
      events: {
        a: placeEvent(NAMES.a, "10:00", "12:00", "coordinator1"),
        b: placeEvent(NAMES.b, "13:00", "14:00", "coordinator2"),
        c: placeEvent(NAMES.c, "16:00", "17:00", "coordinator3"),
      },
    });
    const v = scene.venues.v;
    const { a, b, c } = scene.events;
    const coordinators = {
      [a.id]: await pageAs("coordinator1"),
      [b.id]: await pageAs("coordinator2"),
      [c.id]: await pageAs("coordinator3"),
    };
    const otherStaff = await pageAs("venue_staff2");
    const organiser = await pageAs("organiser");
    const lead = await pageAs("lead");

    const ids: Record<string, string> = {};

    await test.step("Step 1: setup. Each Coordinator requests V, venue_staff1 approves; all three are Approved and clash with nothing", async () => {
      for (const event of [a, b, c]) {
        const submitted = await coordinators[event.id].request.post(`${apiBase}/api/venues/${v.id}/booking-requests`, {
          data: { eventId: event.id, start: event.startAt, end: event.endAt },
        });
        expect(submitted.status(), `request for ${event.name}`).toBe(201);
        ids[event.id] = ((await submitted.json()) as { id: string }).id;
        const approved = await staff.request.post(`${apiBase}/api/venues/bookings/${ids[event.id]}/approve`);
        expect(approved.status(), `approval for ${event.name}`).toBe(201);
      }
      for (const event of [a, b, c]) {
        expect((await mine(coordinators[event.id])).filter((r) => r.eventId === event.id).map((r) => [r.id, r.status])).toEqual([[ids[event.id], "approved"]]);
      }
      // Old settings: A ends at 12:15 (12:00 + 15 min) and B begins at 12:30 (13:00 - 30 min); the calendar shows both.
      await coordinators[a.id].goto(`/venue-records/${v.id}?eventId=${a.id}`);
      const schedule = coordinators[a.id].getByRole("region", { name: "Venue schedule calendar" });
      await schedule.getByText("Turnaround buffer", { exact: true }).first().click();
      await expect(coordinators[a.id].getByRole("dialog")).toContainText("15 minutes after");
      await expect(coordinators[a.id].getByRole("dialog")).toContainText("12:15");
      await coordinators[a.id].keyboard.press("Escape");
    });

    let listed: string[] = [];
    await test.step("Step 2-4: venue_staff1 raises the turnaround to 60; the confirmation lists the affected bookings, never C (SPM-121 AC5, AC8; SPM-125 AC8)", async () => {
      await staff.goto(`/venue-records/${v.id}/edit`);
      await expect(staff.getByLabel(/^Venue name/)).toHaveValue(NAMES.venue);
      await expect(staff.getByLabel(/^Turnaround time/)).toHaveValue(String(OLD_TURNAROUND));
      await expect(staff.getByLabel(/^Setup time/)).toHaveValue(String(SETUP_MINUTES));
      await staff.getByLabel(/^Turnaround time/).fill(String(NEW_TURNAROUND));
      await staff.getByRole("button", { name: "Continue" }).click();
      await staff.getByRole("button", { name: "Save Changes" }).click();

      const confirmation = staff.getByRole("alert").filter({ hasText: "now affected by the changed setup or turnaround time" });
      await expect(confirmation).toBeVisible();
      const items = confirmation.getByRole("listitem");
      const texts = await items.allInnerTexts();
      expect(texts.length, "the affected list is not empty").toBeGreaterThan(0);
      listed = [NAMES.a, NAMES.b].filter((name) => texts.some((text) => text.includes(name)));
      expect(listed.length, "at least one of A and B is listed").toBeGreaterThan(0);
      // Nothing other than A and B is listed, and C never is (Note 2).
      expect(texts.filter((text) => ![NAMES.a, NAMES.b].some((name) => text.includes(name)))).toEqual([]);
      expect(texts.some((text) => text.includes(NAMES.c))).toBe(false);
      await expect(confirmation).toContainText("These bookings remain recorded and have not been removed.");
      // Each listed booking is marked with whether its Coordinator was notified, and the summary agrees.
      const notified = texts.filter((text) => text.includes("Coordinator notified")).length;
      await expect(confirmation).toContainText(
        notified > 0
          ? new RegExp(`Coordinators? of ${notified === 1 ? "1 booking has" : `${notified} bookings have`} been notified in-app`)
          : "No Event Coordinator was notified",
      );
    });

    await test.step("Step 5/11: turnaround 60 is stored; all three bookings still exist, approved, same ids; C is unchanged (SPM-121 AC8, SPM-51 AC9)", async () => {
      const stored = await getVenue(staff, v.id);
      expect([stored.setupTimeMinutes, stored.turnaroundTimeMinutes]).toEqual([SETUP_MINUTES, NEW_TURNAROUND]);
      for (const event of [a, b, c]) {
        const rows = (await mine(coordinators[event.id])).filter((r) => r.eventId === event.id);
        expect(rows.map((r) => [r.id, r.status]), `${event.name} still approved`).toEqual([[ids[event.id], "approved"]]);
      }
      // "Flagged" has no AC for its stored form (Note 1): record whether the product marks A and B, assert only that C is not.
      const flags = Object.fromEntries(await Promise.all([a, b, c].map(async (event) => [event.name, (await mine(coordinators[event.id]))[0]?.affected ?? false])));
      expect(flags[NAMES.c], "C carries no affected marker").toBe(false);
      test.info().annotations.push({ type: "flagged", description: `Stored 'affected' marker after the save: ${JSON.stringify(flags)} (Note 1: not asserted for A and B).` });
    });

    await test.step("Step 6: the calendar shows A's occupied window to 13:00, so a swapped setup/turnaround would be caught", async () => {
      const page = coordinators[a.id];
      await page.goto(`/venue-records/${v.id}?eventId=${a.id}`);
      const schedule = page.getByRole("region", { name: "Venue schedule calendar" });
      await schedule.getByText("Turnaround buffer", { exact: true }).first().click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText("60 minutes after");
      await expect(dialog).toContainText("13:00");
      await page.keyboard.press("Escape");
      await schedule.getByText("Setup buffer", { exact: true }).first().click();
      await expect(page.getByRole("dialog")).toContainText("30 minutes before");
      await page.keyboard.press("Escape");
    });

    await test.step("Step 7: exactly the Coordinators of the listed bookings hold one notice each; coordinator3, the Organiser and the Lead hold none (SPM-125 AC7-8, SPM-168 AC1)", async () => {
      const expected = new Map<string, number>([[a.id, 0], [b.id, 0], [c.id, 0]]);
      const rowsByEvent = new Map<string, Notice[]>();
      for (const event of [a, b, c]) rowsByEvent.set(event.id, (await impactNotices(coordinators[event.id])).filter((n) => n.relatedEventId === event.id));
      for (const event of [a, b]) expected.set(event.id, rowsByEvent.get(event.id)!.length);
      // Whoever was notified did so exactly once, and only for a listed booking.
      for (const event of [a, b]) expect(expected.get(event.id)).toBeLessThanOrEqual(1);
      expect(rowsByEvent.get(c.id)).toHaveLength(0);
      expect(await impactNotices(coordinators[c.id])).toHaveLength(0);
      const notifiedEvents = [a, b].filter((event) => expected.get(event.id) === 1);
      expect(notifiedEvents.length, "at least one Coordinator was told").toBeGreaterThan(0);
      for (const event of [a, b]) {
        const wasListed = listed.includes(event.name);
        if (!wasListed) expect(expected.get(event.id), `${event.name} was not listed, so its Coordinator is not told`).toBe(0);
      }
      for (const other of [organiser, lead, staff, otherStaff]) expect(await impactNotices(other)).toHaveLength(0);

      // The bell opens the Bookings page with that booking.
      const target = notifiedEvents[0];
      const page = coordinators[target.id];
      await page.goto("/events");
      await page.getByRole("button", { name: /^Notifications/ }).click();
      const bell = page.getByRole("dialog", { name: "Notifications" });
      const row = bell.getByRole("listitem").filter({ hasText: target.name });
      await expect(row).toHaveCount(1);
      await expect(row.getByRole("link", { name: "View Booking" })).toHaveAttribute("href", `/bookings?booking=${ids[target.id]}`);
    });

    await test.step("Step 8: the notified Coordinators' event history records the turnaround change by venue_staff1 (SPM-157 AC2, AC5)", async () => {
      const entriesFor = async (event: { id: string }) => {
        const response = await coordinators[event.id].request.get(`${apiBase}/api/events/${event.id}/history`);
        expect(response.status()).toBe(200);
        const body = (await response.json()) as { sections: { venueBookings?: Array<{ summary: string; actor: { name: string }; changes: Array<{ from: unknown; to: unknown }> }> } };
        return (body.sections.venueBookings ?? []).filter((entry) => /setup or turnaround/i.test(entry.summary));
      };
      for (const event of [a, b]) {
        if ((await impactNotices(coordinators[event.id])).length === 0) continue;
        const entries = await entriesFor(event);
        expect(entries.length, `${event.name} history records the venue change`).toBeGreaterThan(0);
        expect(entries[0].actor.name).toBe("Venue Staff 1");
        expect(JSON.stringify(entries[0].changes)).toContain(String(OLD_TURNAROUND));
        expect(JSON.stringify(entries[0].changes)).toContain(String(NEW_TURNAROUND));
      }
      // Note 4 [S1]: whether an unaffected booking also gets the entry is undecided; record it.
      const forC = await entriesFor(c);
      test.info().annotations.push({ type: "history-on-unaffected", description: `E10 C has ${forC.length} venue-change history entries (Note 4: recorded, not asserted).` });
    });

    await test.step("Step 9: venue_staff2 sees no edit control or no open form; a Coordinator cannot reach venue management (SPM-121 AC7)", async () => {
      await otherStaff.goto(`/venue-records/${v.id}/edit`);
      await expect(otherStaff.getByRole("alert").filter({ hasText: "You can only edit venues you created." })).toBeVisible();
      await coordinators[a.id].goto(`/venue-records/${v.id}/edit`);
      await expect(coordinators[a.id].getByRole("button", { name: "Save Changes" })).toHaveCount(0);
      await expect(coordinators[a.id].getByLabel(/^Turnaround time/)).toHaveCount(0);
    });

    await test.step("Step 10: the same update by API is refused for venue_staff2, a Coordinator and no session; turnaround stays 60", async () => {
      // ASSUMPTION [S2]: only the 4xx family and the unchanged value are pinned, not the code.
      const before = (await impactNotices(coordinators[a.id])).length + (await impactNotices(coordinators[b.id])).length;
      expectRefused(await otherStaff.request.patch(`${apiBase}/api/venues/${v.id}`, { data: updateBody(90) }), "venue_staff2 update");
      expectRefused(await coordinators[a.id].request.patch(`${apiBase}/api/venues/${v.id}`, { data: updateBody(90) }), "coordinator1 update");
      const anonymous = await playwrightRequest.newContext({ storageState: { cookies: [], origins: [] } });
      try {
        expect((await anonymous.patch(`${apiBase}/api/venues/${v.id}`, { data: updateBody(90) })).status()).toBe(401);
      } finally {
        await anonymous.dispose();
      }
      expect((await getVenue(staff, v.id)).turnaroundTimeMinutes).toBe(NEW_TURNAROUND);
      expect((await impactNotices(coordinators[a.id])).length + (await impactNotices(coordinators[b.id])).length).toBe(before);
    });

    await test.step("Step 11: nothing was silently deleted; the three bookings are unchanged", async () => {
      for (const event of [a, b, c]) {
        expect((await mine(coordinators[event.id])).filter((r) => r.eventId === event.id).map((r) => [r.id, r.status])).toEqual([[ids[event.id], "approved"]]);
      }
    });
  });
});
