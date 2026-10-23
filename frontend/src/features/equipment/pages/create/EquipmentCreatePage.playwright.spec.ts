import { expect, test } from "@playwright/test";

const email =
  process.env.SPM111_TECH_SUPPORT_EMAIL ?? "tech_support1@connectsphere.test";
const password = process.env.SPM111_TEST_PASSWORD ?? "P@55w0rd";
const name =
  process.env.SPM111_TEST_NAME ?? `SPM-111 equipment browser ${Date.now()}`;

// SPM-111 EQUIP-CRE-04-A/05-A; SPM-113 EQUIP-AVAIL-08-A: create an item with
// status-specific quantities and verify the complete breakdown in live inventory.
test("creates an equipment record and displays it in Equipment Inventory", async ({
  page,
}) => {
  // Arrange: sign in using the seeded Technical Support account in the browser.
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText(/Signed in as/i)).toBeVisible();

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
