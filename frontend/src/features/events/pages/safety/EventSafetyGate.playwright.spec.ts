// SPM-192 E2E-18: Safety gate enforced (SPM-129, SPM-130, SPM-131, SPM-135, SPM-128, SPM-148).
//
// Spec: docs/test-cases/e2e/E2E-18.md. The gate works both ways: the Safety Officer cannot see, open or decide an
// event whose venue and equipment are not confirmed, and the Coordinator cannot confirm before the Safety Officer
// approves. Every negative is asserted through the UI and by a direct API call, then the positive path runs once.
//
// Set-up: the builders do not make booking requests, equipment requests or safety checks (E2E-18 Note 7), so "early"
// and "ready" are built through the real API as the real actors, right after db.scene.
// "Database re-read": the Playwright process has no SQL access (db-cli only seeds), so state is re-read through the
// API of the owning actor (GET event, GET arrangements-status, GET notifications). See the builder gaps in the report.
import { type APIRequestContext, type Page } from "@playwright/test";
import { isoDateFromNow } from "../../../../../e2e/dates";
import { type As, expect, test } from "../../../../../e2e/fixtures";

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";

// --- Assumptions (E2E-18 Notes 3 and 5; refusal statuses are not fixed by an AC) ---------------------------------
/** A refused call is 401 (no session), 403 (wrong role or relationship) or 404 (hidden). Assert membership only. */
const REFUSAL = [401, 403, 404, 409, 422];
/** A refused role/relationship call (never 2xx). */
const ROLE_REFUSAL = [401, 403, 404];
/** Unauthenticated callers are refused 401 per the case (step 8). */
const UNAUTHENTICATED = 401;
/** ASSUMPTION: confirm-before-approval is 422 (backend uses CONFIRM_BLOCKED; the case suggests EVENT_NOT_CONFIRMABLE). */
const CONFIRM_BLOCKED_STATUS = 422;
const CONFIRM_BLOCKED_CODES = ["CONFIRM_BLOCKED", "EVENT_NOT_CONFIRMABLE"];
/** ASSUMPTION: no per-event safety page exists; the case allows a route per implementation. */
const safetyDetailUrl = (eventId: string) => `/safety/events/${eventId}`;
/** SPM-190 Q2 (resolved): a Safety Officer rejection leaves the event revisable. Not exercised here (E2E-18 approves). */
export const SAFETY_REJECTION_REVISABLE = true;
/** SPM-168 Q9 (resolved): Preparation and Confirmation are separate steps; the status flow is
 *  Submitted -> Approved -> Planning -> Confirmed. There is no "Preparation" status, so none is asserted. */
const STATUS_FLOW = ["submitted", "approved", "planning", "confirmed"] as const;
const PLANNING = STATUS_FLOW[2];
const CONFIRMED = STATUS_FLOW[3];

// --- Test data (E2E-18 Test Data) ---------------------------------------------------------------------------------
const ATTENDANCE = 60;
const VENUE_CAPACITY = 100;
const MIC_POOL = 10;
const MIC_REQUEST = 5;
const NAMES = { early: "E2E-18 early", ready: "E2E-18 ready", rejected: "E2E-18 rejected" } as const;
const D = isoDateFromNow(30); // documentation of the case's date; the builder places events 30 days out, 10:00 start.
void D;

const SCENE = {
  venues: { hall: { name: "E2E-18 Hall", capacity: VENUE_CAPACITY, setupMinutes: 30, turnaroundMinutes: 45 } },
  equipment: { mics: { type: "Audio" as const, name: "Microphone", quantity: MIC_POOL } },
  events: {
    early: { name: NAMES.early, status: "Approved" as const, expectedAttendance: ATTENDANCE, startInDays: 31 },
    ready: { name: NAMES.ready, status: "Approved" as const, expectedAttendance: ATTENDANCE },
    // The seed builder cannot write a Rejected row (events_rejection_reason_check needs a stored reason), so this one is
    // seeded Submitted and rejected through the product's own endpoint in buildWorld.
    rejected: { name: NAMES.rejected, status: "Submitted" as const, expectedAttendance: ATTENDANCE, startInDays: 32 },
  },
};

type Json = Record<string, unknown>;
interface Notice { type: string; message: string; relatedEventId?: string; read?: boolean }

async function json(response: { json(): Promise<unknown> }): Promise<Json> {
  return ((await response.json().catch(() => ({}))) ?? {}) as Json;
}

