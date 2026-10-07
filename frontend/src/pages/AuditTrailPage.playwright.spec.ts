// Story: SPM-119 Mark Equipment as Unavailable
// ACs: AC5, AC6, AC7
// Test cases: EQUIP-UNAVAIL-05-A, EQUIP-UNAVAIL-05-B, EQUIP-UNAVAIL-05-C
import { expect, test } from "@playwright/test";

const email =
  process.env.SPM119_TECH_SUPPORT_EMAIL ?? "tech_support1@connectsphere.test";
const readerEmail =
  process.env.SPM119_AUDIT_READER_EMAIL ?? "tech_support2@connectsphere.test";
const password = process.env.SPM119_TEST_PASSWORD ?? "P@55w0rd";
const equipmentName = process.env.SPM119_AUDIT_EQUIPMENT_NAME;

test("EQUIP-UNAVAIL-05-A/B/C displays shared audit history for unavailable and reactivated equipment", async ({
  page,
  browser,
}) => {
  // Arrange: sign in as seeded Technical Support and open the unique fixture record.
  if (!equipmentName) throw new Error("SPM119_AUDIT_EQUIPMENT_NAME is required.");
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  await page.goto("/equipment/availability");
  const row = page.getByRole("row").filter({ hasText: equipmentName });
  await expect(row).toBeVisible();

  // Act: mark the fixture unavailable through the real dialog, then inspect the live Audit Trail.
  await row.getByRole("button", { name: "Mark unavailable" }).click();
  const markDialog = page.getByRole("dialog", { name: "Mark equipment as unavailable" });
  await markDialog.getByLabel("Reason for unavailability").fill("Under repair");
  await markDialog.getByRole("button", { name: "Mark unavailable" }).click();
  await expect(page.getByRole("status")).toContainText("Equipment marked unavailable.");
  await page.goto("/equipment/audit-trail");

  // Assert: 05-A exposes the full persisted snapshot and authenticated actor.
  const markedRow = page.getByRole("row").filter({ hasText: equipmentName });
  await expect(markedRow).toContainText("Lighting");
  await expect(markedRow).toContainText("Tampines");
  await expect(markedRow).toContainText("Active");
  await expect(markedRow).toContainText("50");
  await expect(markedRow).toContainText("Marked unavailable");
  await expect(markedRow).toContainText("Under repair");
  await expect(markedRow).toContainText(email);

  // Act: reactivate the same item through the browser flow.
  await page.goto("/equipment/availability");
  await page.getByLabel("Show unavailable").check();
  const unavailableRow = page.getByRole("row").filter({ hasText: equipmentName });
  await unavailableRow.getByRole("button", { name: "Reactivate" }).click();
  const reactivateDialog = page.getByRole("dialog", { name: "Reactivate equipment" });
  await reactivateDialog.getByRole("button", { name: "Reactivate" }).click();
  await expect(page.getByRole("status")).toContainText("Equipment reactivated.");
  await page.goto("/equipment/audit-trail");

  // Assert: 05-B shows chronological entries for both directions of the change.
  const history = page.getByRole("row").filter({ hasText: equipmentName });
  await expect(history).toHaveCount(2);
  await expect(history.nth(0)).toContainText("Reactivated");
  await expect(history.nth(1)).toContainText("Marked unavailable");
  await expect(history.nth(0)).toContainText(email);
  await expect(history.nth(1)).toContainText(email);

  // Act: sign in separately as a second Technical Support user and open the shared history.
  const readerContext = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
  });
  const readerPage = await readerContext.newPage();
  await readerPage.goto("/login");
  await readerPage.getByLabel("Email").fill(readerEmail);
  await readerPage.getByLabel("Password").fill(password);
  await readerPage.getByRole("button", { name: "Log in" }).click();
  await expect(readerPage).not.toHaveURL(/\/login$/);
  await readerPage.goto("/equipment/audit-trail");

  // Assert: 05-C exposes the first technician's entries to the second without actor filtering.
  const sharedHistory = readerPage.getByRole("row").filter({ hasText: equipmentName });
  await expect(sharedHistory).toHaveCount(2);
  await expect(sharedHistory.nth(0)).toContainText(email);
  await expect(sharedHistory.nth(1)).toContainText(email);
  await readerContext.close();
});
