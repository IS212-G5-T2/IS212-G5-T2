import { randomUUID } from "node:crypto";
import type { APIResponse, Page } from "@playwright/test";
import { emailOf } from "../../../../../e2e/accounts";
import { isoDateFromNow } from "../../../../../e2e/dates";
import { expect, test } from "../../../../../e2e/fixtures";

/*
 * E2E-07 (docs/test-cases/e2e/E2E-07.md): venue search and suitability, SPM-52/54/51. Coordinator1 opens search from her
 * Approved event, the filters start from the event, each unsuitable venue is excluded for its own reason, capacity is
 * checked at 99, 100 and 101, a venue booked by coordinator2 drops out of the clashing window, a missing facility is
 * flagged without blocking, and the clash cannot be submitted.
 *
 * Builder gap (_PREREQUISITES.md item 1): `buildVenue` cannot set layouts, facilities or accessibility, and
 * `buildEvent` cannot set an event's layout, facilities or accessibility needs. So the five venues are created with
 * POST /api/venues as venue_staff1 (the call the Create Venue form makes; E2E-01 drives the form itself) and the
 * journey event is created, assigned and approved through the product's own event, lead and review endpoints. The
 * Coordinator's side (search, availability, booking refusal) is all UI. No product, builder or doc file is changed.
 *
 * Decisions in force (SPM-190, 2026-11-06): Q1 back-to-back allowed (the control window 15:00-17:00 is clear of the
 * occupied 09:30-12:45, so the boundary is not touched), Q3 rejection reasons (none here), Q8 holds block outright (none).
 * Pending requests coexist (commit ffa205b7): the other event's booking is approved before the search, so it blocks.
 *
 * Other differences from the case text, all deliberate:
 *   - `E07 No Projector` offers Wi-Fi rather than no facilities: the venue API requires at least one facility.
 *   - `coordinatorEmail` exists on the builder and is used for the other event; `placeEvent` turns a Singapore wall
 *     time on D into startInDays and durationHours (events land up to a second late, which moves no result).
 *   - The Playwright process has no SQL access: "database" checks read the product's API (_PREREQUISITES.md item 2).
 */
test.use({ timezoneId: "Asia/Singapore", as: "coordinator" });

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";
const D = isoDateFromNow(30);
const hourMs = 3_600_000;
const dayMs = 24 * hourMs;
const sgt = (hhmm: string) => new Date(`${D}T${hhmm}:00+08:00`);

const NAMES = {
  hall: "E07 Hall 100",
  noProjector: "E07 No Projector",
  classroomOnly: "E07 Classroom Only",
  noStepFree: "E07 No Step-Free",
  booked: "E07 Booked Hall",
  mine: "E07 Conference",
  other: "E07 Other Event",
} as const;
const ALL_VENUES = [NAMES.hall, NAMES.noProjector, NAMES.classroomOnly, NAMES.noStepFree, NAMES.booked];
const PROJECTOR = "Projector";
const WHEELCHAIR = "Wheelchair access";

const venueBody = (name: string, extra: { layouts?: string[]; facilities?: string[]; accessibility?: string[] } = {}) => ({
  name,
  location: "E07 Building",
  capacity: 100,
  facilities: extra.facilities ?? [PROJECTOR],
  accessibility: extra.accessibility ?? [WHEELCHAIR],
  layouts: extra.layouts ?? ["Theatre"],
  operatingInformation: "E07 venue",
  setupTimeMinutes: 30,
  turnaroundTimeMinutes: 45,
});

async function createVenue(staff: Page, body: ReturnType<typeof venueBody>): Promise<string> {
  const response = await staff.request.post(`${apiBase}/api/venues`, { data: body });
  expect(response.status(), `create ${body.name}`).toBe(201);
  return ((await response.json()) as { venue: { id: string } }).venue.id;
}

function expectRefused(response: APIResponse, what: string) {
  expect(response.status(), `${what} was answered ${response.status()}`).toBeGreaterThanOrEqual(400);
  expect(response.status(), `${what} was answered ${response.status()}`).toBeLessThan(500);
}