/** Event status, lower-cased (the API and UI hold it lower-case; tolerate either shape). */
async function eventStatus(api: APIRequestContext, eventId: string): Promise<string> {
  const response = await api.get(`${apiBase}/api/events/${eventId}`);
  expect(response.ok(), "event readable by its coordinator").toBe(true);
  const body = await json(response);
  const status = (body.status ?? (body.event as Json | undefined)?.status) as string;
  return String(status).toLowerCase();
}

/** Safety check state as the assigned coordinator sees it (re-read in place of a SQL select). */
async function safetyState(api: APIRequestContext, eventId: string): Promise<string> {
  const response = await api.get(`${apiBase}/api/events/${eventId}/arrangements-status`);
  expect(response.ok()).toBe(true);
  const body = await json(response);
  const checklist = (body.checklist ?? {}) as Json;
  const safety = (checklist.safetyCheck ?? checklist.safety ?? {}) as Json;
  return String(safety.status ?? "not_requested").toLowerCase();
}

async function notices(api: APIRequestContext): Promise<Notice[]> {
  const response = await api.get(`${apiBase}/api/notifications`);
  // GET /api/notifications is open only to Organiser, Coordinator, Lead and Attendee roles: Venue Staff, Technical Support
  // and Safety Officer get 403 because they have no notification feed at all, which is "no notices" for this case.
  if (response.status() === 403) return [];
  expect(response.ok()).toBe(true);
  return (await response.json()) as Notice[];
}
const forEvent = (list: Notice[], eventId: string) => list.filter((n) => n.relatedEventId === eventId);

async function bookHall(api: APIRequestContext, hallId: string, event: { id: string; startAt: string; endAt: string }) {
  const response = await api.post(`${apiBase}/api/venues/${hallId}/booking-requests`, {
    data: { eventId: event.id, start: event.startAt, end: event.endAt },
  });
  expect(response.status()).toBe(201);
  return (await json(response)).id as string;
}

interface World {
  hallId: string;
  early: { id: string; name: string };
  ready: { id: string; name: string };
  rejected: { id: string; name: string };
  earlyBookingId: string;
  readyBookingId: string;
}

/** The case's pre-conditions 3 and 4: scene, then "early" (pending hall) and "ready" (approved hall, 5 mics reserved). */
async function buildWorld(
  db: { scene: (s: typeof SCENE) => Promise<{ venues: Record<string, { id: string }>; events: Record<string, { id: string; name: string; startAt: string; endAt: string }> }> },
  pageAs: (who: As) => Promise<Page>,
): Promise<World> {
  const scene = await db.scene(SCENE);
  const { early, ready, rejected } = scene.events;
  const hallId = scene.venues.hall.id;
  const coordinator = (await pageAs("coordinator1")).request;
  const venueStaff = (await pageAs("venue_staff1")).request;
  const techSupport = (await pageAs("tech_support1")).request;

  // "rejected": the assigned coordinator rejects the Submitted request with a reason (SPM-83).
  const rejection = await coordinator.post(`${apiBase}/api/events/${rejected.id}/reject`, {
    data: { reason: "Rejected for the E2E-18 safety gate case" },
  });
  expect(rejection.ok(), "coordinator rejects the seeded request").toBe(true);

  // "early": the first venue request moves Approved to Planning (SPM-148 AC1); the request stays Pending.
  const earlyBookingId = await bookHall(coordinator, hallId, early);
  expect(await eventStatus(coordinator, early.id)).toBe(PLANNING);

  // "ready": hall requested and approved, 5 microphones requested and reserved. "early" is built a day later
  // (startInDays 31) so its pending hall request cannot clash with "ready"'s window; see the report.
  const readyBookingId = await bookHall(coordinator, hallId, ready);
  expect((await venueStaff.post(`${apiBase}/api/venues/bookings/${readyBookingId}/approve`, { data: {} })).ok()).toBe(true);
  const equipment = await coordinator.post(`${apiBase}/api/equipment/requests`, {
    data: { eventId: ready.id, items: [{ equipmentName: "Microphone", equipmentType: "Audio", quantity: MIC_REQUEST }] },
  });
  expect(equipment.status()).toBe(201);
  const requestId = (await json(equipment)).id as string;
  expect((await techSupport.patch(`${apiBase}/api/equipment/requests/${requestId}/reserve`)).ok()).toBe(true);
  expect(await eventStatus(coordinator, ready.id)).toBe(PLANNING);
  return { hallId, early, ready, rejected, earlyBookingId, readyBookingId };
}

