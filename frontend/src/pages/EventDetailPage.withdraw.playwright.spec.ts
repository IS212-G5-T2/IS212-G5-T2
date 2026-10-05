import { expect, test } from "@playwright/test";

const email = process.env.SPM120_ATTENDEE_EMAIL ?? "attendee1@connectsphere.test";
const password = process.env.SPM120_TEST_PASSWORD ?? "P@55w0rd";
const eventName = process.env.SPM120_TEST_NAME ?? "SPM-120 withdrawal browser";

// SPM-120 WITHDRAW-EVENT-REG-08-A (AC7 story goal, end to end): a registered attendee withdraws from a full
// event and the freed spot is visible. The harness seeds the full event and both registrations.
test("withdrawing from a full event frees the spot and persists across a reload", async ({ page }) => {
  // Arrange: sign in as the attendee who holds one of the two spots, then open the full event.
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText(/Signed in as/i)).toBeVisible();
  await page.goto("/events");
  await page.getByRole("link", { name: new RegExp(eventName) }).first().click();
  await expect(page.getByRole("heading", { name: eventName })).toBeVisible();
  await expect(page.getByRole("button", { name: "Register" })).toHaveCount(0);

  // Act: withdraw and confirm in the dialog.
  await page.getByRole("button", { name: "Withdraw" }).click();
  const dialog = page.getByRole("dialog", { name: `Withdraw from ${eventName}?` });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm Withdrawal" }).click();

  // Assert: the confirmation, the withdrawn status, and the spot that is now free.
  await expect(page.getByRole("status", { name: "Withdrawal confirmation" })).toContainText(
    `Your withdrawal from ${eventName} has been processed.`,
  );
  await expect(page.getByText("Withdrawn", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Withdrawn today at \d{2}:\d{2}$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Register" })).toBeEnabled();
  await expect(page.getByText("1 spot", { exact: true })).toBeVisible();

  // Assert: a full reload still shows the withdrawn status and the freed spot (persisted, not client state).
  await page.reload();
  await expect(page.getByText("Withdrawn", { exact: true })).toBeVisible();
  await expect(page.getByText("1 spot", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Withdraw" })).toHaveCount(0);
});
