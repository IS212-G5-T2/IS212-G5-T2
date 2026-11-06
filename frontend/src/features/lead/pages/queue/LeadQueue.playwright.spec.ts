import { type APIRequestContext, type APIResponse, type Page } from "@playwright/test";
import { isoDateFromNow } from "../../../../../e2e/dates";
import type { As } from "../../../../../e2e/accounts";
import { expect, test, type TestDatabase } from "../../../../../e2e/fixtures";

// E2E-05 (docs/test-cases/e2e/E2E-05.md): the Lead's unassigned queue and coordinator assignment.
// SPM-123 (queue, assignment, Lead-only), SPM-77 (assignment notification), SPM-47 AC1/AC9 (assigned list, Lead-only),
// SPM-48 AC1/AC3 (coordinator list), SPM-38 AC4 (another coordinator's request is not reachable).
//
// SPM-190 resolutions applied: Q5 - the organiser requests, the assigned coordinator decides or cancels, the Lead cannot
// cancel (step 15 asserts the refusal). Q7 - the organiser is NOT notified on assignment, the assigned coordinator IS.
//
// Every test starts from a reset database (fixtures.ts). The unassigned events cannot come from the builder, which always
// assigns coordinator1 (browser-fixtures.mjs buildEvent), so they are created through POST /api/events as an organiser.
// The only test that assigns does it through the Lead's queue page; the other tests use the API as SETUP only.
//
// "DB:" assertions in the case cannot be made directly: frontend/ has no database dependency (fixtures.ts). Stored
// state is read back through the authorised API instead (GET /api/events/:id, /api/lead/assigned, /api/notifications).
// Refusal status codes other than 401 and 403/404 are ASSUMPTIONS in the case, so refusals are asserted as 4xx.

test.use({ as: "organiser", timezoneId: "Asia/Singapore" });

const apiBase = process.env.PLAYWRIGHT_API_URL ?? `http://localhost:${process.env.E2E_BACKEND_PORT ?? "8080"}`;
const journeyName = "Queue assignment event";
const secondName = "Second queue event";

interface Notice { id: string; type: string; message: string; relatedEventId: string | null; read: boolean }
interface Coordinator { id: string; name: string; available: boolean; activeAssignments: number }

function eventPayload(name: string, startInDays = 30) {
  const date = isoDateFromNow(startInDays);
  return {
    name,
    purpose: "E2E-05 queue and assignment verification",
    description: "E2E-05 browser test request.",
    startDateTime: `${date}T02:00:00.000Z`, // 10:00 to 12:00 Singapore time
    endDateTime: `${date}T04:00:00.000Z`,
    expectedAttendance: 60,
    layout: "Theatre",
    facilities: ["Projector"],
    accessibility: ["Hearing loop"],
    attachments: [],
    equipmentNeeds: "None",
    submissionKey: crypto.randomUUID(),
    registrationEnabled: false,
  };
}

/** Workloads that make the default ordering wrong: coordinator1 = 2 active, coordinator2 = 1, coordinator3 = 0. */
const workloadScene = {
  events: {
    a1: { name: "Seeded approved a1", status: "Approved", organiserEmail: "organiser2@connectsphere.test", coordinatorEmail: "coordinator1@connectsphere.test" },
    a2: { name: "Seeded submitted a2", status: "Submitted", organiserEmail: "organiser2@connectsphere.test", coordinatorEmail: "coordinator1@connectsphere.test" },
    b1: { name: "Seeded confirmed b1", status: "Confirmed", organiserEmail: "organiser2@connectsphere.test", coordinatorEmail: "coordinator2@connectsphere.test" },
    // Not active: these must not appear in the Lead's assigned list or in any count.
    // Seeded Submitted and rejected through the product in seedWorkload: the builder cannot write a Rejected row, because
    // events_rejection_reason_check requires a stored reason.
    r1: { name: "Seeded rejected r1", status: "Submitted", organiserEmail: "organiser2@connectsphere.test", coordinatorEmail: "coordinator2@connectsphere.test" },
    c1: { name: "Seeded completed c1", status: "Completed", organiserEmail: "organiser2@connectsphere.test", coordinatorEmail: "coordinator2@connectsphere.test" },
    x1: { name: "Seeded cancelled x1", status: "Cancelled", organiserEmail: "organiser2@connectsphere.test", coordinatorEmail: "coordinator3@connectsphere.test" },
  },
} as const;