const confirmBody = { targetStatus: "Confirmed" };
const statusChange = (api: APIRequestContext, eventId: string) =>
  api.post(`${apiBase}/api/events/${eventId}/status-change`, { data: confirmBody });
const decide = (api: APIRequestContext, eventId: string, decision = "approved") =>
  api.post(`${apiBase}/api/safety-officer/queue/${eventId}/decision`, { data: { decision } });
const requestCheck = (api: APIRequestContext, eventId: string) =>
  api.post(`${apiBase}/api/events/${eventId}/safety-check/request`);

/** Open /safety/events once the queue has loaded, so an absence check is not vacuous. */
async function openQueue(page: Page) {
  const loaded = page.waitForResponse((r) => r.url().includes("/api/safety-officer/queue") && r.request().method() === "GET");
  await page.goto("/safety/events");
  await loaded;
  await expect(page.getByRole("heading", { name: "Events Awaiting Safety Check" })).toBeVisible();
}

test.describe("E2E-18 safety gate enforced", () => {
  test.use({ as: "safety_officer" });

  // Steps 1 and 2 (SPM-129 AC6): the queue omits "early" and "ready"; the direct URL shows no event data.
  test("safety officer does not see unready events in the queue or by direct URL @P0", async ({ page, db, pageAs }) => {
    const w = await buildWorld(db, pageAs);
    await openQueue(page);
    await expect(page.getByText(NAMES.early)).toHaveCount(0);
    await expect(page.getByText(NAMES.ready)).toHaveCount(0);

    await page.goto(safetyDetailUrl(w.early.id));
    await expect(page.getByText(NAMES.early)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Approve arrangement" })).toHaveCount(0);
  });

  // Steps 3 and 4 (SPM-129 AC6, SPM-128 AC4): API refusals as the Safety Officer and as the Coordinator, state unchanged.
  test("safety officer API and coordinator safety request are refused for an event with a pending venue @P0", async ({ page, db, pageAs }) => {
    const w = await buildWorld(db, pageAs);
    const coordinator = await pageAs("coordinator1");

    expect(REFUSAL).toContain((await page.request.get(`${apiBase}/api/safety-officer/queue/${w.early.id}`)).status());
    expect(REFUSAL).toContain((await decide(page.request, w.early.id)).status());
    expect(await safetyState(coordinator.request, w.early.id)).toBe("not_requested");
    expect(await eventStatus(coordinator.request, w.early.id)).toBe(PLANNING);

    // Coordinator side: the control is unavailable (disabled or absent) and the API refuses.
    await coordinator.goto(`/events/${w.early.id}`);
    await expect(coordinator.getByRole("heading", { name: NAMES.early })).toBeVisible();
    const control = coordinator.getByRole("button", { name: /Request For Safety Check/i });
    if ((await control.count()) > 0) await expect(control).toBeDisabled();
    expect(REFUSAL).toContain((await requestCheck(coordinator.request, w.early.id)).status());
    expect(await safetyState(coordinator.request, w.early.id)).toBe("not_requested");
  });

  // Step 5 (SPM-129 AC1): venue approved but no equipment arrangement is still not enough.
  test("an event with an approved venue but no equipment stays out of the queue and refused @P0", async ({ page, db, pageAs }) => {
    const w = await buildWorld(db, pageAs);
    const venueStaff = (await pageAs("venue_staff1")).request;
    const coordinator = (await pageAs("coordinator1")).request;
    expect((await venueStaff.post(`${apiBase}/api/venues/bookings/${w.earlyBookingId}/approve`, { data: {} })).ok()).toBe(true);

    await openQueue(page);
    await expect(page.getByText(NAMES.early)).toHaveCount(0);
    expect(REFUSAL).toContain((await page.request.get(`${apiBase}/api/safety-officer/queue/${w.early.id}`)).status());
    expect(REFUSAL).toContain((await decide(page.request, w.early.id)).status());
    expect(REFUSAL).toContain((await requestCheck(coordinator, w.early.id)).status());
    expect(await safetyState(coordinator, w.early.id)).toBe("not_requested");
    expect(await eventStatus(coordinator, w.early.id)).toBe(PLANNING);
  });

  // Steps 6 and 7 (SPM-135 AC2/AC3, SPM-131 AC3): Confirm before approval, UI and API.
  test("coordinator cannot confirm before the safety officer approves @P0", async ({ db, pageAs }) => {
    const w = await buildWorld(db, pageAs);
    const coordinator = await pageAs("coordinator1");
    await coordinator.goto(`/events/${w.ready.id}`);
    const confirm = coordinator.getByRole("button", { name: "Confirm Event" });
    await expect(confirm).toBeVisible();
    await expect(confirm).toBeDisabled();
    await expect(coordinator.getByLabel("Pending")).toContainText(/safety check/i);

    const response = await statusChange(coordinator.request, w.ready.id);
    expect(response.status()).toBe(CONFIRM_BLOCKED_STATUS);
    const body = await json(response);
    expect(CONFIRM_BLOCKED_CODES).toContain(body.code);
    expect(String(body.message)).toMatch(/safety/i);
    expect(await eventStatus(coordinator.request, w.ready.id)).toBe(PLANNING);
    expect(await safetyState(coordinator.request, w.ready.id)).toBe("not_requested");
  });

  // Step 8 (SPM-128 AC4): no other role can confirm or decide.
  const outsiders: As[] = ["organiser1", "lead", "venue_staff1", "tech_support1", "coordinator2"];
  for (const who of outsiders) {
    test(`${who} cannot confirm or decide a safety check on a ready event @P0`, async ({ db, pageAs }) => {
      const w = await buildWorld(db, pageAs);
      const coordinator = (await pageAs("coordinator1")).request;
      const page = await pageAs(who);

      await page.goto(`/events/${w.ready.id}`);
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("button", { name: "Confirm Event" })).toHaveCount(0);

      expect(ROLE_REFUSAL).toContain((await statusChange(page.request, w.ready.id)).status());
      expect(ROLE_REFUSAL).toContain((await decide(page.request, w.ready.id)).status());
      expect(await eventStatus(coordinator, w.ready.id)).toBe(PLANNING);
      expect(await safetyState(coordinator, w.ready.id)).toBe("not_requested");
    });
  }

  // Step 8, coordinator1 posting a safety decision (only the Safety Officer decides).
  test("coordinator cannot post a safety decision @P0", async ({ db, pageAs }) => {
    const w = await buildWorld(db, pageAs);
    const coordinator = (await pageAs("coordinator1")).request;
    expect(ROLE_REFUSAL).toContain((await decide(coordinator, w.ready.id)).status());
    expect(await safetyState(coordinator, w.ready.id)).toBe("not_requested");
    expect(await eventStatus(coordinator, w.ready.id)).toBe(PLANNING);
    expect(forEvent(await notices(coordinator), w.ready.id).filter((n) => /safety/i.test(n.type))).toHaveLength(0);
  });

  // Step 9 (SPM-135 AC6): a Rejected event cannot be confirmed.
  test("a rejected event cannot be confirmed @P0", async ({ db, pageAs }) => {
    const w = await buildWorld(db, pageAs);
    const coordinator = (await pageAs("coordinator1")).request;
    const response = await statusChange(coordinator, w.rejected.id);
    expect(REFUSAL).toContain(response.status());
    expect(await eventStatus(coordinator, w.rejected.id)).toBe("rejected");
  });

  // Steps 10 to 16: the positive path, with the pending-state gate re-checked on the way.
  test("coordinator requests, safety officer approves, coordinator confirms, organiser is notified @P0", async ({ page, db, pageAs }) => {
    const w = await buildWorld(db, pageAs);
    const coordinatorPage = await pageAs("coordinator1");
    const coordinator = coordinatorPage.request;

    // Step 10: request the safety check.
    const requested = await requestCheck(coordinator, w.ready.id);
    expect(requested.ok()).toBe(true);
    expect(await safetyState(coordinator, w.ready.id)).toBe("pending");
    expect(await eventStatus(coordinator, w.ready.id)).toBe(PLANNING);

    // Step 11: the queue lists "ready" with attendance, venue and equipment.
    await openQueue(page);
    await expect(page.getByText(NAMES.ready)).toBeVisible();
    await expect(page.getByText(NAMES.early)).toHaveCount(0);
    await page.getByRole("button", { name: "Review arrangements" }).click();
    await expect(page.getByRole("heading", { name: NAMES.ready })).toBeVisible();
    await expect(page.getByText(`Expected attendance: ${ATTENDANCE}`).or(page.getByText(String(ATTENDANCE))).first()).toBeVisible();
    await expect(page.getByText("E2E-18 Hall").first()).toBeVisible();
    await expect(page.getByText(String(VENUE_CAPACITY)).first()).toBeVisible();
    await expect(page.getByText(/Microphone/).first()).toBeVisible();
    await expect(page.getByText(new RegExp(`\\b${MIC_REQUEST}\\b`)).first()).toBeVisible();

    // Step 12: still pending, so Confirm is refused by UI and API.
    await coordinatorPage.goto(`/events/${w.ready.id}`);
    await expect(coordinatorPage.getByRole("button", { name: "Confirm Event" })).toBeDisabled();
    expect((await statusChange(coordinator, w.ready.id)).status()).toBe(CONFIRM_BLOCKED_STATUS);
    expect(await eventStatus(coordinator, w.ready.id)).toBe(PLANNING);

    // Step 13: approve, see the confirmation, the event leaves the queue, a repeat decision is refused.
    await page.getByRole("button", { name: "Approve arrangement" }).click();
    await expect(page.getByRole("status")).toContainText("Your safety decision has been submitted.");
    await page.getByRole("button", { name: "Return to queue" }).click();
    await expect(page.getByText(NAMES.ready)).toHaveCount(0);
    expect(await safetyState(coordinator, w.ready.id)).toBe("approved");
    expect(REFUSAL).toContain((await decide(page.request, w.ready.id)).status());

    // Step 14: exactly one safety-response notice for the coordinator; none for anyone else.
    const coordinatorNotices = forEvent(await notices(coordinator), w.ready.id).filter((n) => n.type === "coordinator_safety_response");
    expect(coordinatorNotices).toHaveLength(1);
    await coordinatorPage.goto(`/events/${w.ready.id}`);
    await expect(coordinatorPage.getByText(/approved/i).first()).toBeVisible();
    for (const who of ["organiser1", "lead", "venue_staff1", "tech_support1", "coordinator2", "attendee1"] as As[]) {
      const others = forEvent(await notices((await pageAs(who)).request), w.ready.id);
      expect(others.filter((n) => /safety|EventConfirmed/i.test(n.type)), `${who} has no safety or confirmation notice yet`).toHaveLength(0);
    }

    // Step 15: confirm.
    await coordinatorPage.reload();
    await coordinatorPage.getByRole("button", { name: "Confirm Event" }).click();
    await expect(coordinatorPage.getByRole("status").filter({ hasText: `${NAMES.ready} has been confirmed.` })).toBeVisible();
    expect(await eventStatus(coordinator, w.ready.id)).toBe(CONFIRMED);

    // Step 16: organiser notified once, arrangements visible; attendee sees nothing internal.
    const organiser = await pageAs("organiser1");
    const confirmedNotices = forEvent(await notices(organiser.request), w.ready.id).filter((n) => n.type === "EventConfirmed");
    expect(confirmedNotices).toHaveLength(1);
    const arrangements = await organiser.request.get(`${apiBase}/api/events/${w.ready.id}/confirmed-arrangements`);
    expect(arrangements.status()).toBe(200);
    const arrangementBody = await json(arrangements);
    expect(JSON.stringify(arrangementBody.venueBookings)).toContain("E2E-18 Hall");
    expect(JSON.stringify(arrangementBody.equipment)).toContain("Microphone");
    await organiser.goto(`/events/${w.ready.id}`);
    await expect(organiser.getByRole("button", { name: "Confirm Event" })).toHaveCount(0);

    const attendee = await pageAs("attendee1");
    expect(forEvent(await notices(attendee.request), w.ready.id)).toHaveLength(0);
    expect(ROLE_REFUSAL).toContain((await attendee.request.get(`${apiBase}/api/events/${w.ready.id}/confirmed-arrangements`)).status());
  });
});

// Step 8, unauthenticated: the same calls with no session are refused 401 and the page redirects to login.
test.describe("E2E-18 unauthenticated caller", () => {
  test("unauthenticated confirm, decision and safety page are refused @P0", async ({ db, pageAs, playwright, page }) => {
    const w = await buildWorld(db, pageAs);
    const anonymous = await playwright.request.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      expect((await statusChange(anonymous, w.ready.id)).status()).toBe(UNAUTHENTICATED);
      expect((await decide(anonymous, w.ready.id)).status()).toBe(UNAUTHENTICATED);
    } finally {
      await anonymous.dispose();
    }
    await page.goto("/safety/events");
    await expect(page).toHaveURL(/\/login/);
    const coordinator = (await pageAs("coordinator1")).request;
    expect(await eventStatus(coordinator, w.ready.id)).toBe(PLANNING);
    expect(await safetyState(coordinator, w.ready.id)).toBe("not_requested");
  });
});
