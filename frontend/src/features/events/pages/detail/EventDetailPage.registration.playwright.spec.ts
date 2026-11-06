// SPM-191 / SPM-192 E2E-21: register, capacity, withdraw (docs/test-cases/e2e/E2E-21.md).
//
// Part A (steps 1-8) and part B (steps 10-12) are the P0 half: first-time registration on a non-full event, the
// report for the managers, then filling to capacity with the next attendee refused. Parts C-E (withdraw and release,
// waiting list and promotion, negatives) are P1. The existing EventDetailPage.withdraw.playwright.spec.ts covers
// withdrawal from a full event on the "withdrawal" preset and is not repeated here.
//
// Status labels (SPM-168 Q10): the UI shows "You're registered", "You're on the waitlist" and the "Withdrawn" card;
// the API lower-cases the stored title-case status ("registered", "waitlisted", "withdrawn").
// Not asserted, no endpoint exists: steps 9 and 18 notifications (see E2E-21 Notes 5 and 8; the backend has no
// notifications controller, so there is nothing to read).
import type { Page } from "@playwright/test";
import { expect, test, type Scene } from "../../../../../e2e/fixtures";

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";
// 401/403/404 are all valid refusals; the case fixes no exact code for the report or planning reads (Notes 7, 10).
const REFUSAL = [401, 403, 404];

const GALA = "E2E-21 Gala";
const email = (account: string) => `${account}@connectsphere.test`;

function scene(registrations: Scene["registrations"] = []): Scene {
  return {
    venues: { hall: { name: "E2E-21 Hall", capacity: 100 } },
    events: {
      gala: {
        name: GALA, status: "Confirmed", venue: "hall", capacity: 2, expectedAttendance: 2,
        startInDays: 30, durationHours: 2,
        organiserEmail: email("organiser1"), coordinatorEmail: email("coordinator1"),
      },
      unconfirmed: { name: "E2E-21 Approved", status: "Approved", capacity: 2 },
      cancelled: { name: "E2E-21 Cancelled", status: "Cancelled", capacity: 2 },
      disabled: { name: "E2E-21 Disabled", status: "Confirmed" },
    },
    registrations,
  };
}

async function openGala(page: Page): Promise<void> {
  await page.goto("/events");
  await page.getByRole("link", { name: new RegExp(GALA) }).first().click();
  await expect(page.getByRole("heading", { name: GALA })).toBeVisible();
}

/** The "Available" figure of the registration section while the viewer has no registration of their own. */
const available = (page: Page) => page.locator("dt", { hasText: "Available" }).locator("xpath=following-sibling::dd");

async function register(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await page.getByRole("button", { name: "Submit registration" }).click();
}

async function myRegistration(page: Page, eventId: string): Promise<{ status: string } | null> {
  const resp = await page.request.get(`${apiBase}/api/events/${eventId}/registrations/me`);
  if (resp.status() !== 200) return null;
  return ((await resp.json()) as { registration: { status: string } | null }).registration;
}

async function spotsLeft(page: Page, eventId: string): Promise<number> {
  const resp = await page.request.get(`${apiBase}/api/events/${eventId}`);
  expect(resp.status()).toBe(200);
  return ((await resp.json()) as { availableRegistrationSpots: number }).availableRegistrationSpots;
}

interface ApiReport { totalConfirmed: number; registrations: Array<{ email: string; fullName: string; status: string }> }
async function report(page: Page, eventId: string): Promise<ApiReport> {
  const resp = await page.request.get(`${apiBase}/api/events/${eventId}/registrations/report`);
  expect(resp.status()).toBe(200);
  return (await resp.json()) as ApiReport;
}