/** The workload scene, then the one Rejected event: coordinator2 (its assignee) rejects r1 with a reason (SPM-83). */
async function seedWorkload(db: TestDatabase, pageAs: (who: As) => Promise<Page>) {
  const scene = await db.scene(workloadScene);
  const coordinator2 = await pageAs("coordinator2");
  const response = await coordinator2.request.post(`${apiBase}/api/events/${scene.events.r1.id}/reject`, {
    data: { reason: "Rejected to seed a closed event" },
  });
  await expectOk(response, "reject seeded r1");
  return scene;
}

async function expectOk(response: APIResponse, what: string) {
  expect(response.ok(), `${what}: ${response.status()} ${await response.text()}`).toBe(true);
}

/** A refusal with no data: a 4xx status (the exact code is an ASSUMPTION in the case) and no event name in the body. */
async function expectRefused(response: APIResponse, forbiddenText: string[] = []) {
  const status = response.status();
  expect(status, `expected a refusal, got ${status}`).toBeGreaterThanOrEqual(400);
  expect(status).toBeLessThan(500);
  const body = await response.text();
  for (const text of forbiddenText) expect(body).not.toContain(text);
}

/** Submits an event as the signed-in organiser through the API. Returns it, unassigned. */
async function submitViaApi(request: APIRequestContext, name: string, startInDays = 30) {
  const response = await request.post(`${apiBase}/api/events`, { data: eventPayload(name, startInDays) });
  await expectOk(response, `create ${name}`);
  const { event } = (await response.json()) as { event: { id: string; name: string; status: string } };
  expect(event.status).toBe("submitted");
  return event;
}

async function coordinatorsOf(lead: Page) {
  const response = await lead.request.get(`${apiBase}/api/lead/coordinators`);
  await expectOk(response, "lead coordinators");
  return (await response.json()) as Coordinator[];
}

async function coordinatorId(lead: Page, name: string) {
  const found = (await coordinatorsOf(lead)).find((c) => c.name === name);
  expect(found, `coordinator ${name} listed`).toBeTruthy();
  return found!.id;
}

/** SETUP ONLY: assigns over the API. The assignment under test goes through the queue page. */
async function assignViaApi(lead: Page, eventId: string, name: string) {
  const response = await lead.request.post(`${apiBase}/api/lead/queue/${eventId}/assign`, { data: { coordinatorId: await coordinatorId(lead, name) } });
  await expectOk(response, `assign ${name}`);
}

async function readEvent(page: Page, eventId: string) {
  const response = await page.request.get(`${apiBase}/api/events/${eventId}`);
  await expectOk(response, "read event");
  const body = (await response.json()) as Record<string, unknown>;
  return (body.event ?? body) as { id: string; status: string; coordinatorId?: string | null; coordinatorName?: string | null };
}

async function noticesFor(page: Page, eventId: string) {
  const response = await page.request.get(`${apiBase}/api/notifications`);
  await expectOk(response, "notifications");
  return ((await response.json()) as Notice[]).filter((n) => n.relatedEventId === eventId);
}

async function eventIdsListedFor(page: Page) {
  const response = await page.request.get(`${apiBase}/api/events`);
  await expectOk(response, "event list");
  return ((await response.json()) as { id: string }[]).map((e) => e.id);
}

async function expectNotInEventList(page: Page, name: string) {
  await page.goto("/events");
  await expect(page.getByText("Loading events…")).toHaveCount(0);
  await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
}

