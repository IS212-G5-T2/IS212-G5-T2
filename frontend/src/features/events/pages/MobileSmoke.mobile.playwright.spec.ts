// SPM-192 E2E-30: mobile viewport smoke (docs/test-cases/e2e/E2E-30.md), under the `mobile` project (Pixel 7 profile).
//
// Scope: the Attendee half (open, spots, register, confirmation, persistence, no second registration) is the new
// coverage. The Organiser create/draft/submit steps are already run against the real backend by
// create/EventCreatePage.playwright.spec.ts, so body 1 here keeps only what is new at phone size: the Create Event page
// under a touch profile, the mobile navigation control, and the organiser's view of a booked venue (step 8).
// Two bodies because `pageAs` does not copy touch / user agent from the device profile (E2E-30 Notes 3).
import type { Page } from "@playwright/test";
import { expect, test } from "../../../../e2e/fixtures";

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";
const email = (account: string) => `${account}@connectsphere.test`;

/** No horizontal scroll: the document is not wider than the viewport. */
async function expectNoHorizontalScroll(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
    .toBe(true);
}

test.describe("E2E-30 Mobile viewport smoke", () => {
  test.describe("Organiser", () => {
    test.use({ as: "organiser" });

    test("organiser reaches the create form and a booked venue by touch @P1", async ({ page, db }, testInfo) => {
      expect(testInfo.project.name).toBe("mobile");
      const { events } = await db.scene({
        venues: { hall: { name: "E2E-30 Hall", capacity: 100, setupMinutes: 30, turnaroundMinutes: 45 } },
        events: {
          planned: {
            name: "E2E-30 Planned", status: "Planning", venue: "hall",
            organiserEmail: email("organiser1"), coordinatorEmail: email("coordinator1"),
          },
        },
      });

      // Steps 1-2: the form opens, nothing overflows, the primary action can be scrolled into view, and the
      // navigation is behind the mobile menu control.
      await page.goto("/events/create");
      await expect(page.getByRole("heading", { name: "Create New Event Request" })).toBeVisible();
      await expectNoHorizontalScroll(page);
      const menu = page.getByRole("button", { name: "Open navigation menu" });
      await expect(menu).toBeVisible();
      await menu.tap();
      await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();

      // Step 8: the organiser sees the venue and its booking on the planned event.
      await page.goto(`/events/${events.planned.id}`);
      await expect(page.getByRole("heading", { name: "E2E-30 Planned" })).toBeVisible();
      await expect(page.getByText(/E2E-30 Hall/).first()).toBeVisible();
      await expect(page.getByText(/Booked|Approved/).first()).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  });

  test.describe("Attendee", () => {
    test.use({ as: "attendee" });

    test("attendee registers for an open event by touch and cannot register twice @P1", async ({ page, db }, testInfo) => {
      expect(testInfo.project.name).toBe("mobile");
      const { events } = await db.scene({
        events: { open: { name: "E2E-30 Open", status: "Confirmed", capacity: 5, expectedAttendance: 5 } },
      });
      const open = events.open;
      const available = page.locator("dt", { hasText: "Available" }).locator("xpath=following-sibling::dd");

      // Step 9: list, tap the event, see the spots with no horizontal scroll.
      await page.goto("/events");
      await expectNoHorizontalScroll(page);
      await page.getByRole("link", { name: /E2E-30 Open/ }).first().tap();
      await expect(page.getByRole("heading", { name: "E2E-30 Open" })).toBeVisible();
      await expect(available).toHaveText("5 spots");
      await expectNoHorizontalScroll(page);

      // Step 10: register, see confirmation and status, spots read 4.
      const register = page.getByRole("button", { name: "Register", exact: true });
      await register.scrollIntoViewIfNeeded();
      await expect(register).toBeInViewport();
      await register.tap();
      const submit = page.getByRole("button", { name: "Submit registration" });
      await submit.scrollIntoViewIfNeeded();
      await expect(submit).toBeInViewport();
      await submit.tap();
      await expect(page.getByText("Registration successful. You are registered for E2E-30 Open.")).toBeVisible();
      await expect(page.getByText("You're registered")).toBeVisible();
      await expectNoHorizontalScroll(page);
      const spots = async () => {
        const resp = await page.request.get(`${apiBase}/api/events/${open.id}`);
        expect(resp.status()).toBe(200);
        return ((await resp.json()) as { availableRegistrationSpots: number }).availableRegistrationSpots;
      };
      expect(await spots()).toBe(4);

      // Step 11: a reload keeps the status; no Register control; a second POST is 409 already_registered.
      await page.reload();
      await expect(page.getByText("You're registered")).toBeVisible();
      await expect(page.getByRole("button", { name: "Register", exact: true })).toHaveCount(0);
      expect(await spots()).toBe(4);
      const duplicate = await page.request.post(`${apiBase}/api/events/${open.id}/registrations`, {
        data: { fullName: "Attendee 1", email: email("attendee1") },
      });
      expect(duplicate.status()).toBe(409);
      expect(((await duplicate.json()) as { code: string }).code).toBe("already_registered");

      // Step 12: exactly one stored registration, status registered. The Coordinator report read (needs a second
      // signed-in user) is left to E2E-21, which asserts it.
      const mine = await page.request.get(`${apiBase}/api/events/${open.id}/registrations/me`);
      expect(mine.status()).toBe(200);
      expect(((await mine.json()) as { registration: { status: string } | null }).registration?.status).toBe("registered");
      expect(await spots()).toBe(4);
    });
  });
});
