// Story: SPM-148 Event Status Changes from Approved to Planning
// ACs: AC1, AC3
// Test cases: PLAN-STATUS-01-A (FE), PLAN-STATUS-03-A (FE), PLAN-STATUS-03-D (FE)
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "@/utils/api";
import { useAppStore } from "@/store/useAppStore";
import { deferred } from "@/test/deferred";
import { VenueRecordDetailPage } from "./VenueRecordDetailPage";
import type { VenueRecord } from "../venue-records";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);
const VENUE_ID = "00000000-0000-4000-8000-000000000148";
const venue: VenueRecord = {
  id: VENUE_ID,
  name: "Main Hall",
  location: "North Wing",
  capacity: 200,
  facilities: [],
  layouts: [],
  accessibility: [],
  operatingInformation: "",
  setupTimeMinutes: 0,
  turnaroundTimeMinutes: 0,
  availabilityStatus: "available",
  unavailablePeriods: [],
  reservations: [],
};
const originalUser = useAppStore.getState().currentUser;

/** The Coordinator's event in the given status; the name is the MSG-PL-01 oracle. */
function seedEvent(status: "approved" | "planning") {
  useAppStore.setState({
    currentUser: { id: "coordinator", name: "Daniel Koh", email: "coo@example.test", role: "coordinator" },
    events: [
      {
        id: "event-801",
        name: "Innovation Showcase",
        purpose: "",
        description: "",
        organiserId: "org-1",
        organiserName: "Organiser",
        status,
        startDateTime: "2030-01-12T04:00:00.000Z",
        endDateTime: "2030-01-12T05:00:00.000Z",
        expectedAttendance: 20,
        venueRequirements: { minCapacity: 10, accessibility: [], facilities: [], layout: "" },
        equipmentNeeds: "",
        registrationEnabled: false,
        createdAt: "2030-01-01T00:00:00.000Z",
        updatedAt: "2030-01-01T00:00:00.000Z",
      },
    ],
  });
}

/** Opens the review step for the seeded event (venue read, schedule refresh, continue). */
async function openReview() {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[`/venue-records/${VENUE_ID}`]}>
      <Routes>
        <Route path="/venue-records/:id" element={<VenueRecordDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "Main Hall" });
  fireEvent.change(screen.getByLabelText("Event starts"), { target: { value: "2030-01-12T12:00" } });
  fireEvent.change(screen.getByLabelText("Event ends"), { target: { value: "2030-01-12T13:00" } });
  await user.click(screen.getByRole("button", { name: "Refresh schedule" }));
  await user.click(screen.getByRole("button", { name: "Continue to booking request" }));
  return { user, review: screen.getByRole("region", { name: "Review booking request" }) };
}

describe("SPM-148 AC1/AC3: the booking form reports the move to Planning", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    apiMock.mockResolvedValueOnce(venue).mockResolvedValueOnce(venue);
  });
  afterEach(() => {
    cleanup();
    useAppStore.setState({ currentUser: originalUser });
  });

  // Kills: badge from stale state, MSG-PL-01 missing when the server says statusChanged.
  it("PLAN-STATUS-01-A: the first request shows MSG-PL-01 and the event becomes Planning without a reload", async () => {
    // Arrange: Approved event, server reports the transition.
    seedEvent("approved");
    apiMock.mockResolvedValueOnce({ bookingReference: "VB-00000148", eventStatus: "Planning", statusChanged: true });
    useAppStore.setState((state) => ({
      events: [...state.events, { ...state.events[0], id: "event-900", name: "Other event", status: "approved" }],
    }));
    const { user, review } = await openReview();

    // Act
    await user.click(within(review).getByRole("button", { name: "Submit booking request" }));

    // Assert: MSG-PL-01 text, and the store (the badge source) says planning.
    expect(await screen.findByText("Venue booking request submitted. Innovation Showcase is now in Planning.")).toBeInTheDocument();
    expect(useAppStore.getState().events.find((e) => e.id === "event-801")?.status).toBe("planning");
    // Other events in the store are left alone (Kills: the status update touching every event).
    expect(useAppStore.getState().events.find((e) => e.id === "event-900")?.status).toBe("approved");
  });

  // Kills: "now in Planning" shown for a later request, status overwritten.
  it("PLAN-STATUS-03-A: a later request shows no Planning message and leaves the status alone", async () => {
    // Arrange: already Planning, server reports no change.
    seedEvent("planning");
    apiMock.mockResolvedValueOnce({ bookingReference: "VB-00000149", eventStatus: "Planning", statusChanged: false });
    const { user, review } = await openReview();

    // Act
    await user.click(within(review).getByRole("button", { name: "Submit booking request" }));

    // Assert
    expect(await screen.findByText(/Booking request submitted\. Reference: VB-00000149\./)).toBeInTheDocument();
    expect(screen.queryByText(/is now in Planning/)).not.toBeInTheDocument();
    expect(useAppStore.getState().events[0].status).toBe("planning");
  });

  // Kills: Submit left enabled while the request is in flight.
  it("PLAN-STATUS-03-D: a double click sends one request and disables Submit while it is in flight", async () => {
    // Arrange: hold the booking request open.
    seedEvent("approved");
    const pending = deferred<{ bookingReference: string; eventStatus: string; statusChanged: boolean }>();
    apiMock.mockReturnValueOnce(pending.promise);
    const { user, review } = await openReview();
    const submit = within(review).getByRole("button", { name: "Submit booking request" });

    // Act
    await user.dblClick(submit);

    // Assert: one booking POST in total (venue read x2 + one POST), button disabled.
    const posts = apiMock.mock.calls.filter(([, init]) => (init as { method?: string } | undefined)?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(within(review).getByRole("button", { name: "Submitting…" })).toBeDisabled();
    pending.resolve({ bookingReference: "VB-00000150", eventStatus: "Planning", statusChanged: true });
    expect(await screen.findByText(/is now in Planning/)).toBeInTheDocument();
  });
});

// ASSUMPTION index
// A1: MSG-PL-01 wording "Venue booking request submitted. {name} is now in Planning." -> 01-A
// A2: the server body carries eventStatus and statusChanged (prompt D5) -> 01-A, 03-A, 03-D