test.describe("E2E-05 Lead queue and coordinator assignment", () => {
  // Steps 1-8 and the exclusions of step 7. SPM-123 AC1-AC5, AC8; SPM-77 AC1-AC3; SPM-47 AC1; SPM-48 AC1, AC3.
  test("@P0 organiser submission reaches only the Lead's queue; the Lead assigns coordinator1 through the page and only coordinator1 is notified", async ({
    page, pageAs, db,
  }) => {
    await seedWorkload(db, pageAs);
    const dateIso = isoDateFromNow(30);
    const day = String(Number(dateIso.slice(8)));

    // Step 1: organiser1 creates and submits the request through the form.
    await page.goto("/events/create");
    await page.getByRole("textbox", { name: /event name/i }).fill(journeyName);
    await page.getByRole("textbox", { name: /purpose/i }).fill("E2E-05 queue and assignment verification");
    await page.getByRole("textbox", { name: /description/i }).fill("E2E-05 browser test request.");
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByLabel("Start date", { exact: false }).fill(dateIso);
    await page.getByLabel("Start time", { exact: false }).fill("10:00");
    await page.getByLabel("End date", { exact: false }).fill(dateIso);
    await page.getByLabel("End time", { exact: false }).fill("12:00");
    await page.getByLabel(/Expected attendance/).fill("60");
    await page.getByLabel(/Preferred room layout/).selectOption("Theatre");
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByLabel("Equipment needs").fill("None");
    await page.getByRole("button", { name: "Submit For Review" }).click();
    await expect(page.getByText("Your event request was submitted successfully.")).toBeVisible();
    await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
    const eventId = page.url().split("/").pop()!;

    // Step 1 (stored state) and step 2: Submitted, no coordinator. The detail page has no "awaiting assignment" wording
    // today (see report), so the status timeline reading "submitted" is the observable form of SPM-94 AC2.
    await expect(page.getByLabel("Event status timeline")).toContainText("submitted");
    const stored = await readEvent(page, eventId);
    expect(stored.status).toBe("submitted");
    expect(stored.coordinatorId ?? null).toBeNull();

    // Step 3: the event is in none of the three coordinators' lists (SPM-48 AC1, AC3).
    for (const who of ["coordinator1", "coordinator2", "coordinator3"] as const) {
      const coordinatorPage = await pageAs(who);
      await expectNotInEventList(coordinatorPage, journeyName);
      expect(await eventIdsListedFor(coordinatorPage)).not.toContain(eventId);
    }

    // Step 4: the Lead's queue lists the request with name, purpose, date and time, attendance (SPM-123 AC2) ...
    const lead = await pageAs("lead");
    await lead.goto("/lead/queue");
    await expect(lead.getByRole("heading", { name: "Assignment Queue" })).toBeVisible();
    const card = lead.getByRole("article", { name: journeyName });
    await expect(card).toBeVisible();
    await expect(card).toContainText("E2E-05 queue and assignment verification");
    await expect(card).toContainText(new RegExp(`\\b${day}\\b`));
    await expect(card).toContainText(/10:00/);
    await expect(card).toContainText(/12:00/);
    await expect(card).toContainText("Expected attendance: 60");

    // ... and each coordinator with availability and active count, fewest first (SPM-123 AC3, AC4).
    const panel = lead.getByRole("region", { name: "Coordinators" });
    const rows = panel.getByRole("listitem");
    await expect(rows.filter({ hasText: "Coordinator 3" })).toContainText(/Available.*0 active/);
    await expect(rows.filter({ hasText: "Coordinator 2" })).toContainText(/Available.*1 active/);
    await expect(rows.filter({ hasText: "Coordinator 1" })).toContainText(/Available.*2 active/);
    const order = (await rows.allInnerTexts()).map((text) => /Coordinator ([123])/.exec(text)?.[1]).filter(Boolean);
    expect(order, "coordinator3, then coordinator2, then coordinator1").toEqual(["3", "2", "1"]);

    // Step 5: assign coordinator1, the most loaded and not the first listed, through the page.
    await card.getByLabel("Assign to").selectOption({ label: "Coordinator 1 (2 active)" });
    await card.getByRole("button", { name: "Assign" }).click();
    await expect(lead.getByRole("status").filter({ hasText: "assigned to" })).toContainText(
      `Event request "${journeyName}" assigned to Coordinator 1.`,
    );
    await expect(lead.getByRole("article", { name: journeyName })).toHaveCount(0);
    await expect(lead.getByText("No unassigned requests.")).toBeVisible();
    await expect(panel.getByRole("listitem").filter({ hasText: "Coordinator 1" })).toContainText("3 active");
    const coordinator1 = await pageAs("coordinator1");
    const assigned = await readEvent(coordinator1, eventId);
    expect(assigned.coordinatorName).toBe("Coordinator 1");
    expect(assigned.status).toBe("submitted");

    // Step 6: the Lead's assigned list shows it, with the seeded active events and none of the closed ones (SPM-47 AC1).
    await lead.goto("/lead/reassign");
    await expect(lead.getByRole("heading", { name: "Reassign Events" })).toBeVisible();
    const journeyCard = lead.getByRole("article", { name: journeyName });
    await expect(journeyCard).toBeVisible();
    await expect(journeyCard).toContainText(/submitted/i);
    await expect(journeyCard).toContainText(/10:00\s?am\s?–\s?12:00\s?pm/);
    await expect(journeyCard).toContainText("Coordinator: Coordinator 1");
    for (const name of ["Seeded approved a1", "Seeded submitted a2", "Seeded confirmed b1"])
      await expect(lead.getByRole("article", { name })).toBeVisible();
    for (const name of ["Seeded rejected r1", "Seeded completed c1", "Seeded cancelled x1"])
      await expect(lead.getByRole("article", { name })).toHaveCount(0);

    // Step 7: coordinator1 has exactly one unread notice: name, "assigned to you", the proposed date, a link to the event.
    await coordinator1.goto("/events");
    await expect(coordinator1.getByRole("button", { name: "Notifications, 1 unread" })).toBeVisible();
    await coordinator1.getByRole("button", { name: /^Notifications/ }).click();
    const dialog = coordinator1.getByRole("dialog", { name: "Notifications" });
    await expect(dialog).toContainText(`"${journeyName}"`);
    await expect(dialog).toContainText("has been assigned to you");
    await expect(dialog).toContainText(new RegExp(`on 0?${day} \\w+ ${dateIso.slice(0, 4)}`));
    const own = (await noticesFor(coordinator1, eventId)).filter((n) => n.type === "coordinator_assignment");
    expect(own).toHaveLength(1);
    // Nobody else has a notice for this event: coordinators, and (Q7) the organisers.
    for (const who of ["coordinator2", "coordinator3", "organiser1", "organiser2"] as const) {
      expect(await noticesFor(await pageAs(who), eventId), `${who} has no notice for the event`).toEqual([]);
    }

    // The link opens the event's detail page (SPM-77 AC3).
    await dialog.getByRole("link", { name: "View Request" }).click();
    await expect(coordinator1).toHaveURL(new RegExp(`/events/${eventId}$`));

    // Step 8: coordinator1 now lists the event and sees its full details, with the review control.
    await expect(coordinator1.getByRole("heading", { name: journeyName })).toBeVisible();
    await expect(coordinator1.getByRole("button", { name: "Review Event" })).toBeVisible();
    await coordinator1.goto("/events");
    await expect(coordinator1.getByRole("link", { name: new RegExp(journeyName) })).toBeVisible();
  });

  // Steps 9 and 10. SPM-38 AC4.
  test("@P0 another coordinator cannot open, read or act on an assigned request", async ({ page, pageAs, db }) => {
    await seedWorkload(db, pageAs);
    const event = await submitViaApi(page.request, journeyName);
    const lead = await pageAs("lead");
    await assignViaApi(lead, event.id, "Coordinator 1");
    const other = await pageAs("coordinator2");

    // Step 9: by direct URL no details are shown, and the event is not in the list.
    await other.goto(`/events/${event.id}`);
    await expect(other.getByText("Event not found.")).toBeVisible();
    await expect(other.getByRole("heading", { name: journeyName })).toHaveCount(0);
    await expect(other.getByText("E2E-05 queue and assignment verification")).toHaveCount(0);
    await expectNotInEventList(other, journeyName);

    // Step 10: by direct request, each call is refused and returns no data.
    await expectRefused(await other.request.get(`${apiBase}/api/events/${event.id}`), [journeyName, "E2E-05"]);
    await expectRefused(await other.request.post(`${apiBase}/api/events/${event.id}/approve`), [journeyName]);
    await expectRefused(
      await other.request.post(`${apiBase}/api/events/${event.id}/reject`, { data: { reason: "Not this coordinator to decide" } }),
      [journeyName],
    );
    await expectRefused(
      await other.request.post(`${apiBase}/api/events/${event.id}/clarifications`, { data: { message: "Question from the wrong coordinator" } }),
      [journeyName],
    );

    // Stored state unchanged: still Submitted, still coordinator1, no comment rows.
    const coordinator1 = await pageAs("coordinator1");
    const stored = await readEvent(coordinator1, event.id);
    expect(stored.status).toBe("submitted");
    expect(stored.coordinatorName).toBe("Coordinator 1");
    const comments = await coordinator1.request.get(`${apiBase}/api/events/${event.id}/comments`);
    await expectOk(comments, "comments");
    expect(await comments.json()).toEqual([]);
  });

  // Steps 11 and 12. SPM-123 AC10, SPM-47 AC9.
  test("@P0 no coordinator, and nobody unauthenticated, can view the queue or assign from it", async ({ page, pageAs, playwright, db }) => {
    await seedWorkload(db, pageAs);
    const unassigned = await submitViaApi(page.request, secondName);
    const lead = await pageAs("lead");
    const coordinator2Id = await coordinatorId(lead, "Coordinator 2");
    const other = await pageAs("coordinator2");

    // Step 11: the Lead's pages are not shown and there is no navigation entry for them.
    for (const path of ["/lead/queue", "/lead/reassign"]) {
      await other.goto(path);
      await expect(other).not.toHaveURL(/\/lead\//);
      await expect(other.getByRole("heading", { name: /Assignment Queue|Reassign Events/ })).toHaveCount(0);
      await expect(other.getByRole("article", { name: secondName })).toHaveCount(0);
    }
    await other.goto("/events");
    await expect(other.getByRole("link", { name: "Assignment Queue" })).toHaveCount(0);
    await expect(other.getByRole("link", { name: "Reassign Events" })).toHaveCount(0);

    // Step 12: the API refuses a coordinator who names themselves as the assignee, and reads of the queue.
    await expectRefused(await other.request.get(`${apiBase}/api/lead/queue`), [secondName]);
    await expectRefused(await other.request.get(`${apiBase}/api/lead/assigned`));
    await expectRefused(
      await other.request.post(`${apiBase}/api/lead/queue/${unassigned.id}/assign`, { data: { coordinatorId: coordinator2Id } }),
      [secondName],
    );
    // Unauthenticated: an explicitly empty storage state, because a bare newContext() inherits the signed-in `as` login.
    const anonymous = await playwright.request.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      for (const response of [
        await anonymous.get(`${apiBase}/api/lead/queue`),
        await anonymous.get(`${apiBase}/api/lead/assigned`),
        await anonymous.post(`${apiBase}/api/lead/queue/${unassigned.id}/assign`, { data: { coordinatorId: coordinator2Id } }),
      ])
        expect(response.status()).toBe(401);
    } finally {
      await anonymous.dispose();
    }

    // Still unassigned: the event is in the Lead's queue and coordinator2 has no notice and no event.
    await lead.goto("/lead/queue");
    await expect(lead.getByRole("article", { name: secondName })).toBeVisible();
    const queue = await lead.request.get(`${apiBase}/api/lead/queue`);
    await expectOk(queue, "lead queue");
    expect(((await queue.json()) as { id: string }[]).map((e) => e.id)).toContain(unassigned.id);
    expect(await noticesFor(other, unassigned.id)).toEqual([]);
    expect(await eventIdsListedFor(other)).not.toContain(unassigned.id);
  });

  // Step 13. SPM-77 AC5. The refusal status is ASSUMPTION [S2].
  test("@P0 a second assignment of an assigned event is refused, changes nothing and notifies nobody", async ({ page, pageAs, db }) => {
    await seedWorkload(db, pageAs);
    const event = await submitViaApi(page.request, journeyName);
    const lead = await pageAs("lead");
    await assignViaApi(lead, event.id, "Coordinator 1");
    const coordinator2Id = await coordinatorId(lead, "Coordinator 2");

    await expectRefused(
      await lead.request.post(`${apiBase}/api/lead/queue/${event.id}/assign`, { data: { coordinatorId: coordinator2Id } }),
    );

    const coordinator1 = await pageAs("coordinator1");
    expect((await readEvent(coordinator1, event.id)).coordinatorName).toBe("Coordinator 1");
    const coordinator2 = await pageAs("coordinator2");
    expect(await noticesFor(coordinator2, event.id)).toEqual([]);
    expect(await eventIdsListedFor(coordinator2)).not.toContain(event.id);
    // coordinator1 still has exactly the one assignment notice from the first assignment.
    expect((await noticesFor(coordinator1, event.id)).filter((n) => n.type === "coordinator_assignment")).toHaveLength(1);
  });

  // Step 14. SPM-123 AC9, SPM-88 AC1.
  test("approval does not change the assignee and sends the decision only to the organiser", async ({ page, pageAs, db }) => {
    await seedWorkload(db, pageAs);
    const event = await submitViaApi(page.request, journeyName);
    const lead = await pageAs("lead");
    await assignViaApi(lead, event.id, "Coordinator 1");

    const coordinator1 = await pageAs("coordinator1");
    await coordinator1.goto(`/events/${event.id}`);
    await coordinator1.getByRole("button", { name: "Review Event" }).click();
    await coordinator1.getByRole("radio", { name: "Approve" }).check();
    await coordinator1.getByRole("button", { name: "Submit Decision" }).click();
    await expect(coordinator1.getByLabel("Event status timeline")).toContainText("approved");

    // The assignee is unchanged (read through the Lead's assigned list and the coordinator's own record).
    const assigned = await lead.request.get(`${apiBase}/api/lead/assigned`);
    await expectOk(assigned, "lead assigned");
    const entry = ((await assigned.json()) as { id: string; coordinatorName: string }[]).find((e) => e.id === event.id);
    expect(entry?.coordinatorName).toBe("Coordinator 1");
    expect((await readEvent(coordinator1, event.id)).coordinatorName).toBe("Coordinator 1");

    // organiser1 receives the decision notification (SPM-88 AC1) ...
    const organiserNotices = await noticesFor(page, event.id);
    expect(organiserNotices.map((n) => n.type)).toEqual(["approval"]);
    // ... and no Coordinator gets anything beyond the original assignment notice.
    expect((await noticesFor(coordinator1, event.id)).map((n) => n.type)).toEqual(["coordinator_assignment"]);
    for (const who of ["coordinator2", "coordinator3"] as const)
      expect(await noticesFor(await pageAs(who), event.id), `${who} has no notice`).toEqual([]);
  });

  // Step 15. [S3] and SPM-190 Q5: the Lead only assigns and reassigns; it cannot decide or cancel.
  test("the Lead has no approve, reject or cancel power over a request", async ({ page, pageAs, db }) => {
    await seedWorkload(db, pageAs);
    const event = await submitViaApi(page.request, journeyName);
    const lead = await pageAs("lead");
    await assignViaApi(lead, event.id, "Coordinator 1");

    // UI: the Lead has no review controls on the event (the Lead is not a party to it, so the page shows nothing).
    await lead.goto(`/events/${event.id}`);
    await expect(lead.getByRole("button", { name: "Review Event" })).toHaveCount(0);
    await expect(lead.getByRole("button", { name: "Submit Decision" })).toHaveCount(0);
    await expect(lead.getByRole("radio", { name: "Approve" })).toHaveCount(0);
    await expect(lead.getByRole("radio", { name: "Reject" })).toHaveCount(0);
    await expect(lead.getByRole("button", { name: /Cancel/ })).toHaveCount(0);

    // API: approve, reject and cancel are refused.
    await expectRefused(await lead.request.post(`${apiBase}/api/events/${event.id}/approve`));
    await expectRefused(
      await lead.request.post(`${apiBase}/api/events/${event.id}/reject`, { data: { reason: "The Lead may not reject requests" } }),
    );
    await expectRefused(
      await lead.request.post(`${apiBase}/api/events/${event.id}/status-change`, { data: { targetStatus: "Cancelled" } }),
    );

    // Unchanged: still Submitted with coordinator1, and the organiser has no decision notice.
    const coordinator1 = await pageAs("coordinator1");
    const stored = await readEvent(coordinator1, event.id);
    expect(stored.status).toBe("submitted");
    expect(stored.coordinatorName).toBe("Coordinator 1");
    expect(await noticesFor(page, event.id)).toEqual([]);
  });
});
