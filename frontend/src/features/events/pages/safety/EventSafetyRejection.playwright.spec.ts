// SPM-192 E2E-20: Safety Officer rejects (SPM-130, SPM-131, SPM-48).
//
// Spec: docs/test-cases/e2e/E2E-20.md. SPM-190 Q2 is RESOLVED: rejection is revisable and the COORDINATOR (not the
// organiser) revises and resubmits for a new safety check, so step 10 applies and step 11 is inactive.
// The Safety Officer acts through the browser; the Coordinator, Venue Staff and Technical Support set-up and re-approval
// run through the real API as the real actors (no builders for booking requests, equipment requests or safety checks,
// case pre-condition 4), with the Coordinator's pages checked in the UI. "Database re-read" is the owning actor's API
// (arrangements-status, equipment requests, notifications, coordinator queue); the Playwright process has no SQL access.
import { type APIRequestContext, type Page } from "@playwright/test";
import { isoDateFromNow } from "../../../../../e2e/dates";
import { type As, expect, test } from "../../../../../e2e/fixtures";

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";

/** SPM-190 Q2 (RESOLVED 2026-11-06): rejection is revisable. A changed answer is a one-line edit here. */
const SAFETY_REJECTION_REVISABLE: boolean = true;

// --- Assumptions (refusal statuses are not fixed by an AC) --------------------------------------------------------
/** A refused call is 400 (invalid input), 401, 403, 404 (hidden), 409 (state) or 422. Membership only. */
const REFUSAL = [400, 401, 403, 404, 409, 422];
/** ASSUMPTION: confirm-before-approval is 422 (CONFIRM_BLOCKED), as in E2E-18. */
const CONFIRM_BLOCKED_STATUS = 422;
const PLANNING = "planning";

// --- Test data (E2E-20 Test Data) ---------------------------------------------------------------------------------
const D = isoDateFromNow(30); // the case's date; the builder places the event 30 days out, 10:00 to 12:00.
void D;
const ATTENDANCE = 60;
const MIC_POOL = 10;
const MIC_REQUEST = 5;
const EVENT_NAME = "E2E-20 Rejected event";
const HALL = { name: "E2E-20 Hall", capacity: 100, setupMinutes: 30, turnaroundMinutes: 45 };
const REASON = "Evacuation routes are too narrow for sixty guests";
const SO_CONFIRMATION = "Your safety decision has been submitted.";

type Json = Record<string, unknown>;
interface Notice { type: string; message: string; relatedEventId?: string }
interface ReviewItem { id: string; status: string; safetyReviewStatus?: string; venueName?: string; name?: string; quantity?: number }
interface Feedback { id: string; text: string; resolvedByCoordinatorAt?: string; reviewArrangements: { venueIds: string[]; equipmentIds: string[] } }
interface Checklist {
  venue: { items: ReviewItem[] };
  equipment: { items: ReviewItem[] };
  safetyCheck: { status: string; feedback?: Feedback[] };
}
interface EventRef { id: string; name: string; startAt: string; endAt: string }

async function json(response: { json(): Promise<unknown> }): Promise<Json> {
  return ((await response.json().catch(() => ({}))) ?? {}) as Json;
}

async function eventStatus(api: APIRequestContext, eventId: string): Promise<string> {
  const response = await api.get(`${apiBase}/api/events/${eventId}`);
  expect(response.ok(), "event readable by its coordinator").toBe(true);
  const body = await json(response);
  return String(body.status ?? (body.event as Json | undefined)?.status).toLowerCase();
}

/** The Coordinator's planning checklist (the stand-in for selecting booking, reservation and safety-check rows). */
async function checklist(api: APIRequestContext, eventId: string): Promise<Checklist> {
  const response = await api.get(`${apiBase}/api/events/${eventId}/arrangements-status`);
  expect(response.ok()).toBe(true);
  return ((await json(response)).checklist ?? {}) as Checklist;
}
const safetyStatus = async (api: APIRequestContext, eventId: string) => (await checklist(api, eventId)).safetyCheck.status;

