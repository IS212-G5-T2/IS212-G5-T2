import { expect, test } from "@playwright/test";

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";
const fields = {
  name: "",
  purpose: "",
  description: "",
  startDate: "",
  startTime: "",
  endDate: "",
  endTime: "",
  expectedAttendance: "",
  layout: "",
  facilities: [],
  accessibility: [],
  attachments: [],
  equipmentNeeds: "",
};

// AC1-7: this test uses the actual API/database; mocks only one failed network response.
test("Q2-021 SPM-37 save, refresh, reopen, retry, submit and lock the current UI", async ({
  page,
  request,
}) => {
  const name = process.env.SPM37_TEST_NAME ?? `Draft browser ${Date.now()}`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/events/create");
  await expect(page).toHaveTitle(/ConnectSphere/);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Create New Event Request" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: /event name/i }).fill(name);
  const savedResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/requests/") &&
      response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  const saved = await (await savedResponse).json();
  await expect(page.getByRole("dialog", { name: "Draft saved" })).toBeVisible();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await page.reload();
  const link = page.getByRole("link", { name, exact: true });
  await expect(link).toBeVisible();
  await expect(link.locator("xpath=ancestor::li")).toContainText("Draft");
  if (process.env.SPM37_SCREENSHOT_DIR)
    await page.screenshot({
      path: `${process.env.SPM37_SCREENSHOT_DIR}/draft-list.png`,
      fullPage: true,
      animations: "disabled",
    });
  await link.click();
  await expect(page.getByRole("textbox", { name: /event name/i })).toHaveValue(
    name,
  );
  // A failed save preserves values and supports retry from the same form.
  await page
    .getByRole("textbox", { name: /purpose/i })
    .fill("Browser verification");
  await page.route(`**/api/requests/${saved.id}`, async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: "{}",
      });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(page.getByRole("textbox", { name: /purpose/i })).toHaveValue(
    "Browser verification",
  );
  await page.unroute(`**/api/requests/${saved.id}`);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await page.getByRole("link", { name, exact: true }).click();
  await page
    .getByRole("textbox", { name: /description/i })
    .fill("An event saved using the new UI.");
  await page.getByRole("button", { name: /Continue/ }).click();
  const date = new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10);
  await page.getByLabel("Start date", { exact: false }).fill(date);
  await page.getByLabel("Start time", { exact: false }).fill("10:00");
  await page.getByLabel("End date", { exact: false }).fill(date);
  await page.getByLabel("End time", { exact: false }).fill("12:00");
  await page.getByLabel(/Expected attendance/).fill("30");
  await page.getByLabel(/Preferred room layout/).selectOption("Theatre");
  await page.getByLabel("Projector", { exact: true }).check();
  await page.getByLabel("Hearing loop", { exact: true }).check();
  await page.getByLabel("Supporting files").setInputFiles({
    name: "draft-note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("draft evidence"),
  });
  await expect(page.getByText("draft-note.txt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByLabel("Equipment needs").fill("Two microphones");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await page.getByRole("link", { name, exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Equipment needs")).toHaveValue(
    "Two microphones",
  );
  await page.getByRole("button", { name: /Back/ }).click();
  await page.getByRole("button", { name: /Back/ }).click();
  await expect(page.getByRole("textbox", { name: /purpose/i })).toHaveValue(
    "Browser verification",
  );
  await expect(page.getByRole("textbox", { name: /event name/i })).toHaveValue(
    name,
  );
  await expect(page.getByRole("textbox", { name: /description/i })).toHaveValue(
    "An event saved using the new UI.",
  );
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByLabel("Start date", { exact: false })).toHaveValue(
    date,
  );
  await expect(page.getByLabel("End date", { exact: false })).toHaveValue(date);
  await expect(page.getByLabel("Start time", { exact: false })).toHaveValue(
    "10:00",
  );
  await expect(page.getByLabel("End time", { exact: false })).toHaveValue(
    "12:00",
  );
  await expect(page.getByLabel(/Preferred room layout/)).toHaveValue("Theatre");
  await expect(page.getByLabel(/Expected attendance/)).toHaveValue("30");
  await expect(page.getByLabel("Projector", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Hearing loop", { exact: true })).toBeChecked();
  await expect(page.getByText("draft-note.txt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByLabel("Equipment needs")).toHaveValue(
    "Two microphones",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const box = await page
        .getByRole("complementary", { name: "Primary navigation" })
        .boundingBox();
      return box ? Math.round(box.x + box.width) : 0;
    })
    .toBeLessThanOrEqual(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  if (process.env.SPM37_SCREENSHOT_DIR)
    await page.screenshot({
      path: `${process.env.SPM37_SCREENSHOT_DIR}/draft-mobile.png`,
      fullPage: true,
      animations: "disabled",
    });
  await page
    .getByRole("button", { name: "Submit for Review", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/events/${saved.id}$`));
  await page.goto(`/requests/${saved.id}`);
  await expect(
    page.getByRole("heading", { name: "Request submitted" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toHaveCount(0);
  const rejected = await request.put(`${apiBase}/api/requests/${saved.id}`, {
    data: { fields, version: 1, operationId: crypto.randomUUID() },
  });
  expect(rejected.status()).toBe(409);
  expect(errors).toEqual([]);
  // The backend browser harness removes this run's records after Playwright exits.
});
