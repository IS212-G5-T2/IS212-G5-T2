// SPM-192 E2E-16: reservation reduces availability for overlapping events (docs/test-cases/e2e/E2E-16.md).
//
// Stories: SPM-57, SPM-58, SPM-111, SPM-118, SPM-119, SPM-136, SPM-172.
// SPM-190 Q5 (resolved 2026-11-06): the assigned Coordinator cancels directly, so Event A is cancelled by coordinator1
// through the Cancel Event control; the Lead cannot cancel and is not used.
//
// Deviations from the case (also listed in the report):
// - The scene builder has no maintenanceStatus option, so the "Projector (fault)" record (2 units Under Maintenance) is
//   created through the product (POST /api/equipment as Technical Support) right after db.scene.
// - Equipment requests and reservations have no builder. Event A's request and the first Technical Support reservation
//   go through the UI; the remaining requests and reservations go through the API as the real actor, to keep the spec short.
// - "Database" assertions are re-read through the API of the owning actor (the Playwright process has no SQL access):
//   the availability endpoint (reserved/available per slot), GET /api/equipment/requests, GET /api/notifications.
// - Step 11 needs a fourth event ("E2E-16 Event D", D+2) to ask for 11, because Event C already consumed the pool on D+1.
// - Equipment added after Confirmation is refused by the product (see E2E-26 exclusion rationale), so this spec only
//   requests equipment on Approved/Planning events and never on a Confirmed one.
import { type APIRequestContext, type APIResponse, type Page } from "@playwright/test";
import { type As, type BuiltScene, type Scene, expect, test } from "../../../../e2e/fixtures";

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";
const url = (path: string) => `${apiBase}${path}`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- response bodies are asserted field by field
type Json = any;

/** ASSUMPTION (E2E-16 Note 4): the status of a refused over-reservation is not fixed by SPM-58 AC4; the product answers 409. */
const OVER_RESERVATION_STATUS = 409;
const DECISION_TYPES = ["equipment_request_reserved", "equipment_request_cannot_provide"];

const NAMES = { a: "E2E-16 Event A", b: "E2E-16 Event B", b2: "E2E-16 Event B2", c: "E2E-16 Event C", d: "E2E-16 Event D" } as const;
const POOL = 10;

const SCENE: Scene = {
  equipment: { projectors: { type: "Visual", name: "Projector", quantity: POOL, location: "E2E-16 Store" } },
  events: {
    // A, B and B2 share one window (they overlap); C is a day later and D two days later.
    a: { name: NAMES.a, status: "Approved", startInDays: 30, durationHours: 2 },
    b: { name: NAMES.b, status: "Approved", startInDays: 30, durationHours: 2 },
    b2: { name: NAMES.b2, status: "Approved", startInDays: 30, durationHours: 2, coordinatorEmail: "coordinator2@connectsphere.test" },
    c: { name: NAMES.c, status: "Approved", startInDays: 31, durationHours: 2 },
    d: { name: NAMES.d, status: "Approved", startInDays: 32, durationHours: 2 },
  },
};

test.use({ timezoneId: "Asia/Singapore", as: "coordinator" });

type Actor = (who: As) => Promise<APIRequestContext>;
type Slot = { startAt: string; endAt: string };

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

/** The case's pre-condition 3, second record: 2 projectors Under Maintenance, created through the product (builder gap). */
async function addFaultRecord(api: Actor) {
  await ok(
    await (await api("tech_support1")).post(url("/api/equipment"), {
      data: { name: "Projector (fault)", type: "Visual", quantity: 2, maintenanceStatus: "Under Maintenance", location: "E2E-16 Store" },
    }),
    201,
  );
}

async function pool(api: Actor, slot: Slot, name = "Projector") {
  const query = `startDateTime=${encodeURIComponent(slot.startAt)}&endDateTime=${encodeURIComponent(slot.endAt)}&equipmentType=Visual`;
  const rows: Json[] = await ok(await (await api("tech_support1")).get(url(`/api/equipment/availability?${query}`)), 200);
  const row = rows.find((item) => item.name === name);
  expect(row, `${name} is listed`).toBeTruthy();
  return { active: row.activeQuantity as number, reserved: row.reservedQuantity as number, available: row.availableQuantity as number };
}

const request = async (api: Actor, who: As, eventId: string, quantity: number): Promise<string> =>
  (await ok(
    await (await api(who)).post(url("/api/equipment/requests"), {
      data: { eventId, items: [{ equipmentName: "Projector", equipmentType: "Visual", quantity }] },
    }),
    201,
  )).id;

const reserve = async (api: Actor, requestId: string, who: As = "tech_support1") => (await api(who)).patch(url(`/api/equipment/requests/${requestId}/reserve`));

