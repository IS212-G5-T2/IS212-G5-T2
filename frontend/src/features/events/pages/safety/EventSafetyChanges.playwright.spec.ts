// SPM-192 E2E-19: Safety Officer requests changes, venue-side and equipment-side
// (SPM-130, SPM-131, SPM-129, SPM-65, SPM-58, SPM-55, SPM-157, SPM-48).
//
// Spec: docs/test-cases/e2e/E2E-19.md. Two independent runs on separate fresh databases (Note 8): run A flags the venue
// booking, run B flags the microphone reservation. The Safety Officer acts through the browser; the Coordinator, Venue
// Staff and Technical Support set-up steps run through the real API as the real actors (the builders do not make booking
// requests, equipment requests or safety checks, case pre-condition 4), with the Coordinator's pages checked in the UI.
// "Database re-read": the Playwright process has no SQL access, so state is re-read through the owning actor's API
// (arrangements-status, equipment requests, notifications, coordinator queue, history). See the builder gaps in the report.
import { type APIRequestContext, type Page } from "@playwright/test";
import { isoDateFromNow } from "../../../../../e2e/dates";
import { type As, expect, test } from "../../../../../e2e/fixtures";

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";

// --- Assumptions (refusal statuses and routes are not fixed by an AC) ---------------------------------------------
/** A refused call is 400 (invalid input), 401, 403, 404 (hidden), 409 (state) or 422. Membership only. */
const REFUSAL = [400, 401, 403, 404, 409, 422];
/** ASSUMPTION: confirm-before-approval is 422 (CONFIRM_BLOCKED), as in E2E-18. */
const CONFIRM_BLOCKED_STATUS = 422;
/** ASSUMPTION: the persisted form of "marked for review" is the pending state plus a feedback item (E2E-19 Note 3). */
const PLANNING = "planning";
const CONFIRMED = "confirmed";

// --- Test data (E2E-19 Test Data) ---------------------------------------------------------------------------------
const D = isoDateFromNow(30); // the case's date; the builder places the event 30 days out, 10:00 to 12:00.
void D;
const ATTENDANCE = 60;
const MIC_POOL = 10;
const MIC_REQUEST = 5;
const MIC_AMENDED = 4;
const HALL_A = { name: "E2E-19 Hall A", capacity: 80, setupMinutes: 30, turnaroundMinutes: 45 };
const HALL_B = { name: "E2E-19 Hall B", capacity: 120, setupMinutes: 20, turnaroundMinutes: 30 };
const VENUE_COMMENT = "Seating layout blocks the left exit for 60 people";
const EQUIPMENT_COMMENT = "Cable run crosses the exit route";
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
    venues: { hallA: HALL_A, hallB: HALL_B },
    equipment: { mics: { type: "Audio", name: "Microphone", quantity: MIC_POOL } },
    events: { ev: { name: eventName, status: "Approved", expectedAttendance: ATTENDANCE } },
  } as never);
  const ev = scene.events.ev;
  const coordinatorPage = await pageAs("coordinator1");
  const coordinator = coordinatorPage.request;
  const venueStaff = (await pageAs("venue_staff1")).request;
  const techSupport = (await pageAs("tech_support1")).request;

  const hallABookingId = await bookVenue(coordinator, scene.venues.hallA.id, ev);
  expect((await venueStaff.post(`${apiBase}/api/venues/bookings/${hallABookingId}/approve`, { data: {} })).ok()).toBe(true);
  const equipment = await coordinator.post(`${apiBase}/api/equipment/requests`, {
    data: { eventId: ev.id, items: [{ equipmentName: "Microphone", equipmentType: "Audio", quantity: MIC_REQUEST }] },
  });
  expect(equipment.status()).toBe(201);
  const requestId = (await json(equipment)).id as string;
  expect((await techSupport.patch(`${apiBase}/api/equipment/requests/${requestId}/reserve`)).ok()).toBe(true);
  expect((await requestCheck(coordinator, ev.id)).ok()).toBe(true);
  return { ev, hallAId: scene.venues.hallA.id, hallBId: scene.venues.hallB.id, hallABookingId, requestId, coordinatorPage, coordinator, venueStaff, techSupport };
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

