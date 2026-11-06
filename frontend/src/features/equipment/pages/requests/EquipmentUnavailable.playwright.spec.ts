// SPM-192 E2E-17: equipment not available (docs/test-cases/e2e/E2E-17.md).
//
// Stories: SPM-58, SPM-172, SPM-57, SPM-135, SPM-129.
// Technical Support marks a request Cannot Provide, the Coordinator is told and sees the reason, the event stays out of the
// Safety Officer's queue, the Coordinator amends the request, Technical Support reserves it, and only then does the event
// reach the Safety Officer. Equipment can only be requested while the event is Approved or Planning (the product refuses
// it once Confirmed, E2E-26 exclusion rationale), so this case is built on a Planning event.
//
// Deviations and assumptions (also in the report):
// - "Database" assertions are re-read through the API of the owning actor; the Playwright process has no SQL access.
// - ASSUMPTION (E2E-17 Note 3): the status of a refused safety-check request / early Confirm is not fixed by an AC.
//   The refusal is asserted as a member of REFUSAL (and 409/422 for Confirm), as EventSafetyGate.playwright.spec.ts does.
// - The scene builder books the venue itself (approved), so no booking request is needed for "main".
import { type APIRequestContext, type APIResponse, type Page } from "@playwright/test";
import { type As, type Scene, expect, test } from "../../../../../e2e/fixtures";

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";
const url = (path: string) => `${apiBase}${path}`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- response bodies are asserted field by field
type Json = any;

const EVENT = "E2E-17 Event";
const HALL = "E2E-17 Hall";
const REASON = "Only ten microphones are in stock";
const CANNOT_PROVIDE_TEXT = `Your equipment request for "${EVENT}" cannot be provided.`;
const RESERVED_TEXT = `Your equipment request for "${EVENT}" has been reserved.`;
const DECISION_TYPES = ["equipment_request_reserved", "equipment_request_cannot_provide"];
/** A refused call is 401 (no session), 403 (wrong role), 404 (hidden) or 409/422 (state). Assert membership only. */
const REFUSAL = [401, 403, 404, 409, 422];
const ROLE_REFUSAL = [401, 403, 404];

const SCENE: Scene = {
  venues: { hall: { name: HALL, capacity: 100, setupMinutes: 30, turnaroundMinutes: 45 } },
  equipment: {
    mics: { type: "Audio", name: "Microphone", quantity: 10, location: "E2E-17 Store" },
    projector: { type: "Visual", name: "Projector", quantity: 3, location: "E2E-17 Store" },
  },
  events: { main: { name: EVENT, status: "Planning", venue: "hall", expectedAttendance: 50, startInDays: 30, durationHours: 2 } },
};

test.use({ as: "coordinator" });

type Actor = (who: As) => Promise<APIRequestContext>;

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

const MICS_AND_PROJECTOR = [
  { equipmentName: "Microphone", equipmentType: "Audio", quantity: 20 },
  { equipmentName: "Projector", equipmentType: "Visual", quantity: 1 },
];

const submitRequest = async (api: Actor, eventId: string, items: Json[] = MICS_AND_PROJECTOR): Promise<Json> =>
  ok(await (await api("coordinator1")).post(url("/api/equipment/requests"), { data: { eventId, items } }), 201);

const cannotProvide = (api: Actor, requestId: string, reason = REASON) =>
  api("tech_support1").then((request) => request.patch(url(`/api/equipment/requests/${requestId}/cannot-provide`), { data: { reason } }));

const reserve = (api: Actor, requestId: string) =>
  api("tech_support1").then((request) => request.patch(url(`/api/equipment/requests/${requestId}/reserve`)));

async function myRequests(api: Actor): Promise<Json[]> {
  return ok(await (await api("coordinator1")).get(url("/api/equipment/requests")), 200);
}

async function eventStatus(api: Actor, eventId: string): Promise<string> {
  const body = await ok(await (await api("coordinator1")).get(url(`/api/events/${eventId}`)), 200);
  return String((body.event ?? body).status).toLowerCase();
}

async function safetyState(api: Actor, eventId: string): Promise<string> {
  const body = await ok(await (await api("coordinator1")).get(url(`/api/events/${eventId}/arrangements-status`)), 200);
  const checklist = body.checklist ?? {};
  return String((checklist.safetyCheck ?? checklist.safety ?? {}).status ?? "not_requested").toLowerCase();
}

