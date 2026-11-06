import { type APIResponse, type Page } from "@playwright/test";
import type { As } from "../../../../../e2e/accounts";
import { expect, test } from "../../../../../e2e/fixtures";

// E2E-06 (docs/test-cases/e2e/E2E-06.md): the Lead reassigns an event mid-planning from coordinator1 to coordinator2.
// SPM-47 (reassign, Lead-only), SPM-46 (the new coordinator's view), SPM-48 AC1 (coordinator list), SPM-137 AC6 and
// SPM-172 AC6 (decision notices follow the current coordinator).
//
// SPM-190 Q7 applied: the organiser is NOT notified on reassignment; the original coordinator IS notified of the removal
// (no link) and the new coordinator IS notified of the assignment.
//
// The case creates the clarification, booking and equipment requests through the UI as coordinator1. No builder exists for
// them, so they are created over the authorised API as SETUP ONLY; the reassignment under test goes through /lead/reassign.
// "DB:" assertions are made through the authorised API (frontend/ has no database dependency, see fixtures.ts).
// Refusal status codes are ASSUMPTIONS in the case, so refusals are asserted as 4xx.

test.use({ as: "lead", timezoneId: "Asia/Singapore" });

const apiBase = process.env.PLAYWRIGHT_API_URL ?? `http://localhost:${process.env.E2E_BACKEND_PORT ?? "8080"}`;
const eventName = "Reassignment event";
const clarificationText = "Please confirm the final attendance figure";

interface Notice { id: string; type: string; message: string; relatedEventId: string | null; read: boolean }
interface Coordinator { id: string; name: string; available: boolean; activeAssignments: number }
interface Comment { id: string; type: string; message: string }

async function expectOk(response: APIResponse, what: string) {
  expect(response.ok(), `${what}: ${response.status()} ${await response.text()}`).toBe(true);
}

async function expectRefused(response: APIResponse, forbiddenText: string[] = []) {
  const status = response.status();
  expect(status, `expected a refusal, got ${status}`).toBeGreaterThanOrEqual(400);
  expect(status).toBeLessThan(500);
  const body = await response.text();
  for (const text of forbiddenText) expect(body).not.toContain(text);
}

async function noticesFor(page: Page, eventId: string) {
  const response = await page.request.get(`${apiBase}/api/notifications`);
  await expectOk(response, "notifications");
  return ((await response.json()) as Notice[]).filter((n) => n.relatedEventId === eventId);
}

async function readEvent(page: Page, eventId: string) {
  const response = await page.request.get(`${apiBase}/api/events/${eventId}`);
  await expectOk(response, "read event");
  const body = (await response.json()) as Record<string, unknown>;
  return (body.event ?? body) as { id: string; status: string; coordinatorName?: string | null };
}

async function commentsOf(page: Page, eventId: string) {
  const response = await page.request.get(`${apiBase}/api/events/${eventId}/comments`);
  await expectOk(response, "comments");
  return (await response.json()) as Comment[];
}

async function coordinators(lead: Page) {
  const response = await lead.request.get(`${apiBase}/api/lead/coordinators`);
  await expectOk(response, "lead coordinators");
  return (await response.json()) as Coordinator[];
}

async function coordinatorId(lead: Page, name: string) {
  const found = (await coordinators(lead)).find((c) => c.name === name);
  expect(found, `coordinator ${name} listed`).toBeTruthy();
  return found!.id;
}

interface Planned { eventId: string; bookingId: string; microphoneRequestId: string; clarificationId: string }

/**
 * The pre-conditions of the case: an Approved event for coordinator1 with a clarification answered by organiser1, a
 * Reserved Projector request (one unread decision notice for coordinator1), a Pending Microphone request, and a Pending
 * booking of `hall` (which moves the event to Planning).
 */