async function notices(api: APIRequestContext): Promise<Notice[]> {
  const response = await api.get(`${apiBase}/api/notifications`);
  // Venue Staff, Technical Support and Safety Officer have no notification feed (403): "no notices" for this case.
  if (response.status() === 403) return [];
  expect(response.ok()).toBe(true);
  return (await response.json()) as Notice[];
}
const forEvent = (list: Notice[], eventId: string) => list.filter((n) => n.relatedEventId === eventId);
const safetyNotices = (list: Notice[], eventId: string) => forEvent(list, eventId).filter((n) => n.type === "coordinator_safety_response");

const statusChange = (api: APIRequestContext, eventId: string) =>
  api.post(`${apiBase}/api/events/${eventId}/status-change`, { data: { targetStatus: "Confirmed" } });
const decide = (api: APIRequestContext, eventId: string, body: Json) =>
  api.post(`${apiBase}/api/safety-officer/queue/${eventId}/decision`, { data: body });
const requestCheck = (api: APIRequestContext, eventId: string) =>
  api.post(`${apiBase}/api/events/${eventId}/safety-check/request`);

async function bookVenue(api: APIRequestContext, venueId: string, event: EventRef) {
  const response = await api.post(`${apiBase}/api/venues/${venueId}/booking-requests`, {
    data: { eventId: event.id, start: event.startAt, end: event.endAt },
  });
  expect(response.status()).toBe(201);
  return (await json(response)).id as string;
}

interface EquipmentRequest { id: string; eventId: string; status: string; items: Array<{ id: string; quantity: number }> }
async function equipmentRequestOf(api: APIRequestContext, eventId: string): Promise<EquipmentRequest> {
  const response = await api.get(`${apiBase}/api/equipment/requests`);
  expect(response.ok()).toBe(true);
  const found = ((await response.json()) as EquipmentRequest[]).find((r) => r.eventId === eventId);
  expect(found, "the event's equipment request is listed for its coordinator").toBeTruthy();
  return found!;
}

/** Pre-conditions 3 and 4: scene, then the UI-free build of "awaiting safety check" through the real actors. */
async function buildAwaitingCheck(
  db: { scene: (s: never) => Promise<{ venues: Record<string, { id: string }>; events: Record<string, EventRef> }> },
  pageAs: (who: As) => Promise<Page>,
  eventName: string,
) {
  const scene = await db.scene({
    venues: { hall: HALL },
    equipment: { mics: { type: "Audio", name: "Microphone", quantity: MIC_POOL } },
    events: { ev: { name: eventName, status: "Approved", expectedAttendance: ATTENDANCE } },
  } as never);
  const ev = scene.events.ev;
  const coordinatorPage = await pageAs("coordinator1");
  const coordinator = coordinatorPage.request;
  const venueStaff = (await pageAs("venue_staff1")).request;
  const techSupport = (await pageAs("tech_support1")).request;

  const bookingId = await bookVenue(coordinator, scene.venues.hall.id, ev);
  expect((await venueStaff.post(`${apiBase}/api/venues/bookings/${bookingId}/approve`, { data: {} })).ok()).toBe(true);
  const equipment = await coordinator.post(`${apiBase}/api/equipment/requests`, {
    data: { eventId: ev.id, items: [{ equipmentName: "Microphone", equipmentType: "Audio", quantity: MIC_REQUEST }] },
  });
  expect(equipment.status()).toBe(201);
  const requestId = (await json(equipment)).id as string;
  expect((await techSupport.patch(`${apiBase}/api/equipment/requests/${requestId}/reserve`)).ok()).toBe(true);
  expect((await requestCheck(coordinator, ev.id)).ok()).toBe(true);
  return { ev, hallId: scene.venues.hall.id, bookingId, requestId, coordinatorPage, coordinator, venueStaff, techSupport };
}
type World = Awaited<ReturnType<typeof buildAwaitingCheck>>;

/** Step 1 baseline: booking approved, reservation Reserved, safety check pending, event Planning. */
async function expectBaseline(w: World) {
  const c = await checklist(w.coordinator, w.ev.id);
  expect(c.venue.items.map((i) => i.status)).toEqual(["confirmed"]);
  expect(c.equipment.items.map((i) => i.status)).toEqual(["confirmed"]);
  expect(c.safetyCheck.status).toBe("pending");
  expect(await eventStatus(w.coordinator, w.ev.id)).toBe(PLANNING);
}