/** Open /safety/events once the queue has loaded, so an absence check is not vacuous. */
async function openQueue(page: Page) {
  const loaded = page.waitForResponse((r) => r.url().includes("/api/safety-officer/queue") && r.request().method() === "GET");
  await page.goto("/safety/events");
  await loaded;
  await expect(page.getByRole("heading", { name: "Events Awaiting Safety Check" })).toBeVisible();
}
async function openEvent(page: Page, name: string) {
  await openQueue(page);
  await expect(page.getByText(name)).toBeVisible();
  await page.getByRole("button", { name: "Review arrangements" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

/** Steps 2 and 11: an empty description is refused by the UI (SPM-130 AC4) and by the API, and changes nothing. */
async function expectEmptyChangeRefused(page: Page, w: World) {
  await page.getByRole("button", { name: "Request changes" }).click();
  await page.getByRole("button", { name: "Submit change request" }).click();
  await expect(page.getByRole("alert")).toContainText(/cannot be blank|description/i);
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(REFUSAL).toContain((await decide(page.request, w.ev.id, { decision: "changes_needed", changes: [] })).status());
  expect(await safetyStatus(w.coordinator, w.ev.id)).toBe("pending");
  expect((await checklist(w.coordinator, w.ev.id)).safetyCheck.feedback ?? []).toHaveLength(0);
}

/** Steps 3 and 12: request changes naming exactly one arrangement, see the confirmation, leave the queue (SPM-129 AC5). */
async function requestChanges(page: Page, w: World, comment: string, arrangementLabel: string) {
  await page.getByRole("button", { name: "Request changes" }).click();
  await page.getByRole("textbox", { name: "Change" }).first().fill(comment);
  await page.getByLabel(arrangementLabel).check();
  await page.getByRole("button", { name: "Submit change request" }).click();
  await expect(page.getByRole("status")).toContainText(SO_CONFIRMATION);
  await page.getByRole("button", { name: "Return to queue" }).click();
  await expect(page.getByText(w.ev.name)).toHaveCount(0);
}

/** Absence checks: nobody but the assigned Coordinator is told of the Safety Officer's response (Note 6). */
async function expectNoOtherSafetyNotice(pageAs: (who: As) => Promise<Page>, eventId: string) {
  for (const who of ["organiser1", "lead", "venue_staff1", "tech_support1", "coordinator2", "attendee1"] as As[]) {
    const others = forEvent(await notices((await pageAs(who)).request), eventId);
    expect(others.filter((n) => /safety/i.test(n.type)), `${who} has no safety notice`).toHaveLength(0);
  }
}

/** Step 6 and 13: Confirm refused by the UI and by the API, status unchanged (SPM-131 AC3). */
async function expectCannotConfirm(w: World) {
  await w.coordinatorPage.goto(`/events/${w.ev.id}`);
  const confirm = w.coordinatorPage.getByRole("button", { name: "Confirm Event" });
  await expect(confirm).toBeVisible();
  await expect(confirm).toBeDisabled();
  expect((await statusChange(w.coordinator, w.ev.id)).status()).toBe(CONFIRM_BLOCKED_STATUS);
  expect(await eventStatus(w.coordinator, w.ev.id)).toBe(PLANNING);
}

/** The Coordinator marks every feedback item handled, then resubmits (SPM-131 AC6). The resolve step is required by the
 *  product (a re-request with unresolved feedback is refused 422) although no AC states it; see E2E-19 Note 5. */
async function resolveAndResubmit(w: World) {
  const feedback = (await checklist(w.coordinator, w.ev.id)).safetyCheck.feedback ?? [];
  // Replacing the flagged arrangement (run A cancels the hall A booking) already drops its feedback item from the
  // checklist, so there may be nothing left to resolve; run B keeps its reservation and resolves the item.
  for (const item of feedback) {
    const resolved = await w.coordinator.post(`${apiBase}/api/events/${w.ev.id}/safety-check/feedback/${item.id}/resolve`);
    expect(resolved.ok()).toBe(true);
  }
  const resubmitted = await requestCheck(w.coordinator, w.ev.id);
  expect(resubmitted.ok()).toBe(true);
  expect(await safetyStatus(w.coordinator, w.ev.id)).toBe("pending");
}

test.describe("E2E-19 safety officer requests changes", () => {
  test.use({ as: "safety_officer" });

  // Steps 1 to 10, 16: run A, venue-side.
  test("run A: venue change is returned for review, replaced, re-approved and confirmed @P1", async ({ page, db, pageAs }) => {
    const name = "E2E-19 Run A event";
    const w = await buildAwaitingCheck(db, pageAs, name);
    await expectBaseline(w);

    // Steps 2 and 3.
    await openEvent(page, name);
    await expectEmptyChangeRefused(page, w);
    await requestChanges(page, w, VENUE_COMMENT, `${HALL_A.name} (venue)`);

    // Step 3 re-read: outcome stored, only the hall A booking is back under review, nothing deleted.
    const after = await checklist(w.coordinator, w.ev.id);
    expect(after.safetyCheck.status).toBe("changes_needed");
    expect(after.safetyCheck.feedback).toHaveLength(1);
    expect(after.safetyCheck.feedback![0].text).toBe(VENUE_COMMENT);
    expect(after.safetyCheck.feedback![0].reviewArrangements).toEqual({ venueIds: [w.hallABookingId], equipmentIds: [] });
    expect(after.venue.items).toHaveLength(1);
    expect(after.venue.items[0].id).toBe(w.hallABookingId);
    expect(after.venue.items[0].status).not.toBe("confirmed");
    expect(after.venue.items[0].safetyReviewStatus).toBe("Pending review");
    expect(after.equipment.items.map((i) => i.status)).toEqual(["confirmed"]);
    expect(after.equipment.items[0].safetyReviewStatus).toBeUndefined();
    expect(after.equipment.items[0].quantity).toBe(MIC_REQUEST);
    expect(await eventStatus(w.coordinator, w.ev.id)).toBe(PLANNING);

    // Step 4: the event left the queue and a repeat decision is refused.
    expect(REFUSAL).toContain((await decide(page.request, w.ev.id, { decision: "approved" })).status());

    // Step 5: exactly one new notice; the decision, the comment and the affected arrangement are visible.
    expect(safetyNotices(await notices(w.coordinator), w.ev.id)).toHaveLength(1);
    await w.coordinatorPage.goto(`/events/${w.ev.id}`);
    await expect(w.coordinatorPage.getByRole("heading", { name: "Changes needed" })).toBeVisible();
    await expect(w.coordinatorPage.getByText(VENUE_COMMENT)).toBeVisible();
    await expect(w.coordinatorPage.getByText(`Venue: ${HALL_A.name}`)).toBeVisible();
    await expect(w.coordinatorPage.getByText("Equipment: Microphone")).toHaveCount(0);
    const queueResponse = await w.coordinator.get(`${apiBase}/api/coordinator/queue`);
    expect(queueResponse.ok()).toBe(true);
    const card = ((await queueResponse.json()) as Array<{ id: string; queue: { safety: string; actions: string[] } }>).find((e) => e.id === w.ev.id);
    expect(card?.queue.safety).toBe("CHANGES_REQUESTED");
    expect(card?.queue.actions).toContain("SAFETY_CHANGES_REQUESTED");
    await expectNoOtherSafetyNotice(pageAs, w.ev.id);

    // Step 6.
    await expectCannotConfirm(w);

    // Step 7: replacement venue hall B approved, flagged hall A request cancelled (ASSUMPTION, Note 3).
    const hallBBookingId = await bookVenue(w.coordinator, w.hallBId, w.ev);
    expect((await w.venueStaff.post(`${apiBase}/api/venues/bookings/${hallBBookingId}/approve`, { data: {} })).ok()).toBe(true);
    const cancelled = await w.coordinator.post(`${apiBase}/api/venues/bookings/${w.hallABookingId}/cancel`, { data: { confirmed: true } });
    expect(cancelled.ok()).toBe(true);
    const revised = await checklist(w.coordinator, w.ev.id);
    expect(revised.venue.items.map((i) => [i.id, i.status])).toContainEqual([hallBBookingId, "confirmed"]);
    expect(revised.equipment.items.map((i) => i.status)).toEqual(["confirmed"]);

    // Step 8: resubmit; the earlier changes-needed outcome stays in the event history (SPM-157 AC1).
    await resolveAndResubmit(w);
    const history = await w.coordinator.get(`${apiBase}/api/events/${w.ev.id}/history`);
    expect(history.ok()).toBe(true);
    expect(JSON.stringify(await history.json())).toMatch(/safety/i);

    // Step 9: the Safety Officer sees it again with hall B (capacity 120) and the microphones, and approves.
    await openEvent(page, name);
    await expect(page.getByText(HALL_B.name).first()).toBeVisible();
    await expect(page.getByText(`Capacity: ${HALL_B.capacity}`)).toBeVisible();
    await expect(page.getByText(`Microphone: ${MIC_REQUEST}`)).toBeVisible();
    await page.getByRole("button", { name: "Approve arrangement" }).click();
    await expect(page.getByRole("status")).toContainText(SO_CONFIRMATION);
    await page.getByRole("button", { name: "Return to queue" }).click();
    await expect(page.getByText(name)).toHaveCount(0);
    expect(await safetyStatus(w.coordinator, w.ev.id)).toBe("approved");

    // Step 10: one further notice; Confirm now succeeds.
    expect(safetyNotices(await notices(w.coordinator), w.ev.id)).toHaveLength(2);
    await w.coordinatorPage.goto(`/events/${w.ev.id}`);
    await expect(w.coordinatorPage.getByRole("button", { name: "Confirm Event" })).toBeEnabled();
    expect((await statusChange(w.coordinator, w.ev.id)).ok()).toBe(true);
    expect(await eventStatus(w.coordinator, w.ev.id)).toBe(CONFIRMED);

    // Step 16: Venue Staff and Technical Support are told nothing by the safety response (organiser: confirmation only).
    for (const who of ["venue_staff1", "tech_support1"] as As[])
      expect(forEvent(await notices((await pageAs(who)).request), w.ev.id).filter((n) => /safety/i.test(n.type))).toHaveLength(0);
  });

  // Steps 11 to 16: run B, equipment-side.
  test("run B: equipment change is returned for review, amended, re-reserved and confirmed @P1", async ({ page, db, pageAs }) => {
    const name = "E2E-19 Run B event";
    const w = await buildAwaitingCheck(db, pageAs, name);
    await expectBaseline(w);

    // Steps 11 and 12.
    await openEvent(page, name);
    await expectEmptyChangeRefused(page, w);
    await requestChanges(page, w, EQUIPMENT_COMMENT, "Microphone (equipment)");

    const after = await checklist(w.coordinator, w.ev.id);
    expect(after.safetyCheck.status).toBe("changes_needed");
    expect(after.safetyCheck.feedback).toHaveLength(1);
    expect(after.safetyCheck.feedback![0].text).toBe(EQUIPMENT_COMMENT);
    expect(after.safetyCheck.feedback![0].reviewArrangements.venueIds).toEqual([]);
    expect(after.safetyCheck.feedback![0].reviewArrangements.equipmentIds).toHaveLength(1);
    expect(after.equipment.items).toHaveLength(1);
    expect(after.equipment.items[0].status).not.toBe("confirmed");
    expect(after.equipment.items[0].safetyReviewStatus).toBe("Pending review");
    expect(after.venue.items.map((i) => i.status)).toEqual(["confirmed"]);
    expect(after.venue.items[0].id).toBe(w.hallABookingId);
    expect(after.venue.items[0].safetyReviewStatus).toBeUndefined();
    expect(await eventStatus(w.coordinator, w.ev.id)).toBe(PLANNING);
    const request = await equipmentRequestOf(w.coordinator, w.ev.id);
    expect(request.status).toBe("Pending Review");

    // Step 13: one notice, the decision, the comment, only the equipment marked; Confirm refused.
    expect(safetyNotices(await notices(w.coordinator), w.ev.id)).toHaveLength(1);
    await w.coordinatorPage.goto(`/events/${w.ev.id}`);
    await expect(w.coordinatorPage.getByRole("heading", { name: "Changes needed" })).toBeVisible();
    await expect(w.coordinatorPage.getByText(EQUIPMENT_COMMENT)).toBeVisible();
    await expect(w.coordinatorPage.getByText("Equipment: Microphone")).toBeVisible();
    await expect(w.coordinatorPage.getByText(`Venue: ${HALL_A.name}`)).toHaveCount(0);
    await expectNoOtherSafetyNotice(pageAs, w.ev.id);
    await expectCannotConfirm(w);

    // Step 14: Technical Support sees it as Pending Review; the Coordinator amends (update) to 4; it is re-reserved.
    const queue = await w.techSupport.get(`${apiBase}/api/equipment/requests/review-queue`);
    expect(queue.ok()).toBe(true);
    const queued = ((await queue.json()) as EquipmentRequest[]).find((r) => r.id === request.id);
    expect(queued?.status).toBe("Pending Review");
    const amended = await w.coordinator.put(`${apiBase}/api/equipment/requests/${request.id}`, {
      data: { eventId: w.ev.id, items: [{ id: request.items[0].id, equipmentName: "Microphone", equipmentType: "Audio", quantity: MIC_AMENDED }] },
    });
    expect(amended.ok()).toBe(true);
    expect((await w.techSupport.patch(`${apiBase}/api/equipment/requests/${request.id}/reserve`)).ok()).toBe(true);
    const reserved = await equipmentRequestOf(w.coordinator, w.ev.id);
    expect(reserved.status).toBe("Reserved");
    const revised = await checklist(w.coordinator, w.ev.id);
    expect(revised.equipment.items.map((i) => [i.status, i.quantity])).toEqual([["confirmed", MIC_AMENDED]]);
    expect(forEvent(await notices(w.coordinator), w.ev.id).some((n) => /reserv/i.test(n.message))).toBe(true);

    // Step 15: resubmit, approve, confirm.
    await resolveAndResubmit(w);
    await openEvent(page, name);
    await expect(page.getByText(`Microphone: ${MIC_AMENDED}`)).toBeVisible();
    await page.getByRole("button", { name: "Approve arrangement" }).click();
    await expect(page.getByRole("status")).toContainText(SO_CONFIRMATION);
    await page.getByRole("button", { name: "Return to queue" }).click();
    expect(await safetyStatus(w.coordinator, w.ev.id)).toBe("approved");
    expect(safetyNotices(await notices(w.coordinator), w.ev.id)).toHaveLength(2);
    expect((await statusChange(w.coordinator, w.ev.id)).ok()).toBe(true);
    expect(await eventStatus(w.coordinator, w.ev.id)).toBe(CONFIRMED);

    // Step 16: absence.
    for (const who of ["venue_staff1", "tech_support1"] as As[])
      expect(forEvent(await notices((await pageAs(who)).request), w.ev.id).filter((n) => /safety/i.test(n.type))).toHaveLength(0);
  });
});
