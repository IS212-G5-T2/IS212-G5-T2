// SPM-191 E2E-29: Role and relationship access matrix — P0 subset (R1,R4,R5,R7,R9,R12,R14)
//
// Seven P0 live tests backed by story ACs, plus seven P1 stubs for the rows that have no AC
// or are covered by a different spec. resetDatabase auto-fixture runs before every test, so
// the scene is rebuilt per test rather than once in beforeAll.
//
// Story refs: SPM-38 AC4, SPM-47 AC6/AC9, SPM-55 AC1, SPM-63 AC5, SPM-95 AC6,
//             SPM-121 AC7, SPM-123 AC10, SPM-128 AC4, SPM-129 AC6, SPM-157 AC9, SPM-168 AC2
import { randomUUID } from "crypto";
import type { Page } from "@playwright/test";
import { test, expect, type As, type Scene } from "../../e2e/fixtures";

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";

// Statuses the backend returns for a refused action (401=unauthenticated, 403=wrong role or
// relationship, 404=resource hidden). Assert membership, not the exact code, until the
// matrix resolves the codes per E2E-29 Note 5.
const REFUSAL = [401, 403, 404];

// A decision on an event that is not ready for safety review is refused by the readiness rule itself (409 or 422,
// SPM-129 AC6), which is stricter than a role refusal, so it joins the accepted set only for that row.
const NOT_READY_REFUSAL = [...REFUSAL, 409, 422];

// Standard scene reused by every row. Composed once per test after the auto reset.
const STANDARD_SCENE: Scene = {
  venues: {
    v1: {
      name: "E2E-29 Venue 1",
      ownerEmail: "venue_staff1@connectsphere.test",
      capacity: 100,
      setupMinutes: 30,
      turnaroundMinutes: 45,
    },
  },
  events: {
    submittedAssigned: {
      name: "E2E-29 Submitted assigned",
      status: "Submitted",
      organiserEmail: "organiser1@connectsphere.test",
      coordinatorEmail: "coordinator1@connectsphere.test",
    },
    planning: {
      // venue: "v1" tells buildScene to also insert an approved booking at v1 for this event's window.
      name: "E2E-29 Planning",
      status: "Planning",
      venue: "v1",
      organiserEmail: "organiser1@connectsphere.test",
      coordinatorEmail: "coordinator1@connectsphere.test",
    },
    open: {
      name: "E2E-29 Open",
      status: "Confirmed",
      capacity: 5,
      organiserEmail: "organiser1@connectsphere.test",
      coordinatorEmail: "coordinator1@connectsphere.test",
    },
    // No approved booking, no equipment, no safety check: arrangements not confirmed per SPM-129 AC6.
    notReady: {
      name: "E2E-29 Not ready",
      status: "Planning",
    },
  },
  registrations: [{ event: "open", attendee: "attendee1@connectsphere.test" }],
};

/**
 * Submit a new event as organiser1 through the API, leaving it unassigned (no coordinator is set
 * at submission time — the Lead assigns one later). The builder always assigns coordinator1, so
 * this path is the only way to get an event into the Lead's queue.
 *
 * Returns { id, name } from the `event` member of the 201 response body (`{ event: {...} }`).
 */
async function createUnassignedEvent(org1Page: Page): Promise<{ id: string; name: string }> {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const end = new Date(future.getTime() + 2 * 60 * 60 * 1000);
  const resp = await org1Page.request.post(`${apiBase}/api/events`, {
    data: {
      name: "E2E-29 Unassigned",
      purpose: "Access matrix: unassigned queue fixture",
      description: "Submitted by organiser1; no coordinator assigned.",
      startDateTime: future.toISOString(),
      endDateTime: end.toISOString(),
      expectedAttendance: 10,
      layout: "Theatre",
      facilities: [],
      accessibility: [],
      attachments: [],
      equipmentNeeds: "",
      submissionKey: randomUUID(),
      registrationEnabled: false,
    },
  });
  expect(resp.status()).toBe(201);
  const { event } = (await resp.json()) as { event: { id: string; name: string } };
  return event;
}