/** The Coordinator marks every feedback item handled, then resubmits (SPM-131 AC6). Resolving is required by the product
 *  (a re-request with unresolved feedback is refused 422) although no AC states it; see E2E-19 Note 5. */
async function resolveAndResubmit(w: World) {
  const feedback = (await checklist(w.coordinator, w.ev.id)).safetyCheck.feedback ?? [];
  expect(feedback.length).toBeGreaterThan(0);
  for (const item of feedback) {
    const resolved = await w.coordinator.post(`${apiBase}/api/events/${w.ev.id}/safety-check/feedback/${item.id}/resolve`);
    expect(resolved.ok()).toBe(true);
  }
  const resubmitted = await requestCheck(w.coordinator, w.ev.id);
  expect(resubmitted.ok()).toBe(true);
  expect(await safetyStatus(w.coordinator, w.ev.id)).toBe("pending");
}

/** Open /safety/events once the queue has loaded, so an absence check is not vacuous. */
async function openQueue(page: Page) {
  const loaded = page.waitForResponse((r) => r.url().includes("/api/safety-officer/queue") && r.request().method() === "GET");
  await page.goto("/safety/events");
  await loaded;
  await expect(page.getByRole("heading", { name: "Events Awaiting Safety Check" })).toBeVisible();
}