async function requestState(api: Actor, who: As, requestId: string) {
  const rows: Json[] = await ok(await (await api(who)).get(url("/api/equipment/requests")), 200);
  return rows.find((row) => row.id === requestId);
}

async function eventStatus(api: Actor, who: As, eventId: string): Promise<string> {
  const body = await ok(await (await api(who)).get(url(`/api/events/${eventId}`)), 200);
  return String((body.event ?? body).status).toLowerCase();
}

/** Every equipment-decision notice of the account for one event. GET /api/notifications is 403 for roles without a feed (= no notices). */
async function decisionNotices(api: Actor, who: As, eventId?: string): Promise<Json[]> {
  const response = await (await api(who)).get(url("/api/notifications"));
  if (response.status() === 403) return [];
  const rows: Json[] = await ok(response, 200);
  return rows.filter((row) => DECISION_TYPES.includes(row.type) && (!eventId || row.relatedEventId === eventId));
}

const ALL_OTHERS: As[] = ["coordinator2", "organiser1", "lead", "venue_staff1", "safety_officer1", "tech_support1"];

/** Fill `datetime-local` (browser zone is Asia/Singapore, set above) for the slot. */
function localInput(iso: string): string {
  return new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Singapore" }).replace(" ", "T").slice(0, 16);
}

async function checkAvailabilityInUi(page: Page, slot: Slot) {
  await page.goto("/equipment/availability");
  await page.getByLabel("Start date and time").fill(localInput(slot.startAt));
  await page.getByLabel("End date and time").fill(localInput(slot.endAt));
  await page.getByLabel("Equipment type").selectOption("Visual");
  await page.getByRole("button", { name: "Check availability" }).click();
  return (name: string) => page.locator("tr").filter({ has: page.getByRole("cell", { name, exact: true }) });
}

const eventsOf = (scene: BuiltScene) => scene.events;