async function planEvent(pageAs: (who: As) => Promise<Page>, db: Parameters<Parameters<typeof test>[2]>[0]["db"]): Promise<Planned> {
  const scene = await db.scene({
    venues: { hall: { capacity: 120, setupMinutes: 30, turnaroundMinutes: 45 } },
    equipment: { projector: { name: "Projector", quantity: 10 }, mic: { name: "Microphone", quantity: 10 } },
    events: { main: { status: "Approved", name: eventName, expectedAttendance: 60, startInDays: 30, durationHours: 2 } },
  });
  const event = scene.events.main;
  const coordinator1 = await pageAs("coordinator1");
  const organiser = await pageAs("organiser1");
  const techSupport = await pageAs("tech_support1");

  const clarification = await coordinator1.request.post(`${apiBase}/api/events/${event.id}/clarifications`, { data: { message: clarificationText } });
  await expectOk(clarification, "create clarification");
  const clarificationId = ((await clarification.json()) as { id: string }).id;
  await expectOk(
    await organiser.request.post(`${apiBase}/api/events/${event.id}/clarifications/${clarificationId}/reply`, { data: { message: "Attendance is 60." } }),
    "organiser reply",
  );

  const projector = await coordinator1.request.post(`${apiBase}/api/equipment/requests`, {
    data: { eventId: event.id, items: [{ equipmentName: "Projector", equipmentType: "Visual", quantity: 2 }] },
  });
  await expectOk(projector, "projector request");
  await expectOk(
    await techSupport.request.patch(`${apiBase}/api/equipment/requests/${((await projector.json()) as { id: string }).id}/reserve`),
    "reserve projector",
  );
  const microphone = await coordinator1.request.post(`${apiBase}/api/equipment/requests`, {
    data: { eventId: event.id, items: [{ equipmentName: "Microphone", equipmentType: "Audio", quantity: 2 }] },
  });
  await expectOk(microphone, "microphone request");

  const booking = await coordinator1.request.post(`${apiBase}/api/venues/${scene.venues.hall.id}/booking-requests`, {
    data: { eventId: event.id, start: new Date(event.startAt).toISOString(), end: new Date(event.endAt).toISOString() },
  });
  await expectOk(booking, "booking request");
  return {
    eventId: event.id,
    bookingId: ((await booking.json()) as { id: string }).id,
    microphoneRequestId: ((await microphone.json()) as { id: string }).id,
    clarificationId,
  };
}

/** The Lead reassigns through the page, picking coordinator2 by id (the option text carries a live workload count). */
async function reassignToCoordinator2(lead: Page) {
  await lead.goto("/lead/reassign");
  await expect(lead.getByRole("heading", { name: "Reassign Events" })).toBeVisible();
  const card = lead.getByRole("article", { name: eventName });
  await card.getByLabel("Reassign to").selectOption(await coordinatorId(lead, "Coordinator 2"));
  await card.getByRole("button", { name: "Reassign" }).click();
  await expect(lead.getByRole("status").filter({ hasText: "reassigned to" })).toContainText(`Event "${eventName}" reassigned to Coordinator 2.`);
}

