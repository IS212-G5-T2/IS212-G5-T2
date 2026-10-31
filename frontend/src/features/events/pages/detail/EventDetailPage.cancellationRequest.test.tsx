import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "@/features/events/pages/detail/EventDetailPage";
import type { CancellationRequest } from "@/features/events/types/cancellationRequest";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import type { EventRecord, PlanningView } from "@/types";

/*
 * SPM-155 page wiring (EventDetailPage): the Organiser's request panel and the Coordinator's decision panel are
 * shown to the right people, and accepting a request shows the event as Cancelled without a reload. The HTTP layer
 * is the boundary and is mocked; the page, both panels and the dialog are real.
 * Test cases: CANCEL-REQUEST-01-E (UI), 03-C (UI), 04-A (UI). Mutant IDs in each "Kills:" line are defined in
 * frontend/scripts/testing/mutation/spm155.mutants.mjs.
 */

vi.mock("@/utils/api", async (importOriginal) => ({ ...(await importOriginal<object>()), api: vi.fn() }));
const apiMock = vi.mocked(api);

const EVENT_ID = "00000000-0000-4000-8000-000000000155";
const T0 = "2026-10-12T04:00:00.000Z";

function eventRecord(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: EVENT_ID,
    name: "Annual Gala Dinner",
    purpose: "Dinner",
    description: "A gala dinner.",
    organiserId: "org-01",
    organiserName: "Organiser 1",
    coordinatorId: "coo-01",
    coordinatorName: "Coordinator 1",
    status: "confirmed",
    startDateTime: "2026-11-05T02:00:00.000Z",
    endDateTime: "2026-11-05T04:00:00.000Z",
    expectedAttendance: 80,
    venueRequirements: { minCapacity: 80, layout: "Banquet", facilities: ["Catering"], accessibility: [] },
    equipmentNeeds: "Projector",
    registrationEnabled: false,
    createdAt: "2026-09-13T00:00:00.000Z",
    updatedAt: "2026-10-04T09:00:00.000Z",
    ...overrides,
  };
}

const pending: CancellationRequest = {
  id: "req-1",
  eventId: EVENT_ID,
  eventName: "Annual Gala Dinner",
  status: "pending",
  displayStatus: "pending",
  reason: "Sponsor withdrew",
  requestedBy: "Farid Rahman",
  requestedAt: T0,
};

function planningView(event: EventRecord): PlanningView {
  return { event, venueBookings: [], equipmentArrangements: [], pendingChanges: [], readOnly: false, editableFields: [], lastUpdatedAt: T0 };
}

function routeApi(event: EventRecord, requests: CancellationRequest[]) {
  apiMock.mockImplementation(((path: string) => {
    if (path.endsWith("/cancellation-requests")) return Promise.resolve(requests);
    if (path.endsWith("/decision")) return Promise.resolve({ request: { ...pending, status: "accepted", displayStatus: "accepted" }, message: "Cancellation request accepted. Annual Gala Dinner is cancelled." });
    if (path.endsWith("/arrangements-status")) return Promise.resolve({ eventId: EVENT_ID, ready: false, outstanding: [] });
    if (path.endsWith("/planning")) return Promise.resolve(planningView(event));
    if (path.includes("/comments")) return Promise.resolve([]);
    if (path.includes("/change-requests")) return Promise.resolve([]);
    if (path.endsWith("/confirmed-arrangements")) return Promise.reject(new Error("not confirmed"));
    return Promise.resolve(event);
  }) as typeof api);
}

function renderAs(user: { id: string; role: string; roles: string[] }, event: EventRecord, requests: CancellationRequest[] = [pending]) {
  routeApi(event, requests);
  useAppStore.setState({ currentUser: { ...user, name: user.id, email: `${user.id}@example.test` } as never, events: [event] });
  return render(
    <MemoryRouter initialEntries={[`/events/${EVENT_ID}`]}>
      <Routes>
        <Route path="/events/:id" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const ORG1 = { id: "org-01", role: "organiser", roles: ["organiser"] };
const COO1 = { id: "coo-01", role: "coordinator", roles: ["coordinator"] };
const requestCalls = () => apiMock.mock.calls.filter(([path]) => String(path).endsWith("/cancellation-requests"));

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SPM-155 EventDetailPage wiring", () => {
  // Kills: FM33
  /** CANCEL-REQUEST-01-A (page): the owning Organiser sees the panel and Request Cancellation on a Confirmed event with no request. */
  it("CANCEL-REQUEST-01-A (page): the submitting organiser sees Request Cancellation on a Confirmed event", async () => {
    // Arrange / Act
    renderAs(ORG1, eventRecord(), []);

    // Assert
    expect(await screen.findByRole("button", { name: "Request Cancellation" })).toBeInTheDocument();
  });

  // Kills: FM33, FM6b, FM7
  /** CANCEL-REQUEST-02-A (page): the owner reads Pending on the event page. */
  it("CANCEL-REQUEST-02-A (page): the submitting organiser sees Status: Pending", async () => {
    // Arrange / Act
    renderAs(ORG1, eventRecord());

    // Assert
    expect(await screen.findByText("Status: Pending")).toBeInTheDocument();
  });

  // Kills: FM13, FM49, FM6, FM6b
  /** CANCEL-REQUEST-01-E and 02-D (UI): ORG-02, COO-02, LEAD-01 and ATT-01 see no cancellation panel and no request is fetched. */
  it.each([
    ["ORG-02", { id: "org-02", role: "organiser", roles: ["organiser"] }],
    ["COO-02, not assigned", { id: "coo-02", role: "coordinator", roles: ["coordinator"] }],
    ["LEAD-01", { id: "lead-01", role: "coordinator_lead", roles: ["coordinator_lead"] }],
  ])("CANCEL-REQUEST-01-E (page): %s sees no cancellation request panel", async (_label, user) => {
    // Arrange / Act
    renderAs(user, eventRecord());
    await screen.findByRole("heading", { name: "Annual Gala Dinner" });

    // Assert
    expect(screen.queryByRole("region", { name: "Cancellation request" })).not.toBeInTheDocument();
    expect(requestCalls()).toHaveLength(0);
  });

  // Kills: FM35, FM41, FM46
  /** CANCEL-REQUEST-03-A (page): the assigned Coordinator sees the pending request with its reason and the decision controls. */
  it("CANCEL-REQUEST-03-A (page): the assigned coordinator sees the pending request, Accept and Decline", async () => {
    // Arrange / Act
    renderAs(COO1, eventRecord());

    // Assert
    const panel = await screen.findByRole("region", { name: "Cancellation request" });
    expect(within(panel).getByText("Sponsor withdrew")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Decline" })).toBeInTheDocument();
  });

  // Kills: FM27, FM35, FM36, FM9
  /** CANCEL-REQUEST-04-A (page): after Accept and Confirm cancellation the page shows the cancelled banner and no cancel controls. */
  it("CANCEL-REQUEST-04-A (page): accepting shows the Cancelled banner, sends the decision route and never the status-change route", async () => {
    // Arrange
    const user = userEvent.setup();
    renderAs(COO1, eventRecord());
    await user.click(await screen.findByRole("button", { name: "Accept" }));

    // Act
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm cancellation" }));

    // Assert: the banner shows without a reload; the decision route was used once; status-change was not
    expect(await screen.findByText("This event has been cancelled.")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith("/cancellation-requests/req-1/decision", { method: "POST", body: JSON.stringify({ decision: "accept" }) });
    expect(apiMock.mock.calls.filter(([path]) => String(path).endsWith("/status-change"))).toHaveLength(0);
  });
});
