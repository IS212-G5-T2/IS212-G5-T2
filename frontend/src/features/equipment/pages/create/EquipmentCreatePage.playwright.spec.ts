import { expect, test } from "../../../../../e2e/fixtures";

const name = "SPM-111 equipment browser";

test.use({ as: "tech_support" });

// SPM-111 EQUIP-CRE-04-A/05-A; SPM-113 EQUIP-AVAIL-08-A: create an item with
// status-specific quantities and verify the complete breakdown in live inventory.
test("creates an equipment record and displays it in Equipment Inventory", async ({
  page,
}) => {
  // Arrange: the test is signed in as the seeded Technical Support account (test.use above).
  // Act: complete the real form and create a uniquely named record.
  await page.goto("/equipment/create");
  await page.getByLabel("Equipment name").fill(name);
  await page.getByLabel("Equipment type").selectOption("Visual");
  await page.getByLabel("Active quantity").fill("10");
  await page.getByLabel("Under Maintenance quantity").fill("30");
  await page.getByLabel("Retired quantity").fill("10");
  await page.getByLabel("Location").fill("Browser Test Store");
  await page.getByRole("button", { name: "Create Equipment" }).click();

  // Assert: acknowledgement leads to the live inventory where the persisted row is visible.
  await expect(
    page.getByRole("dialog", { name: "Equipment record created" }),
  ).toContainText("Equipment record created.");
  await page.getByRole("button", { name: "OK" }).click();
  await expect(page).toHaveURL(/\/equipment\/availability$/);
  const equipmentRow = page.getByRole("row", { name: new RegExp(name) });
  await expect(equipmentRow).toBeVisible();
  await expect(equipmentRow).toContainText("Browser Test Store");
  await expect(equipmentRow).toContainText("Active: 10");
  await expect(equipmentRow).toContainText("Under Maintenance: 30");
  await expect(equipmentRow).toContainText("Retired: 10");
  await expect(equipmentRow).toContainText("Total: 50");
});
