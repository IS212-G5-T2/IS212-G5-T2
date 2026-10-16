// Story: SPM-64 Request a Change to a Submitted Event
// ACs: AC1 (Request Change entry point), AC5 (status on the event page)
// Test cases: REQ-CHANGE-01-F, REQ-CHANGE-05-A, REQ-CHANGE-05-E
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "@/features/events/pages/detail/EventDetailPage";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import type { ChangeRequest, EventRecord } from "@/types";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);

function eventWith(status: EventRecord["status"], startDateTime = "2030-12-12T10:00:00.000Z"): EventRecord {
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
    startDateTime,
    endDateTime: "2030-12-12T13:00:00.000Z",
    expectedAttendance: 80,
    venueRequirements: { minCapacity: 80, layout: "Banquet", facilities: [], accessibility: [] },
    equipmentNeeds: "",
    registrationEnabled: false,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
  };
}

const PENDING: ChangeRequest = {
  id: "cr-1",
  eventId: "event-1",
  eventName: "Innovation Showcase",
  status: "Pending",
  changes: [{ field: "expectedAttendance", originalValue: 80, proposedValue: 120 }],
  requiresSafetyCheck: false,
  requestedBy: "Priya Nair",
  createdAt: "2026-10-16T02:00:00.000Z",
};

/** Other reads (planning, comments, history) are supplementary on this page and handle their own errors. */
function stubApi(event: EventRecord, requests: ChangeRequest[] = []) {
  apiMock.mockImplementation((path: string) => {
    if (path === `/events/${event.id}`) return Promise.resolve(event);
    if (path === `/events/${event.id}/change-requests`) return Promise.resolve(requests);
    if (path === `/events/${event.id}/comments`) return Promise.resolve([]);
    return Promise.reject(new Error("not stubbed"));
  });
}

function renderAs(event: EventRecord, role: "organiser" | "coordinator" = "organiser") {
  useAppStore.setState({
    currentUser:
      role === "organiser"
        ? { id: "organiser-1", name: "Priya Nair", email: "priya@example.test", role: "organiser" }
        : { id: "coordinator-1", name: "Marcus Lee", email: "marcus@example.test", role: "coordinator" },
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

describe("SPM-64 on the event page", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });
  afterEach(cleanup);

  /** REQ-CHANGE-01-F: the owner of a Submitted to Confirmed event that has not started sees Request Change. */
  it.each(["submitted", "approved", "planning", "confirmed"] as const)(
    "REQ-CHANGE-01-F offers Request Change on a %s event",
    async (status) => {
      stubApi(eventWith(status));
      renderAs(eventWith(status));
      const link = (await screen.findByRole("button", { name: "Request Change" })).closest("a");
      expect(link).toHaveAttribute("href", "/events/event-1/change-requests");
    },
  );

  /** REQ-CHANGE-01-F: closed, draft or started events, and coordinators, get no Request Change button. */
  it.each([
    ["a cancelled event", eventWith("cancelled"), "organiser"],
    ["a started event", eventWith("planning", "2020-01-01T00:00:00.000Z"), "organiser"],
    ["the coordinator", eventWith("planning"), "coordinator"],
  ] as const)("REQ-CHANGE-01-F offers no Request Change for %s", async (_label, event, role) => {
    stubApi(event);
    renderAs(event, role);
    await screen.findByText("Innovation Showcase");
    expect(screen.queryByRole("button", { name: "Request Change" })).not.toBeInTheDocument();
  });

  /** REQ-CHANGE-05-A: the owner sees the pending request's status with a link to the details. */
  it("REQ-CHANGE-05-A shows the pending change request's status", async () => {
    stubApi(eventWith("submitted"), [PENDING]);
    renderAs(eventWith("submitted"));
    const status = await screen.findByRole("region", { name: "Change request status" });
    expect(status).toHaveTextContent("Pending review");
    expect(status).toHaveTextContent("Expected attendance");
  });

  /** REQ-CHANGE-05-E: no status block before the first request. */
  it("REQ-CHANGE-05-E shows no status before any request", async () => {
    stubApi(eventWith("submitted"));
    renderAs(eventWith("submitted"));
    await screen.findByRole("button", { name: "Request Change" });
    expect(screen.queryByRole("region", { name: "Change request status" })).not.toBeInTheDocument();
  });
});
