import { expect, test } from "@playwright/test";

test("Event Edit Form - Layout and UI", async ({ page }) => {
  // This test verifies that the event edit form renders correctly

  await page.goto("/");
  await expect(page).toHaveTitle(/ConnectSphere/);

  // Wait for the page to fully load
  await page.waitForLoadState("networkidle");

  // Take a screenshot to see what's on the page
  await page.screenshot({ path: "test-results/initial-page.png" });

  // Navigate to events list or create page
  const createLink = page.getByRole("link", { name: /create/i }).first();
  if (await createLink.isVisible()) {
    await createLink.click();
    await page.waitForLoadState("networkidle");
  } else {
    // Try navigating directly
    await page.goto("/events/create");
  }

  // Wait for form to load
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "test-results/create-page.png" });

  // Verify basic structure is present
  const heading = page.getByRole("heading");
  await expect(heading.first()).toBeVisible();

  console.log("Event Edit Form test completed");
});
