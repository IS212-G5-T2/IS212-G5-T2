import { expect, test } from "@playwright/test";

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";
const venueName = process.env.SPM122_TEST_VENUE_NAME;

test.use({ timezoneId: "Asia/Singapore" });

// SPM-122 / VEN-UNAVAIL-01-A/03-A/04-A/06-A: review, confirm, persist, and reload a real venue blockout.
test("creates an unavailable period through the browser and displays it after reload", async ({ page }) => {
  if (!venueName) throw new Error("Run this spec through the browser harness with a dedicated test database.");

  // Arrange: authenticate seeded Venue Staff and create an isolated venue through the real API.
  await page.goto("/login");
  await page.getByLabel("Email").fill("venue_staff1@connectsphere.test");
  await page.getByLabel("Password").fill("P@55w0rd");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  const created = await page.request.post(`${apiBase}/api/venues`, {
    data: {
      name: venueName,
      location: "Browser Test Building",
      capacity: 40,
      facilities: ["AV System"],
      accessibility: [],
      layouts: ["Classroom"],
      operatingInformation: "Browser test venue",
      operatingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      operatingStartTime: "08:00",
      operatingEndTime: "22:00",
      setupTimeMinutes: 0,
      turnaroundTimeMinutes: 0,
    },
  });
  expect(created.status()).toBe(201);
  const venueId = (await created.json()).venue.id as string;
  await page.goto(`/venue-records/${venueId}`);
  await expect(page.getByRole("heading", { name: venueName })).toBeVisible();
  const localTimes = await page.evaluate(() => {
    const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    start.setHours(15, 0, 0, 0);
    const end = new Date(start);
    end.setHours(18, 0, 0, 0);
    const input = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    return { start: input(start), end: input(end), startIso: start.toISOString(), endIso: end.toISOString() };
  });

  // Act: enter the local interval, review it without writing, then confirm.
  await page.getByRole("button", { name: "Mark unavailable" }).click();
  await page.getByLabel("Unavailable start").fill(localTimes.start);
  await page.getByLabel("Unavailable end").fill(localTimes.end);
  await page.getByLabel("Reason").fill("Browser maintenance");
  await page.getByRole("button", { name: "Review unavailability" }).click();
  await expect(page.getByText(/Confirm unavailability for this venue/)).toContainText("Browser maintenance");
  const beforeConfirmation = await page.request.get(`${apiBase}/api/venues/${venueId}`);
  expect((await beforeConfirmation.json()).unavailablePeriods).toEqual([]);
  const savedResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/api/venues/${venueId}/unavailable-periods`) && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Confirm unavailability" }).click();
  const saved = await savedResponse;

  // Assert the actual API persisted the chosen instants and the UI shows the saved period.
  expect(saved.status()).toBe(201);
  const savedBody = await saved.json();
  expect(savedBody.period).toMatchObject({ start: localTimes.startIso, end: localTimes.endIso, reason: "Browser maintenance" });
  await expect(page.getByText("Browser maintenance", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Affected bookings" })).toContainText("No existing bookings are affected.");

  // Assert a fresh page read still displays the same server record, not just transient React state.
  const refreshed = page.waitForResponse((response) =>
    response.url().endsWith(`/api/venues/${venueId}`) && response.request().method() === "GET",
  );
  await page.reload();
  const detail = await (await refreshed).json();
  expect(detail.unavailablePeriods).toEqual([
    expect.objectContaining({ id: savedBody.period.id, start: localTimes.startIso, end: localTimes.endIso, reason: "Browser maintenance" }),
  ]);
  await expect(page.getByText("Browser maintenance", { exact: true })).toBeVisible();
});
