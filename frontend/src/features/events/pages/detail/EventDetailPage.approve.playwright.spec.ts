import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";
const password = process.env.SPM40_TEST_PASSWORD ?? "P@55w0rd";
const organiserEmail =
  process.env.SPM40_ORGANISER_EMAIL ?? "organiser1@connectsphere.test";
const defaultName =
  process.env.SPM40_TEST_NAME ?? `SPM-40 approval functional ${Date.now()}`;

type CreatedEvent = {
  id: string;
  name: string;
  status: string;
  coordinatorName?: string;
};

type CreateEventResponse = {
  event: CreatedEvent;
};

const coordinatorEmailByName: Record<string, string> = {
  "Coordinator 1": "coordinator1@connectsphere.test",
  "Coordinator 2": "coordinator2@connectsphere.test",
  "Coordinator 3": "coordinator3@connectsphere.test",
};

function futureWindow(daysFromNow: number) {
  const start = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  start.setUTCHours(10, 0, 0, 0);
  const end = new Date(start);
  end.setUTCHours(12, 0, 0, 0);
  return { startDateTime: start.toISOString(), endDateTime: end.toISOString() };
}

function eventPayload(name: string) {
  return {
    name,
    purpose: "Functional approval workflow verification",
    description: "SPM-40 browser functional test request.",
    ...futureWindow(45),
    expectedAttendance: 42,
    layout: "Theatre",
    facilities: ["Projector"],
    accessibility: ["Hearing loop"],
    attachments: [],
    equipmentNeeds: "Wireless microphone",
    submissionKey: crypto.randomUUID(),
    registrationEnabled: false,
  };
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText(/Signed in as/i)).toBeVisible();
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
}

async function createSubmittedEvent(request: APIRequestContext, name: string) {
  const loginResponse = await request.post(`${apiBase}/api/auth/login`, {
    data: { email: organiserEmail, password },
  });
  expect(loginResponse.ok()).toBe(true);

  const createResponse = await request.post(`${apiBase}/api/events`, {
    data: eventPayload(name),
  });
  expect(createResponse.ok()).toBe(true);
  const body = (await createResponse.json()) as CreateEventResponse;
  expect(body.event.status).toBe("submitted");
  expect(body.event.coordinatorName).toBeTruthy();
  return body.event;
}

test.describe("SPM-40 approve request functional workflow", () => {
  // SPM-40 AC1-5: the assigned coordinator can find a Submitted request, approve it, and the organiser sees the confirmation.
  test("coordinator approves a submitted request and organiser receives the approval notification", async ({
    page,
    request,
  }) => {
    const event = await createSubmittedEvent(
      request,
      `${defaultName} happy path`,
    );
    const coordinatorEmail =
      coordinatorEmailByName[event.coordinatorName ?? ""];
    expect(coordinatorEmail).toBeTruthy();

    // Coordinator signs in and sees the request in the default Submitted queue.
    await login(page, coordinatorEmail);
    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Pending Requests" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: new RegExp(event.name) }),
    ).toBeVisible();

    // The actual functional action: select Approve and submit the decision from the detail page.
    await page.getByRole("link", { name: new RegExp(event.name) }).click();
    await page.getByRole("button", { name: "Review Event" }).click();
    await page.getByRole("radio", { name: "Approve" }).check();
    await page.getByRole("button", { name: "Submit Decision" }).click();
    await expect(page.getByLabel("Event status timeline")).toContainText(
      "approved",
    );
    await expect(
      page.getByRole("button", { name: "Review Event" }),
    ).toHaveCount(0);

    // The approved request drops out of the coordinator's Submitted pending list.
    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Pending Requests" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: new RegExp(event.name) }),
    ).toHaveCount(0);
    await page.getByLabel("Filter by status").selectOption("approved");
    await expect(
      page.getByRole("link", { name: new RegExp(event.name) }),
    ).toBeVisible();

    // The organiser gets the persistent approval notification and can open the approved request.
    await logout(page);
    await login(page, organiserEmail);
    await expect(
      page.getByLabel("Request decision notifications"),
    ).toContainText(
      `Your event request "${event.name}" was approved and can proceed.`,
    );
    await page
      .getByLabel("Request decision notifications")
      .getByRole("link", { name: "View request" })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: event.name })).toBeVisible();
    await expect(page.getByLabel("Event status timeline")).toContainText(
      "approved",
    );
  });

  // SPM-40 AC6: after approval, the same review workflow cannot move the request back to an earlier state.
  test("approved requests do not expose review controls for reverting to a previous state", async ({
    page,
    request,
  }) => {
    const event = await createSubmittedEvent(
      request,
      `${defaultName} immutable`,
    );
    const coordinatorEmail =
      coordinatorEmailByName[event.coordinatorName ?? ""];
    expect(coordinatorEmail).toBeTruthy();

    // First approval creates the Approved state that AC6 protects.
    await login(page, coordinatorEmail);
    await page.goto(`/events/${event.id}`);
    await page.getByRole("button", { name: "Review Event" }).click();
    await page.getByRole("radio", { name: "Approve" }).check();
    await page.getByRole("button", { name: "Submit Decision" }).click();
    await expect(page.getByLabel("Event status timeline")).toContainText(
      "approved",
    );

    // Reopening the approved event leaves no Review Event or Submit Decision controls to push it backward.
    await page.reload();
    await expect(page.getByLabel("Event status timeline")).toContainText(
      "approved",
    );
    await expect(
      page.getByRole("button", { name: "Review Event" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Submit Decision" }),
    ).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "Approve" })).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "Reject" })).toHaveCount(0);
  });
});
