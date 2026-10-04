import { expect, test } from "@playwright/test";

const email =
  process.env.SPM111_TECH_SUPPORT_EMAIL ?? "tech_support1@connectsphere.test";
const password = process.env.SPM111_TEST_PASSWORD ?? "P@55w0rd";
const name =
  process.env.SPM111_TEST_NAME ?? `SPM-111 equipment browser ${Date.now()}`;

// SPM-111 EQUIP-CRE-04-A/05-A: a Technical Support user creates an item and sees it in live inventory.
test("creates an equipment record and displays it in Equipment Availability", async ({
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
  await page.getByLabel("Quantity").fill("7");
  await page.getByLabel("Maintenance status").selectOption("Active");
  await page.getByLabel("Location").fill("Browser Test Store");
  await page.getByRole("button", { name: "Create Equipment" }).click();

  // Assert: acknowledgement leads to the live inventory where the persisted row is visible.
  await expect(
    page.getByRole("dialog", { name: "Equipment record created" }),
  ).toContainText("Equipment record created.");
  await page.getByRole("button", { name: "OK" }).click();
  await expect(page).toHaveURL(/\/equipment\/availability$/);
  await expect(page.getByRole("cell", { name })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Browser Test Store" }),
  ).toBeVisible();
});