test.describe("E2E-21 Register, capacity, withdraw", () => {
  test.use({ as: "attendee" });

  test("A: an attendee registers for a non-full event and the managers see the registration @P0", async ({ page, db, pageAs }) => {
    const { events } = await db.scene(scene());
    const gala = events.gala;

    // Steps 1-2: open the event, see two spots, open the form (name and email prefilled) and submit.
    await openGala(page);
    await expect(available(page)).toHaveText("2 spots");
    await page.getByRole("button", { name: "Register", exact: true }).click();
    await expect(page.getByLabel(/Full name/)).toHaveValue("Attendee 1");
    await expect(page.getByLabel(/Email/)).toHaveValue(email("attendee1"));
    await page.getByRole("button", { name: "Submit registration" }).click();

    // Step 3: SPM-168 Q10 confirmation text, registered status, one spot fewer, no second registration.
    await expect(page.getByText(`Registration successful. You are registered for ${GALA}.`)).toBeVisible();
    await expect(page.getByText("You're registered")).toBeVisible();
    await expect(page.getByRole("button", { name: "Register", exact: true })).toHaveCount(0);
    expect(await spotsLeft(page, gala.id)).toBe(1);
    const duplicate = await page.request.post(`${apiBase}/api/events/${gala.id}/registrations`, {
      data: { fullName: "Attendee 1", email: email("attendee1") },
    });
    expect(duplicate.status()).toBe(409);
    expect(((await duplicate.json()) as { code: string }).code).toBe("already_registered");

    // Steps 4-5: a reload keeps the status; the stored state is exactly one registered row.
    await page.reload();
    await expect(page.getByText("You're registered")).toBeVisible();
    expect(await spotsLeft(page, gala.id)).toBe(1);
    expect((await myRegistration(page, gala.id))?.status).toBe("registered");

    // Steps 6-7: the owning organiser and the assigned coordinator see the same single row.
    for (const who of ["organiser", "coordinator"] as const) {
      const manager = await pageAs(who);
      await manager.goto(`/events/${gala.id}/registrations/report`);
      await expect(manager.getByText("1 Attendee Registered (1 / 2)")).toBeVisible();
      const rows = manager.getByRole("row").filter({ hasText: email("attendee1") });
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText("Attendee 1");
      await expect(rows.first()).toContainText(/\d{1,2} [A-Z][a-z]{2} \d{4}/);
      const body = await report(manager, gala.id);
      expect(body.totalConfirmed).toBe(1);
      expect(body.registrations).toHaveLength(1);
    }

    // Step 8: other organiser, other coordinator and another attendee are refused the report, UI and API.
    for (const who of ["organiser2", "coordinator2", "attendee2"] as const) {
      const outsider = await pageAs(who);
      await outsider.goto(`/events/${gala.id}/registrations/report`);
      await expect(outsider.getByRole("alert")).toBeVisible();
      await expect(outsider.getByText(email("attendee1"))).toHaveCount(0);
      const resp = await outsider.request.get(`${apiBase}/api/events/${gala.id}/registrations/report`);
      expect(REFUSAL).toContain(resp.status());
      expect(await resp.text()).not.toContain(email("attendee1"));
    }
    // Step 9 (no notification for the managers) is not asserted: the backend has no notifications read endpoint.
  });

  test("B: the last place succeeds and the next attendee is offered the waiting list, not a register button @P0", async ({ page, db, pageAs }) => {
    const { events } = await db.scene(scene());
    const gala = events.gala;

    await openGala(page);
    await register(page);
    await expect(page.getByText("You're registered")).toBeVisible();

    // Step 10: attendee 2 takes the last place; no spots are left.
    const attendee2 = await pageAs("attendee2");
    await openGala(attendee2);
    await expect(available(attendee2)).toHaveText("1 spot");
    await register(attendee2);
    await expect(attendee2.getByText(`Registration successful. You are registered for ${GALA}.`)).toBeVisible();
    await expect(attendee2.getByText("You're registered")).toBeVisible();
    expect(await spotsLeft(attendee2, gala.id)).toBe(0);

    // Step 11: attendee 3 sees the event is full with a waiting list and no Register control.
    const attendee3 = await pageAs("attendee3");
    await openGala(attendee3);
    await expect(attendee3.getByRole("heading", { name: "Event full" })).toBeVisible();
    await expect(available(attendee3)).toHaveText("0 of 2 available");
    await expect(attendee3.getByText("This event is full. Join the waitlist to be notified if a spot opens.")).toBeVisible();
    await expect(attendee3.getByRole("button", { name: "Join Waitlist" })).toBeEnabled();
    await expect(attendee3.getByRole("button", { name: "Register", exact: true })).toHaveCount(0);

    // Step 12: a direct registration is refused 422 registration_full and stores nothing.
    const direct = await attendee3.request.post(`${apiBase}/api/events/${gala.id}/registrations`, {
      data: { fullName: "Attendee 3", email: email("attendee3") },
    });
    expect(direct.status()).toBe(422);
    const refusal = (await direct.json()) as { code: string; message: string };
    expect(refusal.code).toBe("registration_full");
    expect(refusal.message).toBeTruthy();
    expect(await myRegistration(attendee3, gala.id)).toBeNull();
    expect((await report(await pageAs("coordinator"), gala.id)).totalConfirmed).toBe(2);
  });

  test("C+D: withdrawing releases a place, then the waiting list promotes automatically @P1", async ({ page, db, pageAs }) => {
    const { events } = await db.scene(scene([
      { event: "gala", attendee: email("attendee1"), status: "Registered" },
      { event: "gala", attendee: email("attendee2"), status: "Registered" },
    ]));
    const gala = events.gala;

    // Steps 13-14: withdraw through the prompt that names the consequence; the status and the spot figure change.
    await openGala(page);
    await page.getByRole("button", { name: "Withdraw", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Withdraw your registration?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("You'll give up your spot for this event.");
    await dialog.getByRole("button", { name: "Withdraw", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Registration withdrawn" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Withdrawn" })).toBeVisible();
    expect((await myRegistration(page, gala.id))?.status).toBe("withdrawn");
    expect(await spotsLeft(page, gala.id)).toBe(1);

    // Step 15: attendee 3 now registers directly and the event is full again.
    const attendee3 = await pageAs("attendee3");
    await openGala(attendee3);
    await expect(available(attendee3)).toHaveText("1 spot");
    await register(attendee3);
    await expect(attendee3.getByText("You're registered")).toBeVisible();
    expect(await spotsLeft(attendee3, gala.id)).toBe(0);

    // Step 16: the coordinator's report counts attendees 2 and 3 as the active registrations.
    const coordinator = await pageAs("coordinator");
    const afterC = await report(coordinator, gala.id);
    expect(afterC.totalConfirmed).toBe(2);
    expect(afterC.registrations.find((r) => r.email === email("attendee1"))?.status).toBe("withdrawn");

    // Step 17: attendee 1 joins the waiting list of the full event.
    await page.reload();
    await page.getByRole("button", { name: "Join Waitlist" }).click();
    await expect(page.getByText(`You have joined the waitlist for ${GALA}. Your position is 1.`)).toBeVisible();
    await expect(page.getByText("You're on the waitlist")).toBeVisible();
    await expect(page.getByText("You're #1 in line")).toBeVisible();
    expect((await myRegistration(page, gala.id))?.status).toBe("waitlisted");

    // Step 18: attendee 2 withdraws; attendee 1 is promoted with no action. The promotion notification is not
    // asserted (no notifications read endpoint).
    const attendee2 = await pageAs("attendee2");
    await openGala(attendee2);
    await attendee2.getByRole("button", { name: "Withdraw", exact: true }).click();
    await attendee2.getByRole("dialog").getByRole("button", { name: "Withdraw", exact: true }).click();
    await expect(attendee2.getByRole("status").filter({ hasText: "Registration withdrawn" })).toBeVisible();
    await page.reload();
    await expect(page.getByText("You're registered")).toBeVisible();
    expect((await myRegistration(page, gala.id))?.status).toBe("registered");

    // Step 23 (gala part): attendee 2 withdrawn, attendee 3 registered, attendee 1 promoted; total 2.
    const final = await report(coordinator, gala.id);
    expect(final.totalConfirmed).toBe(2);
    const statusOf = (account: string) => final.registrations.find((r) => r.email === email(account))?.status;
    expect(statusOf("attendee1")).toBe("registered");
    expect(statusOf("attendee2")).toBe("withdrawn");
    expect(statusOf("attendee3")).toBe("registered");
  });

  test("E: unconfirmed, cancelled and registration-disabled events cannot be registered for, and planning stays hidden @P1", async ({ page, db, pageAs }) => {
    const { events } = await db.scene(scene());
    const body = { fullName: "Attendee 1", email: email("attendee1") };

    // Step 19: an unconfirmed event is not visible; POST 404.
    await page.goto(`/events/${events.unconfirmed.id}`);
    await expect(page.getByText(events.unconfirmed.name)).toHaveCount(0);
    expect((await page.request.post(`${apiBase}/api/events/${events.unconfirmed.id}/registrations`, { data: body })).status()).toBe(404);
    expect(await myRegistration(page, events.unconfirmed.id)).toBeNull();

    // Step 20: a cancelled event offers no Register control and the POST is refused (exact code assumed, Notes 9).
    await page.goto(`/events/${events.cancelled.id}`);
    await expect(page.getByRole("button", { name: "Register", exact: true })).toHaveCount(0);
    const cancelled = await page.request.post(`${apiBase}/api/events/${events.cancelled.id}/registrations`, { data: body });
    expect(cancelled.ok()).toBe(false);
    expect(await myRegistration(page, events.cancelled.id)).toBeNull();

    // Step 21: a registration-disabled event offers no Register control; POST 422 REGISTRATION_DISABLED.
    await page.goto(`/events/${events.disabled.id}`);
    await expect(page.getByRole("button", { name: "Register", exact: true })).toHaveCount(0);
    const disabled = await page.request.post(`${apiBase}/api/events/${events.disabled.id}/registrations`, { data: body });
    expect(disabled.status()).toBe(422);
    expect(((await disabled.json()) as { code: string }).code).toBe("REGISTRATION_DISABLED");
    expect(await myRegistration(page, events.disabled.id)).toBeNull();

    // Step 22: an attendee sees no internal planning in the UI and every planning read is refused (Notes 10).
    const attendee3 = await pageAs("attendee3");
    await openGala(attendee3);
    await expect(attendee3.getByRole("heading", { name: /venue booking|equipment request|arrangements|history/i })).toHaveCount(0);
    for (const path of ["planning", "history", "arrangements-status"]) {
      const resp = await attendee3.request.get(`${apiBase}/api/events/${events.gala.id}/${path}`);
      expect(REFUSAL).toContain(resp.status());
    }
  });
});
