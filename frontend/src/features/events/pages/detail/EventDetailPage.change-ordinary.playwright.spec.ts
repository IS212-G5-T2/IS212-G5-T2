// SPM-192 E2E-22: ordinary edit, no re-review (docs/test-cases/e2e/E2E-22.md).
//
// Stories: SPM-49, SPM-85, SPM-64, SPM-97, SPM-157.
// Actor (E2E-22 Note 1): the assigned Coordinator makes a direct edit; the Organiser path is E2E-25 and E2E-27's.
// Note 2 / assumption S2: the event form has no separate "programme text" field, so only the description is changed.
// Note 4: the Organiser's direct visit to /events/:id/edit is recorded as an annotation, not asserted.
// Arrange deviation: no builder exists for equipment, so the reservation is made through the product API
// (Coordinator 1 requests 2 projectors, Technical Support 1 reserves them), as the case allows.
// SPM-168 Q1 (back-to-back allowed) is not exercised here; Q3 (denial reason rules) belongs to E2E-27.
import { type APIRequestContext, type APIResponse } from "@playwright/test";
import { expect, test } from "../../../../../e2e/fixtures";

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";
const REFUSAL = [401, 403, 404];
const NEW_DESCRIPTION = "E2E-22 updated description";
const REFUSED_DESCRIPTION = "E2E-22 should be refused";

type Json = any; // response bodies are asserted field by field

async function ok(response: APIResponse, expected?: number): Promise<Json> {
  const text = await response.text();
  if (expected !== undefined) expect(response.status(), text).toBe(expected);
  else expect(response.ok(), `${response.status()} ${text}`).toBe(true);
  return text ? JSON.parse(text) : {};
}

/**
 * Arrange gap: the scene builder leaves an event's room layout and description empty, and the planning form refuses to
 * save anything (even an unrelated field) while either is blank. The Coordinator therefore fills both through the product
 * first: the description applies at once, the layout is reviewed against the venue booking and is confirmed.
 */
async function completeRequiredPlanningFields(api: APIRequestContext, eventId: string, description: string) {
  const base = `${apiBase}/api/events/${eventId}/planning`;
  await ok(await api.patch(base, { data: { description, layout: "Theatre" } }), 200);
  const view = await ok(await api.get(base), 200);
  for (const change of view.pendingChanges as Json[])
    for (const impact of (change.impacts as Json[]).filter((item) => item.impacted))
      await ok(await api.post(`${base}/changes/${change.id}/resolve`, { data: { decision: "confirm", bookingId: impact.bookingId } }), 201);
  expect(((await ok(await api.get(base), 200)).pendingChanges as Json[]), "no change is left awaiting review").toEqual([]);
}

test.use({ as: "coordinator" });

