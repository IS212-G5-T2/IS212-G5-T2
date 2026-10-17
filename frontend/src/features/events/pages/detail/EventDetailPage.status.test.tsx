// Story: SPM-94 Track My Event Status (Organiser)
// ACs: AC2 (awaiting assignment), AC3 (one safety indicator), shown on the planning page too
// Test cases: TRACK-EVENT-STATUS-02-A, 03-A, 03-B (planning page)
import { cleanup, render, screen } from "@testing-library/react";
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
  // Kills: M6 (indicator for any unassigned event), M7 (indicator persists after assignment), indicator removed from the page.
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

  // Kills: M8 (changes requested and cleared swapped on the page), indicator removed from the page.
  it.each([
    ["AWAITING_CHECK", "Awaiting Safety Officer check"],
    ["CHANGES_REQUESTED", "Safety changes requested"],
    ["CLEARED", "Safety check cleared"],
  ] as const)("TRACK-EVENT-STATUS-03-A/03-B: %s shows exactly '%s' on the planning page", async (indicator, text) => {
    current = eventRecord({ status: "planning", safetyIndicator: indicator });
    renderPage();
    expect(await screen.findByText(text)).toBeInTheDocument();
    // Kills: M9 (two safety indicators at once): exactly one safety text is on the page.
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
