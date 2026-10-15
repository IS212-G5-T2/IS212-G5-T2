// Story: SPM-148 Event Status Changes from Approved to Planning
// ACs: AC5
// Test cases: PLAN-STATUS-05-A (FE)
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { EventListPage } from "@/features/events/pages/list/EventListPage";
import { api } from "@/utils/api";
import { useAppStore } from "@/store/useAppStore";
import type { EventRecord, EventStatus } from "@/types";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);

function eventIn(status: EventStatus, id: string, name: string): EventRecord {
  return {
    id,
    name,
    purpose: "",
    description: "",
    organiserId: "org-1",
    organiserName: "Organiser",
    coordinatorId: "coo-1",
    status,
    startDateTime: "2030-01-12T04:00:00.000Z",
    endDateTime: "2030-01-12T05:00:00.000Z",
    expectedAttendance: 20,
    venueRequirements: { minCapacity: 10, accessibility: [], facilities: [], layout: "" },
    attachments: [],
    equipmentNeeds: "",
    registrationEnabled: false,
    changeRequests: [],
    createdAt: "2030-01-01T00:00:00.000Z",
    updatedAt: "2030-01-01T00:00:00.000Z",
  } as EventRecord;
}

describe("SPM-148 AC5: Planning events appear under the Planning filter", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue([
      eventIn("planning", "e-804", "Alumni Night"),
      eventIn("approved", "e-801", "Innovation Showcase"),
      eventIn("confirmed", "e-805", "Careers Fair"),
    ]);
    useAppStore.setState({
      authLoading: false,
      isAuthenticated: true,
      currentUser: { id: "coo-1", name: "Daniel Koh", email: "coo@example.test", role: "coordinator" },
      events: [],
    });
  });
  afterEach(cleanup);

  // Kills: M12 filter ignored, Planning missing from the filter options.
  it("PLAN-STATUS-05-A: choosing Planning lists only the Planning event", async () => {
    // Arrange
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/planning"]}>
        <EventListPage />
      </MemoryRouter>,
    );
    // The Coordinator lands on Submitted; nothing is listed until Planning is chosen.
    const filter = await screen.findByLabelText("Filter by status");

    // Act
    await user.selectOptions(filter, "planning");

    // Assert
    expect(await screen.findByText("Alumni Night")).toBeInTheDocument();
    // The badge reads "Planning" (StatusBadge), not just the filter option.
    expect(screen.getByText("Planning", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByText("Innovation Showcase")).not.toBeInTheDocument();
    expect(screen.queryByText("Careers Fair")).not.toBeInTheDocument();
  });
});