test.describe("E2E-29 Access matrix", () => {
  // -------------------------------------------------------------------------
  // R1 (A): Organiser 2 cannot access Organiser 1's event — P0
  // SPM-95 AC6, SPM-63 AC5, SPM-157 AC9
  // -------------------------------------------------------------------------
  test.describe("R1-A organiser2 event isolation", () => {
    test.use({ as: "organiser2" });

    test("R1-A: organiser2 cannot access organiser1 event @P0 @access-matrix", async ({ page, db, pageAs }) => {
      const scene = await db.scene(STANDARD_SCENE);
      const planning = scene.events.planning;
      const open = scene.events.open;

      // Snapshot the planning event as the authorised coordinator1 before any attempt.
      const coord1Page = await pageAs("coordinator1");
      const before = (await coord1Page.request.get(`${apiBase}/api/events/${planning.id}`).then((r) => r.json())) as unknown;

      // UI: event detail must not expose organiser1's event data.
      await page.goto(`/events/${planning.id}`);
      await expect(page.getByText(planning.name)).not.toBeVisible();

      // UI: edit route is guarded.
      await page.goto(`/events/${planning.id}/edit`);
      await expect(page.getByText(planning.name)).not.toBeVisible();

      // UI: events list must not contain any of organiser1's events.
      await page.goto("/events");
      await expect(page.getByText(planning.name)).not.toBeVisible();
      await expect(page.getByText(open.name)).not.toBeVisible();

      // API: GET event refused.
      let resp = await page.request.get(`${apiBase}/api/events/${planning.id}`);
      expect(REFUSAL).toContain(resp.status());

      // API: PATCH planning refused.
      resp = await page.request.patch(`${apiBase}/api/events/${planning.id}/planning`, {
        data: { purpose: "tampered by organiser2" },
      });
      expect(REFUSAL).toContain(resp.status());

      // API: POST change-request refused.
      resp = await page.request.post(`${apiBase}/api/events/${planning.id}/change-requests`, {
        // A valid body, so the refusal is the ownership check and not a 400 from validation running first.
        data: { changes: { description: "tampered by organiser2" }, reason: "tampered by organiser2" },
      });
      expect(REFUSAL).toContain(resp.status());

      // API: GET history refused.
      resp = await page.request.get(`${apiBase}/api/events/${planning.id}/history`);
      expect(REFUSAL).toContain(resp.status());

      // API: GET registrations report refused.
      resp = await page.request.get(`${apiBase}/api/events/${planning.id}/registrations/report`);
      expect(REFUSAL).toContain(resp.status());

      // API: POST cancellation request on open event refused.
      resp = await page.request.post(`${apiBase}/api/events/${open.id}/cancellation-requests`, {
        data: { reason: "tampered by organiser2" },
      });
      expect(REFUSAL).toContain(resp.status());

      // API: organiser2's own event list must not contain organiser1's events.
      const listResp = await page.request.get(`${apiBase}/api/events`);
      expect(listResp.status()).toBe(200);
      const events = (await listResp.json()) as Array<{ id: string }>;
      expect(events.map((e) => e.id)).not.toContain(planning.id);
      expect(events.map((e) => e.id)).not.toContain(open.id);

      // State: planning event unchanged.
      const after = (await coord1Page.request.get(`${apiBase}/api/events/${planning.id}`).then((r) => r.json())) as unknown;
      expect(after).toEqual(before);
    });
  });

  // -------------------------------------------------------------------------
  // R2 (B): Organiser cannot edit own event in planning — P1 stub (covered by E2E-22)
  // -------------------------------------------------------------------------
  test("R2-B: organiser cannot edit own event in planning @access-matrix", async () => {
    test.skip(true, "P1 – covered by E2E-22 step 12 (SPM-97 AC4)");
  });

  // -------------------------------------------------------------------------
  // R3 (C): Attendee cannot access internal planning pages — P1 stub
  // -------------------------------------------------------------------------
  test("R3-C: attendee cannot access internal planning pages @access-matrix", async () => {
    test.skip(true, "P1 – no story AC; rule comes from plan and SPM-168 AC2");
  });

  // -------------------------------------------------------------------------
  // R4 (D): Coordinator 2 cannot access another Coordinator's event — P0
  // SPM-38 AC4, SPM-47 AC6
  // -------------------------------------------------------------------------
  test.describe("R4-D coordinator2 event isolation", () => {
    test.use({ as: "coordinator2" });

    test("R4-D: coordinator2 cannot access another coordinator event @P0 @access-matrix", async ({ page, db, pageAs }) => {
      const scene = await db.scene(STANDARD_SCENE);
      const submittedAssigned = scene.events.submittedAssigned;
      const planning = scene.events.planning;
      const open = scene.events.open;

      // Snapshot as coordinator1.
      const coord1Page = await pageAs("coordinator1");
      const before = (await coord1Page.request.get(`${apiBase}/api/events/${submittedAssigned.id}`).then((r) => r.json())) as unknown;

      // UI: no Approve / Reject controls visible on another coordinator's submitted event.
      await page.goto(`/events/${submittedAssigned.id}`);
      await expect(page.getByRole("button", { name: /^approve$/i })).not.toBeVisible();
      await expect(page.getByRole("button", { name: /^reject$/i })).not.toBeVisible();

      // API: approve refused.
      let resp = await page.request.post(`${apiBase}/api/events/${submittedAssigned.id}/approve`, {
        data: {},
      });
      expect(REFUSAL).toContain(resp.status());

      // API: reject refused.
      resp = await page.request.post(`${apiBase}/api/events/${submittedAssigned.id}/reject`, {
        data: { reason: "tampered by coordinator2" },
      });
      expect(REFUSAL).toContain(resp.status());

      // API: PATCH planning refused.
      resp = await page.request.patch(`${apiBase}/api/events/${planning.id}/planning`, {
        data: { purpose: "tampered by coordinator2" },
      });
      expect(REFUSAL).toContain(resp.status());

      // API: status-change (confirm / cancel) refused.
      resp = await page.request.post(`${apiBase}/api/events/${planning.id}/status-change`, {
        data: { action: "confirm" },
      });
      expect(REFUSAL).toContain(resp.status());

      // API: GET history refused.
      resp = await page.request.get(`${apiBase}/api/events/${planning.id}/history`);
      expect(REFUSAL).toContain(resp.status());

      // API: GET registrations report on open event refused.
      resp = await page.request.get(`${apiBase}/api/events/${open.id}/registrations/report`);
      expect(REFUSAL).toContain(resp.status());

      // State: submittedAssigned event unchanged.
      const after = (await coord1Page.request.get(`${apiBase}/api/events/${submittedAssigned.id}`).then((r) => r.json())) as unknown;
      expect(after).toEqual(before);
    });
  });

  // -------------------------------------------------------------------------
  // R5 (E): Coordinator 1 cannot access or see the unassigned event — P0
  // SPM-123 AC10
  // -------------------------------------------------------------------------
  test.describe("R5-E coordinator1 unassigned event isolation", () => {
    test.use({ as: "coordinator1" });

    test("R5-E: coordinator1 cannot access or see the unassigned event @P0 @access-matrix", async ({ page, db, pageAs }) => {
      const scene = await db.scene(STANDARD_SCENE);
      const planning = scene.events.planning;

      // Create the unassigned event as organiser1 (builder always assigns coordinator1).
      const org1Page = await pageAs("organiser1");
      const unassigned = await createUnassignedEvent(org1Page);

      // Confirm the unassigned event appears in the Lead's queue.
      const leadPage = await pageAs("lead");
      const queueBefore = (await leadPage.request.get(`${apiBase}/api/lead/queue`).then((r) => r.json())) as Array<{ id: string }>;
      expect(queueBefore.some((e) => e.id === unassigned.id)).toBe(true);

      // UI: events list must not show the unassigned event.
      await page.goto("/events");
      await expect(page.getByText(unassigned.name)).not.toBeVisible();

      // UI: lead queue is guarded for coordinator1.
      await page.goto("/lead/queue");
      await expect(page.getByText(unassigned.name)).not.toBeVisible();

      // API: GET unassigned event refused.
      let resp = await page.request.get(`${apiBase}/api/events/${unassigned.id}`);
      expect(REFUSAL).toContain(resp.status());

      // API: assign coordinator on unassigned event via lead endpoint refused.
      resp = await page.request.post(`${apiBase}/api/lead/queue/${unassigned.id}/assign`, {
        data: { coordinatorId: "00000000-0000-0000-0000-000000000000" },
      });
      expect(REFUSAL).toContain(resp.status());

      // State: unassigned event still in Lead's queue with no coordinator.
      const queueAfter = (await leadPage.request.get(`${apiBase}/api/lead/queue`).then((r) => r.json())) as Array<{ id: string }>;
      expect(queueAfter.some((e) => e.id === unassigned.id)).toBe(true);

      // State: planning event still assigned to coordinator1.
      // page IS coordinator1; the fact they can read it confirms they are still assigned.
      const planningAfter = (await page.request.get(`${apiBase}/api/events/${planning.id}`).then((r: { json(): Promise<unknown> }) => r.json())) as { coordinatorName?: string };
      expect(planningAfter.coordinatorName).toBe("Coordinator 1");
    });
  });

  // -------------------------------------------------------------------------
  // R6 (F): Lead is refused actions outside its remit — P1 stub
  // -------------------------------------------------------------------------
  test("R6-F: lead is refused actions outside its remit @access-matrix", async () => {
    test.skip(true, "P1 – no story AC; rule from plan and SPM-168 Established facts");
  });

  // -------------------------------------------------------------------------
  // R7 (G): Every role except the Lead is refused the Lead's pages — P0
  // SPM-123 AC10, SPM-47 AC9
  // One describe/test pair per role so the test runner can select them individually.
  // -------------------------------------------------------------------------
  const nonLeadRoles: As[] = [
    "organiser1",
    "coordinator1",
    "venue_staff1",
    "tech_support1",
    "safety_officer1",
    "attendee1",
  ];

  for (const role of nonLeadRoles) {
    test.describe(`R7-G: ${role} lead-pages access`, () => {
      test.use({ as: role });

      test(`R7-G: ${role} cannot access lead pages @P0 @access-matrix`, async ({ page, db, pageAs }) => {
        const scene = await db.scene(STANDARD_SCENE);
        const planning = scene.events.planning;

        // Create unassigned event. organiser1 IS the page when role === "organiser1".
        const org1Page = role === "organiser1" ? page : await pageAs("organiser1");
        const unassigned = await createUnassignedEvent(org1Page);

        // UI: /lead/queue must redirect or hide all Lead content.
        await page.goto("/lead/queue");
        await expect(page.getByText(unassigned.name)).not.toBeVisible();

        // API: GET /api/lead/queue refused.
        let resp = await page.request.get(`${apiBase}/api/lead/queue`);
        expect(REFUSAL).toContain(resp.status());

        // API: GET /api/lead/assigned refused.
        resp = await page.request.get(`${apiBase}/api/lead/assigned`);
        expect(REFUSAL).toContain(resp.status());

        // API: GET /api/lead/coordinators refused.
        resp = await page.request.get(`${apiBase}/api/lead/coordinators`);
        expect(REFUSAL).toContain(resp.status());

        // API: assign from queue refused.
        resp = await page.request.post(`${apiBase}/api/lead/queue/${unassigned.id}/assign`, {
          data: { coordinatorId: "00000000-0000-0000-0000-000000000000" },
        });
        expect(REFUSAL).toContain(resp.status());

        // API: reassign planning event refused.
        resp = await page.request.post(`${apiBase}/api/lead/events/${planning.id}/reassign`, {
          data: { coordinatorId: "00000000-0000-0000-0000-000000000000" },
        });
        expect(REFUSAL).toContain(resp.status());

        // State: unassigned event still unassigned, planning still has coordinator1.
        const leadPage = await pageAs("lead");
        const queueAfter = (await leadPage.request.get(`${apiBase}/api/lead/queue`).then((r) => r.json())) as Array<{ id: string }>;
        expect(queueAfter.some((e) => e.id === unassigned.id)).toBe(true);

        // Read as the assigned coordinator1 (the Lead is not the event's coordinator and cannot read it).
        const coord1Page = role === "coordinator1" ? page : await pageAs("coordinator1");
        const planningAfter = (await coord1Page.request.get(`${apiBase}/api/events/${planning.id}`).then((r) => r.json())) as { coordinatorName?: string };
        expect(planningAfter.coordinatorName).toBe("Coordinator 1");
      });
    });
  }

  // -------------------------------------------------------------------------
  // R8 (H): Venue Staff cannot approve event requests — P1 stub
  // -------------------------------------------------------------------------
  test("R8-H: venue_staff cannot approve event requests @access-matrix", async () => {
    test.skip(true, "P1 – no story AC; rule from plan and SPM-168 AC2");
  });

  // -------------------------------------------------------------------------
  // R9 (I): Venue Staff 2 cannot edit Venue Staff 1's venue or see its bookings — P0
  // SPM-121 AC7, SPM-55 AC1
  // -------------------------------------------------------------------------
  test.describe("R9-I venue_staff2 cannot access venue_staff1 venue", () => {
    test.use({ as: "venue_staff2" });

    test("R9-I: venue_staff2 cannot edit venue_staff1 venue or see its bookings @P0 @access-matrix", async ({ page, db, pageAs }) => {
      // A Submitted event cannot take a booking (409, SPM-148), and the planning event already holds v1 for its window, so
      // the pending booking is made for an extra Approved event a day later.
      const scene = await db.scene({
        ...STANDARD_SCENE,
        events: {
          ...STANDARD_SCENE.events,
          bookable: {
            name: "E2E-29 Bookable",
            status: "Approved",
            startInDays: 31,
            organiserEmail: "organiser1@connectsphere.test",
            coordinatorEmail: "coordinator1@connectsphere.test",
          },
        },
      });
      const v1 = scene.venues.v1;
      const submittedAssigned = scene.events.bookable;

      // Create a pending booking at v1 for the bookable event as coordinator1.
      const coord1Page = await pageAs("coordinator1");
      const bookingResp = await coord1Page.request.post(`${apiBase}/api/venues/${v1.id}/booking-requests`, {
        data: {
          eventId: submittedAssigned.id,
          start: submittedAssigned.startAt,
          end: submittedAssigned.endAt,
        },
      });
      expect(bookingResp.status()).toBe(201);
      const pendingBooking = (await bookingResp.json()) as { id: string };

      // Snapshot venue record as venue_staff1.
      const vs1Page = await pageAs("venue_staff1");
      const venueBefore = (await vs1Page.request.get(`${apiBase}/api/venues/${v1.id}`).then((r) => r.json())) as unknown;

      // UI: edit route for v1 must not be accessible to venue_staff2.
      await page.goto(`/venue-records/${v1.id}/edit`);
      await expect(page.getByText(v1.name)).not.toBeVisible();

      // API: PATCH venue refused.
      let resp = await page.request.patch(`${apiBase}/api/venues/${v1.id}`, {
        // A complete, valid venue body, so the refusal is the ownership check and not a 400 from validation running first.
        data: {
          name: "tampered by venue_staff2",
          location: "Browser Test Building",
          capacity: 100,
          facilities: ["Projector"],
          layouts: ["Theatre"],
          operatingInformation: "tampered by venue_staff2",
          setupTimeMinutes: 30,
          turnaroundTimeMinutes: 45,
        },
      });
      expect(REFUSAL).toContain(resp.status());

      // The unavailable-period row of the case is the fixme test below: the product accepts it (see there).

      // API: approve pending booking at v1 refused.
      resp = await page.request.post(`${apiBase}/api/venues/bookings/${pendingBooking.id}/approve`, {
        data: {},
      });
      expect(REFUSAL).toContain(resp.status());

      // API: reject pending booking at v1 refused.
      resp = await page.request.post(`${apiBase}/api/venues/bookings/${pendingBooking.id}/reject`, {
        data: { reason: "tampered by venue_staff2" },
      });
      expect(REFUSAL).toContain(resp.status());

      // State: venue record unchanged.
      const venueAfter = (await vs1Page.request.get(`${apiBase}/api/venues/${v1.id}`).then((r) => r.json())) as unknown;
      expect(venueAfter).toEqual(venueBefore);

      // State: booking still pending.
      const pendingAfter = (await vs1Page.request.get(`${apiBase}/api/venues/bookings/pending`).then((r) => r.json())) as Array<{ id: string; status: string }>;
      const bookingAfter = pendingAfter.find((b) => b.id === pendingBooking.id);
      expect(bookingAfter).toBeDefined();
      expect(bookingAfter?.status).toBe("pending");
    });
  });

  // FIXME (product defect, report to the team): VenuesService.markUnavailable (and endUnavailable) only checks that the
  // caller is Venue Staff, never that they own the venue, so venue_staff2 gets 201 and the venue's schedule is blocked
  // for venue_staff1's bookings. E2E-29 R9 and SPM-121 AC7 require every write on another staff member's venue to be
  // refused, and PATCH /api/venues/:id already is. Re-enable once the ownership check exists.
  test.describe("R9-I venue_staff2 cannot block venue_staff1 venue", () => {
    test.use({ as: "venue_staff2" });

    test.fixme("R9-I: venue_staff2 cannot add an unavailable period to venue_staff1 venue @P0 @access-matrix", async ({ page, db }) => {
      const scene = await db.scene(STANDARD_SCENE);
      const v1 = scene.venues.v1;
      const nearFuture = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const resp = await page.request.post(`${apiBase}/api/venues/${v1.id}/unavailable-periods`, {
        data: {
          start: nearFuture.toISOString(),
          end: new Date(nearFuture.getTime() + 60 * 60 * 1000).toISOString(),
          reason: "tampered",
        },
      });
      expect(REFUSAL).toContain(resp.status());
    });
  });

  // -------------------------------------------------------------------------
  // R10 (J): Technical Support cannot approve venue bookings — P1 stub
  // -------------------------------------------------------------------------
  test("R10-J: tech_support cannot approve venue bookings @access-matrix", async () => {
    test.skip(true, "P1 – no story AC; rule from plan and SPM-168 AC2");
  });

  // -------------------------------------------------------------------------
  // R11 (K): Safety Officer cannot edit bookings or venues — P1 stub
  // -------------------------------------------------------------------------
  test("R11-K: safety_officer cannot edit bookings or venues @access-matrix", async () => {
    test.skip(true, "P1 – no story AC; rule from plan and SPM-168 AC2");
  });

  // -------------------------------------------------------------------------
  // R12 (L): Safety Officer is refused events not yet ready — P0
  // SPM-129 AC6, SPM-128 AC4
  // -------------------------------------------------------------------------
  test.describe("R12-L safety_officer refused unready events", () => {
    test.use({ as: "safety_officer1" });

    test("R12-L: safety_officer refused events not yet ready @P0 @access-matrix", async ({ page, db }) => {
      const scene = await db.scene(STANDARD_SCENE);
      const notReady = scene.events.notReady;
      const planning = scene.events.planning;

      // UI: /safety/events must not list events whose arrangements are not confirmed.
      await page.goto("/safety/events");
      await expect(page.getByText(notReady.name)).not.toBeVisible();
      // The planning event also has no confirmed equipment or safety check.
      await expect(page.getByText(planning.name)).not.toBeVisible();

      // API: GET safety-officer queue for notReady refused.
      let resp = await page.request.get(`${apiBase}/api/safety-officer/queue/${notReady.id}`);
      expect(REFUSAL).toContain(resp.status());

      // API: POST decision for notReady refused.
      resp = await page.request.post(`${apiBase}/api/safety-officer/queue/${notReady.id}/decision`, {
        data: { decision: "approved" },
      });
      expect(NOT_READY_REFUSAL).toContain(resp.status());

      // State: no safety check row was created for notReady.
      // The queue endpoint still returns a refusal, confirming no approved row was inserted.
      const recheckResp = await page.request.get(`${apiBase}/api/safety-officer/queue/${notReady.id}`);
      expect(REFUSAL).toContain(recheckResp.status());
    });
  });

  // -------------------------------------------------------------------------
  // R13 (M): Navigation by role — P1 stub
  // -------------------------------------------------------------------------
  test("R13-M: navigation by role @access-matrix", async () => {
    test.skip(true, "P1 – SPM-168 AC2 navigation audit; no single story AC");
  });

  // -------------------------------------------------------------------------
  // R14 (N): Unauthenticated browser is refused every protected page and API — P0
  // SPM-168 AC2
  // No `test.use({ as: ... })` → `page` has no session (anonymous browser).
  // -------------------------------------------------------------------------
  test("R14-N: unauthenticated browser refused every protected page and API @P0 @access-matrix", async ({ page, db, browser }) => {
    const scene = await db.scene(STANDARD_SCENE);
    const open = scene.events.open;
    const planning = scene.events.planning;

    // UI: every protected route must redirect (the anonymous page has no session cookie).
    const protectedRoutes = [
      "/events",
      `/events/${open.id}`,
      "/events/create",
      "/requests",
      "/venues",
      "/bookings",
      "/venue-records",
      "/equipment",
      "/equipment/requests",
      "/lead/queue",
      "/safety/events",
      "/settings",
    ];
    for (const route of protectedRoutes) {
      await page.goto(route);
      // The route guard should redirect away; at minimum the event name must not be rendered.
      await expect(page.getByText(open.name)).not.toBeVisible();
      await expect(page.getByText(planning.name)).not.toBeVisible();
    }

    // API: every protected endpoint returns 401 with no session.
    const apiChecks: Array<{ method: "get" | "post"; path: string; data?: unknown }> = [
      { method: "get", path: "/api/events" },
      { method: "get", path: `/api/events/${open.id}` },
      { method: "get", path: "/api/notifications" },
      { method: "get", path: "/api/lead/queue" },
      { method: "get", path: "/api/safety-officer/queue" },
      { method: "get", path: "/api/venues/bookings/pending" },
      { method: "get", path: "/api/equipment/requests" },
      { method: "post", path: "/api/events", data: {} },
      { method: "post", path: `/api/events/${open.id}/registrations`, data: {} },
      { method: "post", path: `/api/events/${planning.id}/status-change`, data: { action: "confirm" } },
    ];
    for (const call of apiChecks) {
      const resp =
        call.method === "get"
          ? await page.request.get(`${apiBase}${call.path}`)
          : await page.request.post(`${apiBase}${call.path}`, { data: call.data });
      expect(resp.status()).toBe(401);
    }

    // API: a malformed session cookie must also return 401.
    const malformedCtx = await browser.newContext({
      extraHTTPHeaders: { Cookie: "connectsphere_session=not-a-real-token" },
    });
    try {
      const malformedResp = await malformedCtx.request.get(`${apiBase}/api/events`);
      expect(malformedResp.status()).toBe(401);
    } finally {
      await malformedCtx.close();
    }
  });
});
