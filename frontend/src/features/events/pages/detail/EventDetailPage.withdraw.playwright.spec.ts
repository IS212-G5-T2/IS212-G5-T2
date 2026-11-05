import { expect, test } from "../../../../../e2e/fixtures";

const email = "attendee1@connectsphere.test";

test.use({ as: "attendee" });

// SPM-120 WITHDRAW-EVENT-REG-CAP-01 (story goal, end to end) plus the withdrawn-card redesign: a registered attendee
// withdraws from a full event, sees the timeline card and the freed spot, and can register again. The test builds
// the full event (capacity 2) and both registrations itself (the "withdrawal" preset), after the per-test reset.
test("withdrawing from a full event frees the spot, persists across a reload, and the attendee can register again", async ({ page, db }) => {
  // Arrange: build the full event, sign in as the attendee who holds one of the two spots, then open the full event.
  const { eventName } = await db.preset("withdrawal");
  await page.goto("/events");
  await page.getByRole("link", { name: new RegExp(eventName) }).first().click();
  await expect(page.getByRole("heading", { name: eventName })).toBeVisible();
  await expect(page.getByRole("button", { name: "Register", exact: true })).toHaveCount(0);

  // Act: withdraw and confirm in the dialog.
  await page.getByRole("button", { name: "Withdraw", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Withdraw your registration?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Withdraw", exact: true }).click();

  // Assert: the confirmation banner, the withdrawn card (badge, timeline with absolute SGT times) and the freed spot.
  // The success toast (role status) replaces the old confirmation banner.
  await expect(page.getByRole("status").filter({ hasText: "Registration withdrawn" })).toBeVisible();
  const timestamp = /\d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}/;
  await expect(page.getByRole("listitem").filter({ hasText: "Registered" })).toContainText(timestamp);
  await expect(page.getByRole("listitem").filter({ hasText: "Withdrawn" })).toContainText(timestamp);
  await expect(page.getByText(/^1 spot left/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Register again" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Register", exact: true })).toHaveCount(0);

  // Assert: a full reload still shows the withdrawn card and the freed spot (persisted, not client state).
  await page.reload();
  await expect(page.getByText("Registration withdrawn")).toBeVisible();
  await expect(page.getByText(/^1 spot left/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Withdraw", exact: true })).toHaveCount(0);

  // Act: register again. The form is prefilled from the withdrawn registration and the footer steps aside.
  await page.getByRole("button", { name: "Register again" }).click();
  await expect(page.getByLabel(/Full name/)).toHaveValue("Attendee 1");
  await expect(page.getByLabel(/Email/)).toHaveValue(email);
  await expect(page.getByRole("button", { name: "Register again" })).toHaveCount(0);
  await page.getByRole("button", { name: "Submit registration" }).click();

  // Assert: the card is the active registration again, with the re-register wording, and it persists.
  await expect(page.getByText(`Registered again for ${eventName}.`)).toBeVisible();
  await expect(page.getByText("You're registered")).toBeVisible();
  await expect(page.getByRole("button", { name: "Withdraw", exact: true })).toBeEnabled();
  await expect(page.getByText("Registration withdrawn")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("You're registered")).toBeVisible();
  await expect(page.getByText("Registration withdrawn")).toHaveCount(0);
});
