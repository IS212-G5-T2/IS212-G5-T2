import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "@/pages/EventDetailPage";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import type { EventRecord, UserRole } from "@/types";

/**
 * SPM-40 — Approve a request. Frontend UI unit tests (Confluence: EVENT-APPROVE-01
 * A-C and the AC6 UI immutability guard EVENT-APPROVE-04-C). RED / TDD: the
 * "Review Event" decision controls already render an Approve option (from the
 * SPM-83 reject work), but selecting Approve + "Submit Decision" is not wired to
 * anything yet, so the approve request never fires. Intended UI contract:
 *
 *   - Clicking "Review Event" reveals Approve and Reject options + "Submit
 *     Decision"; Approve needs no reason field.
 *   - Selecting Approve and submitting fires POST /events/:id/approve.
 *   - The Approve entrypoint is only shown to the assigned coordinator, and only
 *     while the event is Submitted.
 */

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

function assignedEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "00000000-0000-4000-8000-000000000036",
    name: "Welcome Evening",
    purpose: "Community building",
    description: "A welcome event for new members.",
    organiserId: "organiser-9",
    organiserName: "Demo Organiser",
    coordinatorId: "coordinator-1",
    coordinatorName: "Demo Coordinator",
    status: "submitted",
    startDateTime: "2026-12-12T18:00:00.000Z",
    endDateTime: "2026-12-12T21:00:00.000Z",
    expectedAttendance: 80,
    venueRequirements: { minCapacity: 80, layout: "Banquet", facilities: [], accessibility: [] },
    equipmentNeeds: "",
    registrationEnabled: false,
    changeRequests: [],
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
    ...overrides,
  };
}

function setUser(role: UserRole, id = "coordinator-1") {
  useAppStore.setState({
    currentUser: { id, name: "Test User", email: "user@example.test", role },
  });
}

function renderDetail(event: EventRecord) {
  apiMock.mockImplementation((path: string) =>
    Promise.resolve(String(path).includes("/comments") ? [] : event),
  );
  return render(
    <MemoryRouter initialEntries={[`/events/${event.id}`]}>
      <Routes>
        <Route path="/events/:id" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openReviewApprove() {
  fireEvent.click(await screen.findByRole("button", { name: "Review Event" }));
  fireEvent.click(screen.getByRole("radio", { name: /approve/i }));
}

function submitDecision() {
  fireEvent.click(screen.getByRole("button", { name: "Submit Decision" }));
}

function approveRequestFired() {
  return apiMock.mock.calls.some(([p]) => String(p).includes("/approve"));
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ events: [], notifications: [] });
  setUser("coordinator");
});

describe("EventDetailPage — approve workflow (SPM-40)", () => {
  // EVENT-APPROVE-01-A — happy path (entry)
  it("lets the assigned coordinator open the decision controls with an Approve option", async () => {
    renderDetail(assignedEvent());

    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review Event" }));

    expect(screen.getByRole("radio", { name: /approve/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /reject/i })).toBeTruthy();
  });

  // EVENT-APPROVE-01-B — happy path (submit); no reason required
  it("submits an approval and fires the approve request without asking for a reason", async () => {
    renderDetail(assignedEvent());
    await openReviewApprove();

    // Approve requires no reason field.
    expect(screen.queryByRole("textbox", { name: /reason/i })).toBeNull();

    submitDecision();

    expect(approveRequestFired()).toBe(true);
  });

  // EVENT-APPROVE-01-C — authorization (UI): controls only for the assigned coordinator
  it("shows the Approve controls only to the assigned coordinator", async () => {
    // Unassigned coordinator: no Review Event entrypoint.
    setUser("coordinator", "coordinator-2");
    renderDetail(assignedEvent());
    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Review Event" })).toBeNull();
    cleanup();

    // Organiser (owner): no decision controls.
    setUser("organiser", "organiser-9");
    renderDetail(assignedEvent());
    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /approve/i })).toBeNull();
    cleanup();

    // Assigned coordinator: the Approve control is available.
    setUser("coordinator", "coordinator-1");
    renderDetail(assignedEvent());
    fireEvent.click(await screen.findByRole("button", { name: "Review Event" }));
    expect(screen.getByRole("radio", { name: /approve/i })).toBeTruthy();
  });

  // EVENT-APPROVE-04-C — immutability (UI): no approve/revert controls once approved
  it("hides the approve controls once the event is approved", async () => {
    setUser("coordinator", "coordinator-1");

    // An already-approved event offers no Review Event entrypoint / decision controls.
    renderDetail(assignedEvent({ status: "approved" }));
    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Review Event" })).toBeNull();
    expect(screen.queryByRole("radio", { name: /approve/i })).toBeNull();
    cleanup();

    // Contrast: while still submitted, the Approve entrypoint is shown.
    renderDetail(assignedEvent({ status: "submitted" }));
    expect(await screen.findByRole("button", { name: "Review Event" })).toBeTruthy();
  });
});