const heading = (page: Page, name: string) => page.getByRole("heading", { name, exact: true });
const countText = (page: Page) => page.getByRole("status").filter({ hasText: /venues? match/ });

/** Asserts exactly these venue names are listed, out of the five. */
async function expectListed(page: Page, listed: string[]) {
  for (const name of ALL_VENUES) await expect(heading(page, name), `${name} ${listed.includes(name) ? "listed" : "not listed"}`).toHaveCount(listed.includes(name) ? 1 : 0);
  await expect(countText(page)).toHaveText(`${listed.length} ${listed.length === 1 ? "venue matches" : "venues match"} your criteria.`);
}

test.describe("E2E-07 venue search and suitability", () => {
  test("E2E-07 filters start from the event, each venue returns for its own criterion, the clash cannot be submitted @P1", async ({ page: coordinator1, db, pageAs }) => {
    test.setTimeout(300_000);
    const scene = await db.scene({
      events: {
        other: {
          name: NAMES.other,
          status: "Approved",
          coordinatorEmail: emailOf("coordinator2"),
          startInDays: (sgt("10:00").getTime() - Date.now()) / dayMs,
          durationHours: 2,
        },
      },
    });
    const other = scene.events.other;
    const staff = await pageAs("venue_staff");
    const coordinator2 = await pageAs("coordinator2");
    const organiser = await pageAs("organiser");
    const lead = await pageAs("lead");

    // --- Pre-conditions: five venues, the journey event, and coordinator2's approved booking -----------------------
    const ids = {
      hall: await createVenue(staff, venueBody(NAMES.hall)),
      noProjector: await createVenue(staff, venueBody(NAMES.noProjector, { facilities: ["Wi-Fi"] })),
      classroomOnly: await createVenue(staff, venueBody(NAMES.classroomOnly, { layouts: ["Classroom"] })),
      noStepFree: await createVenue(staff, venueBody(NAMES.noStepFree, { accessibility: [] })),
      booked: await createVenue(staff, venueBody(NAMES.booked)),
    };

    const created = await organiser.request.post(`${apiBase}/api/events`, {
      data: {
        name: NAMES.mine,
        purpose: "E2E-07 conference",
        description: "Venue search journey",
        startDateTime: sgt("10:00").toISOString(),
        endDateTime: sgt("12:00").toISOString(),
        expectedAttendance: 100,
        layout: "Theatre",
        facilities: [PROJECTOR],
        accessibility: [WHEELCHAIR],
        attachments: [],
        equipmentNeeds: "",
        submissionKey: randomUUID(),
        registrationEnabled: false,
      },
    });
    expect(created.status(), "organiser creates the journey event").toBe(201);
    const createdBody = (await created.json()) as { id?: string; event?: { id: string } };
    const mineId = createdBody.id ?? createdBody.event!.id;
    const coordinatorList = (await (await lead.request.get(`${apiBase}/api/lead/coordinators`)).json()) as Array<{ id: string; name: string }>;
    const coordinator1Id = coordinatorList.find((c) => c.name === "Coordinator 1")!.id;
    expect((await lead.request.post(`${apiBase}/api/lead/queue/${mineId}/assign`, { data: { coordinatorId: coordinator1Id } })).status()).toBe(201);
    expect((await coordinator1.request.post(`${apiBase}/api/events/${mineId}/approve`)).status()).toBe(201);
    expect(((await (await coordinator1.request.get(`${apiBase}/api/events/${mineId}`)).json()) as { status: string }).status.toLowerCase()).toBe("approved");

    // coordinator2 requests E07 Booked Hall for the other event; venue_staff1 approves (occupied 09:30-12:45).
    const bookedRequest = await coordinator2.request.post(`${apiBase}/api/venues/${ids.booked}/booking-requests`, {
      data: { eventId: other.id, start: other.startAt, end: other.endAt },
    });
    expect(bookedRequest.status()).toBe(201);
    const bookedId = ((await bookedRequest.json()) as { id: string }).id;
    expect((await staff.request.post(`${apiBase}/api/venues/bookings/${bookedId}/approve`)).status()).toBe(201);

    await test.step("Step 1: search from the event pre-fills capacity, layout, facility, accessibility and window (SPM-52 AC4)", async () => {
      await coordinator1.goto(`/events/${mineId}`);
      await coordinator1.getByRole("link", { name: "Search Venues" }).click();
      await expect(coordinator1).toHaveURL(new RegExp(`/venues\\?eventId=${mineId}`));
      await expect(coordinator1.getByLabel("Minimum capacity")).toHaveValue("100");
      await expect(coordinator1.getByLabel("Room layout")).toHaveValue("Theatre");
      await expect(coordinator1.getByLabel(PROJECTOR, { exact: true })).toBeChecked();
      await expect(coordinator1.getByLabel(WHEELCHAIR, { exact: true })).toBeChecked();
      await expect(coordinator1.getByLabel("Start date and time")).toHaveValue(`${D}T10:00`);
      await expect(coordinator1.getByLabel("End date and time")).toHaveValue(`${D}T12:00`);
    });

    await test.step("Step 2: one result, with its name, location, capacity, layouts and a way into availability (SPM-52 AC6)", async () => {
      await expectListed(coordinator1, [NAMES.hall]);
      const card = heading(coordinator1, NAMES.hall).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
      await expect(card).toContainText("E07 Building");
      await expect(card).toContainText("Capacity: 100");
      await expect(card).toContainText("Layouts: Theatre");
      await expect(card).toContainText(PROJECTOR);
      await expect(card.getByRole("button", { name: "Check Availability" })).toBeVisible();
    });

    await test.step("Steps 3-5: minimum capacity 99 and 100 keep the venue, 101 removes it with the no-match message (SPM-52 AC2, AC8)", async () => {
      const capacity = coordinator1.getByLabel("Minimum capacity");
      await capacity.fill("99");
      await expectListed(coordinator1, [NAMES.hall]);
      await capacity.fill("100");
      await expectListed(coordinator1, [NAMES.hall]);
      await capacity.fill("101");
      await expectListed(coordinator1, []);
      await expect(coordinator1.getByText("No venues match these filters.")).toBeVisible();
      await expect(coordinator1.getByText(/Try adjusting or clearing some of your filters/)).toBeVisible();
      await capacity.fill("100");
      await expectListed(coordinator1, [NAMES.hall]);
    });

    await test.step("Step 6: relaxing one filter at a time brings back exactly the venue that filter excluded (SPM-52 AC2)", async () => {
      const projector = coordinator1.getByLabel(PROJECTOR, { exact: true });
      await projector.uncheck();
      await expectListed(coordinator1, [NAMES.hall, NAMES.noProjector]);
      await projector.check();
      await expectListed(coordinator1, [NAMES.hall]);

      const layout = coordinator1.getByLabel("Room layout");
      await layout.selectOption("Classroom");
      await expectListed(coordinator1, [NAMES.classroomOnly]);
      await layout.selectOption("");
      await expectListed(coordinator1, [NAMES.hall, NAMES.classroomOnly]);
      await layout.selectOption("Theatre");
      await expectListed(coordinator1, [NAMES.hall]);

      const wheelchair = coordinator1.getByLabel(WHEELCHAIR, { exact: true });
      await wheelchair.uncheck();
      await expectListed(coordinator1, [NAMES.hall, NAMES.noStepFree]);
      await wheelchair.check();
      await expectListed(coordinator1, [NAMES.hall]);
    });

    await test.step("Step 7: the booked venue is absent for 10:00-12:00 and present for 15:00-17:00 (SPM-52 AC3)", async () => {
      // Occupied 10:00 - 30 min to 12:00 + 45 min = 09:30 to 12:45, so 15:00 is clear by more than a minute (Q1 not touched).
      const start = coordinator1.getByLabel("Start date and time");
      const end = coordinator1.getByLabel("End date and time");
      await end.fill(`${D}T17:00`);
      await start.fill(`${D}T15:00`);
      await expectListed(coordinator1, [NAMES.hall, NAMES.booked]);
      await start.fill(`${D}T10:00`);
      await end.fill(`${D}T12:00`);
      await expectListed(coordinator1, [NAMES.hall]);
    });

    await test.step("Step 8: a missing facility is a warning on the availability page and does not block the request (SPM-54 AC1)", async () => {
      await coordinator1.goto(`/venue-records/${ids.noProjector}?eventId=${mineId}`);
      await expect(heading(coordinator1, NAMES.noProjector)).toBeVisible();
      const suitability = coordinator1.getByLabel("Venue suitability");
      await expect(suitability).toContainText("Suitability needs review");
      await expect(suitability).toContainText(`Missing facility: ${PROJECTOR}.`);
      // Not blocking: the slot is free and the submit control is offered and enabled; it is deliberately not clicked.
      await expect(coordinator1.getByRole("status").filter({ hasText: "This time is available for this venue." })).toBeVisible();
      await expect(coordinator1.getByRole("button", { name: "Submit booking request" })).toBeEnabled();
    });

    await test.step("Step 9: the booked venue shows the slot as conflicting, offers no submit and names the booking (SPM-51 AC4, AC7)", async () => {
      await coordinator1.goto(`/venue-records/${ids.booked}?eventId=${mineId}`);
      await expect(heading(coordinator1, NAMES.booked)).toBeVisible();
      const alert = coordinator1.getByRole("alert").filter({ hasText: "This time is unavailable" });
      await expect(alert).toBeVisible();
      await expect(alert).toContainText(NAMES.other);
      await expect(coordinator1.getByRole("status").filter({ hasText: "This time is available for this venue." })).toHaveCount(0);
      await expect(coordinator1.getByRole("button", { name: "Submit booking request" })).toHaveCount(0);
    });

    await test.step("Step 10: the same request by API is refused; no booking row exists for the event and it is still Approved (SPM-148 AC1-2)", async () => {
      // ASSUMPTION [S2]: only the 4xx family is pinned, not the code.
      expectRefused(
        await coordinator1.request.post(`${apiBase}/api/venues/${ids.booked}/booking-requests`, {
          data: { eventId: mineId, start: sgt("10:00").toISOString(), end: sgt("12:00").toISOString() },
        }),
        "API submit for the booked slot",
      );
      const rows = (await (await coordinator1.request.get(`${apiBase}/api/venues/bookings/mine`)).json()) as Array<{ eventId: string }>;
      expect(rows.filter((row) => row.eventId === mineId)).toHaveLength(0);
      expect(((await (await coordinator1.request.get(`${apiBase}/api/events/${mineId}`)).json()) as { status: string }).status.toLowerCase()).toBe("approved");
      // Searching and refusing created no venue notification for coordinator1 (only the assignment notice from the setup).
      const notices = (await (await coordinator1.request.get(`${apiBase}/api/notifications`)).json()) as Array<{ type: string }>;
      expect(notices.filter((n) => /venue/i.test(n.type))).toHaveLength(0);
    });

    await test.step("Step 11: one click clears every filter and lists all five venues (SPM-52 AC7)", async () => {
      await coordinator1.goto(`/venues?eventId=${mineId}`);
      await expectListed(coordinator1, [NAMES.hall]);
      await coordinator1.getByRole("button", { name: "Clear all filters" }).click();
      await expect(coordinator1.getByLabel("Minimum capacity")).toHaveValue("");
      await expect(coordinator1.getByLabel("Room layout")).toHaveValue("");
      await expect(coordinator1.getByLabel("Start date and time")).toHaveValue("");
      await expect(coordinator1.getByLabel("End date and time")).toHaveValue("");
      await expect(coordinator1.getByLabel(PROJECTOR, { exact: true })).not.toBeChecked();
      await expect(coordinator1.getByLabel(WHEELCHAIR, { exact: true })).not.toBeChecked();
      await expectListed(coordinator1, ALL_VENUES);
    });
  });
});