test.describe("E2E-06 reassignment mid-planning", () => {
  // Steps 1, 2, 4-12, 14. SPM-47 AC1/AC5/AC6/AC8; SPM-46 AC1-AC4; SPM-48 AC1; SPM-137 AC6; SPM-172 AC6; Q7.
  test("@P1 the Lead reassigns a Planning event; coordinator2 inherits it and later decisions notify coordinator2 only", async ({ page: lead, pageAs, db }) => {
    const { eventId, bookingId, microphoneRequestId, clarificationId } = await planEvent(pageAs, db);
    const coordinator1 = await pageAs("coordinator1");
    const coordinator2 = await pageAs("coordinator2");

    // Step 1: setup check. coordinator1 owns it, it is in Planning, and one equipment-decision notice is unread.
    const before = await readEvent(coordinator1, eventId);
    expect(before.status.toLowerCase()).toBe("planning");
    expect(before.coordinatorName).toBe("Coordinator 1");
    const equipmentNotice = (await noticesFor(coordinator1, eventId)).filter((n) => /equipment request/i.test(n.message));
    expect(equipmentNotice.filter((n) => !n.read)).toHaveLength(1);
    const commentsBefore = await commentsOf(coordinator1, eventId);

    // Step 2: the Lead lists the event with name, status, date and time, and its current coordinator; coordinators fewest first.
    await lead.goto("/lead/reassign");
    const card = lead.getByRole("article", { name: eventName });
    await expect(card).toBeVisible();
    await expect(card).toContainText(/planning/i);
    await expect(card).toContainText(/\d{1,2}:\d{2}\s?[ap]m/i);
    await expect(card).toContainText("Coordinator: Coordinator 1");
    const options = (await card.getByLabel("Reassign to").locator("option").allInnerTexts()).filter((t) => /^Coordinator/.test(t));
    expect(options.find((t) => t.startsWith("Coordinator 1"))).toContain("current");
    expect(options.find((t) => t.startsWith("Coordinator 2"))).toMatch(/\(\d+ active\)/);

    // Step 4: reassign to coordinator2 through the page; the confirmation names the event and coordinator2.
    await reassignToCoordinator2(lead);
    await expect(lead.getByRole("article", { name: eventName })).toContainText("Coordinator: Coordinator 2");

    // Step 4 stored state: only the coordinator changed. Status, clarifications, booking and equipment are as they were.
    const after = await readEvent(coordinator2, eventId);
    expect(after.coordinatorName).toBe("Coordinator 2");
    expect(after.status).toBe(before.status);
    expect(await commentsOf(coordinator2, eventId)).toEqual(commentsBefore);
    const booking = await coordinator2.request.get(`${apiBase}/api/venues/bookings/mine`);
    await expectOk(booking, "coordinator2 bookings");
    expect(JSON.stringify(await booking.json())).toContain(bookingId);
    const equipment = await coordinator2.request.get(`${apiBase}/api/equipment/requests`);
    await expectOk(equipment, "coordinator2 equipment requests");
    expect(JSON.stringify(await equipment.json())).toContain(microphoneRequestId);

    // Step 5: coordinator1 no longer lists the event and its page shows nothing of it. Approve, reject and reply are absent.
    await coordinator1.goto("/events");
    await expect(coordinator1.getByText("Loading events…")).toHaveCount(0);
    await expect(coordinator1.getByRole("link", { name: new RegExp(eventName) })).toHaveCount(0);
    await coordinator1.goto(`/events/${eventId}`);
    await expect(coordinator1.getByRole("heading", { name: eventName })).toHaveCount(0);
    await expect(coordinator1.getByRole("button", { name: /Review Event|Approve|Reject|Reply/ })).toHaveCount(0);

    // Step 6: by direct request, each call is refused and returns no data; nothing changes.
    await expectRefused(await coordinator1.request.get(`${apiBase}/api/events/${eventId}`), [eventName]);
    await expectRefused(
      await coordinator1.request.post(`${apiBase}/api/events/${eventId}/clarifications/${clarificationId}/reply`, { data: { message: "Reply from the old coordinator" } }),
      [eventName],
    );
    await expectRefused(await coordinator1.request.post(`${apiBase}/api/events/${eventId}/approve`), [eventName]);
    expect(await commentsOf(coordinator2, eventId)).toEqual(commentsBefore);
    expect((await readEvent(coordinator2, eventId)).status).toBe(before.status);

    // Step 7: coordinator2 lists it labelled Reassigned; the page names the original coordinator and shows the booking.
    await coordinator2.goto("/events");
    const listed = coordinator2.getByRole("link", { name: new RegExp(eventName) });
    await expect(listed).toBeVisible();
    await expect(listed).toContainText("Reassigned");
    await listed.click();
    await expect(coordinator2).toHaveURL(new RegExp(`/events/${eventId}$`));
    await expect(coordinator2.getByRole("heading", { name: eventName })).toBeVisible();
    await expect(coordinator2.getByRole("note")).toContainText("Reassigned to you from Coordinator 1");
    await expect(coordinator2.getByText(clarificationText)).toBeVisible();
    // coordinator2 replies to the existing clarification and the reply is stored (SPM-47 AC5).
    await expectOk(
      await coordinator2.request.post(`${apiBase}/api/events/${eventId}/clarifications/${clarificationId}/reply`, { data: { message: "Noted by the new coordinator." } }),
      "coordinator2 reply",
    );
    expect((await commentsOf(coordinator2, eventId)).map((c) => c.message)).toContain("Noted by the new coordinator.");

    // Step 9: notifications. Exactly one reassigned-to notice with a link for coordinator2; exactly one reassigned-away
    // notice with no link for coordinator1; nobody else, and in particular not the organiser (Q7).
    const to = (await noticesFor(coordinator2, eventId)).filter((n) => n.type === "coordinator_reassignment");
    expect(to).toHaveLength(1);
    expect(to[0].message).toContain(eventName);
    expect(to[0].read).toBe(false);
    const away = (await noticesFor(coordinator1, eventId)).filter((n) => n.type === "coordinator_unassignment");
    expect(away).toHaveLength(1);
    for (const who of ["organiser1", "lead", "coordinator3"] as const)
      expect((await noticesFor(await pageAs(who), eventId)).filter((n) => /reassigned/i.test(n.message)), `${who} gets no reassignment notice`).toEqual([]);
    await coordinator2.goto("/events");
    await coordinator2.getByRole("button", { name: /^Notifications/ }).click();
    const dialog = coordinator2.getByRole("dialog", { name: "Notifications" });
    await expect(dialog).toContainText(`Event "${eventName}" has been reassigned to you.`);
    await dialog.getByRole("link", { name: "View Request" }).first().click();
    await expect(coordinator2).toHaveURL(new RegExp(`/events/${eventId}$`));
    await coordinator1.goto("/events");
    await coordinator1.getByRole("button", { name: /^Notifications/ }).click();
    const oldDialog = coordinator1.getByRole("dialog", { name: "Notifications" });
    await expect(oldDialog).toContainText(`Event "${eventName}" has been reassigned to Coordinator 2.`);
    await expect(oldDialog.getByRole("link", { name: "View Request" })).toHaveCount(0);

    // Step 10: coordinator1's unread equipment-decision notice is gone (read) and coordinator2 never received it.
    const oldEquipment = (await noticesFor(coordinator1, eventId)).filter((n) => /equipment request/i.test(n.message));
    expect(oldEquipment.filter((n) => !n.read)).toEqual([]);
    expect((await noticesFor(coordinator2, eventId)).filter((n) => /equipment request/i.test(n.message))).toEqual([]);

    // Step 11: Venue Staff approve the booking: coordinator2 gets exactly one notice, coordinator1 and organiser1 none.
    const coordinator1Before = (await noticesFor(coordinator1, eventId)).length;
    const venueStaff = await pageAs("venue_staff1");
    await expectOk(await venueStaff.request.post(`${apiBase}/api/venues/bookings/${bookingId}/approve`), "approve booking");
    const approved = (await noticesFor(coordinator2, eventId)).filter((n) => /booking of .* has been approved/.test(n.message));
    expect(approved).toHaveLength(1);
    expect(approved[0].message).toMatch(new RegExp(`^Your booking of .* for "${eventName}" has been approved\\.$`));
    expect((await noticesFor(coordinator1, eventId)).length).toBe(coordinator1Before);
    expect((await noticesFor(await pageAs("organiser1"), eventId)).filter((n) => /booking/i.test(n.message))).toEqual([]);

    // Step 12: Technical Support reserve the Microphone request: coordinator2 gets exactly one notice, coordinator1 none.
    const techSupport = await pageAs("tech_support1");
    await expectOk(await techSupport.request.patch(`${apiBase}/api/equipment/requests/${microphoneRequestId}/reserve`), "reserve microphone");
    const reserved = (await noticesFor(coordinator2, eventId)).filter((n) => /equipment request/i.test(n.message));
    expect(reserved).toHaveLength(1);
    expect(reserved[0].message).toBe(`Your equipment request for "${eventName}" has been reserved.`);
    expect((await noticesFor(coordinator1, eventId)).length).toBe(coordinator1Before);
    for (const who of ["organiser1", "lead"] as const)
      expect((await noticesFor(await pageAs(who), eventId)).filter((n) => /equipment request/i.test(n.message)), `${who} gets no equipment notice`).toEqual([]);
  });

  // Step 3. SPM-47 AC3.
  test("@P1 the Lead cannot reassign an event to the coordinator it already has", async ({ page: lead, pageAs, db }) => {
    const { eventId } = await planEvent(pageAs, db);
    const coordinator1Id = await coordinatorId(lead, "Coordinator 1");

    await lead.goto("/lead/reassign");
    const card = lead.getByRole("article", { name: eventName });
    await expect(card.getByRole("option", { name: /^Coordinator 1 \(current\)/ })).toBeDisabled();
    await expect(card.getByRole("button", { name: "Reassign" })).toBeDisabled();

    // The same by direct request is refused, and nothing changes or is sent.
    await expectRefused(
      await lead.request.post(`${apiBase}/api/lead/events/${eventId}/reassign`, { data: { coordinatorId: coordinator1Id, currentCoordinatorId: coordinator1Id } }),
    );
    const coordinator1 = await pageAs("coordinator1");
    expect((await readEvent(coordinator1, eventId)).coordinatorName).toBe("Coordinator 1");
    expect((await noticesFor(coordinator1, eventId)).filter((n) => n.type === "coordinator_unassignment")).toEqual([]);
    expect((await noticesFor(await pageAs("coordinator2"), eventId)).filter((n) => n.type === "coordinator_reassignment")).toEqual([]);
  });

  // Step 13. SPM-47 AC9.
  test("@P1 only the Lead can reassign: coordinators are kept off the page and refused by the API, and so is an anonymous caller", async ({ page: lead, pageAs, playwright, db }) => {
    const { eventId } = await planEvent(pageAs, db);
    const coordinator2Id = await coordinatorId(lead, "Coordinator 2");
    const coordinator1Id = await coordinatorId(lead, "Coordinator 1");
    const payload = { coordinatorId: coordinator2Id, currentCoordinatorId: coordinator1Id };

    for (const who of ["coordinator1", "coordinator2"] as const) {
      const page = await pageAs(who);
      await page.goto("/lead/reassign");
      await expect(page).not.toHaveURL(/\/lead\//);
      await expect(page.getByRole("heading", { name: "Reassign Events" })).toHaveCount(0);
      await expect(page.getByRole("article", { name: eventName })).toHaveCount(0);
    }
    await expectRefused(await (await pageAs("coordinator2")).request.post(`${apiBase}/api/lead/events/${eventId}/reassign`, { data: payload }), [eventName]);

    const anonymous = await playwright.request.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      expect((await anonymous.post(`${apiBase}/api/lead/events/${eventId}/reassign`, { data: payload })).status()).toBe(401);
    } finally {
      await anonymous.dispose();
    }

    // Still coordinator1's event, with nothing sent to coordinator2.
    const coordinator1 = await pageAs("coordinator1");
    expect((await readEvent(coordinator1, eventId)).coordinatorName).toBe("Coordinator 1");
    expect((await noticesFor(await pageAs("coordinator2"), eventId)).filter((n) => n.type === "coordinator_reassignment")).toEqual([]);
  });
});