test.describe("E2E-22 ordinary edit", () => {
  test("E2E-22 a Coordinator's description edit applies at once, touches no booking or reservation, and the capacity boundary flags only the excess @P1", async ({ page, db, pageAs }) => {
    const scene = await db.scene({
      venues: { hall: { name: "E2E-22 Hall", capacity: 100, setupMinutes: 30, turnaroundMinutes: 45 } },
      equipment: { projector: { name: "E2E-22 Projector", quantity: 10, type: "Visual" } },
      events: {
        plan: {
          name: "E2E-22 Planning event", status: "Planning", venue: "hall", expectedAttendance: 60, startInDays: 30, durationHours: 2,
          organiserEmail: "organiser1@connectsphere.test", coordinatorEmail: "coordinator1@connectsphere.test",
        },
      },
    });
    const eventId = scene.events.plan.id;
    const coordinator = page.request;
    const organiserPage = await pageAs("organiser");
    const techSupportPage = await pageAs("tech_support");
    const url = (path: string) => `${apiBase}${path}`;

    const planning = async () => ok(await coordinator.get(url(`/api/events/${eventId}/planning`)), 200);
    const equipmentRecords = async () =>
      (await ok(await coordinator.get(url("/api/equipment/requests")), 200) as Json[]).filter((record) => record.eventId === eventId);
    const arrangements = async () => {
      const body = await ok(await coordinator.get(url(`/api/events/${eventId}/arrangements-status`)), 200);
      return body.checklist ?? body;
    };
    const bookings = async () =>
      ((await planning()).venueBookings as Json[]).map(({ id, status, start, end, requestStatus }) => ({ id, status, start, end, requestStatus }));

    // --- Arrange through the product (steps 1 to 3) -------------------------------------------------------------------
    let before: { description: string; lastUpdatedAt: string; bookings: Json[]; equipment: Json[]; arrangements: Json };
    await test.step("Steps 1 to 3: 2 projectors requested and reserved; snapshot taken", async () => {
      await completeRequiredPlanningFields(coordinator, eventId, "E2E-22 original description");
      const created = await ok(
        await coordinator.post(url("/api/equipment/requests"), {
          data: { eventId, items: [{ equipmentName: scene.equipment.projector.name, equipmentType: "Visual", quantity: 2 }] },
        }),
        201,
      );
      await ok(await techSupportPage.request.patch(url(`/api/equipment/requests/${created.id}/reserve`)), 200);

      const view = await planning();
      const records = await equipmentRecords();
      expect(records, "one equipment request for the event").toHaveLength(1);
      expect(String(records[0].status)).toBe("Reserved");
      before = { description: view.event.description, lastUpdatedAt: view.lastUpdatedAt, bookings: await bookings(), equipment: records, arrangements: await arrangements() };
      expect(before.bookings, "the builder's approved venue booking").toHaveLength(1);
      expect(view.pendingChanges).toEqual([]);
    });

    // --- A. The ordinary edit ----------------------------------------------------------------------------------------
    await test.step("Step 4: the event information shows which fields apply at once and which need review (SPM-49 AC1, AC2)", async () => {
      await page.goto(`/events/${eventId}`);
      await expect(page.locator("#planning-description")).toBeVisible();
      await expect(page.getByText("Applies immediately").first()).toBeVisible();
      await expect(page.getByText("Review if it affects bookings").first()).toBeVisible();
      const modes = Object.fromEntries(((await planning()).editableFields as Json[]).map((entry) => [entry.field, entry.mode]));
      expect(modes.description, "the description is a direct field").toBe("direct");
    });

    await test.step("Steps 5 and 6: the description is saved, shown after reload, and the last-updated time moves (SPM-49 AC3, AC5, AC6)", async () => {
      await page.locator("#planning-description").fill(NEW_DESCRIPTION);
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByText("Changes saved.")).toBeVisible();
      await page.reload();
      await expect(page.locator("#planning-description")).toHaveValue(NEW_DESCRIPTION);

      const after = await planning();
      expect(after.event.description).toBe(NEW_DESCRIPTION);
      expect(Date.parse(after.lastUpdatedAt), "the stored last-updated time is later").toBeGreaterThan(Date.parse(before.lastUpdatedAt));
    });

    await test.step("Step 7: nothing is flagged and no change request exists; the event is still Planning (SPM-85 AC1)", async () => {
      const after = await planning();
      expect(after.pendingChanges).toEqual([]);
      expect(String(after.event.status).toLowerCase()).toBe("planning");
      expect(await ok(await coordinator.get(url(`/api/events/${eventId}/change-requests`)), 200)).toEqual([]);
    });

    await test.step("Step 8: the venue booking and the equipment reservation are untouched and not returned for review", async () => {
      expect(await bookings()).toEqual(before.bookings);
      const records = await equipmentRecords();
      expect(records).toHaveLength(1);
      expect(String(records[0].status)).toBe("Reserved");
      expect(records[0].items.map((item: Json) => item.quantity)).toEqual(before.equipment[0].items.map((item: Json) => item.quantity));
      expect(records[0].items[0].quantity).toBe(2);
      expect(await arrangements()).toEqual(before.arrangements);
    });

    await test.step("Step 9: the history has one entry for the update with old value, new value, actor and time (SPM-157 AC1)", async () => {
      const history = await ok(await coordinator.get(url(`/api/events/${eventId}/history`)), 200);
      // The arrange step also wrote a description (the builder leaves it blank), so pick the entry for this edit.
      const entries = ((history.sections.event ?? []) as Json[]).filter((entry) =>
        (entry.changes as Json[]).some((change) => change.field === "description" && change.to === NEW_DESCRIPTION),
      );
      expect(entries, "exactly one entry for the description edit").toHaveLength(1);
      const change = (entries[0].changes as Json[]).find((item) => item.field === "description")!;
      expect(change.from).toBe(before.description);
      expect(change.to).toBe(NEW_DESCRIPTION);
      expect(entries[0].actor.kind).toBe("user");
      expect(entries[0].actor.name).toMatch(/coordinator/i);
      expect(Date.parse(entries[0].occurredAt)).not.toBeNaN();
    });

    await test.step("Step 10: Organiser 1 sees the new description (SPM-97 AC5; Note 3 assumption S3)", async () => {
      await organiserPage.goto(`/events/${eventId}`);
      await expect(organiserPage.getByText(NEW_DESCRIPTION).first()).toBeVisible();
    });

    // --- B. The Organiser cannot edit directly ---------------------------------------------------------------------
    await test.step("Step 11: no edit control for the Organiser (SPM-97 AC4); the /edit route is recorded, not asserted (Note 4)", async () => {
      await organiserPage.goto(`/events/${eventId}`);
      await expect(organiserPage.getByText(NEW_DESCRIPTION).first()).toBeVisible();
      await expect(organiserPage.locator("#planning-description")).toHaveCount(0);
      await expect(organiserPage.getByRole("button", { name: "Save changes" })).toHaveCount(0);

      await organiserPage.goto(`/events/${eventId}/edit`);
      await organiserPage.waitForLoadState("networkidle");
      test.info().annotations.push({
        type: "observation",
        description: `E2E-22 Note 4: /events/:id/edit for a Planning event as Organiser 1 ends at ${new URL(organiserPage.url()).pathname}; save controls shown: ${await organiserPage.getByRole("button", { name: /save/i }).count()}.`,
      });
    });

    await test.step("Step 12: a direct update by Organiser 1 is refused and the stored text is unchanged", async () => {
      const attempt = await organiserPage.request.patch(url(`/api/events/${eventId}/planning`), { data: { description: REFUSED_DESCRIPTION } });
      expect(REFUSAL, `PATCH planning as Organiser 1 was answered ${attempt.status()}`).toContain(attempt.status());
      expect((await planning()).event.description).toBe(NEW_DESCRIPTION);
    });

    // --- C. Boundary control: where "ordinary" ends -------------------------------------------------------------------
    await test.step("Step 13: attendance 100, exactly the venue capacity, applies at once (SPM-49 AC5, SPM-85 AC2)", async () => {
      const bookingsBefore = await bookings();
      const result = await ok(await coordinator.patch(url(`/api/events/${eventId}/planning`), { data: { expectedAttendance: 100 } }), 200);
      expect(result.applied).toEqual(["expectedAttendance"]);
      expect(result.flagged).toEqual([]);
      const view = await planning();
      expect(view.event.expectedAttendance).toBe(100);
      expect(view.pendingChanges).toEqual([]);
      expect(await bookings()).toEqual(bookingsBefore);
    });

    await test.step("Step 14: attendance 101, one above capacity, is flagged with current 100, proposed 101 and the booking (SPM-85 AC1 to AC3)", async () => {
      await page.goto(`/events/${eventId}`);
      await page.locator("#planning-attendance").fill("101");
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByText(/sent for review/).first()).toBeVisible();
      await expect(page.getByTestId("pending-expectedAttendance")).toContainText("101");

      const view = await planning();
      expect(view.event.expectedAttendance, "the stored attendance is still 100").toBe(100);
      expect(view.pendingChanges).toHaveLength(1);
      const [change] = view.pendingChanges as Json[];
      expect(change.field).toBe("expectedAttendance");
      expect(change.currentValue).toBe(100);
      expect(change.proposedValue).toBe(101);
      expect(String(change.status)).toBe("Needs Review");
      expect((change.impacts as Json[]).filter((impact) => impact.impacted).map((impact) => impact.venueName)).toEqual([scene.venues.hall.name]);
    });

    await test.step("Step 15: the Coordinator rejects the flagged change; attendance stays 100 and the history says Rejected (SPM-85 AC4, AC6)", async () => {
      await page.getByRole("button", { name: "Reject Change", exact: true }).click();
      await expect.poll(async () => ((await planning()).pendingChanges as Json[]).length).toBe(0);
      expect((await planning()).event.expectedAttendance).toBe(100);

      const rows = (await ok(await coordinator.get(url(`/api/events/${eventId}/planning/history`)), 200)) as Json[];
      const rejected = rows.filter((row) => row.field === "expectedAttendance" && row.status === "Rejected");
      expect(rejected, "one Rejected entry for the 101 proposal").toHaveLength(1);
      expect(rejected[0].originalValue).toBe(100);
      expect(rejected[0].proposedValue).toBe(101);
      expect(rejected[0].resolvedValue).toBe(100);
      expect(rejected[0].resolvedBy).toMatch(/coordinator/i);
    });
  });
});
