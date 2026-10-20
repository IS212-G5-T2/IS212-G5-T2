import { writeFileSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";

// SPM-36 AC9 in a real browser: an invalid supporting file must show an error to the organiser.
// The API is mocked with page.route, so these run against the Vite dev server without the
// backend or database. Expected messages are the ones the create page uses.
const appOrigin = "http://localhost:5173";
const corsHeaders = {
  "Access-Control-Allow-Origin": appOrigin,
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
};

// Only the API host is mocked. A broader pattern would also catch Vite module paths such as
// src/features/events/api/..., which must load as real JavaScript.
const apiOrigin = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";

async function mockApi(page: Page, submitEvent?: (route: Route) => Promise<void>) {
  await page.route(`${apiOrigin}/api/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: corsHeaders });
    if (request.url().endsWith("/api/auth/me")) {
      return route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: "application/json",
        body: JSON.stringify({
          uid: "organiser-1",
          name: "Organiser One",
          email: "organiser@example.test",
          roles: ["ORGANISER"],
        }),
      });
    }
    if (request.method() === "POST" && request.url().endsWith("/api/events") && submitEvent) {
      return submitEvent(route);
    }
    return route.fulfill({ status: 200, headers: corsHeaders, contentType: "application/json", body: "[]" });
  });
}

function dayFromToday(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Opens the form and completes Basic Information, so the page is on the attachment step. */
async function openAttachmentStep(page: Page) {
  await page.goto("/events/create");
  await expect(page.getByRole("heading", { name: "Create New Event Request" })).toBeVisible();
  await page.getByRole("textbox", { name: /event name/i }).fill("Welcome Evening");
  await page.getByRole("textbox", { name: /purpose/i }).fill("Community building");
  await page.getByRole("textbox", { name: /description/i }).fill("A welcome event for new members.");
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.getByLabel("Supporting files")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

// Count check: at most five files per request.
test("SPM-36 AC9 shows an error when a sixth supporting file is picked", async ({ page }) => {
  await openAttachmentStep(page);

  const files = Array.from({ length: 6 }, (_, index) => ({
    name: `note-${index + 1}.txt`,
    mimeType: "text/plain",
    buffer: Buffer.from(`note ${index + 1}`),
  }));
  await page.getByLabel("Supporting files").setInputFiles(files);

  await expect(page.getByRole("alert")).toHaveText("Use up to five files.");
  await expect(page.getByText("note-1.txt", { exact: true })).toHaveCount(0);
});

// Size check: the combined size of all supporting files is capped at 50 MB.
test("SPM-36 AC9 shows an error when the picked files pass 50 MB combined", async ({ page }, testInfo) => {
  await openAttachmentStep(page);

  // Two 26 MB files, written to disk because Playwright rejects in-memory buffers above 50 MB.
  const megabyte = 1024 * 1024;
  const largeA = testInfo.outputPath("large-a.bin");
  const largeB = testInfo.outputPath("large-b.bin");
  writeFileSync(largeA, Buffer.alloc(26 * megabyte));
  writeFileSync(largeB, Buffer.alloc(26 * megabyte));
  await page.getByLabel("Supporting files").setInputFiles([largeA, largeB]);

  await expect(page.getByRole("alert")).toHaveText("Use up to five files, 50 MB total.");
  await expect(page.getByText("large-a.bin", { exact: true })).toHaveCount(0);
});

// Read check: the browser fails to read a selected file. This is an injected fault: FileReader
// is patched to fire its error event for the duration of the test, because a real disk read
// cannot be made to fail reliably in a browser.
test("SPM-36 AC9 shows an error when a selected file cannot be read", async ({ page }) => {
  await page.addInitScript(() => {
    const original = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (this: FileReader, blob: Blob) {
      if ((window as unknown as Record<string, unknown>).__failFileReads) {
        setTimeout(() => this.onerror?.(new ProgressEvent("error") as ProgressEvent<FileReader>), 0);
        return;
      }
      return original.call(this, blob);
    };
  });
  await openAttachmentStep(page);
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__failFileReads = true;
  });

  await page.getByLabel("Supporting files").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("notes"),
  });

  await expect(page.getByRole("alert")).toHaveText("Unable to read the selected file. Please try again.");
  await expect(page.getByText("notes.txt", { exact: true })).toHaveCount(0);
});

// Server check: the API rejects an attachment on submit. The organiser must be returned to the
// attachment step and see the reason there, not be left on the review step with no explanation.
test("SPM-36 AC9 returns to the attachment step and shows the server's attachment error after submit", async ({ page }) => {
  await mockApi(page, (route) =>
    route.fulfill({
      status: 400,
      headers: corsHeaders,
      contentType: "application/json",
      body: JSON.stringify({ message: "Invalid event request.", errors: { attachments: "Upload valid files." } }),
    }),
  );
  await page.goto("/events/create");
  await page.getByRole("textbox", { name: /event name/i }).fill("Welcome Evening");
  await page.getByRole("textbox", { name: /purpose/i }).fill("Community building");
  await page.getByRole("textbox", { name: /description/i }).fill("A welcome event for new members.");
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByLabel("Start date").fill(dayFromToday(7));
  await page.getByLabel("Start time").fill("18:00");
  await page.getByLabel("End date").fill(dayFromToday(7));
  await page.getByLabel("End time").fill("21:00");
  await page.getByLabel(/expected attendance/i).fill("80");
  await page.getByLabel(/preferred room layout/i).selectOption("Banquet");
  await page.getByLabel("Supporting files").setInputFiles({
    name: "proposal.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("proposal"),
  });
  await expect(page.getByText("proposal.txt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /continue/i }).click();

  await page.getByRole("button", { name: /submit for review/i }).click();

  // The reason appears in the banner and beside the attachment field; either is the user-facing error.
  await expect(page.getByRole("alert").filter({ hasText: "Upload valid files." }).first()).toBeVisible();
  await expect(page.getByLabel("Supporting files")).toBeVisible();
});
