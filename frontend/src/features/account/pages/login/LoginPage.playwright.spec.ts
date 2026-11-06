// SPM-187 stage 2: the one deliberate UI login in the browser suite. Every other spec starts from a saved login
// (test.use({ as: ... }), see frontend/e2e/auth.setup.ts), so this spec is what keeps logging in and out covered end to
// end (SPM-168 AC2): real form, real backend session, real cookie. It stays anonymous (no `as`) on purpose.
import { expect, test } from "../../../../../e2e/fixtures";

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";
const email = "coordinator1@connectsphere.test";
const password = "P@55w0rd";

test("a user logs in through the login page, is recognised by the backend, and logs out again", async ({ page }) => {
  // Anonymous to start: the backend refuses a request with no session.
  expect((await page.request.get(`${apiBase}/api/auth/me`)).status()).toBe(401);

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await expect(page).not.toHaveURL(/\/login$/);

  // The session is the one the form created, for the account typed in.
  const me = await page.request.get(`${apiBase}/api/auth/me`);
  expect(me.status()).toBe(200);
  expect(((await me.json()) as { email: string }).email).toBe(email);

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
  expect((await page.request.get(`${apiBase}/api/auth/me`)).status()).toBe(401);
});