/** Equipment-decision notices of the account for the event; 403 (no notification feed for the role) means none. */
async function decisionNotices(api: Actor, who: As, eventId: string): Promise<Json[]> {
  const response = await (await api(who)).get(url("/api/notifications"));
  if (response.status() === 403) return [];
  const rows: Json[] = await ok(response, 200);
  return rows.filter((row) => DECISION_TYPES.includes(row.type) && row.relatedEventId === eventId);
}

const OTHERS: As[] = ["coordinator2", "organiser1", "lead", "venue_staff1", "safety_officer1"];

async function expectNobodyElseNotified(api: Actor, eventId: string) {
  for (const who of OTHERS) expect(await decisionNotices(api, who, eventId), `${who} has no equipment notice`).toEqual([]);
}

/** Reserved microphone and projector quantity across the event window, read as Technical Support. */
async function reservedFor(api: Actor, event: { startAt: string; endAt: string }): Promise<Record<string, number>> {
  const query = `startDateTime=${encodeURIComponent(event.startAt)}&endDateTime=${encodeURIComponent(event.endAt)}`;
  const rows: Json[] = await ok(await (await api("tech_support1")).get(url(`/api/equipment/availability?${query}`)), 200);
  return Object.fromEntries(rows.map((row) => [row.name, row.reservedQuantity as number]));
}

async function openQueue(page: Page) {
  const loaded = page.waitForResponse((r) => r.url().includes("/api/safety-officer/queue") && r.request().method() === "GET");
  await page.goto("/safety/events");
  await loaded;
  await expect(page.getByRole("heading", { name: "Events Awaiting Safety Check" })).toBeVisible();
}

