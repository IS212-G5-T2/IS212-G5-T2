import { type APIResponse, type Page } from "@playwright/test";
import { atUtcHour, isoDateFromNow } from "../../../../../e2e/dates";
import { expect, test } from "../../../../../e2e/fixtures";

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";

test.use({ as: "organiser" });
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
}) => {
  const name = "Draft browser";
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
  await expect(page.getByRole("listitem").filter({ has: link })).toContainText("Draft");
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
  const date = isoDateFromNow(30);
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
    .getByRole("button", { name: "Submit For Review", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/events/${saved.id}$`));
  await page.goto(`/requests/${saved.id}`);
  await expect(
    page.getByRole("heading", { name: "Request submitted" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toHaveCount(0);
  const rejected = await page.request.put(`${apiBase}/api/requests/${saved.id}`, {
    data: { fields, version: 1, operationId: crypto.randomUUID() },
  });
  expect(rejected.status()).toBe(409);
  expect(errors).toEqual([]);
  // The backend browser harness removes this run's records after Playwright exits.
});

// E2E-02 (docs/test-cases/e2e/E2E-02.md): draft handling across roles. SPM-37 AC2-AC5 and AC7, SPM-36 AC3-AC6,
// SPM-48 AC3, SPM-123 AC1/AC2, SPM-94 AC1. Drafts are not `events` rows in this product (they live behind /api/requests),
// and frontend/ has no database dependency, so the case's "DB:" checks are made through the authorised API instead.
// The refusal status codes are ASSUMPTIONS in the case (Notes 1 and 2), so refusals are asserted as 4xx with no data.
const draftName = "Draft handling check";
const draftPurpose = "Quarterly staff briefing";
const draftDescription = "Short briefing for the staff body";

/** A refusal with no data: a 4xx status and none of the draft's text in the body. */
async function expectRefusedNoData(response: APIResponse, what: string) {
  const status = response.status();
  expect(status, `${what}: expected a refusal, got ${status}`).toBeGreaterThanOrEqual(400);
  expect(status, `${what}: expected a client error, got ${status}`).toBeLessThan(500);
  const body = await response.text();
  for (const text of [draftName, draftPurpose, draftDescription]) expect(body, what).not.toContain(text);
}

test.describe("E2E-02 draft handling @P1", () => {
  test.use({ timezoneId: "Asia/Singapore" });

  test("@P1 a draft is saved, resumed and kept private; submit with a missing purpose is refused; the submitted request is distinct, locked and in the Lead's queue", async ({
    page,
    pageAs,
    playwright,
  }) => {
    const date = isoDateFromNow(30);
    const readDrafts = async () => {
      const response = await page.request.get(`${apiBase}/api/requests`);
      expect(response.status()).toBe(200);
      return (await response.json()) as Array<{ id: string; status: string; version: number; eventId: string | null; fields: Record<string, unknown> }>;
    };
    const readEvents = async (who: Page) => {
      const response = await who.request.get(`${apiBase}/api/events`);
      expect(response.status()).toBe(200);
      return (await response.json()) as Array<{ id: string; name: string; status: string }>;
    };

    // Step 1: name only, Save draft, confirmation (SPM-37 AC2, AC6). One draft row, no event.
    await page.goto("/events/create");
    await page.getByRole("textbox", { name: /event name/i }).fill(draftName);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Draft saved" })).toBeVisible();
    await page.getByRole("button", { name: "OK", exact: true }).click();
    const afterFirstSave = await readDrafts();
    expect(afterFirstSave.map((draft) => draft.status)).toEqual(["Draft"]);
    expect(afterFirstSave[0].fields.name).toBe(draftName);
    expect(afterFirstSave[0].fields.purpose ?? "").toBe("");
    const draftId = afterFirstSave[0].id;
    expect(await readEvents(page)).toHaveLength(0);

    // Step 2: listed in My Requests, in the draft section, labelled Draft (SPM-37 AC2).
    await expect(page).toHaveURL(/\/requests$/);
    const link = page.getByRole("link", { name: draftName, exact: true });
    await expect(link).toBeVisible();
    await expect(page.getByRole("listitem").filter({ has: link })).toContainText("Draft");

    // Step 3: reload, reopen, the name is pre-filled (SPM-37 AC3, AC5).
    await page.reload();
    await page.getByRole("link", { name: draftName, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/requests/${draftId}`));
    await expect(page.getByRole("textbox", { name: /event name/i })).toHaveValue(draftName);

    // Step 4: add purpose and description, save again; still one draft with the same id (SPM-37 AC4).
    await page.getByRole("textbox", { name: /purpose/i }).fill(draftPurpose);
    await page.getByRole("textbox", { name: /description/i }).fill(draftDescription);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.getByRole("button", { name: "OK", exact: true }).click();
    await page.reload();
    await page.getByRole("link", { name: draftName, exact: true }).click();
    await expect(page.getByRole("textbox", { name: /event name/i })).toHaveValue(draftName);
    await expect(page.getByRole("textbox", { name: /purpose/i })).toHaveValue(draftPurpose);
    await expect(page.getByRole("textbox", { name: /description/i })).toHaveValue(draftDescription);
    const afterSecondSave = await readDrafts();
    expect(afterSecondSave).toHaveLength(1);
    expect(afterSecondSave[0]).toMatchObject({ id: draftId, status: "Draft" });
    expect(afterSecondSave[0].version).toBeGreaterThan(afterFirstSave[0].version);

    // Step 5: the Lead does not list the draft and cannot load it by URL or API (SPM-123 AC1/AC2; Note 1 / [S1]).
    const lead = await pageAs("lead");
    await lead.goto("/lead/queue");
    await expect(lead.getByRole("heading", { name: "Assignment Queue" })).toBeVisible();
    await expect(lead.getByRole("article", { name: draftName })).toHaveCount(0);
    await lead.goto(`/requests/${draftId}`);
    await expect(lead.getByText(draftName)).toHaveCount(0);
    await lead.goto(`/events/${draftId}`);
    await expect(lead.getByText(draftName)).toHaveCount(0);
    await expectRefusedNoData(await lead.request.get(`${apiBase}/api/requests/${draftId}`), "lead GET draft");
    await expectRefusedNoData(await lead.request.get(`${apiBase}/api/events/${draftId}`), "lead GET event by draft id");
    const leadQueue = await lead.request.get(`${apiBase}/api/lead/queue`);
    expect(leadQueue.status()).toBe(200);
    expect(await leadQueue.text()).not.toContain(draftName);

    // Step 6: neither Coordinator lists it, and coordinator1 cannot load it by URL or API (SPM-48 AC3).
    for (const who of ["coordinator1", "coordinator2"] as const) {
      const coordinator = await pageAs(who);
      await coordinator.goto("/events");
      await expect(coordinator.getByText("Loading events…")).toHaveCount(0);
      await expect(coordinator.getByText(draftName)).toHaveCount(0);
      expect((await readEvents(coordinator)).map((event) => event.name)).not.toContain(draftName);
      await expectRefusedNoData(await coordinator.request.get(`${apiBase}/api/requests/${draftId}`), `${who} GET draft`);
      await expectRefusedNoData(await coordinator.request.get(`${apiBase}/api/events/${draftId}`), `${who} GET event by draft id`);
    }
    const coordinator1 = await pageAs("coordinator1");
    await coordinator1.goto(`/events/${draftId}`);
    await expect(coordinator1.getByText(draftName)).toHaveCount(0);

    // Step 7: a second Organiser does not see it either.
    const organiser2 = await pageAs("organiser2");
    await organiser2.goto("/events");
    await expect(organiser2.getByText("Loading events…")).toHaveCount(0);
    await expect(organiser2.getByText(draftName)).toHaveCount(0);
    await organiser2.goto("/requests");
    await expect(organiser2.getByText(draftName)).toHaveCount(0);
    await organiser2.goto(`/requests/${draftId}`);
    await expect(organiser2.getByText(draftName)).toHaveCount(0);
    await expectRefusedNoData(await organiser2.request.get(`${apiBase}/api/requests/${draftId}`), "organiser2 GET draft");
    expect(await (await organiser2.request.get(`${apiBase}/api/requests`)).text()).not.toContain(draftName);

    // Step 8: complete everything except the purpose, which is cleared; the attempt to go on is refused in the form
    // (SPM-36 AC3, AC5). The wizard checks the purpose on its own step, so the refusal is where the purpose is entered.
    await page.goto(`/requests/${draftId}`);
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByLabel("Start date", { exact: false }).fill(date);
    await page.getByLabel("Start time", { exact: false }).fill("10:00");
    await page.getByLabel("End date", { exact: false }).fill(date);
    await page.getByLabel("End time", { exact: false }).fill("12:00");
    await page.getByLabel(/Expected attendance/).fill("30");
    await page.getByLabel(/Preferred room layout/).selectOption("Theatre");
    await page.getByRole("button", { name: /Back/ }).click();
    await page.getByRole("textbox", { name: /purpose/i }).fill("");
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByText("Enter the purpose of your event.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Edit Draft Request" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /event name/i })).toHaveValue(draftName);
    await expect(page.getByRole("textbox", { name: /description/i })).toHaveValue(draftDescription);
    // Save the incomplete draft (allowed: SPM-37 AC1), so the stored draft is the one the API attempt submits.
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.getByRole("button", { name: "OK", exact: true }).click();
    const incomplete = (await readDrafts())[0];
    expect(incomplete).toMatchObject({ id: draftId, status: "Draft" });
    expect(String(incomplete.fields.purpose ?? "").trim()).toBe("");
    expect(await readEvents(page)).toHaveLength(0);

    // Step 9: the same submit straight to the API is refused and the status stays Draft ([S2]).
    const refusedSubmit = await page.request.post(`${apiBase}/api/requests/${draftId}/submit`, {
      data: { version: incomplete.version, startDateTime: atUtcHour(30, 2).toISOString(), endDateTime: atUtcHour(30, 4).toISOString() },
    });
    await expectRefusedNoData(refusedSubmit, "API submit with the purpose missing");
    expect((await readDrafts())[0]).toMatchObject({ id: draftId, status: "Draft", eventId: null });
    expect(await readEvents(page)).toHaveLength(0);

    // Step 10: fill the purpose and submit (SPM-36 AC6). The same id becomes a Submitted event; no duplicate.
    await page.goto(`/requests/${draftId}`);
    await page.getByRole("textbox", { name: /purpose/i }).fill(draftPurpose);
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByLabel("Start date", { exact: false })).toHaveValue(date);
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByLabel("Equipment needs").fill("None");
    await page.getByRole("button", { name: "Submit For Review", exact: true }).click();
    await expect(page.getByText("Your event request was submitted successfully.")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/events/${draftId}$`));
    const events = await readEvents(page);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: draftId, name: draftName, status: "submitted" });
    expect(await readDrafts()).toHaveLength(1);
    expect((await readDrafts())[0].status).toBe("Submitted");

    // Step 11: listed as Submitted among the events and not in the drafts section (SPM-94 AC1).
    await page.goto("/events");
    const card = page.getByRole("link", { name: new RegExp(draftName) });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Submitted");
    await expect(page.getByRole("region", { name: "Draft requests" })).toHaveCount(0);

    // Step 12: the draft-editing flow is gone in the UI and refused by the API; stored values unchanged (SPM-37 AC7).
    await page.goto(`/requests/${draftId}`);
    await expect(page.getByRole("heading", { name: "Request submitted" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save draft", exact: true })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: /event name/i })).toHaveCount(0);
    const submitted = (await readDrafts())[0];
    const edit = await page.request.put(`${apiBase}/api/requests/${draftId}`, {
      data: { fields: { ...fields, name: "Tampered name" }, version: submitted.version, operationId: crypto.randomUUID() },
    });
    expect(edit.status()).toBe(409);
    const unchanged = (await readDrafts())[0];
    expect(unchanged.fields).toEqual(submitted.fields);
    expect(unchanged.version).toBe(submitted.version);

    // Step 13: the Lead's queue now lists it with name, purpose, date and time, attendance (SPM-123 AC1/AC2);
    // the coordinators still do not (it is not assigned yet).
    await lead.goto("/lead/queue");
    const queued = lead.getByRole("article", { name: draftName });
    await expect(queued).toBeVisible();
    await expect(queued).toContainText(draftPurpose);
    await expect(queued).toContainText(new RegExp(`\\b${Number(date.slice(8))}\\b`));
    await expect(queued).toContainText(/10:00/);
    await expect(queued).toContainText(/12:00/);
    await expect(queued).toContainText("Expected attendance: 30");
    for (const who of ["coordinator1", "coordinator2"] as const) {
      const coordinator = await pageAs(who);
      expect((await readEvents(coordinator)).map((event) => event.name)).not.toContain(draftName);
    }

    // Step 14: with no session the draft and the request are refused with 401. An explicitly empty storage state,
    // because a bare newContext() inherits the signed-in `as` login.
    const anonymous = await playwright.request.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      expect((await anonymous.get(`${apiBase}/api/requests/${draftId}`)).status()).toBe(401);
      expect((await anonymous.get(`${apiBase}/api/events/${draftId}`)).status()).toBe(401);
    } finally {
      await anonymous.dispose();
    }
  });
});
