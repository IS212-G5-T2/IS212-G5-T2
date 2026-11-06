// Story: SPM-187 Browser test fixtures (acceptance criterion 2)
// Proves the whole `db.scene` path a real spec takes: fixtures.ts -> e2e/db-cli.ts -> child process
// `browser-fixtures.mjs seed` (stdin JSON in, stdout JSON out) -> buildScene -> the database -> the running app.
// browser-fixtures.test.mjs covers buildScene in-process; only this spec exercises the plumbing above it.
import { expect, test } from "../../../../../e2e/fixtures";

test.use({ as: "venue_staff" });

// SPM-187 AC2: a venue with 30 minutes setup and 15 minutes turnaround, and an event at Approved, built in one call.
test("db.scene builds a 30/15-minute venue and an Approved event in one call, and the app renders them", async ({ page, db }) => {
  // Act: one call through the real fixture chain (child process and JSON round-trip included).
  const scene = await db.scene({
    venues: { hall: { name: "SPM-187 scene hall", capacity: 64, setupMinutes: 30, turnaroundMinutes: 15 } },
    events: { main: { name: "SPM-187 scene event", status: "Approved", venue: "hall" } },
  });

  // Assert: the JSON that came back through stdout carries the ids and values that were asked for.
  expect(scene.venues.hall).toMatchObject({ name: "SPM-187 scene hall", setupMinutes: 30, turnaroundMinutes: 15 });
  expect(scene.venues.hall.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(scene.events.main).toMatchObject({ name: "SPM-187 scene event", status: "Approved" });
  expect(scene.events.main.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(scene.registrations).toEqual([]);

  // Assert: the app, reading the same database, renders what the scene wrote (so the rows really exist, not just the JSON).
  await page.goto(`/venue-records/${scene.venues.hall.id}`);
  await expect(page.getByRole("heading", { name: "SPM-187 scene hall" })).toBeVisible();
  await expect(page.getByText("Setup requirements").locator("xpath=following-sibling::dd")).toHaveText("30 minutes before an event");
  await expect(page.getByText("Turnaround time").locator("xpath=following-sibling::dd")).toHaveText("15 minutes after an event");
  await expect(page.getByText("Capacity", { exact: true }).locator("xpath=following-sibling::dd")).toHaveText("64");
  // The Approved event's booking of this venue appears in the venue's booking history.
  await page.getByRole("button", { name: "Show booking history" }).click();
  await expect(page.getByRole("strong").filter({ hasText: "SPM-187 scene event" })).toBeVisible();
});