test.describe("E2E-20 safety officer rejects", () => {
  test.use({ as: "safety_officer" });

  test("rejection needs a reason, notifies the coordinator once, flags every arrangement and stays revisable @P1", async ({ page, db, pageAs }) => {
    const w = await buildAwaitingCheck(db, pageAs, EVENT_NAME);

    // Step 1: baseline.
    const baseline = await checklist(w.coordinator, w.ev.id);
    expect(baseline.venue.items.map((i) => i.status)).toEqual(["confirmed"]);
    expect(baseline.equipment.items.map((i) => i.status)).toEqual(["confirmed"]);
    expect(baseline.safetyCheck.status).toBe("pending");
    expect(await eventStatus(w.coordinator, w.ev.id)).toBe(PLANNING);

    // Step 2: an empty reason is refused by the UI (SPM-130 AC4); empty and whitespace-only reasons are refused by the API.
    await openQueue(page);
    await expect(page.getByText(EVENT_NAME)).toBeVisible();
    await page.getByRole("button", { name: "Review arrangements" }).click();
    await expect(page.getByRole("heading", { name: EVENT_NAME })).toBeVisible();
    await page.getByRole("button", { name: "Reject arrangement" }).click();
    await page.getByRole("button", { name: "Submit rejection" }).click();
    await expect(page.getByRole("alert")).toContainText("Enter a reason for rejection.");
    expect(REFUSAL).toContain((await decide(page.request, w.ev.id, { decision: "rejected" })).status());
    expect(REFUSAL).toContain((await decide(page.request, w.ev.id, { decision: "rejected", reason: "   " })).status());
    expect(await safetyStatus(w.coordinator, w.ev.id)).toBe("pending");
    expect((await checklist(w.coordinator, w.ev.id)).safetyCheck.feedback ?? []).toHaveLength(0);

    // Step 3: reject with a reason; confirmation shown (SPM-130 AC5).
    await page.getByLabel("Reason for rejection").fill(REASON);
    await page.getByRole("button", { name: "Submit rejection" }).click();
    await expect(page.getByRole("status")).toContainText(SO_CONFIRMATION);
    await page.getByRole("button", { name: "Return to queue" }).click();

    // Steps 3, 4 and 7 re-read: rejected, reason stored, event neither Cancelled nor Rejected, nothing deleted,
    // and BOTH arrangements flagged for re-review (SPM-131 AC5; the persisted form is the pending state plus feedback).
    const after = await checklist(w.coordinator, w.ev.id);
    expect(after.safetyCheck.status).toBe("rejected");
    expect(after.safetyCheck.feedback).toHaveLength(1);
    expect(after.safetyCheck.feedback![0].text).toBe(REASON);
    expect(after.safetyCheck.feedback![0].reviewArrangements.venueIds).toEqual([w.bookingId]);
    expect(after.safetyCheck.feedback![0].reviewArrangements.equipmentIds).toHaveLength(1);
    expect(after.venue.items).toHaveLength(1);
    expect(after.venue.items[0].status).not.toBe("confirmed");
    expect(after.venue.items[0].safetyReviewStatus).toBe("Pending review");
    expect(after.equipment.items).toHaveLength(1);
    expect(after.equipment.items[0].status).not.toBe("confirmed");
    expect(after.equipment.items[0].safetyReviewStatus).toBe("Pending review");
    expect(after.equipment.items[0].quantity).toBe(MIC_REQUEST);
    expect(await eventStatus(w.coordinator, w.ev.id)).toBe(PLANNING);

    // Step 4: left the queue; a second decision is refused.
    await openQueue(page);
    await expect(page.getByText(EVENT_NAME)).toHaveCount(0);
    expect(REFUSAL).toContain((await decide(page.request, w.ev.id, { decision: "approved" })).status());
    expect(REFUSAL).toContain((await decide(page.request, w.ev.id, { decision: "rejected", reason: REASON })).status());

    // Steps 5 and 6: exactly one notice; decision and reason visible; every arrangement marked; dashboard shows rejected.
    expect(safetyNotices(await notices(w.coordinator), w.ev.id)).toHaveLength(1);
    await w.coordinatorPage.goto(`/events/${w.ev.id}`);
    await expect(w.coordinatorPage.getByRole("heading", { name: "Rejection feedback" })).toBeVisible();
    await expect(w.coordinatorPage.getByText(REASON)).toBeVisible();
    await expect(w.coordinatorPage.getByText(`Venue: ${HALL.name}`)).toBeVisible();
    await expect(w.coordinatorPage.getByText("Equipment: Microphone")).toBeVisible();
    const queueResponse = await w.coordinator.get(`${apiBase}/api/coordinator/queue`);
    expect(queueResponse.ok()).toBe(true);
    const card = ((await queueResponse.json()) as Array<{ id: string; queue: { safety: string; actions: string[] } }>).find((e) => e.id === w.ev.id);
    expect(card?.queue.safety).toBe("REJECTED");
    expect(card?.queue.actions).toContain("SAFETY_REJECTED");

    // Step 8: Confirm refused by the UI and the API (SPM-131 AC3).
    const confirm = w.coordinatorPage.getByRole("button", { name: "Confirm Event" });
    await expect(confirm).toBeVisible();
    await expect(confirm).toBeDisabled();
    expect((await statusChange(w.coordinator, w.ev.id)).status()).toBe(CONFIRM_BLOCKED_STATUS);
    expect(await eventStatus(w.coordinator, w.ev.id)).toBe(PLANNING);

    // Step 9: absence (U7, Q7: the organiser is not notified).
    for (const who of ["organiser1", "lead", "venue_staff1", "tech_support1", "coordinator2", "attendee1"] as As[]) {
      const others = forEvent(await notices((await pageAs(who)).request), w.ev.id);
      expect(others.filter((n) => /safety/i.test(n.type)), `${who} has no safety notice`).toHaveLength(0);
    }

    if (SAFETY_REJECTION_REVISABLE) {
      // Step 10: Venue Staff and Technical Support re-approve; the COORDINATOR resolves the feedback and resubmits
      // (SPM-131 AC6; resolving is required by the product before a re-request, see E2E-19 Note 5). Stop at pending.
      expect((await w.venueStaff.post(`${apiBase}/api/venues/bookings/${w.bookingId}/approve`, { data: {} })).ok()).toBe(true);
      expect((await w.techSupport.patch(`${apiBase}/api/equipment/requests/${w.requestId}/reserve`)).ok()).toBe(true);
      await resolveAndResubmit(w);
      await openQueue(page);
      await expect(page.getByText(EVENT_NAME)).toBeVisible();
      expect(await safetyStatus(w.coordinator, w.ev.id)).toBe("pending");
      expect(await eventStatus(w.coordinator, w.ev.id)).toBe(PLANNING);
    } else {
      // Step 11 (inactive while SAFETY_REJECTION_REVISABLE is true): resubmission is refused and no new check appears.
      expect(REFUSAL).toContain((await requestCheck(w.coordinator, w.ev.id)).status());
      expect(await safetyStatus(w.coordinator, w.ev.id)).toBe("rejected");
    }
  });
});
