import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "@/pages/EventDetailPage";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import { PLANNING_REFRESH_MS } from "@/utils/planning";
import type { EventRecord, PlanningView } from "@/types";

/**
 * SPM-97 — Organiser views event information during planning. RED / TDD: the
 * planning panel and "@/utils/planning" do not exist yet. Contract: for
 * planning-phase events the page fetches GET /events/:id/planning, renders a
 * section named "Planning information", and re-fetches every PLANNING_REFRESH_MS.
 */

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const EVENT_ID = "00000000-0000-4000-8000-000000000049";

function eventRecord(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: EVENT_ID,
    name: "Welcome Evening",
    purpose: "Community building",
    description: "A welcome event for new members.",
    organiserId: "organiser-1",
    organiserName: "Demo Organiser",
    coordinatorId: "coordinator-1",
    coordinatorName: "Demo Coordinator",
    status: "planning",
    startDateTime: "2026-11-10T10:00:00.000Z",
    endDateTime: "2026-11-10T13:00:00.000Z",
    expectedAttendance: 80,
    venueRequirements: { minCapacity: 80, layout: "Banquet", facilities: ["Catering"], accessibility: ["Wheelchair ramps"] },
    equipmentNeeds: "Two microphones",
    registrationEnabled: false,
    changeRequests: [],
    createdAt: "2026-09-13T00:00:00.000Z",
    updatedAt: "2026-10-04T09:00:00.000Z",
    ...overrides,
  };
}

function planningView(overrides: Partial<PlanningView> = {}): PlanningView {
  return {
    event: eventRecord(),
    venueBookings: [
      { id: "bk-1", venueName: "Hall A", start: "2026-11-10T10:00:00.000Z", end: "2026-11-10T13:00:00.000Z", status: "Booked" },
    ],
    equipmentArrangements: [{ id: "eq-1", name: "Projector", quantity: 2, status: "Reserved" }],
    pendingChanges: [],
    readOnly: true,
    editableFields: [],
    lastUpdatedAt: "2026-10-04T09:00:00.000Z",
    ...overrides,
  };
}

let currentView: PlanningView;

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/events/${EVENT_ID}`]}>
      <Routes>
        <Route path="/events/:id" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const planningRegion = () => screen.findByRole("region", { name: /planning information/i });

beforeEach(() => {
  vi.clearAllMocks();
  currentView = planningView();
  apiMock.mockImplementation((async (path: string) => {
    if (path.endsWith("/planning")) return currentView;
    if (path.includes("/comments")) return [];
    return currentView.event;
  }) as typeof api);
  useAppStore.setState({
    currentUser: { id: "organiser-1", name: "Demo Organiser", email: "organiser@example.test", role: "organiser" },
    events: [],
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("EventDetailPage planning information (organiser)", () => {
  // EVENT-VIEW-01-A: once the event is in planning the organiser sees the planning panel.
  it("EVENT-VIEW-01-A shows the planning information panel for a planning-phase event", async () => {
    renderPage();
    expect(await planningRegion()).toBeInTheDocument();
  });

  // EVENT-VIEW-01-B: before planning there is no panel and the planning endpoint is not called.
  it("EVENT-VIEW-01-B hides the planning panel while the event is only submitted", async () => {
    currentView = planningView({ event: eventRecord({ status: "submitted" }) });
    renderPage();
    await screen.findByText("Event Details");
    expect(screen.queryByRole("region", { name: /planning information/i })).not.toBeInTheDocument();
    expect(apiMock.mock.calls.some(([path]) => String(path).endsWith("/planning"))).toBe(false);
  });

  // EVENT-VIEW-02-A: the organiser sees the current venue, equipment and booking status.
  it("EVENT-VIEW-02-A lists the booked venue, equipment arrangement and their status", async () => {
    renderPage();
    const region = await planningRegion();
    expect(within(region).getByText(/Hall A/)).toBeInTheDocument();
    expect(within(region).getByText(/Booked/)).toBeInTheDocument();
    expect(within(region).getByText(/Projector/)).toBeInTheDocument();
    expect(within(region).getByText(/Reserved/)).toBeInTheDocument();
  });

  // EVENT-VIEW-03-A: a field with a change pending because of a booking conflict is marked.
  it("EVENT-VIEW-03-A marks a conflict-driven pending change on the affected field", async () => {
    currentView = planningView({
      pendingChanges: [
        { id: "chg-1", kind: "booking_conflict", field: "expectedAttendance", currentValue: 80, proposedValue: 150, status: "Needs Review", impacts: [] },
      ],
    });
    renderPage();
    const region = await planningRegion();
    expect(within(region).getByText(/change pending/i)).toBeInTheDocument();
    expect(within(region).getByText(/booking conflict/i)).toBeInTheDocument();
  });

  // EVENT-VIEW-03-B: an unavailable booked venue is shown as needing a replacement.
  it("EVENT-VIEW-03-B shows that a replacement venue is required", async () => {
    currentView = planningView({
      venueBookings: [{ id: "bk-1", venueName: "Hall A", start: "2026-11-10T10:00:00.000Z", end: "2026-11-10T13:00:00.000Z", status: "Unavailable" }],
      pendingChanges: [
        { id: "venue-bk-1", kind: "replacement_venue_required", field: "venue", bookingId: "bk-1", venueName: "Hall A", status: "Needs Review" },
      ],
    });
    renderPage();
    const region = await planningRegion();
    expect(within(region).getByText(/replacement venue required/i)).toBeInTheDocument();
  });

  // EVENT-VIEW-04-A: the organiser's panel has no way to edit anything.
  it("EVENT-VIEW-04-A offers no edit controls to the organiser", async () => {
    renderPage();
    const region = await planningRegion();
    const editButtons = within(region)
      .queryAllByRole("button")
      .filter((button) => /edit|update|save|confirm|reject/i.test(button.textContent ?? ""));
    expect(editButtons).toHaveLength(0);
    for (const role of ["textbox", "spinbutton", "checkbox", "combobox"]) {
      expect(within(region).queryAllByRole(role)).toHaveLength(0);
    }
    expect(screen.queryByRole("link", { name: /^edit$/i })).not.toBeInTheDocument();
  });

  // EVENT-VIEW-05-A: after the coordinator resolves a change the page updates by itself.
  it("EVENT-VIEW-05-A refreshes automatically once the pending change is resolved", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    currentView = planningView({
      pendingChanges: [
        { id: "chg-1", kind: "booking_conflict", field: "expectedAttendance", currentValue: 80, proposedValue: 150, status: "Needs Review", impacts: [] },
      ],
    });
    renderPage();
    const region = await planningRegion();
    expect(within(region).getByText(/change pending/i)).toBeInTheDocument();

    // The coordinator confirms the change on the server; the organiser does nothing.
    currentView = planningView({ event: eventRecord({ expectedAttendance: 150 }), pendingChanges: [] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLANNING_REFRESH_MS);
    });

    await waitFor(() => {
      const refreshed = screen.getByRole("region", { name: /planning information/i });
      expect(within(refreshed).getByText(/150/)).toBeInTheDocument();
      expect(within(refreshed).queryByText(/change pending/i)).not.toBeInTheDocument();
    });
  });
});