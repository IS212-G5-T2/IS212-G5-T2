import { expect, test } from "@playwright/test";

const email = process.env.SPM120_ATTENDEE_EMAIL ?? "attendee1@connectsphere.test";
const password = process.env.SPM120_TEST_PASSWORD ?? "P@55w0rd";
const eventName = process.env.SPM120_TEST_NAME ?? "SPM-120 withdrawal browser";

// SPM-120 WITHDRAW-EVENT-REG-08-A (story goal, end to end) plus the withdrawn-card redesign: a registered attendee
// withdraws from a full event, sees the timeline card and the freed spot, and can register again. The harness seeds
// the full event (capacity 2) and both registrations.
test("withdrawing from a full event frees the spot, persists across a reload, and the attendee can register again", async ({ page }) => {
  // Arrange: sign in as the attendee who holds one of the two spots, then open the full event.
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText(/Signed in as/i)).toBeVisible();
  await page.goto("/events");
  await page.getByRole("link", { name: new RegExp(eventName) }).first().click();
  await expect(page.getByRole("heading", { name: eventName })).toBeVisible();
  await expect(page.getByRole("button", { name: "Register", exact: true })).toHaveCount(0);

  // Act: withdraw and confirm in the dialog.
  await page.getByRole("button", { name: "Withdraw", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: `Withdraw from ${eventName}?` });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm Withdrawal" }).click();

  // Assert: the confirmation banner, the withdrawn card (badge, timeline with absolute SGT times) and the freed spot.
  await expect(page.getByRole("status", { name: "Withdrawal confirmation" })).toContainText(
    `Your withdrawal from ${eventName} has been processed.`,
  );
  await expect(page.getByText("Registration withdrawn")).toBeVisible();
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
