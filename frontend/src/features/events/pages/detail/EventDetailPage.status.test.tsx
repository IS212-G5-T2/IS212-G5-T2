// Story: SPM-94 Track My Event Status (Organiser)
// ACs: AC2 (awaiting assignment), AC3 (one safety indicator), shown on the planning page too
// Test cases: TRACK-EVENT-STATUS-02-A, 03-A, 03-B (planning page)
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "@/features/events/pages/detail/EventDetailPage";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import type { EventRecord, PlanningView } from "@/types";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const EVENT_ID = "00000000-0000-4000-8000-000000000501";

function eventRecord(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: EVENT_ID,
    name: "Student Mixer",
    purpose: "Mixer",
    description: "",
    organiserId: "ORG-01",
    organiserName: "Organiser One",
    status: "planning",
    startDateTime: "2026-11-10T10:00:00.000Z",
    endDateTime: "2026-11-10T13:00:00.000Z",
    expectedAttendance: 20,
    venueRequirements: { minCapacity: 20, layout: "Boardroom", facilities: [], accessibility: [] },
    equipmentNeeds: "",
    registrationEnabled: false,
    changeRequests: [],
    createdAt: "2026-10-12T04:00:00.000Z",
    updatedAt: "2026-10-12T04:00:00.000Z",
    ...overrides,
  };
}

function planningView(event: EventRecord): PlanningView {
  return {
    event,
    venueBookings: [],
    equipmentArrangements: [],
    pendingChanges: [],
    readOnly: true,
    editableFields: [],
    lastUpdatedAt: "2026-10-12T04:00:00.000Z",
  };
}

let current: EventRecord;

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/events/${EVENT_ID}`]}>
      <Routes>
        <Route path="/events/:id" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.mockImplementation((async (path: string) => {
    if (path.endsWith("/planning")) return planningView(current);
    if (path.includes("/comments")) return [];
    return current;
  }) as typeof api);
  useAppStore.setState({
    currentUser: { id: "ORG-01", name: "Organiser One", email: "organiser@example.test", role: "organiser" },
    events: [],
  });
});

afterEach(() => {
  cleanup();
});

describe("SPM-94 AC2/AC3 on the organiser's planning page", () => {
  // Kills: X5 (indicator removed from the planning page), X4 (shown without the server flag).
  it("TRACK-EVENT-STATUS-02-A: the owner sees Awaiting Coordinator assignment for an unassigned Submitted event", async () => {
    current = eventRecord({ status: "submitted", coordinatorId: undefined, awaitingCoordinatorAssignment: true });
    renderPage();
    expect(await screen.findByText("Awaiting Coordinator assignment")).toBeInTheDocument();
  });

  it("TRACK-EVENT-STATUS-02-A: the owner does not see the assignment indicator once a coordinator is assigned", async () => {
    current = eventRecord({ status: "submitted", coordinatorId: "COO-01", coordinatorName: "Coordinator One" });
    renderPage();
    await screen.findByText("Student Mixer");
    expect(screen.queryByText("Awaiting Coordinator assignment")).not.toBeInTheDocument();
  });

  // Kills: X5 (indicator removed from the planning page), the three indicator texts swapped.
  it.each([
    ["AWAITING_CHECK", "Awaiting Safety Officer check"],
    ["CHANGES_REQUESTED", "Safety changes requested"],
    ["CLEARED", "Safety check cleared"],
  ] as const)("TRACK-EVENT-STATUS-03-A/03-B: %s shows exactly '%s' on the planning page", async (indicator, text) => {
    current = eventRecord({ status: "planning", safetyIndicator: indicator });
    renderPage();
    expect(await screen.findByText(text)).toBeInTheDocument();
    // Exactly one safety text is on the page (M9-style: two at once would fail).
    expect(screen.getAllByText(/^(Awaiting Safety Officer check|Safety changes requested|Safety check cleared)$/)).toHaveLength(1);
  });

  it("TRACK-EVENT-STATUS-03-B: a null safety indicator shows no safety text on the planning page", async () => {
    current = eventRecord({ status: "planning", safetyIndicator: null });
    renderPage();
    await screen.findByText("Student Mixer");
    expect(screen.queryByText(/^(Awaiting Safety Officer check|Safety changes requested|Safety check cleared)$/)).not.toBeInTheDocument();
  });

  // Oracle: indicators are the organiser's view only (planning header is gated by isOwner).
  it("TRACK-EVENT-STATUS-03-B: the assigned coordinator, not the owner, sees no indicators on the page", async () => {
    current = eventRecord({ status: "planning", safetyIndicator: "AWAITING_CHECK", coordinatorId: "COO-01", coordinatorName: "Coordinator One" });
    useAppStore.setState({
      currentUser: { id: "COO-01", name: "Coordinator One", email: "coo@example.test", role: "coordinator" },
    });
    renderPage();
    await screen.findByText("Student Mixer");
    expect(screen.queryByText("Awaiting Safety Officer check")).not.toBeInTheDocument();
  });
});

describe("SPM-94 AC4: a revisit shows the server's status, not the store's copy", () => {
  // Oracle: the page requests the event on every visit and shows what the server holds (Approved).
  // Kills: a refetch skipped when the store already holds the event (stale Submitted copy shown).
  it("TRACK-EVENT-STATUS-04-B: a revisit with a stale Submitted copy in the store shows Approved from the server", async () => {
    current = eventRecord({ status: "approved" });
    useAppStore.setState({ events: [eventRecord({ status: "submitted" })] });
    renderPage();

    const timeline = await screen.findByLabelText("Event status timeline");
    await waitFor(() => expect(within(timeline).getByText("approved")).toHaveClass("bg-primary-100"));
    expect(apiMock).toHaveBeenCalledWith(`/events/${EVENT_ID}`);
  });
});

describe("SPM-94 AC1: the planning page marks the exact current step", () => {
  // Oracle: the status flow submitted -> approved -> planning -> confirmed; a reached step is shaded, the next one is not.
  // Kills: a timeline one step ahead or behind (the step after the current one would be shaded).
  it.each([
    ["submitted", "submitted", "approved"],
    ["approved", "approved", "planning"],
    ["planning", "planning", "confirmed"],
    ["confirmed", "confirmed", "cancelled"],
  ] as const)("TRACK-EVENT-STATUS-01-B: %s marks %s reached and %s not yet reached", async (status, reached, next) => {
    current = eventRecord({ status });
    renderPage();
    const timeline = await screen.findByLabelText("Event status timeline");
    await waitFor(() => expect(within(timeline).getByText(reached)).toHaveClass("bg-primary-100"));
    expect(within(timeline).getByText(next)).toHaveClass("text-gray-400");
  });

  // Oracle: a rejected event shows the rejected step in the danger colour, after the submitted step.
  it("TRACK-EVENT-STATUS-01-B: rejected marks the rejected step in the danger colour", async () => {
    current = eventRecord({ status: "rejected", rejectionReason: "Not suitable for this venue" });
    renderPage();
    const timeline = await screen.findByLabelText("Event status timeline");
    await waitFor(() => expect(within(timeline).getByText("rejected")).toHaveClass("bg-danger-100"));
    expect(within(timeline).getByText("submitted")).toHaveClass("bg-primary-100");
  });
});