test.describe("E2E-17 equipment not available", () => {
  // Steps 1 to 8. SPM-57 AC10, SPM-58 AC2/AC4/AC8/AC9, SPM-172 AC1/AC2/AC3/AC7, SPM-129 AC6, SPM-135 AC2/AC3.
  test("Cannot Provide is recorded with its reason, notifies only the Coordinator and keeps the event out of the safety queue @P1 @E2E-17", async ({
    page, db, pageAs,
  }) => {
    const scene = await db.scene(SCENE);
    const { main } = scene.events;
    const { page: pageOf, api } = makeActors(pageAs);

    // Step 1: coordinator1 requests 20 microphones and 1 projector through the form (SPM-57).
    await page.goto(`/equipment/requests/create?eventId=${main.id}`);
    await expect(page.getByLabel("Selected event details")).toContainText(EVENT);
    await page.getByLabel("Equipment name").fill("Microphone");
    await page.getByLabel("Equipment type").selectOption("Audio");
    await page.getByLabel("Quantity").fill("20");
    await page.getByRole("button", { name: "Add another item" }).click();
    await page.locator("#equipment-request-name-1").fill("Projector");
    await page.locator("#equipment-request-type-1").selectOption("Visual");
    await page.locator("#equipment-request-quantity-1").fill("1");
    await page.getByRole("button", { name: "Submit Request" }).click();
    const confirmation = page.getByRole("dialog", { name: "Equipment request submitted" });
    await expect(confirmation).toContainText(/ER-[0-9A-F]{8}/);
    await expect(confirmation).toContainText("Status: Pending Review.");
    await confirmation.getByRole("button", { name: "OK" }).click();
    const submitted = await myRequests(api);
    expect(submitted).toHaveLength(1);
    const requestId: string = submitted[0].id;
    expect(submitted[0].status).toBe("Pending Review");
    expect(submitted[0].items).toHaveLength(2);

    // Step 2: a second new submission for the same event is not offered in the UI and is refused by the API (SPM-57 AC10).
    await page.goto(`/equipment/requests/create?eventId=${main.id}`);
    await expect(page.getByText("No eligible events are available.")).toBeVisible();
    const second = await (await api("coordinator1")).post(url("/api/equipment/requests"), { data: { eventId: main.id, items: MICS_AND_PROJECTOR } });
    expect(second.status()).toBe(409);
    expect(await myRequests(api)).toHaveLength(1);

    // Step 3: Technical Support sees 20 requested against 10 available, cannot reserve, and marks the request Cannot Provide.
    const techSupport = await pageOf("tech_support1");
    await techSupport.goto("/equipment/requests");
    const card = techSupport.locator(`#equipment-request-${requestId}`);
    await card.getByRole("button", { name: "Review request" }).click();
    await expect(card).toContainText("10 available for this event period; 20 requested.");
    await expect(card.getByRole("button", { name: "Approve & reserve" })).toBeDisabled();
    expect((await reserve(api, requestId)).status()).toBe(409);
    await card.getByRole("button", { name: "Cannot provide" }).click();
    await card.getByLabel("Reason (shown to the event coordinator)").fill(REASON);
    await card.getByRole("button", { name: "Confirm cannot provide" }).click();
    await expect(card).toHaveCount(0);
    const decided = (await myRequests(api))[0];
    expect(decided.status).toBe("Cannot Provide");
    expect(decided.decisionReason).toBe(REASON);
    expect(decided.id, "the whole request is decided, no second request").toBe(requestId);
    // No partial reservation for either item.
    expect(await reservedFor(api, main)).toMatchObject({ Microphone: 0, Projector: 0 });

    // Step 4: exactly one unread notification for coordinator1, none for anyone else (SPM-172 AC1/AC2).
    const notices = await decisionNotices(api, "coordinator1", main.id);
    expect(notices).toHaveLength(1);
    expect(notices[0].message).toBe(CANNOT_PROVIDE_TEXT);
    expect(notices[0].read).toBe(false);
    await expectNobodyElseNotified(api, main.id);

    // Step 5: the notification opens the equipment requests page with the request highlighted and the reason shown (SPM-172 AC3).
    await page.goto("/events");
    await page.getByRole("button", { name: /^Notifications, 1 unread/ }).click();
    const bell = page.getByRole("dialog", { name: "Notifications" });
    await expect(bell).toContainText(CANNOT_PROVIDE_TEXT);
    await bell.getByRole("link", { name: "View Request" }).click();
    await expect(page).toHaveURL(new RegExp(`/equipment/requests\\?request=${requestId}`));
    const highlighted = page.locator(`#equipment-request-${requestId}`);
    await expect(highlighted).toHaveAttribute("aria-current", "true");
    await expect(highlighted).toContainText("Cannot Provide");
    await expect(highlighted).toContainText(REASON);

    // Step 6: deciding the already-decided request again is refused and creates no further notification (SPM-172 AC7).
    expect((await reserve(api, requestId)).status()).toBe(409);
    expect((await cannotProvide(api, requestId)).status()).toBe(409);
    expect((await myRequests(api))[0].status).toBe("Cannot Provide");
    expect(await decisionNotices(api, "coordinator1", main.id)).toHaveLength(1);

    // Step 7, UI: the event is not in the Safety Officer's queue; the Coordinator cannot request a safety check or confirm.
    const safetyOfficer = await pageOf("safety_officer1");
    await openQueue(safetyOfficer);
    await expect(safetyOfficer.getByText(EVENT)).toHaveCount(0);
    await page.goto(`/events/${main.id}`);
    await expect(page.getByRole("heading", { name: EVENT })).toBeVisible();
    const safetyControl = page.getByRole("button", { name: /Request For Safety Check/i });
    if ((await safetyControl.count()) > 0) await expect(safetyControl).toBeDisabled();
    const confirm = page.getByRole("button", { name: "Confirm Event" });
    await expect(confirm).toBeVisible();
    await expect(confirm).toBeDisabled();
    await expect(page.getByLabel("Pending")).toContainText(/equipment/i);

    // Step 8, API: queue detail, safety-check request and Confirm are all refused; nothing was created.
    expect(REFUSAL).toContain((await safetyOfficer.request.get(url(`/api/safety-officer/queue/${main.id}`))).status());
    const coordinator = await api("coordinator1");
    expect(REFUSAL).toContain((await coordinator.post(url(`/api/events/${main.id}/safety-check/request`))).status());
    const confirmAttempt = await coordinator.post(url(`/api/events/${main.id}/status-change`), { data: { targetStatus: "Confirmed" } });
    expect([409, 422]).toContain(confirmAttempt.status());
    expect(String((await confirmAttempt.json()).message)).toMatch(/equipment/i);
    expect(await safetyState(api, main.id)).toBe("not_requested");
    expect(await eventStatus(api, main.id)).toBe("planning");
    expect(ROLE_REFUSAL).toContain((await (await api("coordinator2")).post(url(`/api/events/${main.id}/safety-check/request`))).status());
  });

  // Steps 9 to 13. SPM-58 AC12, SPM-172 AC5, SPM-129 AC1/AC3.
  test("amending the request returns it to Pending Review, a reservation notifies again and the event reaches the Safety Officer @P1 @E2E-17", async ({
    page, db, pageAs,
  }) => {
    const scene = await db.scene(SCENE);
    const { main } = scene.events;
    const { page: pageOf, api } = makeActors(pageAs);

    // Arrange (steps 1 to 3 through the product): the request is Cannot Provide with its reason and one notification.
    const created = await submitRequest(api, main.id);
    await ok(await cannotProvide(api, created.id), 200);
    expect((await myRequests(api))[0].status).toBe("Cannot Provide");
    expect(await decisionNotices(api, "coordinator1", main.id)).toHaveLength(1);

    // Step 9: coordinator1 amends (update, not resubmit) to 8 microphones and removes the projector.
    await page.goto("/equipment/requests");
    await page.locator(`#equipment-request-${created.id}`).getByRole("link", { name: "Update Event" }).click();
    await expect(page.getByRole("heading", { name: "Update equipment request" })).toBeVisible();
    await page.locator("#equipment-request-quantity-0").fill("8");
    await page.getByRole("button", { name: "Remove item 2" }).click();
    await page.getByRole("button", { name: "Update Event" }).click();
    const updated = page.getByRole("dialog", { name: "Equipment request updated" });
    await expect(updated).toContainText(/ER-[0-9A-F]{8}/);
    await updated.getByRole("button", { name: "OK" }).click();
    const amended = await myRequests(api);
    expect(amended).toHaveLength(1);
    expect(amended[0].id, "same request id").toBe(created.id);
    expect(amended[0].status).toBe("Pending Review");
    expect(amended[0].items.map((item: Json) => [item.equipmentName, item.quantity])).toEqual([["Microphone", 8]]);
    // Still the one notification: an amendment is not a decision.
    expect(await decisionNotices(api, "coordinator1", main.id)).toHaveLength(1);

    // Step 10: Technical Support reserves it through the UI.
    const techSupport = await pageOf("tech_support1");
    await techSupport.goto("/equipment/requests");
    const card = techSupport.locator(`#equipment-request-${created.id}`);
    await card.getByRole("button", { name: "Review request" }).click();
    await expect(card).toContainText("10 available for this event period; 8 requested.");
    await card.getByRole("button", { name: "Approve & reserve" }).click();
    await expect(card).toHaveCount(0);
    expect((await myRequests(api))[0].status).toBe("Reserved");
    expect(await reservedFor(api, main)).toMatchObject({ Microphone: 8, Projector: 0 });

    // Step 11: a second, new notification (one per decision); still nothing for the other roles.
    const notices = await decisionNotices(api, "coordinator1", main.id);
    expect(notices.map((row) => row.message).sort()).toEqual([CANNOT_PROVIDE_TEXT, RESERVED_TEXT].sort());
    await expectNobodyElseNotified(api, main.id);

    // Step 12: with the venue approved and the equipment reserved the Coordinator can request the safety check through the UI.
    await page.goto(`/events/${main.id}`);
    await page.getByRole("button", { name: /Request For Safety Check/i }).click();
    await expect.poll(() => safetyState(api, main.id)).toBe("pending");

    // Step 13: the event is now in the Safety Officer's queue with its venue and the reserved 8 microphones.
    const safetyOfficer = await pageOf("safety_officer1");
    await openQueue(safetyOfficer);
    await expect(safetyOfficer.getByText(EVENT)).toBeVisible();
    await safetyOfficer.getByRole("button", { name: "Review arrangements" }).click();
    await expect(safetyOfficer.getByRole("heading", { name: EVENT })).toBeVisible();
    await expect(safetyOfficer.getByText(HALL).first()).toBeVisible();
    await expect(safetyOfficer.getByText(/Microphone/).first()).toBeVisible();
    await expect(safetyOfficer.getByText(/\b8\b/).first()).toBeVisible();
    expect(await eventStatus(api, main.id)).toBe("planning");
  });
});
