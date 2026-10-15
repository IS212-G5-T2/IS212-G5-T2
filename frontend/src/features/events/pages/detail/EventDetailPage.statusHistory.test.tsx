// Story: SPM-148 Event Status Changes from Approved to Planning
// ACs: AC4 (history visible to the organiser and the assigned coordinator)
// Test cases: PLAN-STATUS-04-A (FE gate for the history panel)
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "@/features/events/pages/detail/EventDetailPage";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import type { EventRecord } from "@/types";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);

function eventWith(status: EventRecord["status"]): EventRecord {
  return {
    id: "event-1",
    name: "Innovation Showcase",
    purpose: "",
    description: "",
    organiserId: "organiser-1",
    organiserName: "Priya Nair",
    coordinatorId: "coordinator-1",
    coordinatorName: "Marcus Lee",
    status,
    startDateTime: "2026-12-12T18:00:00.000Z",
    endDateTime: "2026-12-12T21:00:00.000Z",
    expectedAttendance: 80,
    venueRequirements: { minCapacity: 80, layout: "Banquet", facilities: [], accessibility: [] },
    equipmentNeeds: "",
    registrationEnabled: false,
    changeRequests: [],
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
  };
}

/** Other paths reject: the planning and change-history reads are supplementary here and their errors are handled. */
function stubApi(event: EventRecord) {
  apiMock.mockImplementation((path: string) => {
    if (path === `/events/${event.id}`) return Promise.resolve(event);
    if (path === `/events/${event.id}/comments`) return Promise.resolve([]);
    if (path === `/events/${event.id}/status-history`)
      return Promise.resolve([
        { fromStatus: "Approved", toStatus: "Planning", changedAt: "2026-10-15T04:00:00.000Z", changedBy: { id: "coordinator-1", name: "Marcus Lee" } },
      ]);
    return Promise.reject(new Error("not stubbed"));
  });
}

function renderAs(event: EventRecord) {
  useAppStore.setState({
    currentUser: { id: "organiser-1", name: "Priya Nair", email: "priya@example.test", role: "organiser" },
    events: [event],
  });
  return render(
    <MemoryRouter initialEntries={[`/events/${event.id}`]}>
      <Routes>
        <Route path="/events/:id" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SPM-148 AC4: the history panel is shown to the owning organiser for planning-stage events", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });
  afterEach(cleanup);

  // Kills: a gate that hides the history from the owning organiser of a Planning event.
  it("PLAN-STATUS-04-A: the owning organiser of a Planning event sees the Status History panel", async () => {
    stubApi(eventWith("planning"));
    renderAs(eventWith("planning"));

    expect(await screen.findByRole("heading", { name: "Status History" })).toBeInTheDocument();
    expect(await screen.findByText("Approved to Planning, 15 Oct 2026 12:00 SGT, by Marcus Lee")).toBeInTheDocument();
  });

  // Kills: a gate that shows the history for events that never reached planning.
  it("PLAN-STATUS-04-A: a Submitted event does not show the Status History panel", async () => {
    stubApi(eventWith("submitted"));
    renderAs(eventWith("submitted"));

    await screen.findByText("Innovation Showcase");
    expect(screen.queryByRole("heading", { name: "Status History" })).not.toBeInTheDocument();
  });
});