test.describe("E2E-16 equipment pool", () => {
  // Steps 1 to 11. SPM-57 AC3/AC5/AC6, SPM-58 AC2/AC4/AC5/AC6, SPM-111 AC6, SPM-172 AC1.
  test("reserving shrinks the pool for overlapping events only, refuses over-reservation and ignores Under Maintenance units @P1 @E2E-16", async ({
    page, db, pageAs,
  }) => {
    const scene = await db.scene(SCENE);
    const { a, b, b2, c, d } = eventsOf(scene);
    const { page: pageOf, api } = makeActors(pageAs);
    await addFaultRecord(api);

    // Step 1: the Active record is 10 available; the Under Maintenance record never raises availability (SPM-111 AC6).
    const techSupportPage = await pageOf("tech_support1");
    const row = await checkAvailabilityInUi(techSupportPage, a);
    await expect(row("Projector")).toContainText("Active: 10");
    await expect(row("Projector")).toContainText("Available: 10");
    await expect(row("Projector (fault)")).toContainText("Under Maintenance: 2");
    await expect(row("Projector (fault)")).toContainText("Available: 0");
    expect(await pool(api, a, "Projector (fault)")).toEqual({ active: 0, reserved: 0, available: 0 });

    // Step 2: coordinator1 requests 7 for Event A through the form; reference and Pending Review are shown (SPM-57).
    await page.goto(`/equipment/requests/create?eventId=${a.id}`);
    const details = page.getByLabel("Selected event details");
    await expect(details).toContainText(NAMES.a);
    await expect(details).toContainText("Expected attendance");
    await page.getByLabel("Equipment name").fill("Projector");
    await page.getByLabel("Equipment type").selectOption("Visual");
    await page.getByLabel("Quantity").fill("7");
    await page.getByRole("button", { name: "Submit Request" }).click();
    const confirmation = page.getByRole("dialog", { name: "Equipment request submitted" });
    await expect(confirmation).toContainText(/ER-[0-9A-F]{8}/);
    await expect(confirmation).toContainText("Status: Pending Review.");
    await confirmation.getByRole("button", { name: "OK" }).click();
    const mine: Json[] = await ok(await (await api("coordinator1")).get(url("/api/equipment/requests")), 200);
    const requestA = mine.find((item) => item.eventId === a.id);
    expect(requestA, "one request for Event A").toBeTruthy();
    expect(mine.filter((item) => item.eventId === a.id)).toHaveLength(1);
    expect(requestA.status).toBe("Pending Review");
    expect(requestA.items.map((item: Json) => item.quantity)).toEqual([7]);
    expect(await eventStatus(api, "coordinator1", a.id)).toBe("planning"); // SPM-57 AC9

    // Step 3: Technical Support reviews it (10 free), reserves it through the UI; it leaves the queue and is Reserved.
    await techSupportPage.goto("/equipment/requests");
    const card = techSupportPage.locator(`#equipment-request-${requestA.id}`);
    await expect(card).toContainText(NAMES.a);
    await expect(card).toContainText(requestA.reference);
    await card.getByRole("button", { name: "Review request" }).click();
    await expect(card).toContainText("Projector · Visual × 7");
    await expect(card).toContainText("10 available for this event period; 7 requested.");
    await card.getByRole("button", { name: "Approve & reserve" }).click();
    await expect(card).toHaveCount(0);
    expect((await requestState(api, "coordinator1", requestA.id)).status).toBe("Reserved");
    expect(await pool(api, a)).toEqual({ active: 10, reserved: 7, available: 3 });

    // Step 4: exactly one new notification for coordinator1, none for any other role (SPM-172 AC1).
    const reservedNotices = await decisionNotices(api, "coordinator1", a.id);
    expect(reservedNotices).toHaveLength(1);
    expect(reservedNotices[0].message).toBe(`Your equipment request for "${NAMES.a}" has been reserved.`);
    for (const who of ALL_OTHERS) expect(await decisionNotices(api, who), `${who} has no equipment notice`).toEqual([]);
    await page.goto("/events");
    await page.getByRole("button", { name: /^Notifications, 1 unread/ }).click();
    await expect(page.getByRole("dialog", { name: "Notifications" })).toContainText(`Your equipment request for "${NAMES.a}" has been reserved.`);

    // Step 5: Event B's overlapping slot shows 3, not 10 (SPM-58 AC6); the UI agrees.
    expect(await pool(api, b)).toEqual({ active: 10, reserved: 7, available: 3 });
    const overlapRow = await checkAvailabilityInUi(techSupportPage, b);
    await expect(overlapRow("Projector")).toContainText("Reserved: 7");
    await expect(overlapRow("Projector")).toContainText("Available: 3");

    // Step 6 and 7: coordinator2 requests 4 for B2; Technical Support cannot reserve it (UI blocked, API refused).
    const requestB2 = await request(api, "coordinator2", b2.id, 4);
    expect((await requestState(api, "coordinator2", requestB2)).status).toBe("Pending Review");
    await techSupportPage.goto("/equipment/requests");
    const b2Card = techSupportPage.locator(`#equipment-request-${requestB2}`);
    await b2Card.getByRole("button", { name: "Review request" }).click();
    await expect(b2Card).toContainText("3 available for this event period; 4 requested.");
    await expect(b2Card.getByRole("button", { name: "Approve & reserve" })).toBeDisabled();
    const refusal = await reserve(api, requestB2);
    expect(refusal.status(), await refusal.text()).toBe(OVER_RESERVATION_STATUS);
    expect((await requestState(api, "coordinator2", requestB2)).status).toBe("Pending Review");
    expect(await pool(api, b2)).toEqual({ active: 10, reserved: 7, available: 3 });
    expect(await decisionNotices(api, "coordinator2"), "a refused decision creates no notification (SPM-172 AC7)").toEqual([]);

    // Step 8: coordinator1 requests exactly the 3 that remain for Event B and it is reserved.
    const requestB = await request(api, "coordinator1", b.id, 3);
    await ok(await reserve(api, requestB), 200);
    expect((await requestState(api, "coordinator1", requestB)).status).toBe("Reserved");
    expect(await pool(api, b)).toEqual({ active: 10, reserved: 10, available: 0 });
    expect(await decisionNotices(api, "coordinator1", b.id)).toHaveLength(1);
    expect(await decisionNotices(api, "coordinator1", a.id), "Event A still has its one notice").toHaveLength(1);

    // Step 9: one more projector for an overlapping event is refused, and the total stays 10.
    expect((await reserve(api, requestB2)).status()).toBe(OVER_RESERVATION_STATUS);
    expect(await pool(api, b2)).toEqual({ active: 10, reserved: 10, available: 0 });

    // Step 10: Event C's slot on D+1 is untouched; 10 can be requested and reserved (boundary), D's totals are unchanged.
    expect(await pool(api, c)).toEqual({ active: 10, reserved: 0, available: 10 });
    // The two fault units never add to the pool: across both records the slot can supply at most 10.
    expect((await pool(api, c)).available + (await pool(api, c, "Projector (fault)")).available).toBe(POOL);
    const requestC = await request(api, "coordinator1", c.id, 10);
    await ok(await reserve(api, requestC), 200);
    expect(await pool(api, c)).toEqual({ active: 10, reserved: 10, available: 0 });
    expect(await pool(api, a)).toEqual({ active: 10, reserved: 10, available: 0 });

    // Step 11: 11 can never be reserved, even on an untouched day.
    const requestD = await request(api, "coordinator1", d.id, 11);
    expect((await reserve(api, requestD)).status()).toBe(OVER_RESERVATION_STATUS);
    expect((await requestState(api, "coordinator1", requestD)).status).toBe("Pending Review");
    expect(await pool(api, d)).toEqual({ active: 10, reserved: 0, available: 10 });
  });

  // Steps 12 and 13. SPM-136 AC1/AC2/AC5, SPM-190 Q5.
  test("cancelling Event A releases its 7 projectors and the refused request for 4 can then be reserved @P1 @E2E-16", async ({
    page, db, pageAs,
  }) => {
    const scene = await db.scene(SCENE);
    const { a, b, b2 } = eventsOf(scene);
    const { page: pageOf, api } = makeActors(pageAs);
    await addFaultRecord(api);
    const requestA = await request(api, "coordinator1", a.id, 7);
    await ok(await reserve(api, requestA), 200);
    const requestB = await request(api, "coordinator1", b.id, 3);
    await ok(await reserve(api, requestB), 200);
    const requestB2 = await request(api, "coordinator2", b2.id, 4);
    expect((await reserve(api, requestB2)).status()).toBe(OVER_RESERVATION_STATUS);
    expect(await pool(api, a)).toEqual({ active: 10, reserved: 10, available: 0 });

    // Step 12: coordinator1 (the assigned Coordinator, SPM-190 Q5) cancels Event A and confirms the prompt.
    await page.goto(`/events/${a.id}`);
    await page.getByRole("button", { name: "Cancel Event" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Confirm cancellation" }).click();
    await expect(dialog.getByRole("status")).toContainText(`${NAMES.a} has been cancelled.`);
    await dialog.getByRole("button", { name: "Close" }).click();
    expect(await eventStatus(api, "coordinator1", a.id)).toBe("cancelled");
    // A's reservations are released (no longer counted) and Event B's 3 are untouched.
    expect(await pool(api, b)).toEqual({ active: 10, reserved: 3, available: 7 });
    const stillHolding = (await requestState(api, "coordinator1", requestA))?.status;
    expect(stillHolding === undefined || stillHolding === "Cancelled", `request A no longer holds quantity (${stillHolding})`).toBe(true);
    expect((await requestState(api, "coordinator1", requestB)).status).toBe("Reserved");

    // Step 13: B2's slot shows 7 free in the UI; the previously refused 4 now reserves, B's 3 are still held.
    const row = await checkAvailabilityInUi(await pageOf("tech_support1"), b2);
    await expect(row("Projector")).toContainText("Reserved: 3");
    await expect(row("Projector")).toContainText("Available: 7");
    const tsPage = await pageOf("tech_support1");
    await tsPage.goto("/equipment/requests");
    const b2Card = tsPage.locator(`#equipment-request-${requestB2}`);
    await b2Card.getByRole("button", { name: "Review request" }).click();
    await expect(b2Card).toContainText("7 available for this event period; 4 requested.");
    await b2Card.getByRole("button", { name: "Approve & reserve" }).click();
    await expect(b2Card).toHaveCount(0);
    expect((await requestState(api, "coordinator2", requestB2)).status).toBe("Reserved");
    expect(await pool(api, b2)).toEqual({ active: 10, reserved: 7, available: 3 });
    expect(await decisionNotices(api, "coordinator2", b2.id)).toHaveLength(1);
  });

  // Step 14 and the role negatives. Only Technical Support reserves (SPM-58, SPM-113).
  test("only Technical Support can reserve: every other caller is refused and nothing changes @P1 @E2E-16", async ({
    db, pageAs, playwright,
  }) => {
    const scene = await db.scene(SCENE);
    const { a } = eventsOf(scene);
    const { api } = makeActors(pageAs);
    const requestA = await request(api, "coordinator1", a.id, 7);
    const before = await pool(api, a);

    const refused: As[] = ["coordinator1", "coordinator2", "organiser1", "lead", "venue_staff1", "safety_officer1", "attendee1"];
    for (const who of refused) {
      const response = await reserve(api, requestA, who);
      expect(response.status(), `${who} direct reserve`).toBe(403);
    }
    const anonymous = await playwright.request.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      expect((await anonymous.patch(url(`/api/equipment/requests/${requestA}/reserve`))).status()).toBe(401);
    } finally {
      await anonymous.dispose();
    }

    expect((await requestState(api, "coordinator1", requestA)).status).toBe("Pending Review");
    expect(await pool(api, a)).toEqual(before);
    for (const who of ["coordinator1", ...ALL_OTHERS] as As[]) expect(await decisionNotices(api, who), `${who} has no notice`).toEqual([]);
  });
});
