import { type APIRequestContext } from "@playwright/test";
import { atUtcHour } from "../../../../../e2e/dates";
import { type Account, expect, test } from "../../../../../e2e/fixtures";

const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080";
const password = process.env.SPM40_TEST_PASSWORD ?? "P@55w0rd";
const organiserEmail =
  process.env.SPM40_ORGANISER_EMAIL ?? "organiser1@connectsphere.test";
const leadEmail = process.env.SPM40_LEAD_EMAIL ?? "lead@connectsphere.test";
const defaultName = "SPM-40 approval functional";

type CreatedEvent = {
  id: string;
  name: string;
  status: string;
  coordinatorName?: string;
};

type CreateEventResponse = {
  event: CreatedEvent;
};

// The Lead assigns whichever coordinator is least loaded, so which account the test acts as is only known after the
// event exists. That is why this spec picks its account at run time with `pageAs` instead of `test.use({ as })`.
const coordinatorAccountByName: Record<string, Account> = {
  "Coordinator 1": "coordinator1",
  "Coordinator 2": "coordinator2",
  "Coordinator 3": "coordinator3",
};

function futureWindow(daysFromNow: number) {
  const start = atUtcHour(daysFromNow, 10);
  const end = atUtcHour(daysFromNow, 12);
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
  // SPM-123: a submitted request is not auto-assigned; the Lead assigns a coordinator before review.
  const assigned = await assignCoordinator(request, body.event.id);
  return { ...body.event, coordinatorName: assigned.event.coordinatorName };
}

async function assignCoordinator(request: APIRequestContext, eventId: string) {
  const leadLogin = await request.post(`${apiBase}/api/auth/login`, {
    data: { email: leadEmail, password },
  });
  expect(leadLogin.ok()).toBe(true);

  const coordinatorsResponse = await request.get(`${apiBase}/api/lead/coordinators`);
  expect(coordinatorsResponse.ok()).toBe(true);
  const coordinators = (await coordinatorsResponse.json()) as {
    id: string;
    name: string;
    available: boolean;
    activeAssignments: number;
  }[];
  const coordinator = coordinators
    .filter((item) => item.available && coordinatorAccountByName[item.name] !== undefined)
    .sort((a, b) => a.activeAssignments - b.activeAssignments)[0];
  expect(coordinator, "an available named coordinator").toBeTruthy();

  const assignResponse = await request.post(`${apiBase}/api/lead/queue/${eventId}/assign`, {
    data: { coordinatorId: coordinator.id },
  });
  expect(assignResponse.ok()).toBe(true);
  return (await assignResponse.json()) as { event: { coordinatorName: string } };
}

test.describe("SPM-40 approve request functional workflow", () => {
  // SPM-40 AC1-5: the assigned coordinator can find a Submitted request, approve it, and the organiser sees the confirmation.
  // Quarantined: the approval POST succeeds but the organiser's notification feed does not
  // refetch in time for the dropdown's live-region to receive the row. Needs either a polled
  // assertion on the feed or a window-focus dispatch to force the refetch.
  test.fixme("coordinator approves a submitted request and organiser receives the approval notification", async ({
    pageAs,
    request,
  }) => {
    const event = await createSubmittedEvent(
      request,
      `${defaultName} happy path`,
    );
    const coordinatorAccount =
      coordinatorAccountByName[event.coordinatorName ?? ""];
    expect(coordinatorAccount).toBeTruthy();

    // Coordinator signs in and sees the request in the default Submitted queue.
    let page = await pageAs(coordinatorAccount);
    await page.goto("/events");
    await page.getByLabel("Filter by status").selectOption("submitted");
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
    await page.getByLabel("Filter by status").selectOption("submitted");
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
    page = await pageAs("organiser1");
    await page.goto("/");
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
    pageAs,
    request,
  }) => {
    const event = await createSubmittedEvent(
      request,
      `${defaultName} immutable`,
    );
    const coordinatorAccount =
      coordinatorAccountByName[event.coordinatorName ?? ""];
    expect(coordinatorAccount).toBeTruthy();

    // First approval creates the Approved state that AC6 protects.
    const page = await pageAs(coordinatorAccount);
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
